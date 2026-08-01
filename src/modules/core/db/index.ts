import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { decideSsl } from './ssl';
import { AMBANG_LAMBAT_MS, batasSambung } from './koneksi';
import { log } from '../observability';

const connectionString = process.env.DATABASE_URL!;

// `prepare: false` wajib untuk pooler pgbouncer (Neon/Vercel Postgres).
// Serverless: 1 koneksi per invocation agar tidak menghabiskan pool;
// server long-lived (VPS/on-prem): pool lebih besar.
// TLS: MENYALA untuk host publik apa pun; mati hanya untuk host lokal/privat
// atau bila dinyatakan `sslmode=disable`. Dulu ditebak dari nama host
// (`neon.tech`, `.aws.`), yang diam-diam mematikan TLS begitu basis datanya
// bukan Neon — persis yang terjadi kalau pindah ke VPS. Lihat db/ssl.ts.
const { ssl: sslMode } = decideSsl(connectionString);
/* Batas waktu MENYAMBUNG — lihat db/koneksi.ts untuk pengukuran yang
   melahirkannya (panggilan pertama dari lambda dingin: 57 detik; kedua: 0,45
   detik). Ia menurunkan atap dari ±57 ke ±30 detik, bukan membuktikan
   sebabnya; sengaja tidak dibuat lebih agresif karena batas yang terlalu
   pendek mengubah "lambat tapi berhasil" jadi "gagal", dan itu jauh lebih
   buruk bagi orang yang sedang memakai produknya. */
const batasSambungDetik = batasSambung();

const client = postgres(connectionString, {
  max: process.env.VERCEL ? 1 : 10,
  prepare: false,
  idle_timeout: 20,
  connect_timeout: batasSambungDetik,
  ssl: sslMode,
  /* Satu-satunya jejak yang akan ada saat kejadian itu terulang. Tanpa ini,
     yang tersisa cuma pengguna yang menunggu dan tak ada angka apa pun untuk
     ditindaklanjuti. Dipasang di `onnotice`? Bukan — postgres.js tak
     memberitahu lama sambung, jadi diukur sendiri di pembungkus di bawah. */
});

/**
 * Catat penyambungan yang lambat.
 *
 * Diukur pada kueri PERTAMA setelah proses hidup, karena di situlah
 * penyambungan benar-benar terjadi — kueri berikutnya memakai koneksi yang
 * sama dan tak menceritakan apa pun tentang biaya menyambung.
 */
let sudahDiukur = false;
export async function ukurSambungPertama(): Promise<void> {
  if (sudahDiukur) return;
  sudahDiukur = true;
  const t0 = Date.now();
  try {
    await client`select 1`;
    const ms = Date.now() - t0;
    if (ms >= AMBANG_LAMBAT_MS) {
      log('warn', {
        event: 'db.sambung_lambat', durasiMs: ms, batasDetik: batasSambungDetik,
        pesan: 'Penyambungan pertama ke basis data jauh lebih lama dari biasanya.',
      });
    }
  } catch (e) {
    log('error', { event: 'db.sambung_gagal', durasiMs: Date.now() - t0, pesan: (e as Error).message });
  }
}

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { client };
export * from './schema';
