import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  adaPenyaring, cocokCari, keadaanAwal, klikUrut, nilaiUnik, normalisasi,
  olahTabel, ubahCari, ubahSaring, ubahUkuran,
  type KeadaanTabel, type OpsiTabel,
} from '../src/app/_lib/tabel';

/**
 * TABEL — aturan yang menahan seluruh tabel modul berperilaku sama.
 *
 * Tiap tes di sini menjaga satu bentuk kegagalan yang TIDAK terlihat saat
 * membangunnya: semuanya benar pada halaman pertama, pada data demo, dengan
 * kotak cari kosong. Itu tepat keadaan yang dipakai orang menilai "sudah
 * jalan" — dan tepat keadaan yang tak pernah dialami pelanggan.
 */

interface Baris { nama: string; peran: string; pesan: number; sync: string | null }

const DATA: Baris[] = [
  { nama: 'Budi Santoso', peran: 'admin', pesan: 120, sync: '2026-07-30' },
  { nama: 'Ani Wijaya', peran: 'member', pesan: 12, sync: null },
  { nama: 'Citra Dewi', peran: 'admin', pesan: 9, sync: '2026-06-01' },
  { nama: 'Dedi Kurnia', peran: 'member', pesan: 300, sync: '2026-07-31' },
  { nama: 'Eka Putri', peran: 'viewer', pesan: 45, sync: null },
];

const OPSI: OpsiTabel<Baris> = {
  cari: (r) => [r.nama, r.peran],
  saring: { peran: (r) => r.peran },
  urut: { nama: (r) => r.nama, pesan: (r) => r.pesan, sync: (r) => r.sync },
};

const K = (patch: Partial<KeadaanTabel> = {}): KeadaanTabel => ({ ...keadaanAwal(), ...patch });

/* ── nomor baris ──────────────────────────────────────────────────────── */

test('NOMOR BARIS GLOBAL — halaman 2 tidak mulai dari 1 lagi', () => {
  /* Bentuk kegagalannya: `rows.map((r, i) => i + 1)`. Benar di halaman
     pertama — satu-satunya halaman yang biasanya dibuka saat membangunnya —
     dan salah di setiap halaman berikutnya. Akibatnya dua baris berbeda punya
     nomor yang sama, dan nomor berhenti bisa dipakai menyebut baris ("cek
     nomor 23") yang justru satu-satunya gunanya. */
  const h1 = olahTabel(DATA, OPSI, K({ ukuran: 2, halaman: 1 }));
  const h2 = olahTabel(DATA, OPSI, K({ ukuran: 2, halaman: 2 }));
  const h3 = olahTabel(DATA, OPSI, K({ ukuran: 2, halaman: 3 }));
  assert.equal(h1.mulai, 0);
  assert.equal(h2.mulai, 2, 'halaman 2 menomori ulang dari awal');
  assert.equal(h3.mulai, 4);
  // Nomor yang benar-benar tampil tak boleh ada yang kembar.
  const nomor = [h1, h2, h3].flatMap((h) => h.tampil.map((_, i) => h.mulai + i + 1));
  assert.deepEqual(nomor, [1, 2, 3, 4, 5]);
});

test('nomor tetap runut SETELAH disaring — bukan nomor asli barisnya', () => {
  /* Yang dinomori adalah tampilan, bukan data. Kalau nomor melompat (1, 3, 4)
     karena mengikuti indeks aslinya, pembacanya akan mengira ada baris yang
     hilang tanpa sebab. */
  const h = olahTabel(DATA, OPSI, K({ saring: { peran: 'admin' }, ukuran: 10 }));
  assert.deepEqual(h.tampil.map((_, i) => h.mulai + i + 1), [1, 2]);
});

/* ── halaman ──────────────────────────────────────────────────────────── */

test('MENGETIK PENCARIAN MENGEMBALIKAN KE HALAMAN 1', () => {
  /* Tanpa ini: seseorang di halaman 7 mengetik kata kunci, hasilnya 3 baris —
     yang semuanya ada di halaman 1 — dan layar menunjukkan tabel KOSONG. Yang
     membacanya menyimpulkan datanya tak ada, bukan bahwa ia sedang berdiri di
     halaman yang tak punya isi lagi. */
  assert.equal(ubahCari(K({ halaman: 7 }), 'budi').halaman, 1);
  assert.equal(ubahSaring(K({ halaman: 7 }), 'peran', 'admin').halaman, 1);
  assert.equal(ubahUkuran(K({ halaman: 7 }), 50).halaman, 1);
  assert.equal(klikUrut(K({ halaman: 7 }), 'nama').halaman, 1);
});

test('halaman DIJEPIT saat hasil menyusut — tak pernah kosong tanpa sebab', () => {
  /* Jaring pengaman untuk jalur yang tak lewat ubahCari(): data yang berubah
     sendiri (polling, hapus baris terakhir) bisa mengecilkan hasil tanpa satu
     pun aksi pengguna. */
  const h = olahTabel(DATA, OPSI, K({ halaman: 99, ukuran: 2 }));
  assert.equal(h.halaman, 3, 'halaman di luar jangkauan tak dijepit ke halaman terakhir');
  assert.equal(h.tampil.length, 1);
  assert.ok(h.tampil.length > 0, 'halaman terjepit tetap menghasilkan tabel kosong');
});

test('daftar kosong tetap punya satu halaman, bukan nol', () => {
  const h = olahTabel([], OPSI, K());
  assert.equal(h.halamanTotal, 1, '0 halaman membuat "halaman 1 dari 0" tampil di layar');
  assert.equal(h.halaman, 1);
  assert.equal(h.total, 0);
});

test('total mentah DIBEDAKAN dari total tersaring', () => {
  /* Dua keadaan kosong yang menuntut kalimat berbeda: "belum ada data, mulai
     dengan menambah" vs "tak ada yang cocok, longgarkan penyaringnya".
     Menyamakannya menyuruh orang menambah data yang sebenarnya sudah ada. */
  const h = olahTabel(DATA, OPSI, K({ q: 'zzz' }));
  assert.equal(h.total, 0);
  assert.equal(h.totalMentah, 5);
});

/* ── cari ─────────────────────────────────────────────────────────────── */

test('cari ber-AND antar kata, lintas kolom', () => {
  /* "budi admin" harus ketemu walau tak ada satu kolom pun yang memuat kedua
     kata itu berurutan — itulah yang orang ketik. */
  const h = olahTabel(DATA, OPSI, K({ q: 'budi admin' }));
  assert.deepEqual(h.tampil.map((r) => r.nama), ['Budi Santoso']);
  assert.equal(olahTabel(DATA, OPSI, K({ q: 'budi member' })).total, 0);
});

test('cari mengabaikan besar-kecil huruf dan spasi berlebih', () => {
  assert.equal(olahTabel(DATA, OPSI, K({ q: '  BUDI   santoso ' })).total, 1);
  assert.equal(normalisasi('  Budi   SANTOSO '), 'budi santoso');
});

test('kotak cari kosong TIDAK menyaring apa pun', () => {
  /* Bentuk kegagalan yang gampang: string kosong dianggap kata kunci, lalu
     seluruh tabel hilang saat halaman pertama kali dibuka. */
  assert.equal(olahTabel(DATA, OPSI, K({ q: '   ' })).total, DATA.length);
  assert.equal(cocokCari('apa pun', ''), true);
});

/* ── saring ───────────────────────────────────────────────────────────── */

test('penyaring bernilai kosong berarti SEMUA, bukan "yang kosong"', () => {
  assert.equal(olahTabel(DATA, OPSI, K({ saring: { peran: '' } })).total, DATA.length);
});

test('penyaring mencocokkan PERSIS, bukan sebagian', () => {
  /* "admin" tak boleh ikut menarik "superadmin" — penyaring peran yang
     mencocokkan sebagian akan diam-diam memperlihatkan akun yang lebih
     berkuasa di daftar yang mengaku berisi admin biasa. */
  const rows = [{ peran: 'admin' }, { peran: 'superadmin' }];
  const o: OpsiTabel<{ peran: string }> = { saring: { peran: (r) => r.peran } };
  assert.equal(olahTabel(rows, o, K({ saring: { peran: 'admin' } })).total, 1);
});

test('pilihan penyaring diambil dari DATA, terurut, tanpa kembar & tanpa kosong', () => {
  assert.deepEqual(nilaiUnik(DATA, (r) => r.peran), ['admin', 'member', 'viewer']);
  assert.deepEqual(nilaiUnik(DATA, (r) => r.sync), ['2026-06-01', '2026-07-30', '2026-07-31']);
  assert.deepEqual(nilaiUnik([], (r: Baris) => r.peran), []);
});

/* ── urut ─────────────────────────────────────────────────────────────── */

test('angka diurutkan sebagai ANGKA, bukan sebagai teks', () => {
  /* Bentuk kegagalan klasik: 9 > 300 karena '9' > '3'. Terlihat benar sampai
     ada baris berdigit tiga — yaitu tepat saat tabelnya mulai berguna. */
  const naik = olahTabel(DATA, OPSI, K({ urut: 'pesan', arah: 'naik' }));
  assert.deepEqual(naik.tampil.map((r) => r.pesan), [9, 12, 45, 120, 300]);
  const turun = olahTabel(DATA, OPSI, K({ urut: 'pesan', arah: 'turun' }));
  assert.deepEqual(turun.tampil.map((r) => r.pesan), [300, 120, 45, 12, 9]);
});

test('NILAI KOSONG SELALU DI BAWAH — di kedua arah', () => {
  /* Kalau kosong ikut dibalik, membalik "terakhir sync" menaruh sumber yang
     BELUM PERNAH sync di puncak — persis tempat mata mencari yang terbaru,
     dan persis kesimpulan yang salah. */
  const naik = olahTabel(DATA, OPSI, K({ urut: 'sync', arah: 'naik' }));
  const turun = olahTabel(DATA, OPSI, K({ urut: 'sync', arah: 'turun' }));
  assert.deepEqual(naik.tampil.slice(-2).map((r) => r.sync), [null, null]);
  assert.deepEqual(turun.tampil.slice(-2).map((r) => r.sync), [null, null]);
  assert.equal(turun.tampil[0].sync, '2026-07-31');
});

test('urutan STABIL — baris berbobot sama tak bertukar tempat', () => {
  const rows = [{ k: 'a', id: 1 }, { k: 'a', id: 2 }, { k: 'a', id: 3 }];
  const o: OpsiTabel<{ k: string; id: number }> = { urut: { k: (r) => r.k } };
  for (const arah of ['naik', 'turun'] as const) {
    const h = olahTabel(rows, o, K({ urut: 'k', arah }));
    assert.deepEqual(h.tampil.map((r) => r.id), [1, 2, 3], `urutan tak stabil saat ${arah}`);
  }
});

test('klik ketiga MELEPAS urutan, mengembalikan urutan asli', () => {
  /* Sebagian tabel punya urutan bawaan yang bermakna (antrean, prioritas,
     kronologi) dan tak bisa dilahirkan kembali oleh kolom mana pun. Tanpa
     jalan keluar, satu klik iseng menghapusnya sampai halaman dimuat ulang. */
  let k = K();
  k = klikUrut(k, 'nama'); assert.deepEqual([k.urut, k.arah], ['nama', 'naik']);
  k = klikUrut(k, 'nama'); assert.deepEqual([k.urut, k.arah], ['nama', 'turun']);
  k = klikUrut(k, 'nama'); assert.equal(k.urut, null, 'klik ketiga tak melepas urutan');
  // Pindah kolom selalu mulai dari menaik, bukan mewarisi arah kolom sebelumnya.
  k = klikUrut(klikUrut(K(), 'nama'), 'pesan');
  assert.deepEqual([k.urut, k.arah], ['pesan', 'naik']);
});

test('kolom yang tak punya pengambil nilai TIDAK mengacak tabel', () => {
  const h = olahTabel(DATA, OPSI, K({ urut: 'kolom-yang-tak-ada' }));
  assert.deepEqual(h.tampil.map((r) => r.nama), DATA.map((r) => r.nama));
});

/* ── urutan operasinya sendiri ────────────────────────────────────────── */

test('saring dulu, baru urut, baru penggal', () => {
  /* Kalau dipenggal sebelum disaring, tiap halaman berisi jumlah baris yang
     berbeda-beda; kalau diurut sebelum disaring, yang diurutkan adalah baris
     yang akan dibuang. Keduanya menghasilkan tabel yang terlihat "kadang
     benar". */
  const h = olahTabel(DATA, OPSI, K({ saring: { peran: 'member' }, urut: 'pesan', arah: 'turun', ukuran: 1 }));
  assert.equal(h.total, 2);
  assert.equal(h.halamanTotal, 2);
  assert.deepEqual(h.tampil.map((r) => r.nama), ['Dedi Kurnia']);
});

test('data null/undefined tak meledak — hanya kosong', () => {
  for (const kosong of [null, undefined]) {
    const h = olahTabel(kosong, OPSI, K());
    assert.equal(h.total, 0);
    assert.equal(h.tampil.length, 0);
  }
});

test('adaPenyaring membedakan "belum dicari" dari "dicari & tak ketemu"', () => {
  assert.equal(adaPenyaring(K()), false);
  assert.equal(adaPenyaring(K({ q: '  ' })), false, 'spasi dianggap pencarian aktif');
  assert.equal(adaPenyaring(K({ q: 'a' })), true);
  assert.equal(adaPenyaring(K({ saring: { peran: '' } })), false);
  assert.equal(adaPenyaring(K({ saring: { peran: 'admin' } })), true);
});
