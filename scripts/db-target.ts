/**
 * ALAT PEMINDAHAN BASIS DATA — uji, siapkan, migrasikan sebuah Postgres
 * mana pun (Neon, Hostinger, AWS RDS, VPS sendiri) sebelum dipakai Nalar.
 *
 *   npm run db:probe   -- "postgres://..."     # periksa kelayakan saja
 *   npm run db:target  -- "postgres://..."     # periksa lalu migrasikan
 *
 * Ada karena satu alasan yang sangat konkret: aplikasi ini TIDAK terikat
 * Neon sama sekali — ia hanya `postgres.js` + DATABASE_URL. Pindah cukup
 * mengganti satu variabel lingkungan. Yang berbahaya bukan pemindahannya,
 * melainkan pindah ke basis data yang ternyata tak punya pgvector, atau yang
 * perannya bisa MELEWATI Row-Level Security — dan keduanya baru ketahuan
 * setelah semuanya terlanjur diarahkan ke sana.
 *
 * Tak pernah menyentuh DATABASE_URL yang sedang berjalan. Peralihannya tetap
 * keputusan manusia: alat ini menyiapkan tujuannya, bukan memindahkan lalu
 * lintas ke sana.
 */
import postgres from 'postgres';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { probeDatabase } from '../src/modules/core/db/probe';
import { decideSsl } from '../src/modules/core/db/ssl';

const MARK: Record<string, string> = { ok: '  ok  ', warn: ' PERIKSA', fail: ' GAGAL' };

async function main() {
  const url = process.argv[2]?.trim();
  const migrasi = process.argv.includes('--migrate');
  // Koneksi migrasi dinilai dengan ukuran berbeda: di sana berhak penuh MEMANG
  // seharusnya, sedangkan pada koneksi aplikasi itu cacat yang mematikan
  // isolasi antar pelanggan.
  const intent = process.argv.includes('--admin') || migrasi ? 'admin' as const : 'app' as const;
  if (!url || !url.startsWith('postgres')) {
    console.error('Pemakaian: npm run db:probe -- "postgres://user:pass@host:5432/db"');
    process.exit(1);
  }

  const host = (() => { try { return new URL(url).hostname; } catch { return '(tak terbaca)'; } })();
  console.log(`\nMemeriksa ${host} …\n`);

  const hasil = await probeDatabase(url, intent);
  for (const i of hasil.items) {
    console.log(`[${MARK[i.level]}] ${i.label.padEnd(22)} ${i.detail}`);
  }

  console.log();
  if (!hasil.usable) {
    console.error('TIDAK LAYAK dipakai. Perbaiki yang bertanda GAGAL lebih dulu.\n');
    process.exit(2);
  }
  console.log('Layak dipakai.');

  if (!migrasi) {
    console.log('\nUntuk memigrasikan skema ke sana:  npm run db:target -- "<url>"\n');
    process.exit(0);
  }

  /* ── migrasi ──────────────────────────────────────────────────────
     Menjalankan berkas SQL yang sama dengan db:migrate, terhadap TUJUAN —
     bukan terhadap DATABASE_URL. Urutan berkas ditentukan namanya, sama
     seperti runner biasa. */
  console.log('\nMemigrasikan skema ke tujuan …\n');
  const { ssl } = decideSsl(url);
  const sql = postgres(url, { max: 1, prepare: false, ssl });
  try {
    const dir = join(process.cwd(), 'migrations');
    const berkas = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const f of berkas) {
      process.stdout.write(`  ${f} … `);
      try {
        await sql.unsafe(await readFile(join(dir, f), 'utf8'));
        console.log('selesai');
      } catch (e) {
        // Migrasi di proyek ini idempoten & terjaga; galat di sini berarti
        // sesuatu yang sungguh berbeda pada tujuannya, jadi HENTIKAN —
        // meneruskan hanya menghasilkan skema separuh jadi.
        console.log('GAGAL');
        console.error(`\n  ${(e as Error).message}\n`);
        process.exit(3);
      }
    }
    console.log('\nSkema siap. Langkah berikutnya, dan ini keputusanmu:');
    console.log('  1. Pindahkan datanya (pg_dump/pg_restore atau ekspor per tenant)');
    console.log('  2. Buat peran nalar_app di sana:  DATABASE_URL="<url>" npm run db:setup-role');
    console.log('  3. Baru arahkan DATABASE_URL aplikasi ke tujuan\n');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
