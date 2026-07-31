/**
 * PEKERJA INGEST — menjalankan sync sampai TUNTAS, di luar Vercel.
 *
 *   NALAR_INGEST_WORKER=1 npm run ingest:worker
 *   NALAR_INGEST_WORKER=1 npm run ingest:worker -- --source=<id>
 *   NALAR_INGEST_WORKER=1 npm run ingest:worker -- --sekali    # satu putaran
 *
 * KENAPA ADA. Di Vercel sebuah fungsi dipaksa selesai dalam 60 detik dan
 * dibekukan begitu responsnya terkirim, jadi sync memproses 150 berkas per
 * jalan lalu berhenti dengan sisanya dilaporkan `pending`. Untuk korpus
 * kecil itu tak terasa. Untuk 700 GB — ±3,1 juta dokumen — itu ±20.589 kali
 * jalan, ±14 hari nonstop bila dipicu cron tiap menit DAN setiap putaran
 * sukses penuh. Yang menghalangi bukan kapasitas: indeks korpus sebesar itu
 * hanya 2,5 GB dan MELAYANI pertanyaannya dari Vercel sudah muat. Yang tak
 * ada adalah proses latar yang hidup terus. Ini prosesnya.
 *
 * TAK ADA KODE INGEST BARU DI SINI, dan itu bukan kebetulan melainkan
 * syaratnya. Pekerja ini memanggil `runSync` yang sama persis dengan yang
 * dipakai jalur HTTP; kalau ia punya jalur ingest sendiri, jalur itu akan
 * berbeda perilakunya dalam hal yang tak seorang pun sadari sampai hasil
 * ingest lewat pekerja ternyata tak sama dengan lewat tombol.
 *
 * BASIS DATANYA SAMA. Pekerja menulis ke Postgres yang sama dengan yang
 * dibaca Vercel, jadi penyajian tetap serverless sementara pemasukan
 * dokumen berjalan di mesin yang tak punya tenggat. Yang berbeda hanya
 * pemicunya.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, client } from '@/modules/core/db';
import { dataSources, tenants } from '@/modules/core/db/schema';
import { withTenant } from '@/modules/core/db/tenant-context';
import { runSync } from '@/modules/knowledge/sync.service';
import { batasSync, ENV_PEKERJA } from '@/modules/knowledge/sync-limits';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const flag = (n: string) => process.argv.includes(`--${n}`);

/**
 * Atap putaran per sumber.
 *
 * Ada karena sync yang TAK PERNAH menghabiskan antreannya — misalnya karena
 * kuota tenant sudah habis, atau upstream terus melempar berkas baru — akan
 * memutar selamanya tanpa satu pun tanda. Atap ini membuat keadaan itu
 * berakhir sebagai laporan, bukan sebagai proses yang menggantung semalaman.
 */
const MAX_PUTARAN = 500;

/** Jeda antar putaran — memberi ruang bagi penyedia upstream, bukan menahan diri. */
const JEDA_MS = 1_000;

let berhenti = false;
for (const sinyal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinyal, () => {
    // Berhenti DI ANTARA putaran, bukan di tengah. Memutus sync di tengah
    // meninggalkan sumber berstatus 'syncing' yang tak pernah berubah, dan
    // itu terbaca sebagai macet padahal cuma dihentikan.
    if (berhenti) process.exit(130);
    console.log(`\n[worker] ${sinyal} diterima — berhenti setelah putaran ini selesai.`);
    berhenti = true;
  });
}

interface Antre { tenantId: string; userId: string; sourceId: string; nama: string }

/**
 * Sumber yang masih punya pekerjaan.
 *
 * `partial` berarti putaran sebelumnya menyisakan `pending`; `error` ikut
 * diambil karena kegagalan sering bersifat sementara (token kedaluwarsa yang
 * sudah diperbarui, upstream yang sempat 503) dan pekerja yang menolak
 * mencoba lagi menyerahkan pemulihan pada manusia yang tak sedang melihat.
 */
async function antrean(sourceId?: string): Promise<Antre[]> {
  const ts = await db.select({ id: tenants.id, nama: tenants.name }).from(tenants);
  const out: Antre[] = [];
  for (const t of ts) {
    const rows = await withTenant(t.id, (tx) => tx.select({
      id: dataSources.id, status: dataSources.status,
      kind: dataSources.kind, config: dataSources.config,
    }).from(dataSources).where(and(
      isNull(dataSources.deletedAt),
      sourceId ? eq(dataSources.id, sourceId) : sql`true`,
    )));

    for (const r of rows) {
      if (!sourceId && !['partial', 'error', 'pending', 'quota'].includes(r.status ?? '')) continue;
      // Kuota habis TIDAK diulang: memutar ulang sesuatu yang pasti ditolak
      // hanya membakar panggilan upstream, dan yang perlu terjadi adalah
      // manusia menghapus dokumen atau menaikkan paket.
      if (r.status === 'quota') {
        console.log(`[worker] lewati ${r.id} (${t.nama}) — kuota habis, butuh tindakan manusia`);
        continue;
      }

      /* userId dipakai HANYA untuk mengambil token OAuth milik akun sumber
         ini, jadi yang benar adalah PEMILIK KONEKSINYA — bukan siapa pun
         di tenant. Memakai user sembarang berarti token yang diambil milik
         orang lain, dan sync akan gagal dengan galat izin yang menyesatkan:
         seolah aksesnya dicabut, padahal sekadar salah orang. */
      const userId = await pemilikKoneksi(t.id, r.kind, r.config as Record<string, unknown>);
      if (!userId) {
        console.log(`[worker] lewati ${r.id} (${t.nama}/${r.kind}) — tak ada koneksi OAuth yang cocok`);
        continue;
      }
      out.push({ tenantId: t.id, userId, sourceId: r.id, nama: `${t.nama}/${r.kind}` });
    }
  }
  return out;
}

/**
 * Siapa yang memegang token untuk sumber ini.
 *
 * Sumber `upload`/`url` tak butuh OAuth sama sekali — pemanggilnya cuma perlu
 * userId yang sah, dan siapa pun di tenant memenuhinya.
 */
async function pemilikKoneksi(
  tenantId: string, kind: string, config: Record<string, unknown>,
): Promise<string | null> {
  const provider = kind.startsWith('gdrive') ? 'google'
    : (kind === 'onedrive' || kind === 'sharepoint') ? 'microsoft' : null;

  if (!provider) {
    const u = (await withTenant(tenantId, (tx) => tx.execute(sql`
      select id::text as id from users where deleted_at is null order by created_at limit 1
    `))) as unknown as Array<{ id: string }>;
    return u[0]?.id ?? null;
  }

  const email = typeof config.accountEmail === 'string' ? config.accountEmail : null;
  const rows = await withTenant(tenantId, (tx) => tx.execute(sql`
    select user_id::text as "userId" from oauth_connections
     where provider = ${provider} and deleted_at is null
       ${email ? sql`and account_email = ${email.toLowerCase()}` : sql``}
     order by updated_at desc limit 1
  `)) as unknown as Array<{ userId: string }>;
  return rows[0]?.userId ?? null;
}

/** Status sumber sesudah satu putaran — menentukan apakah perlu diputar lagi. */
async function statusSumber(tenantId: string, sourceId: string) {
  const r = await withTenant(tenantId, (tx) => tx.select({
    status: dataSources.status, config: dataSources.config,
  }).from(dataSources).where(eq(dataSources.id, sourceId)).limit(1));
  const cfg = (r[0]?.config ?? {}) as { lastSync?: { pending?: number } };
  return { status: r[0]?.status ?? null, pending: cfg.lastSync?.pending ?? 0 };
}

async function main() {
  const batas = batasSync();
  if (batas.mode !== 'pekerja') {
    /* MENOLAK berjalan dengan batas lambda, bukan diam-diam memakainya.
       Menjalankan pekerja dengan batas 150 berkas per putaran akan tampak
       bekerja — ia memang maju — sambil membutuhkan ribuan kali lebih lama
       dari yang seharusnya, dan tak ada yang akan curiga. */
    console.error(
      `Pekerja ini menuntut ${ENV_PEKERJA}=1.\n`
      + 'Tanpa itu batasnya tetap batas lambda (150 berkas/putaran) dan pekerja\n'
      + 'akan berjalan ribuan kali lebih lama tanpa satu pun tanda bahwa ada\n'
      + 'yang salah konfigurasi.');
    process.exit(2);
  }

  console.log(`[worker] mode=${batas.mode} ingest/putaran=${batas.ingestPerRun} listing=${batas.listFiles}`);
  const daftar = await antrean(arg('source'));
  if (!daftar.length) { console.log('[worker] tak ada sumber yang perlu dikerjakan.'); return; }
  console.log(`[worker] ${daftar.length} sumber dalam antrean\n`);

  for (const a of daftar) {
    if (berhenti) break;
    let putaran = 0;
    for (;;) {
      if (berhenti) break;
      putaran++;
      const mulai = Date.now();
      try {
        await runSync({ tenantId: a.tenantId, userId: a.userId, sourceId: a.sourceId });
      } catch (e) {
        // Satu sumber yang gagal TIDAK menghentikan sumber lain. Peringatan
        // sudah diterbitkan runSync sendiri (core/alerts).
        console.error(`[worker] ${a.nama} putaran ${putaran} GAGAL: ${(e as Error).message.slice(0, 140)}`);
        break;
      }
      const { status, pending } = await statusSumber(a.tenantId, a.sourceId);
      const detik = ((Date.now() - mulai) / 1000).toFixed(1);
      console.log(`[worker] ${a.nama} putaran ${putaran}: status=${status} sisa=${pending} (${detik}s)`);

      if (flag('sekali')) break;
      if (pending <= 0 || status === 'synced' || status === 'quota') break;
      if (putaran >= MAX_PUTARAN) {
        console.warn(`[worker] ${a.nama} mencapai batas ${MAX_PUTARAN} putaran dengan sisa ${pending} — `
          + 'antreannya tak pernah habis; periksa apakah upstream terus menambah berkas.');
        break;
      }
      await new Promise((r) => setTimeout(r, JEDA_MS));
    }
  }
  console.log(berhenti ? '\n[worker] dihentikan.' : '\n[worker] selesai.');
}

main().catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
