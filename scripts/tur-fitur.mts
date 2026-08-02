/**
 * TUR FITUR — berjalan di produksi, memotret tiap langkah, dan menyimpulkan
 * dari yang DISAKSIKAN.
 *
 *   npm run tur                                   # permukaan publik saja
 *   NALAR_EMAIL=... NALAR_SANDI=... npm run tur    # + 20 halaman di balik login
 *   TUR_TULIS=1 ... npm run tur                    # + alur yang butuh menyimpan
 *   BASIS=http://localhost:3000 npm run tur
 *
 * Hasilnya ditulis ke src/app/(app)/dataroom/bukti.generated.json dan dibaca
 * tab "Bukti Fitur" di Dataroom — jadi angka di sana punya tangkapan layar di
 * belakangnya, bukan ingatan siapa pun.
 *
 * PERAMBAN: playwright-core + Edge/Chrome yang sudah ada di mesin. Sengaja
 * bukan paket `playwright` penuh — paket itu mengunduh ±150MB peramban pada
 * tiap `npm ci`, dan CI proyek ini tak butuh peramban sama sekali.
 */
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { chromium } from 'playwright-core';
import {
  BASIS, KELUARAN, TULIS, Pengintai, jalankanAdegan, siapkanKeluaran,
} from './tur-lib.mjs';
import type { Adegan, Status } from './tur-lib.mjs';
import { adeganPublik, adeganMasuk, adeganTerlindungi, bersihkan, dibuat } from './tur-adegan.mjs';

const EMAIL = process.env.NALAR_EMAIL ?? '';
const SANDI = process.env.NALAR_SANDI ?? '';

/**
 * Kunci publik chatbot untuk memotret widget & demo.
 *
 * Dibaca dari basis data kalau kredensialnya ada, karena kunci itu memang tak
 * pernah muncul di halaman mana pun tanpa login. Kalau tak ada, kedua adegan
 * itu TIDAK dikarang — ia cuma tak ikut, dan laporannya menyebutkan begitu.
 */
async function kunciPublik(): Promise<string | null> {
  if (process.env.TUR_PUBLIC_KEY) return process.env.TUR_PUBLIC_KEY;
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) return null;
  const sql = postgres(url, { max: 1, prepare: false });
  try {
    const r = await sql`select public_key from chatbots
      where deleted_at is null and enabled = true order by created_at limit 1`;
    return (r[0]?.public_key as string) ?? null;
  } catch { return null; } finally { await sql.end(); }
}

async function utama() {
  siapkanKeluaran();
  const publicKey = await kunciPublik();

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 }, locale: 'id-ID',
  });
  const page = await ctx.newPage();
  const mata = new Pengintai();
  mata.pasang(page);

  const selesai: Adegan[] = [];
  const jejakBersih: string[] = [];
  console.log(`TUR FITUR · ${BASIS} · mode ${TULIS ? 'baca+tulis' : 'baca saja'}\n`);

  for (const def of adeganPublik(publicKey)) {
    console.log(`> ${def.fitur}`);
    selesai.push(await jalankanAdegan(page, mata, def));
  }

  let masuk = false;
  if (EMAIL && SANDI) {
    const def = adeganMasuk(EMAIL, SANDI);
    console.log(`> ${def.fitur}`);
    const a = await jalankanAdegan(page, mata, def);
    selesai.push(a);
    masuk = a.status !== 'gagal';
    if (!masuk) console.error('  LOGIN GAGAL — adegan di balik login dilewati');
  } else {
    console.log('· kredensial tak diberikan — hanya permukaan publik yang diperiksa');
  }

  if (masuk) {
    for (const def of adeganTerlindungi) {
      console.log(`> ${def.fitur}`);
      selesai.push(await jalankanAdegan(page, mata, def));
    }
    if (TULIS) {
      console.log('> Bersih-bersih objek uji');
      const j = await bersihkan(page).catch((e: Error) => [`GAGAL: ${e.message}`]);
      jejakBersih.push(...j);
      for (const b of j) console.log(`  ${b}`);
    }
  }

  await browser.close();

  const hitung = (s: Status) => selesai.filter((a) => a.status === s).length;
  const laporan = {
    basis: BASIS,
    pada: new Date().toISOString(),
    masuk,
    mode: TULIS ? 'baca+tulis' : 'baca saja',
    dibuatLaluDihapus: { ...dibuat },
    jejakBersih,
    ringkas: {
      total: selesai.length,
      bekerja: hitung('bekerja'), sebagian: hitung('sebagian'),
      gagal: hitung('gagal'), dilewati: hitung('dilewati'),
    },
    adegan: selesai,
  };
  /* Ditulis sebagai MODUL TYPESCRIPT, bukan JSON: bentuknya lalu dijaga
     `tsc` di kedua sisi, dan tab Dataroom tak perlu konfigurasi impor JSON
     yang gampang lupa dinyalakan. */
  writeFileSync('src/app/(app)/dataroom/bukti.generated.ts',
    '/* DIHASILKAN OLEH `npm run tur` — JANGAN DIEDIT TANGAN. */\n'
    + "import type { LaporanTur } from './bukti-tipe';\n\n"
    + `export const BUKTI: LaporanTur = ${JSON.stringify(laporan, null, 2)};\n`);

  console.log(`\n${selesai.length} fitur · ${hitung('bekerja')} bekerja · ${hitung('sebagian')} sebagian · ${hitung('gagal')} gagal · ${hitung('dilewati')} dilewati`);
  console.log(`tangkapan layar: ${KELUARAN}/  ·  laporan: src/app/(app)/dataroom/bukti.generated.ts`);
}

await utama();
