import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { dataSources } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { registerJobHandler, enqueueJob, getJobStatus, type JobStatus } from '@/modules/core/jobs';
import { audit } from '@/modules/core/guardrails';
import { periksaSync, terbitkanPeringatan } from '@/modules/core/alerts';
import { TEXT_EXT, DOC_EXT } from './format';
import { batasSync } from './sync-limits';
import { masihMuat } from './anggaran-sync';
import { ringkasPerFolder, saringFolderTerpilih, type Pratinjau } from './pratinjau';
import { dispatch } from '@/modules/core/events';
import { connectionService } from '@/modules/connections/connection.service';
import { knowledgeService, QuotaError } from './knowledge.service';
import { knowledgeBaseService } from './knowledge-base.service';
import { memoryAgent } from '@/modules/memory/memory-agent.service';
import { crawlUserDrive, getUserDriveFilesMeta, downloadUserDriveFile, exportUserDriveFile, isGoogleNative, googleNativeExportMime } from './storage/gdrive';
import { crawlUserSharepoint, downloadUserSharepointFile } from './storage/sharepoint';
import {
  isSharingLink, resolveShareLink, resolveSiteFolder, parseSharePointSiteUrl,
  crawlDriveFolder, downloadDriveItem,
} from './storage/sharepoint-sites';
import {
  parseDriveFolderUrl, crawlPublicFolder, downloadPublicFile, exportPublicFile,
} from './storage/gdrive-public';
import { oauthAppService } from '@/modules/auth/oauth-app.service';
import { assertPublicHttpUrl } from '@/modules/core/net';
import { decryptSecret } from '@/modules/core/crypto';
import type { KredensialS3 } from '@/modules/connections/s3';
import { ambilObjek, daftarObjek } from './storage/s3';
import { daftarHalaman, isiHalaman, type KredensialNotion } from './storage/notion';
import { daftarKanal, isiKanal, versiKanal, type KredensialSlack } from './storage/slack';

/**
 * SYNC WORKER — crawl storage user → ekstrak teks → ingest KB →
 * auto-trigger Memory Agent. Job 'source.sync' di antrean core/jobs.
 *
 * INCREMENTAL / DELTA SYNC
 * ------------------------
 * Sync TIDAK meng-ingest ulang seluruh drive tiap kali jalan. Tiap chunk
 * menyimpan `external_id` (id file upstream) + `external_version` (Drive
 * modifiedTime / Graph eTag). Satu run:
 *   1. listing metadata saja (murah, tanpa download)
 *   2. bandingkan dengan manifest DB → planDelta()
 *   3. hanya file BARU / BERUBAH yang diunduh + di-embed;
 *      file yang HILANG di upstream chunk-nya di-soft-delete
 * Tanpa ini, sync kedua menduplikasi seluruh KB dan membayar biaya
 * embedding berulang.
 *
 * Storage:
 *  • gdrive        — Google Drive user (OAuth google; folder rekursif dgn
 *                    drive.readonly, atau berkas terpilih dgn drive.file)
 *  • gdrive_public — URL folder yang dibagikan "Anyone with the link",
 *                    dibaca dengan API KEY tanpa OAuth sama sekali. Satu-
 *                    satunya jalur yang menarik SELURUH isi folder rekursif
 *                    tanpa scope restricted (lihat storage/gdrive-public.ts)
 *  • onedrive      — /me/drive user via Microsoft Graph (OAuth microsoft)
 *  • sharepoint    — document library situs, shared link, atau /me/drive
 *                    (lihat storage/sharepoint.ts)
 *
 * Ekstraksi: txt/md/csv/json/html langsung; PDF (pdf-parse), DOCX (mammoth);
 * Google Docs/Sheets/Slides via export teks. Format tak didukung dihitung
 * skipped — dilaporkan, tidak diam-diam.
 */

interface SyncPayload { tenantId: string; userId: string; sourceId: string; full?: boolean }

/* Batas DITENTUKAN OLEH TEMPAT KODE INI BERJALAN, bukan ditulis mati.
   Di lambda ia harus muat di tenggat 60 detik; di pekerja yang hidup
   terus tenggat itu tak ada, dan mempertahankan angka lambda di sana
   berarti korpus 700 GB butuh 20.589 kali jalan untuk sesuatu yang bisa
   diselesaikan satu proses. Lihat ./sync-limits. */
const { ingestPerRun: MAX_INGEST_PER_SYNC, listFiles: MAX_LIST_FILES } = batasSync();
const MAX_FILE_CHARS = 200_000;

registerJobHandler('source.sync', async (payload) => {
  await runSync(payload as SyncPayload);
});

export const syncService = {
  /** `full: true` → paksa re-ingest semua file (abaikan versi tersimpan). */
  enqueue(tenantId: string, userId: string, sourceId: string, full = false): JobStatus {
    return enqueueJob('source.sync', sourceId, { tenantId, userId, sourceId, full } satisfies SyncPayload);
  },
  status(sourceId: string): JobStatus | null {
    return getJobStatus('source.sync', sourceId);
  },
};

/* ── perencanaan delta (murni — diuji tanpa DB) ───────────────────── */

export interface RemoteFile {
  externalId: string;
  name: string;
  /** Penanda versi upstream; string kosong = upstream tak memberi versi. */
  version: string;
  mimeType?: string;
  /** Ukuran byte bila upstream melaporkannya — kaki murah pencocokan kembar
   *  yang bisa melewati berkas SEBELUM diunduh. */
  size?: number;
  /**
   * Jalur upstream lengkap, bila konektornya memang tahu hierarkinya.
   *
   * Dari sinilah kolom `documents.folder` diturunkan. Sengaja OPSIONAL:
   * Notion & Slack tak punya folder, dan konektor yang mengarang jalur akan
   * membuat penyaring folder membuang dokumen yang sebenarnya cocok —
   * kegagalan yang lebih buruk daripada penyaring yang jujur kosong.
   */
  path?: string;
}

export interface SyncPlan {
  /** Belum pernah di-ingest. */
  create: RemoteFile[];
  /** Sudah ada tapi versinya berbeda → chunk lama dibuang, di-ingest ulang. */
  update: RemoteFile[];
  /** Tak berubah — tidak diunduh, tidak di-embed. */
  unchanged: number;
  /** external_id yang ada di DB tapi lenyap dari upstream → soft-delete. */
  remove: string[];
}

/**
 * Bandingkan listing upstream dengan manifest DB.
 *
 * `truncated` = listing kena batas MAX_LIST_FILES, jadi kita TIDAK melihat
 * seluruh drive. Dalam kondisi itu penghapusan DILEWATI — file yang sekadar
 * berada di luar jendela listing tidak boleh dikira terhapus.
 */
export function planDelta(
  remote: RemoteFile[],
  manifest: Map<string, string>,
  opts: { full?: boolean; truncated?: boolean } = {},
): SyncPlan {
  const plan: SyncPlan = { create: [], update: [], unchanged: 0, remove: [] };
  const seen = new Set<string>();

  for (const f of remote) {
    seen.add(f.externalId);
    const prev = manifest.get(f.externalId);
    if (prev === undefined) plan.create.push(f);
    else if (opts.full || prev !== f.version || f.version === '') plan.update.push(f);
    else plan.unchanged++;
  }

  if (!opts.truncated) {
    for (const id of manifest.keys()) if (!seen.has(id)) plan.remove.push(id);
  }
  return plan;
}

/* ── job utama ────────────────────────────────────────────────────── */

/** DIEKSPOR utk pekerja ingest (scripts/ingest-worker.ts) — pekerja WAJIB
 *  memanggil jalur yang sama dengan HTTP; jalur ingest kedua akan berbeda
 *  perilakunya dalam hal yang tak seorang pun sadari sampai hasilnya beda. */
/**
 * Apa yang AKAN diserap sumber ini — tanpa mengunduh satu byte pun.
 *
 * Memakai `connect()` yang SAMA dengan sync, jadi tak ada kemungkinan
 * pratinjaunya menjanjikan sesuatu yang berbeda dari yang benar-benar terjadi.
 * Jalur ingest kedua akan berbeda perilakunya dalam hal yang tak seorang pun
 * sadari sampai hasilnya beda — dan pada fitur yang gunanya MEMPERCAYAI
 * angkanya sebelum membayar, itu kegagalan yang menghapus seluruh gunanya.
 */
export async function pratinjauSumber(
  tenantId: string, userId: string, sourceId: string,
): Promise<Pratinjau & { folderTerpilih: string[] }> {
  const source = await withTenant(tenantId, async (tx) =>
    (await tx.select().from(dataSources).where(and(
      eq(dataSources.id, sourceId), isNull(dataSources.deletedAt),
    )).limit(1))[0] ?? null);
  if (!source) throw new Error('Sumber data tidak ditemukan');

  const config = source.config as Record<string, unknown>;
  const conn = await connect(tenantId, userId, source.kind, config);
  const hasil = ringkasPerFolder(conn.files, isExtractable, conn.truncated);
  return {
    ...hasil,
    folderTerpilih: Array.isArray(config.folderTerpilih) ? (config.folderTerpilih as string[]) : [],
  };
}

export async function runSync({ tenantId, userId, sourceId, full }: SyncPayload): Promise<void> {
  const source = await withTenant(tenantId, async (tx) =>
    (await tx.select().from(dataSources).where(and(
      eq(dataSources.id, sourceId), isNull(dataSources.deletedAt),
    )).limit(1))[0] ?? null);
  if (!source) throw new Error('Sumber data tidak ditemukan');

  const setStatus = (status: string, extra?: Record<string, unknown>) =>
    withTenant(tenantId, (tx) => tx.update(dataSources).set({
      status, lastSyncedAt: new Date(), updatedAt: new Date(),
      ...(extra ? { config: { ...(source.config as object), lastSync: extra } } : {}),
    }).where(eq(dataSources.id, sourceId)));

  /**
   * Kabar progres SELAMA sync berjalan.
   *
   * Tanpa ini, sync panjang tampak menggantung: status berhenti di
   * 'syncing' dan tak berubah lagi sampai seluruhnya selesai. Pemilik
   * data lalu menekan Sync lagi karena mengira yang pertama mati — dan
   * sync kedua benar-benar berjalan, membakar kuota dua kali untuk
   * pekerjaan yang sama.
   *
   * DITULIS BERKALA, bukan per berkas: satu UPDATE per berkas berarti
   * 150 tulis per jalan di lambda dan 5.000 di pekerja, semuanya untuk
   * angka yang dibaca manusia beberapa detik sekali. Yang dibutuhkan
   * hanya cukup sering agar bilahnya terlihat BERGERAK.
   */
  const kabarProgres = async (selesai: number, total: number, berkas?: string) => {
    try {
      await withTenant(tenantId, (tx) => tx.update(dataSources).set({
        updatedAt: new Date(),
        config: { ...(source.config as object), progress: { selesai, total, berkas: berkas ?? null, at: new Date().toISOString() } },
      }).where(eq(dataSources.id, sourceId)));
    } catch (err) {
      // Gagal mengabarkan progres TIDAK boleh menggagalkan sync. Yang
      // hilang cuma bilahnya; pekerjaannya sendiri tetap benar.
      console.error('[sync] gagal menulis progres:', err);
    }
  };

  /* Awal putaran — anggaran waktu dihitung dari SINI, bukan dari awal
     lingkaran ingest: pendaftaran berkas (listing) juga memakan tenggat yang
     sama, dan mengabaikannya membuat anggaran berbohong pada sumber yang
     daftarnya panjang. */
  const mulaiMs = Date.now();

  await setStatus('syncing');

  try {
    const conn = await connect(tenantId, userId, source.kind, source.config as Record<string, unknown>);

    /* FOLDER YANG DICENTANG PEMILIKNYA — disaring SEBELUM apa pun diunduh.
       Daftar kosong berarti SEMUA; arti sebaliknya akan membuat setiap sumber
       yang sudah ada berhenti menyerap apa pun pada detik fitur ini dipasang,
       tanpa galat dan tanpa jejak. Lihat saringFolderTerpilih(). */
    const terpilihFolder = Array.isArray((source.config as Record<string, unknown>)?.folderTerpilih)
      ? ((source.config as Record<string, unknown>).folderTerpilih as string[])
      : null;
    const berkasTerpilih = saringFolderTerpilih(conn.files, terpilihFolder);

    /* PENJAGA: pilihan yang MENGHABISKAN daftar hampir pasti salah paham,
       bukan maksud.
       Kalau jalur tersimpan tak cocok dengan jalur yang dihitung dari berkas
       — satu garis miring berbeda sudah cukup — penyaringnya mengembalikan
       NOL berkas. Dan nol berkas berarti planDelta melihat seluruh isi
       knowledge base "lenyap dari upstream" lalu menghapus semuanya.
       Perlakukan seperti pendaftaran terpotong: jangan hapus apa pun,
       dan berteriak. Menghapus seluruh korpus pelanggan karena satu jalur
       salah ketik adalah kegagalan yang tak boleh mungkin terjadi. */
    if (conn.files.length > 0 && berkasTerpilih.length === 0) {
      await terbitkanPeringatan(tenantId, {
        jenis: 'sync.folder_kosong', tingkat: 'gawat',
        pesan: 'Pilihan folder tidak cocok dengan satu berkas pun — sync dihentikan sebelum menghapus apa pun.',
        konteks: { sourceId, folderTerpilih: terpilihFolder, berkasUpstream: conn.files.length },
      });
      await setStatus('error', {
        pesan: 'Pilihan folder tidak cocok dengan satu berkas pun di sumber ini. '
          + 'Buka Pratinjau dan pilih ulang foldernya.',
      });
      return;
    }


    // Format yang pasti tak bisa jadi teks tidak perlu diunduh sama sekali.
    const supported: RemoteFile[] = [];
    let skipped = 0;
    for (const f of berkasTerpilih) {
      if (isExtractable(f.name, f.mimeType)) supported.push(f);
      else skipped++;
    }

    const manifest = await knowledgeService.manifestBySource(tenantId, sourceId);
    const plan = planDelta(supported, manifest, { full, truncated: conn.truncated });

    // File hilang di upstream → chunk-nya keluar dari KB (soft-delete, bisa di-restore).
    let removed = 0;
    if (plan.remove.length) {
      removed = await knowledgeService.removeExternal(tenantId, sourceId, plan.remove);
    }

    // Migrasi dari sync pra-delta: chunk lama tak punya external_id sehingga tak
    // terlihat di manifest — tanpa dibuang ia akan berdampingan dgn ingest baru
    // (KB dobel). Sekali jalan saat source pertama kali di-sync secara delta.
    if (manifest.size === 0 || full) {
      removed += await knowledgeService.removeLegacy(tenantId, sourceId);
    }

    // Kerja mahal dibatasi per run; sisanya dilaporkan sebagai `pending`.
    const work = [...plan.create, ...plan.update];
    const batch = work.slice(0, MAX_INGEST_PER_SYNC);
    const pending = work.length - batch.length;
    const isUpdate = new Set(plan.update.map((f) => f.externalId));

    let ingested = 0, updated = 0, failed = 0, duplicates = 0;
    /** Terunduh, formatnya didukung, tapi ekstraksinya kosong — hampir selalu
     *  PDF hasil pindai tanpa OCR. */
    let noText = 0;
    /** Pesan kuota bila sync berhenti karena jatah habis; null = tak terjadi. */
    let quotaStop: string | null = null;
    /* Sekali setiap KABAR_TIAP berkas, atau setiap 3 detik — mana pun yang
       lebih dulu. Dua syarat karena keduanya bisa jadi yang lambat: berkas
       kecil melaju puluhan per detik (hitungan yang menahan), sementara satu
       PDF 200 halaman bisa memakan setengah menit sendirian (waktu yang
       menahan). Hanya salah satu, dan bilahnya akan terlihat macet di
       separuh kasus. */
    const KABAR_TIAP = 5;
    const KABAR_MS = 3_000;
    let kabarTerakhir = Date.now();
    let diproses = 0;
    await kabarProgres(0, batch.length);

    /* Berhenti karena ANGGARAN WAKTU, bukan karena dibunuh. Bedanya: yang
       ini melaporkan sisa yang benar dan menutup statusnya rapi. */
    let berhentiWaktu = 0;

    for (const f of batch) {
      if (!masihMuat({ mulaiMs, sekarangMs: Date.now(), sudahDiproses: diproses })) {
        berhentiWaktu = batch.length - diproses;
        break;
      }
      try {
        /* LAPIS 1 — nama + ukuran, SEBELUM mengunduh apa pun.
           Ini satu-satunya lapisan yang bisa menghemat unduhan; sidik jari isi
           (lapis 2, di knowledgeService.ingest) baru bisa dihitung setelah
           berkasnya ada di tangan. Berkas yang sudah diketahui sebagai versi
           lebih baru dari dirinya sendiri TIDAK dilewati — itu update, bukan
           kembar. */
        if (!isUpdate.has(f.externalId) && f.size) {
          const kembar = await knowledgeService.findByNameSize(
            tenantId, source.knowledgeBaseId, f.name, f.size);
          if (kembar && kembar !== f.externalId) {
            await knowledgeService.recordDuplicate(tenantId, {
              knowledgeBaseId: source.knowledgeBaseId, sourceId,
              externalId: f.externalId, title: f.name, sizeBytes: f.size,
              canonicalDocRef: kembar, reason: 'name-size',
            });
            duplicates++;
            continue;
          }
        }

        const { content, mime } = await conn.fetch(f);
        const text = await extractText(f.name, content, mime);
        if (text === null) {
          // DIBEDAKAN dari 'format tak didukung'. Keduanya sama-sama tak
          // masuk, tapi menuntut tindakan yang sama sekali berbeda: format
          // tak didukung berarti berkasnya memang bukan dokumen teks; ini
          // berarti berkasnya DOKUMEN tapi isinya gambar — dan pemiliknya
          // perlu menjalankan OCR. Menggabungkan keduanya membuat laporan
          // '5.000 dilewati' yang tak menuntun ke mana pun.
          noText++;
          continue;
        }

        // Versi baru menggantikan yang lama — buang chunk lama DULU agar
        // KB tidak berisi dua versi dokumen yang sama.
        if (isUpdate.has(f.externalId)) {
          await knowledgeService.removeExternal(tenantId, sourceId, [f.externalId]);
        }

        const n = await knowledgeService.ingest(tenantId, {
          knowledgeBaseId: source.knowledgeBaseId,
          title: f.name,
          sizeBytes: f.size,
          text: text.slice(0, MAX_FILE_CHARS),
          sourceId,
          externalId: f.externalId,
          externalVersion: f.version,
          /* Jalur upstream, dipakai menurunkan kolom `folder`.
             HANYA konektor yang memang TAHU hierarkinya yang mengisi ini —
             S3 lewat kunci objek, Drive publik lewat penelusuran folder.
             Notion & Slack tak punya folder sama sekali, dan mengarang jalur
             untuk keduanya akan membuat penyaring folder membuang dokumen
             yang sebenarnya cocok. */
          path: f.path,
          metadata: { syncedFrom: source.kind },
        });
        // ingest() mengembalikan 0 bila LAPIS 2 (sidik jari isi) menemukan
        // kembar — berkasnya terunduh tapi tak di-embed dan tak disimpan.
        if (n === 0) duplicates++;
        else if (isUpdate.has(f.externalId)) updated++;
        else ingested++;
      } catch (err) {
        /* Kuota habis BUKAN kegagalan satu berkas — berkas berikutnya pasti
           gagal juga. Meneruskan loop hanya membuang unduhan dan menghasilkan
           laporan berisi ratusan "gagal" yang menyembunyikan sebab tunggalnya.
           Sisanya dilaporkan sebagai `pending`, jadi sync bisa dilanjutkan
           begitu paket dinaikkan atau dokumen lama dibuang. */
        if (err instanceof QuotaError) {
          quotaStop = err.message;
          console.warn(`[sync] berhenti — kuota penyimpanan habis: ${err.message}`);
          break;
        }
        // 1 file gagal TIDAK boleh mematikan seluruh sync.
        console.error(`[sync] gagal memproses ${f.name}:`, err);
        failed++;
      }

      /* Dihitung di LUAR try: berkas yang gagal tetap berkas yang sudah
         dilewati. Menghitungnya hanya saat berhasil membuat bilah berhenti
         bergerak pada folder yang isinya banyak gagal — dan bilah yang
         berhenti persis itulah yang membuat orang mengira sync-nya mati. */
      diproses++;
      if (diproses % KABAR_TIAP === 0 || Date.now() - kabarTerakhir >= KABAR_MS) {
        kabarTerakhir = Date.now();
        await kabarProgres(diproses, batch.length, f.name);
      }
    }

    const stats = {
      ingested, updated, removed, unchanged: plan.unchanged,
      // Dilaporkan TERPISAH dari `skipped`: "dilewati karena formatnya tak
      // didukung" dan "dilewati karena kembar" menuntut tindakan yang berbeda
      // dari pemilik data, dan menggabungkannya menyembunyikan keduanya.
      duplicates,
      skipped, noText, failed,
      /* Sisa = yang tak muat di batas berkas per jalan DITAMBAH yang tak muat
         di anggaran waktu. Melaporkan salah satunya saja membuat orang
         mengira sync sudah tuntas padahal belum. */
      pending: pending + berhentiWaktu,
      ...(berhentiWaktu ? { berhentiKarenaWaktu: berhentiWaktu } : {}),
      at: new Date().toISOString(),
      // Disebut TERPISAH: kuota habis menuntut tindakan yang sama sekali
      // berbeda dari berkas yang gagal diproses.
      ...(quotaStop ? { quotaExceeded: quotaStop } : {}),
    };
    /* Progres DIBUANG saat selesai. Bilah yang tertinggal dari jalan
       sebelumnya akan terbaca sebagai sync yang masih berjalan — dan
       pemiliknya menunggu sesuatu yang sudah selesai berjam-jam lalu. */
    await withTenant(tenantId, (tx) => tx.update(dataSources).set({
      config: { ...(source.config as object), progress: null },
    }).where(eq(dataSources.id, sourceId)));
    await setStatus(quotaStop ? 'quota' : pending > 0 ? 'partial' : 'synced', stats);
    /* Kuota yang menghentikan sync DIBERITAHUKAN, bukan cuma dicatat di
       status sumber. Status hanya terbaca oleh yang kebetulan membuka
       halaman Knowledge; sementara akibatnya — dokumen berhenti masuk —
       baru terasa berhari-hari kemudian saat jawaban mulai meleset. */
    if (quotaStop) {
      await terbitkanPeringatan(tenantId, {
        jenis: 'kuota.habis', tingkat: 'gawat',
        pesan: `Sync berhenti karena kuota penyimpanan habis: ${quotaStop}`,
        konteks: { sourceId, knowledgeBaseId: source.knowledgeBaseId, ingested, pending },
      });
    }
    await audit(tenantId, 'system', 'source.sync', sourceId, {
      kind: source.kind, knowledgeBaseId: source.knowledgeBaseId, ...stats,
    });
    await dispatch('source.connected', {
      tenantId, knowledgeBaseId: source.knowledgeBaseId, sourceId, kind: source.kind,
    });

    // rantai otomatis (D11): KB berubah → petakan ulang memory utk SETIAP
    // chatbot yang memakai KB ini. Tak ada perubahan ⇒ tak perlu agent.
    if (ingested || updated || removed) {
      const botIds = await knowledgeBaseService.assignedChatbots(tenantId, source.knowledgeBaseId);
      for (const botId of botIds) memoryAgent.enqueueRun(tenantId, botId);
    }
  } catch (err) {
    await setStatus('error', { message: (err as Error).message });
    /* Diterbitkan SEBELUM melempar ulang: kalau menunggu pemanggil, tak
       ada pemanggil yang tahu sumber mana yang gagal — job runner hanya
       melihat satu galat tanpa konteks. Peredaman 6 jam ada di
       terbitkanPeringatan; sync berjalan berkali-kali sehari, dan tanpa
       itu satu folder yang izinnya dicabut mengirim belasan peringatan
       identik per hari sampai orang berhenti membacanya. */
    const p = periksaSync({
      sourceId, kbId: source.knowledgeBaseId,
      gagal: 1, pesan: (err as Error).message.slice(0, 160),
    });
    if (p) await terbitkanPeringatan(tenantId, p);
    throw err;
  }
}

/* ── konektor per storage (listing murah + fetch malas) ───────────── */

interface Connector {
  files: RemoteFile[];
  /** true bila listing kena batas → deteksi file terhapus tidak dapat dipercaya. */
  truncated: boolean;
  fetch(f: RemoteFile): Promise<{ content: Buffer; mime?: string }>;
}

async function connect(
  tenantId: string, userId: string, kind: string, config: Record<string, unknown>,
): Promise<Connector> {
  // scope: 'all' = SELURUH drive (rekursif) · 'folder' = folder tertentu (rekursif)
  const scope = (config.scope === 'all' ? 'all' : 'folder') as 'all' | 'folder';
  const accountEmail = config.accountEmail ? String(config.accountEmail) : undefined;

  if (kind === 'gdrive') {
    const token = await connectionService.getAccessToken(tenantId, userId, 'google', accountEmail);
    if (!token) throw new Error('Akun Google belum terhubung (hubungkan di Knowledge → Connect Google)');

    // Mode 'picker' (D10): config membawa daftar id berkas yang dipilih user
    // di Google Picker. Dengan drive.file listing folder mustahil — metadata
    // diambil per id. Berkas yang 404 hilang dari listing → planDelta remove.
    const pickedIds = Array.isArray(config.fileIds)
      ? (config.fileIds as unknown[]).map(String).filter(Boolean)
      : null;

    const raw = pickedIds
      ? await getUserDriveFilesMeta(token, pickedIds.slice(0, MAX_LIST_FILES))
      : await crawlUserDrive(token, {
          scope,
          folderId: config.folderId ? String(config.folderId) : undefined,
          maxFiles: MAX_LIST_FILES,
        });
    return {
      files: raw.map((f) => ({
        externalId: f.id, name: f.name, mimeType: f.mimeType,
        version: f.modifiedTime ?? '',
        // Drive mengirim int64 sebagai STRING; Number('') = 0, dan 0 memang
        // arti yang benar di sini ("tak diketahui") — lihat nameSizeKey().
        size: Number(f.size ?? 0) || undefined,
      })),
      // Picker: daftar id-nya eksplisit & lengkap (kecuali dipangkas), jadi
      // berkas yang tak muncul memang boleh dihapus dari KB.
      truncated: pickedIds
        ? pickedIds.length > MAX_LIST_FILES
        : raw.length >= MAX_LIST_FILES,
      async fetch(f) {
        if (isGoogleNative(f.mimeType)) {
          // Docs Editors tak bisa alt=media; harus di-export.
          const exportMime = googleNativeExportMime(f.mimeType)!; // isExtractable menjamin ada
          return { content: await exportUserDriveFile(token, f.externalId, exportMime), mime: exportMime };
        }
        return { content: await downloadUserDriveFile(token, f.externalId) };
      },
    };
  }

  // Folder Drive publik — TANPA OAuth. Tak ada accountEmail, tak ada token;
  // yang dibutuhkan hanya API key platform + folder yang benar-benar publik.
  if (kind === 'gdrive_public') {
    const app = await oauthAppService.get('google');
    const apiKey = app?.driveApiKey;
    if (!apiKey) {
      throw new Error('Kunci Drive API belum diisi superadmin (Models & Keys → kredensial Google → Drive API key).');
    }
    const root = parseDriveFolderUrl(String(config.folderUrl ?? ''));
    const raw = await crawlPublicFolder(apiKey, root, { maxFiles: MAX_LIST_FILES });
    /** resourceKey per berkas — sebagian berkas lama menolak diunduh tanpanya. */
    const keys = new Map(raw.filter((f) => f.resourceKey).map((f) => [f.id, f.resourceKey!]));
    return {
      files: raw.map((f) => ({
        externalId: f.id, name: f.name, mimeType: f.mimeType,
        version: f.modifiedTime ?? '',
      })),
      truncated: raw.length >= MAX_LIST_FILES,
      async fetch(f) {
        const rk = keys.get(f.externalId);
        if (isGoogleNative(f.mimeType)) {
          const exportMime = googleNativeExportMime(f.mimeType)!;
          return { content: await exportPublicFile(apiKey, f.externalId, exportMime, rk), mime: exportMime };
        }
        return { content: await downloadPublicFile(apiKey, f.externalId, rk) };
      },
    };
  }

  if (kind === 'onedrive' || kind === 'sharepoint') {
    const token = await connectionService.getAccessToken(tenantId, userId, 'microsoft', accountEmail);
    if (!token) throw new Error('Akun Microsoft belum terhubung (hubungkan di Knowledge → Connect Microsoft)');

    // Jalur BARU: URL situs SharePoint atau tautan berbagi. Keduanya bermuara
    // ke (driveId, itemId) lalu ditelusuri rekursif — sub-sub-folder ikut.
    const url = config.siteUrl ? String(config.siteUrl).trim() : '';
    if (url) {
      const target = isSharingLink(url)
        ? await resolveShareLink(token, url)
        : await resolveSiteFolder(token, parseSharePointSiteUrl(url));
      const raw = await crawlDriveFolder(token, target, { maxFiles: MAX_LIST_FILES });
      return {
        files: raw.map((it) => ({
          externalId: it.id, name: it.name,
          version: it.eTag ?? it.lastModifiedDateTime ?? '',
        })),
        truncated: raw.length >= MAX_LIST_FILES,
        async fetch(f) {
          return { content: await downloadDriveItem(token, target.driveId, f.externalId) };
        },
      };
    }

    // Jalur lama: OneDrive pribadi (/me/drive) berdasarkan path.
    const raw = await crawlUserSharepoint(token, {
      scope,
      folderPath: config.folderPath ? String(config.folderPath) : undefined,
      maxFiles: MAX_LIST_FILES,
    });
    return {
      files: raw.map((it) => ({
        externalId: it.id, name: it.name,
        version: it.eTag ?? it.lastModifiedDateTime ?? '',
      })),
      truncated: raw.length >= MAX_LIST_FILES,
      async fetch(f) {
        return { content: await downloadUserSharepointFile(token, f.externalId) };
      },
    };
  }

  /**
   * Satu halaman web. Tanpa OAuth, tanpa akun — cukup URL publik.
   *
   * Tetap berupa SUMBER (bukan ingest sekali jalan) supaya bisa disinkronkan
   * ulang: halaman kebijakan, harga, atau FAQ berubah, dan delta sync akan
   * menangkapnya lewat ETag/Last-Modified.
   */
  if (kind === 'url') {
    const url = assertPublicHttpUrl(String(config.url ?? ''), { label: 'URL sumber' });
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'NalarBot/1.0 (+https://rag.sainskerta.net)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Halaman menjawab ${res.status} — tak bisa dibaca.`);

    const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());
    // Penanda versi: ETag/Last-Modified kalau server menyediakannya, kalau
    // tidak sidik jari isi. Tanpa penanda, tiap sync akan meng-embed ulang
    // halaman yang sama dan membakar biaya tanpa alasan.
    const version = res.headers.get('etag')
      ?? res.headers.get('last-modified')
      ?? createHash('sha256').update(buf).digest('hex').slice(0, 32);
    const name = config.title ? String(config.title) : new URL(url).pathname.split('/').filter(Boolean).pop() || new URL(url).hostname;

    return {
      files: [{ externalId: url, name: `${name}`, mimeType: mime || 'text/html', version }],
      truncated: false,
      async fetch() { return { content: buf, mime: mime || 'text/html' }; },
    };
  }

  /**
   * Penyimpanan objek kompatibel-S3 (AWS S3, MinIO, Cloudflare R2, Wasabi).
   *
   * Tanpa OAuth: pelanggan memasok kunci aksesnya sendiri, persis seperti
   * mereka memasok kunci API penyedia LLM. Secret-nya TERENKRIPSI di config
   * (`secretAccessKeyEnc`) — menyimpannya polos di jsonb berarti satu kunci
   * yang bisa membaca seluruh bucket pelanggan tergeletak di basis data.
   *
   * ETag dipakai sebagai penanda versi. Untuk unggahan biasa ia MD5 isi
   * berkas, jadi berkas yang tak berubah tak pernah diunduh ulang; untuk
   * unggahan multipart bentuknya "<hash>-<n>" — tetap berubah begitu isinya
   * berubah, yang memang satu-satunya sifat yang dibutuhkan planDelta().
   */
  if (kind === 's3') {
    const secretEnc = String(config.secretAccessKeyEnc ?? '');
    if (!secretEnc) throw new Error('Sumber S3 tanpa secret access key — pasang ulang sumbernya.');
    const kred: KredensialS3 = {
      accessKeyId: String(config.accessKeyId ?? ''),
      secretAccessKey: decryptSecret(secretEnc),
      region: String(config.region ?? 'us-east-1'),
      bucket: String(config.bucket ?? ''),
      endpoint: config.endpoint ? String(config.endpoint) : undefined,
      gayaPath: config.gayaPath === true,
    };
    if (!kred.accessKeyId || !kred.bucket) throw new Error('Sumber S3 tanpa access key id atau bucket.');

    const prefix = String(config.prefix ?? '').replace(/^\/+/, '');
    const { objek, terpotong } = await daftarObjek(kred, prefix);

    return {
      files: objek.map((o) => ({
        externalId: o.key,
        /* Kunci S3 SUDAH berupa jalur — tak ada yang perlu ditebak. */
        path: o.key,
        /* Nama berkasnya saja untuk judul; kunci penuh tetap jadi externalId
           supaya dua berkas bernama sama di folder berbeda tak saling
           menimpa di manifest. */
        name: o.key.split('/').pop() || o.key,
        version: o.etag,
        size: o.size,
      })),
      truncated: terpotong,
      async fetch(f) { return ambilObjek(kred, f.externalId); },
    };
  }

  /**
   * NOTION — halaman yang dibagikan ke integrasi milik pelanggan.
   *
   * Tanpa aplikasi OAuth kita: pelanggan membuat internal integration di
   * ruang kerjanya, membagikan halaman yang dipilihnya, lalu menempelkan
   * token. Sama seperti S3, dan itulah yang membuka kartu ini — anggapan
   * lamanya "menuntut aplikasi OAuth yang kita daftarkan" hanya benar untuk
   * integrasi marketplace.
   *
   * Batas aksesnya ditentukan PEMILIK DATA lewat tombol Share di Notion, dan
   * itu batas yang lebih baik daripada apa pun yang bisa kami tulis.
   */
  if (kind === 'notion') {
    const tokenEnc = String(config.tokenEnc ?? '');
    if (!tokenEnc) throw new Error('Sumber Notion tanpa token — pasang ulang sumbernya.');
    const kred: KredensialNotion = { token: decryptSecret(tokenEnc) };
    const { halaman, terpotong } = await daftarHalaman(kred);
    return {
      files: halaman.map((h) => ({
        externalId: h.id,
        name: `${h.judul}.md`,
        version: h.versi,
      })),
      truncated: terpotong,
      async fetch(f) {
        const md = await isiHalaman(kred, f.externalId);
        return { content: Buffer.from(md, 'utf8'), mime: 'text/markdown' };
      },
    };
  }

  /**
   * SLACK — satu kanal, satu dokumen.
   *
   * Alternatifnya (satu pesan satu dokumen) menghasilkan puluhan ribu potongan
   * sepanjang satu kalimat yang hampir tak pernah cukup menjawab apa pun,
   * sekaligus menghabiskan kuota potongan dalam sekali sync. Percakapan baru
   * berarti sebagai rangkaian.
   *
   * Versi kanal butuh SATU panggilan tambahan per kanal (pesan terbaru). Itu
   * harga yang dibayar di pendaftaran, bukan di pengunduhan — dan justru itu
   * yang membuat kanal yang tak berubah tak pernah diunduh ulang.
   */
  if (kind === 'slack') {
    const tokenEnc = String(config.tokenEnc ?? '');
    if (!tokenEnc) throw new Error('Sumber Slack tanpa token — pasang ulang sumbernya.');
    const kred: KredensialSlack = { token: decryptSecret(tokenEnc) };
    const { kanal, terpotong } = await daftarKanal(kred);
    const nama = new Map(kanal.map((c) => [c.id, c.nama]));
    const versi = await Promise.all(kanal.map((c) => versiKanal(kred, c.id).catch(() => '')));
    return {
      files: kanal.map((c, i) => ({
        externalId: c.id,
        name: `#${c.nama}.md`,
        version: versi[i],
      })),
      truncated: terpotong,
      async fetch(f) {
        const teks = await isiKanal(kred, f.externalId, nama.get(f.externalId) ?? f.externalId);
        return { content: Buffer.from(teks, 'utf8'), mime: 'text/markdown' };
      },
    };
  }

  throw new Error(`Jenis sumber belum didukung sync: ${kind}`);
}

/* ── ekstraksi teks ───────────────────────────────────────────────── */

/* Daftarnya tinggal di ./format supaya halaman bantuan membaca sumber yang
   SAMA. Menyalinnya ke sana dengan tangan berarti janji kepada pengguna
   berhenti benar begitu satu ekstensi ditambahkan di sini — tanpa ada yang
   gagal, dan tanpa ada yang tahu. */

/**
 * Bisakah file ini jadi teks? Dipakai SEBELUM download agar format tak
 * didukung (gambar, XLSX, Forms, …) tidak pernah diunduh percuma.
 */
export function isExtractable(name: string, mimeType?: string): boolean {
  if (isGoogleNative(mimeType)) return googleNativeExportMime(mimeType) !== null;
  if (mimeType?.startsWith('text/')) return true;
  const lower = name.toLowerCase();
  return [...TEXT_EXT, ...DOC_EXT].some((e) => lower.endsWith(e));
}

/**
 * name+buffer → teks, atau null bila format tak didukung (dihitung skipped).
 * PDF via pdf-parse, DOCX via mammoth (dynamic import — modul berat hanya
 * dimuat saat dibutuhkan). Parser gagal ⇒ null, JANGAN mematikan sync.
 */
export async function extractText(name: string, buf: Buffer, mime?: string): Promise<string | null> {
  // Konten yang sudah berupa teks (mis. hasil export Google Docs/Sheets → text/plain,
  // text/csv). Buffer kosong (native tak didukung / gagal ambil) → null = skipped.
  if (mime && mime.startsWith('text/')) {
    const t = buf.toString('utf8').trim();
    return t || null;
  }

  const lower = name.toLowerCase();
  if (TEXT_EXT.some((e) => lower.endsWith(e))) return buf.toString('utf8');

  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return buf.toString('utf8')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (lower.endsWith('.pdf')) {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buf);
      return data.text?.trim() || null;
    } catch (err) {
      console.error(`[sync] gagal parse PDF ${name}:`, err);
      return null;
    }
  }

  if (lower.endsWith('.docx')) {
    try {
      const mammoth = await import('mammoth');
      const r = await mammoth.extractRawText({ buffer: buf });
      return r.value?.trim() || null;
    } catch (err) {
      console.error(`[sync] gagal parse DOCX ${name}:`, err);
      return null;
    }
  }

  // XLSX/PPTX/gambar — belum didukung; tercatat sebagai skipped.
  return null;
}
