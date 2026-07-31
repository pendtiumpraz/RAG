/**
 * VERIFIKASI PEMULIHAN — `npm run dr:verify`
 *
 * Menjawab satu pertanyaan yang menentukan nasib setiap rencana pemulihan:
 * apakah bentuk basis data produksi masih SAMA dengan yang terakhir kali
 * disepakati di repo?
 *
 * KENAPA ITU YANG DIPERIKSA. Cadangan hampir selalu ada — Neon menyediakan
 * PITR tanpa kita minta. Yang membuat pemulihan gagal di hari buruk adalah
 * SELISIH: satu indeks yang dibuat manual lewat psql, satu kebijakan RLS yang
 * tak pernah masuk migrasi, satu kolom yang lahir dari `db:push` lalu tak
 * pernah dituliskan. Semua itu tak terlihat sehari-hari — produksinya jalan —
 * dan baru muncul sebagai "kenapa aplikasinya rusak setelah dipulihkan", saat
 * tak ada waktu untuk menyelidikinya.
 *
 * KENAPA PATOKAN, BUKAN PENCOCOKAN TEKS. Versi pertama skrip ini mencari nama
 * tabel/indeks/kebijakan di dalam schema.ts dan migrations/*.sql. Ia melaporkan
 * ENAM selisih, dan keenamnya PALSU: dua indeks ternyata UNIQUE constraint yang
 * dibuat Drizzle dari `.unique()` (namanya tak ditulis manusia), dan empat
 * kebijakan dibuat migrasi 0017 lewat FOREACH + format() sehingga nama
 * literalnya memang tak pernah muncul di berkas. Pemeriksa yang berisik lebih
 * buruk daripada tak ada: orang belajar mengabaikannya, lalu selisih sungguhan
 * bersembunyi di antara deranya.
 *
 * Patokan di `docs/dr-baseline.json` di-commit bersama perubahan skema, jadi
 * perubahan yang DISENGAJA terlihat di diff, dan perubahan yang tak disengaja
 * — yang dibuat langsung di produksi — muncul sebagai kegagalan skrip ini.
 *
 * DUA JENIS "BARU", DAN MEMBEDAKANNYA ADALAH INTI ALAT INI. Versi pertama
 * memperlakukan setiap objek yang belum ada di patokan sebagai bahaya. Begitu
 * migrasi 0040 masuk, ia melaporkan tujuh selisih menakutkan yang SEMUANYA
 * sah — lahir dari berkas migrasi yang sudah di-commit, dan karena itu pasti
 * lahir lagi setelah pemulihan. Yang berbahaya justru kebalikannya: objek
 * yang TIDAK disebut migrasi mana pun, karena hanya itu yang lenyap saat
 * basis data dibangun ulang dari repo.
 *
 * Bahayanya halus, dan justru itu sebabnya diperbaiki: kalau tiap migrasi sah
 * memicu gelombang alarm palsu, menyegarkan patokan jadi refleks — dan
 * hanyutan yang sungguhan ikut disetujui tanpa pernah dibaca. Alat yang
 * selalu berbunyi sama saja dengan alat yang tak pernah berbunyi.
 *
 * BATAS PENGENALANNYA, DAN ARAH SALAHNYA DISENGAJA. Objek dianggap
 * terjelaskan bila NAMANYA muncul di salah satu migrations/*.sql. Empat
 * kebijakan yang dibuat migrasi 0017 lewat FOREACH + format() tak pernah
 * menampakkan nama literalnya, jadi seandainya ia baru, ia akan dilaporkan
 * TAK TERJELASKAN. Itu arah yang benar: alat ini boleh terlalu curiga, tak
 * boleh terlalu tenang.
 *
 * HANYA MEMBACA. Tak membuat, mengubah, atau menghapus apa pun.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { db, client } from '@/modules/core/db';
/* Klasifikasinya tinggal di src/, bukan di sini: berkas ini membuka koneksi
   saat diimpor, jadi logika yang menumpang di dalamnya cuma bisa diuji
   dengan Postgres yang hidup. */
import { dijelaskanMigrasi, teksMigrasi } from '@/modules/core/dr-drift';

const BASELINE = 'docs/dr-baseline.json';

interface Patokan {
  tabel: string[];
  indeks: string[];
  kebijakan: string[];
  ekstensi: string[];
  /** Tabel yang RLS-nya aktif. Kebijakan tanpa RLS aktif tak menahan apa pun. */
  rlsAktif: string[];
}

async function potret(): Promise<Patokan> {
  const baris = async <T>(q: ReturnType<typeof sql>) =>
    (await db.execute(q)) as unknown as T[];

  const tabel = await baris<{ tablename: string }>(sql`
    select tablename from pg_tables where schemaname='public' order by tablename`);
  /* Indeks yang menopang CONSTRAINT sengaja dilewati: ia lahir dari
     `.unique()`/primary key di schema.ts, namanya dibuat Drizzle, dan
     `db:push` selalu membuatnya kembali. Memasukkannya cuma menambah baris
     yang tak pernah bisa ditindaklanjuti siapa pun. */
  const indeks = await baris<{ indexname: string }>(sql`
    select i.indexname from pg_indexes i
    where i.schemaname='public'
      and not exists (select 1 from pg_constraint c where c.conname = i.indexname)
    order by i.indexname`);
  const kebijakan = await baris<{ n: string }>(sql`
    select tablename || '.' || policyname as n from pg_policies
    where schemaname='public' order by 1`);
  const ekstensi = await baris<{ extname: string }>(sql`
    select extname from pg_extension where extname <> 'plpgsql' order by extname`);
  const rlsAktif = await baris<{ tablename: string }>(sql`
    select tablename from pg_tables where schemaname='public' and rowsecurity order by tablename`);

  return {
    tabel: tabel.map((x) => x.tablename),
    indeks: indeks.map((x) => x.indexname),
    kebijakan: kebijakan.map((x) => x.n),
    ekstensi: ekstensi.map((x) => x.extname),
    rlsAktif: rlsAktif.map((x) => x.tablename),
  };
}

/** Selisih dua daftar: apa yang HILANG dan apa yang MUNCUL tanpa dicatat. */
function bandingkan(patokan: string[], hidup: string[]) {
  const p = new Set(patokan), h = new Set(hidup);
  return {
    hilang: patokan.filter((x) => !h.has(x)),
    baru: hidup.filter((x) => !p.has(x)),
  };
}


async function main() {
  const kini = await potret();
  const tulis = process.argv.includes('--tulis');

  /* Menyegarkan patokan saat masih ada hanyutan LIAR adalah cara paling rapi
     menghapus bukti: selisihnya berhenti dilaporkan tanpa pernah menjadi bisa
     dipulihkan. Karena itu --tulis menolak, dan --paksa harus diketik sadar. */
  if (tulis && existsSync(BASELINE) && !process.argv.includes('--paksa')) {
    const lama = JSON.parse(readFileSync(BASELINE, 'utf8')) as Patokan;
    const migrasi = teksMigrasi();
    const liar = ([
      [lama.tabel, kini.tabel], [lama.indeks, kini.indeks],
      [lama.kebijakan, kini.kebijakan], [lama.ekstensi, kini.ekstensi],
      [lama.rlsAktif, kini.rlsAktif],
    ] as Array<[string[], string[]]>).flatMap(([p, h]) => {
      const d = bandingkan(p, h);
      return [...d.hilang, ...d.baru.filter((x) => !dijelaskanMigrasi(x, migrasi))];
    });
    if (liar.length) {
      console.error(`\nMENOLAK menulis patokan: ${liar.length} selisih LIAR belum dijelaskan`);
      console.error('migrasi mana pun.\n');
      for (const x of liar) console.error(`  ${x}`);
      console.error('\nTuliskan dulu migrations/*.sql-nya. Kalau memang sengaja, ulangi');
      console.error('dengan `-- --tulis --paksa`.\n');
      process.exitCode = 1;
      return;
    }
  }

  if (tulis || !existsSync(BASELINE)) {
    writeFileSync(BASELINE, `${JSON.stringify(kini, null, 2)}\n`);
    console.log(`\nPatokan ditulis ke ${BASELINE}.`);
    console.log('COMMIT berkas ini bersama perubahan skemanya — itulah yang membuat');
    console.log('perubahan yang disengaja terlihat di diff, dan yang tak disengaja');
    console.log('muncul sebagai kegagalan dr:verify.\n');
    return;
  }

  const patokan = JSON.parse(readFileSync(BASELINE, 'utf8')) as Patokan;
  const bagian: Array<[string, string[], string[]]> = [
    ['tabel', patokan.tabel, kini.tabel],
    ['indeks', patokan.indeks, kini.indeks],
    ['kebijakan RLS', patokan.kebijakan, kini.kebijakan],
    ['ekstensi', patokan.ekstensi, kini.ekstensi],
    ['RLS aktif', patokan.rlsAktif, kini.rlsAktif],
  ];

  console.log(`\nVERIFIKASI PEMULIHAN — ${kini.tabel.length} tabel · ${kini.indeks.length} indeks · `
    + `${kini.kebijakan.length} kebijakan · RLS aktif di ${kini.rlsAktif.length} tabel\n`);

  const migrasi = teksMigrasi();
  const terjelaskan: string[] = [];
  let liar = 0;

  for (const [nama, p, h] of bagian) {
    const d = bandingkan(p, h);
    /* HILANG selalu liar. Migrasi bisa menjelaskan kelahiran sebuah objek,
       tak pernah ketiadaannya — tak ada berkas yang bisa membuktikan bahwa
       sesuatu memang seharusnya lenyap. */
    for (const x of d.hilang) {
      liar++;
      console.log(`  [${nama} HILANG] ${x}`);
      console.log('      Ada di patokan, tak ada di produksi. Sesuatu menghapusnya.');
    }
    for (const x of d.baru) {
      if (dijelaskanMigrasi(x, migrasi)) { terjelaskan.push(`${nama}: ${x}`); continue; }
      liar++;
      console.log(`  [${nama} LIAR] ${x}`);
      console.log('      Ada di produksi, TAK disebut migrasi mana pun — kemungkinan dibuat');
      console.log('      langsung di produksi, dan TIDAK akan ada setelah pemulihan.');
    }
  }

  if (terjelaskan.length) {
    console.log(`  ${terjelaskan.length} objek baru TERJELASKAN oleh migrations/*.sql:`);
    for (const x of terjelaskan) console.log(`      ${x}`);
    console.log('      Ini bukan hanyutan: pemulihan memutar ulang migrasinya dan akan');
    console.log('      menghasilkan objek yang sama. Patokannya saja yang tertinggal —');
    console.log('      segarkan dengan `npm run dr:verify -- --tulis`.\n');
  }

  if (liar === 0) {
    console.log(terjelaskan.length
      ? 'Tak ada hanyutan liar. Semua selisih terjelaskan migrasi ter-commit.\n'
      : 'Tak ada selisih. Bentuk produksi sama persis dengan patokan terakhir\nyang disepakati di repo.\n');
  } else {
    console.log(`\n${liar} selisih LIAR. Setiap satu berarti pemulihan menghasilkan basis data`);
    console.log('yang BERBEDA dari produksi sekarang. Perbaiki lewat migrations/*.sql —');
    console.log('BUKAN dengan menyegarkan patokan, karena menyegarkannya hanya membuat');
    console.log('selisihnya berhenti dilaporkan tanpa membuatnya bisa dipulihkan.\n');
    process.exitCode = 1;
  }

  console.log('Yang TIDAK dibuktikan skrip ini: bahwa DATANYA bisa dipulihkan.');
  console.log('Ia hanya membandingkan BENTUK. Pemulihan data adalah PITR Neon, dan');
  console.log('latihannya belum pernah dijalankan — lihat docs/RUNBOOK.md.\n');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
