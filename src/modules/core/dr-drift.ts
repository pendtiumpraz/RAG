import { readFileSync, readdirSync } from 'node:fs';

/**
 * KLASIFIKASI HANYUT PEMULIHAN — murni, tanpa basis data.
 *
 * Dipisahkan dari `scripts/dr-verify.ts` karena skrip itu membuka koneksi
 * saat diimpor: menguji logikanya lewat sana berarti setiap uji unit
 * menuntut Postgres yang hidup, dan uji yang mahal dijalankan adalah uji
 * yang berhenti dijalankan.
 *
 * SATU PERTANYAAN YANG DIJAWAB DI SINI: sebuah objek yang ada di produksi
 * tapi belum ada di patokan — ia lahir dari migrasi yang sudah di-commit,
 * atau dibuat langsung di produksi? Bedanya menentukan segalanya. Yang
 * pertama akan lahir lagi setelah pemulihan; yang kedua lenyap, dan justru
 * itulah yang dicari.
 */

const DIR_MIGRASI = 'migrations';

/** Seluruh isi migrations/*.sql, dibaca SEKALI. */
export function teksMigrasi(dir = DIR_MIGRASI): string {
  return readdirSync(dir).filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
}

/**
 * Apakah objek ini lahir dari migrasi yang sudah di-commit?
 *
 * SEGMEN TERAKHIR untuk kebijakan RLS. Kebijakan dicatat sebagai
 * "tabel.kebijakan", tapi migrasinya menulis nama kebijakannya saja.
 * Menyamakan keduanya membuat SETIAP kebijakan baru tampak liar — dan
 * kebijakan RLS justru jenis objek yang paling sering ditambahkan, jadi
 * kekeliruan itu akan berulang di hampir tiap migrasi.
 *
 * BATAS KATA, bukan `includes`. Tanpa itu, indeks liar bernama
 * `divisions_bocor` akan cocok pada kata `divisions` di migrasi 0040 dan
 * lolos sebagai "terjelaskan" — bentuk kegagalan yang paling mahal, karena
 * alatnya tampak bekerja sambil diam pada hal yang seharusnya diteriakkan.
 *
 * Karakter regex di dalam nama DILOLOSKAN. Nama objek Postgres boleh
 * dikutip dan memuat titik atau kurung; tanpa pelolosan, satu nama seperti
 * `idx.*` berubah jadi pola yang cocok dengan apa saja dan membungkam
 * seluruh pemeriksaan sekaligus.
 */
export function dijelaskanMigrasi(nama: string, teks: string): boolean {
  const cari = nama.includes('.') ? nama.slice(nama.lastIndexOf('.') + 1) : nama;
  if (!cari) return false;
  const lolos = cari.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_])${lolos}([^A-Za-z0-9_]|$)`).test(teks);
}
