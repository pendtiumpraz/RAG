import { NextRequest, NextResponse, after } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { dataSources, knowledgeBases } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { requireRole } from '@/modules/core/auth';
import { knowledgeService } from '@/modules/knowledge/knowledge.service';
import { QuotaError } from '@/modules/knowledge/knowledge.service';
import { extractText, isExtractable } from '@/modules/knowledge/sync.service';
import { storageService } from '@/modules/storage';
import { uploadedFileService } from '@/modules/knowledge/uploaded-file.service';
import { jobsSettled } from '@/modules/core/jobs';
import { ensureIntegrations } from '../../../_wire';

export const runtime = 'nodejs';
/** Ekstraksi + embed beberapa berkas butuh waktu setelah respons terkirim. */
export const maxDuration = 60;

/**
 * POST /api/knowledge-bases/{id}/upload — unggah berkas langsung ke KB.
 *
 * Jalur untuk pelanggan yang dokumennya TIDAK ada di Drive/SharePoint. Sampai
 * sekarang jenis sumber `upload` hanya ada di enum skema tanpa jalur apa pun,
 * jadi mereka terpaksa lewat API.
 *
 * Berbeda dari sumber storage, unggahan TIDAK bisa disinkronkan ulang: berkas
 * aslinya TAK PERNAH dulu ditinggalkan di mana pun. SEJAK kartu ini, berkas
 * ORISINAL turut disimpan ke blob/BYOB (jalur unggahan manual saja — Drive/
 * SharePoint tetap sync langsung tanpa blob). Ekstraksi + ingest tetap dikerjakan
 * di sini, bukan lewat job sync.
 *
 * PEMILIHAN PENYIMPANAN: BYOB terhubung user (default) dipakai dulu; bila tak
 * ada, jatuh ke blob platform dari env (BLOB_STORE_ID/BLOB_READ_WRITE_TOKEN).
 * Bersama simpanan, dicatat path/url di tabel `uploaded_files` utk penelusuran
 * & penghitungan kuota blob per paket (`storageBytes`).
 *
 * Semua berkas satu KB bermuara ke SATU baris sumber "Unggahan manual", dan
 * tiap berkas memakai namanya sebagai `externalId`. Konsekuensinya sengaja:
 * mengunggah ulang nama yang sama MENGGANTI isi lamanya alih-alih menumpuk
 * dua salinan — perilaku yang diharapkan orang saat memperbaiki dokumen.
 *
 * BATAS 4,5 MB per permintaan datang dari Vercel, bukan dari kita. Itu batas
 * badan permintaan fungsi serverless dan tak bisa dinaikkan dari sisi aplikasi;
 * UI menyebutkannya apa adanya supaya kegagalannya tak terasa misterius.
 */
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 20;
const SOURCE_NAME = 'Unggahan manual';

/**
 * Ringkasan penyimpanan sumber dari batch yang baru saja diunggah — cukup utk
 * ditulis ke `config.storage` sumber sebagai jejak tingkat-sumber. Detail
 * per-berkas (path/url/id koneksi) hidup di tabel `uploaded_files`.
 */
function simplifikasiStorage(berkas: Array<{ stored: boolean }>): Record<string, unknown> {
  const tersimpan = berkas.filter((x) => x.stored).length;
  return { jumlahBerkas: berkas.length, tersimpan, gagalSimpan: berkas.length - tersimpan };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  ensureIntegrations();
  // Anggota tenant boleh mengunggah ke KB milik TENANT-nya (RLS menjaga ia
  // tak pernah menyentuh KB/tenant lain). Yang dulu hanya superadmin/admin
  // kini dibuka ke member — unggahan langsung adalah jalur yang paling sering
  // dipakai pemilik data yang belum punya storage terhubung.
  const user = await requireRole('superadmin', 'admin', 'member');
  const { id: knowledgeBaseId } = await ctx.params;

  const kb = await withTenant(user.tenantId, async (tx) =>
    (await tx.select({ id: knowledgeBases.id }).from(knowledgeBases)
      .where(and(eq(knowledgeBases.id, knowledgeBaseId), isNull(knowledgeBases.deletedAt)))
      .limit(1))[0]);
  if (!kb) return NextResponse.json({ error: 'Knowledge base tidak ditemukan' }, { status: 404 });

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json(
      { error: 'Gagal membaca berkas. Total unggahan mungkin melebihi 4,5 MB — batas Vercel per permintaan.' },
      { status: 413 });
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: 'Tak ada berkas yang dikirim' }, { status: 400 });
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Maksimal ${MAX_FILES} berkas per unggahan` }, { status: 400 });
  }
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: `Total ${(total / 1048576).toFixed(1)} MB melebihi batas 4 MB per unggahan. Bagi jadi beberapa kali.` },
      { status: 413 });
  }

  // Satu baris sumber per KB — dibuat sekali, lalu dipakai ulang.
  const source = await withTenant(user.tenantId, async (tx) => {
    const found = (await tx.select().from(dataSources).where(and(
      eq(dataSources.knowledgeBaseId, knowledgeBaseId),
      eq(dataSources.kind, 'upload'),
      isNull(dataSources.deletedAt),
    )).limit(1))[0];
    if (found) return found;
    return (await tx.insert(dataSources).values({
      tenantId: user.tenantId, knowledgeBaseId, kind: 'upload',
      config: { name: SOURCE_NAME }, status: 'ready',
    }).returning())[0];
  });

  const ingested: Array<{ name: string; chunks: number; stored: boolean; storagePath?: string | null }> = [];
  // Tersimpan di blob TAPI belum ter-ingest ke KB (parser gagal / teks kosong).
  // Berkas aslinya aman; tinggal di-ingest ulang begitu extractor bisa membacanya.
  const disimpan: Array<{ name: string; reason: string; stored: boolean }> = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  try {
  /* SIMPAN DULU, BARU PARSE. Berkas orisinal harus aman di blob sebelum apa
     pun — kalau parser gagal (itu tak berarti dokumennya rusak / hasil pindai),
     berkasnya tetap tersimpan & tercatat, bisa di-ingest ulang nanti. Kuota
     blob diperiksa PER-BERKAS sebelum simpan; kalau habis → QuotaError (402)
     menghentikan seluruh unggahan. (Drive/SharePoint tak pernah lewat sini —
     mereka sync langsung tanpa blob dan tak dihitung terhadap kuota ini.) */
  for (const f of files) {
    if (!isExtractable(f.name, f.type)) {
      skipped.push({ name: f.name, reason: 'format tak didukung' });
      continue;
    }
    try {
      const buf = Buffer.from(await f.arrayBuffer());

      /* 1. Kuota + SIMPAN berkas ORISINAL ke blob/BYOB (Bos Galih: "sing
         nyimpen nang blob cuma sing upload aja"). Pastikan byte-nya muat di
         kuota paket dulu — kalau tidak, tolak BERKAS INI (QuotaError → 402). */
      await knowledgeService.assertStorageBlobQuota(user.tenantId, f.size);
      const simpan = await storageService.simpanBerkasUpload(
        user.tenantId, user.id,
        {
          knowledgeBaseId,
          nama: f.name,
          bytes: buf,
          mime: f.type || null,
        },
      ).catch((e: unknown) => {
        // Gagal menyimpan (credential blob mati, bucket salah, dll) TIDAK
        // boleh menggagalkan seluruh unggahan. Dicatat sebagai tidak tersimpan
        // supaya pemilik tahu berkas aslinya tak berada di storage (dan
        // pemakaian blob tak naik) — teksnya tetap coba di-ingest di bawah.
        console.error('[upload] gagal simpan ke blob:', (e as Error).message);
        return null;
      });

      /* 2. Catat jejak berkas-orisinal SEGERA setelah tersimpan (bukan setelah
         ingest) — berkas yang tersimpan tapi gagal di-parse pun tetap tercatat
         di uploaded_files supaya aslinya tak hilang & bisa diunduh/di-ingest
         ulang. Hanya bila benar-benar tersimpan; kalau null tak ada baris dan
         byte-nya tak ikut dihitung. */
      if (simpan) {
        await withTenant(user.tenantId, (tx) => uploadedFileService.simpan(tx, {
          tenantId: user.tenantId,
          userId: user.id,
          knowledgeBaseId,
          sourceId: source.id,
          filename: f.name,
          sizeBytes: f.size,
          provider: simpan.provider,
          storageConnectionId: simpan.storageConnectionId,
          path: simpan.path,
          url: simpan.url,
          mime: f.type || null,
        }));
      }

      /* 3. BARU ekstraksi teks. Gagal/kosong ⇒ berkas TETAP tersimpan, hanya
         tak di-ingest ke KB. BUKAN "hasil pindai" — parser bisa gagal karena
         banyak sebab; error asli sudah dilog di extractText(). */
      const text = await extractText(f.name, buf, f.type);
      if (!text?.trim()) {
        disimpan.push({
          name: f.name,
          reason: simpan
            ? 'disimpan, tapi teksnya belum bisa dibaca — belum diingest ke KB'
            : 'gagal disimpan & teksnya belum bisa dibaca — belum diingest',
          stored: Boolean(simpan),
        });
        continue;
      }

      // Potongan lama dengan nama yang sama DIBUANG dulu. `ingest()` tak
      // melakukannya sendiri — jalur sync memanggil removeExternal() secara
      // terpisah sebelum meng-ingest ulang. Tanpa langkah ini, mengunggah
      // dokumen yang diperbaiki akan menyimpan DUA versi sekaligus, dan
      // retrieval bisa menjawab dari yang usang. Terbukti saat pengujian:
      // ingest dua kali dengan externalId sama menghasilkan dua potongan.
      await knowledgeService.removeExternal(user.tenantId, source.id, [f.name]);

      const chunks = await knowledgeService.ingest(user.tenantId, {
        knowledgeBaseId,
        title: f.name,
        text,
        sourceId: source.id,
        externalId: f.name,
        externalVersion: String(f.size),
        metadata: {
          uploadedBy: user.id, size: f.size, mime: f.type || null,
          ...(simpan ? { storage: { provider: simpan.provider, path: simpan.path, url: simpan.url } } : {}),
        },
      });

      ingested.push({
        name: f.name, chunks,
        stored: Boolean(simpan),
        storagePath: simpan?.path ?? null,
      });
    } catch (e) {
      // Kuota blob terlampaui → HENTIKAN seluruh unggahan dengan 402 (bukan
      // sekadar satu berkas "skip"): berkas berikutnya pasti ditolak juga, dan
      // pemilik data harus tahu jatahnya habis, bukan berkasnya yang rusak.
      if (e instanceof QuotaError) throw e;
      // Satu berkas rusak tak boleh menggagalkan seluruh unggahan.
      skipped.push({ name: f.name, reason: (e as Error).message.slice(0, 120) });
    }
  }
  } catch (e) {
    // Kuota blob terlampaui di tengah loop → seluruh unggahan dihentikan 402.
    if (e instanceof QuotaError) {
      return NextResponse.json(
        { error: e.message, type: 'quota', used: e.used, limit: e.limit }, { status: 402 });
    }
    throw e;
  }

  await withTenant(user.tenantId, (tx) => tx.update(dataSources).set({
    status: 'ready', lastSyncedAt: new Date(), updatedAt: new Date(),
    config: {
      name: SOURCE_NAME,
      // Referensi storage tingkat sumber — menyimpan PALING BANYAK SATU penyedia
      // yang dipakai batch ini, cukup utk penelusuran. Detail per-berkas hidup
      // di tabel uploaded_files.
      storage: simplifikasiStorage([...ingested, ...disimpan]),
      lastSync: { ingested: ingested.length, disimpan: disimpan.length, skipped: skipped.length },
    },
  }).where(eq(dataSources.id, source.id)));

  // Vercel membekukan lambda begitu respons terkirim; agen memory yang
  // terpicu oleh ingest akan mati di tengah tanpa ini.
  after(jobsSettled);

  return NextResponse.json({
    ok: true,
    sourceId: source.id,
    ingested,
    disimpan,
    skipped,
    chunks: ingested.reduce((n, x) => n + x.chunks, 0),
  }, { status: 201 });
}
