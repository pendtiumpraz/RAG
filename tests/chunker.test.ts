import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

const load = () => import('../src/modules/knowledge/chunker');

const tabel = (n: number) => ['| No | Uraian  | Jumlah |', '|----|---------|--------|']
  .concat(Array.from({ length: n }, (_, i) => `| ${i + 1} | Item ${i + 1} | ${(i + 1) * 1000} |`))
  .join('\n');

test('kepala tabel DIULANG di potongan lanjutan', async () => {
  /* Kegagalan yang paling mahal karena hasilnya TERLIHAT masuk akal:
     potongan berisi "| 12 | Item 12 | 12000 |" tanpa nama kolom, dan model
     lalu menjawab dengan angka tanpa tahu angka apa. Terukur pada pemotong
     lama: potongan kedua memuat lima baris tabel tanpa satu pun baris
     kepala. */
  const { chunkText } = await load();
  const c = chunkText(`Rincian biaya:\n\n${tabel(40)}`, 400, 60);
  assert.ok(c.length > 1, 'teks uji terlalu pendek untuk terpotong');
  for (let i = 1; i < c.length; i++) {
    const baris = c[i].split('\n');
    if (!/^\|/.test(baris[0])) continue;              // bukan lanjutan tabel
    assert.ok(/No\s*\|\s*Uraian/.test(c[i]),
      `potongan #${i + 1} memuat baris tabel tanpa kepala kolom`);
  }
});

test('kepala tak diulang bila potongan memang MULAI dari kepalanya', async () => {
  // Mengulang kepala yang sudah ada akan menggandakannya di potongan
  // pertama tabel — noise yang ikut di-embed dan ikut dibayar.
  const { chunkText } = await load();
  const c = chunkText(`${tabel(30)}`, 500, 60);
  const kepala = (c[0].match(/No\s*\|\s*Uraian/g) ?? []).length;
  assert.equal(kepala, 1, 'kepala tabel tergandakan di potongan pertama');
});

test('butir DAFTAR bernomor bukan awal bagian', async () => {
  /* Regresi yang dibuat lalu diperbaiki dalam tick yang sama: pola pertama
     menerima "1." tunggal, jadi setiap butir daftar dianggap awal bagian.
     Pada daftar KBLI yang tiap barisnya bernomor, pemotong ingin memutus di
     hampir setiap baris — satu daftar kode jadi belasan potongan tanpa
     makna, dan kuota pelanggan habis untuk itu. */
  const { awalBagian } = await load();
  assert.ok(!awalBagian('1. 147415 - Perdagangan Eceran Mesin Kantor'));
  assert.ok(!awalBagian('2) Listrik dan air'));
  // Yang berjenjang TETAP dianggap struktur.
  assert.ok(awalBagian('1.2 Ruang Lingkup'));
  assert.ok(awalBagian('Pasal 12'));
  assert.ok(awalBagian('BAB III'));
  assert.ok(awalBagian('## Ketentuan Umum'));
});

test('titik singkatan bukan akhir kalimat', async () => {
  // "No. 45" dan "Jl. Sudirman" adalah titik-spasi yang membelah satu
  // keterangan kalau dijadikan batas potong.
  const { chunkText } = await load();
  const t = `Sesuai Surat Edaran No. 45 tahun 2023 dari Jl. Sudirman, ${'y'.repeat(500)}`;
  for (const c of chunkText(t, 300, 40)) {
    assert.ok(!/\bNo\.$/.test(c.trim()), 'potongan berakhir tepat setelah "No."');
    assert.ok(!/\bJl\.$/.test(c.trim()), 'potongan berakhir tepat setelah "Jl."');
  }
});

test('SELESAI untuk teks panjang — tak berputar selamanya', async () => {
  /* Kontrak yang pernah dilanggar dan akibatnya mematikan: tanpa penghenti,
     `start = end - overlap` mundur ke posisi yang sama dan loop berputar
     selamanya untuk SEMUA teks lebih panjang dari `size` — heap penuh
     potongan identik lalu OOM, dan di lambda ia mati sunyi dengan sync
     macet di status 'syncing'. */
  const { chunkText } = await load();
  const panjang = 'Kalimat contoh yang cukup panjang. '.repeat(400);
  const c = chunkText(panjang);
  assert.ok(c.length > 1 && c.length < 200, `jumlah potongan tak wajar: ${c.length}`);
  // Tak ada potongan kosong, dan tiap potongan benar-benar maju.
  assert.ok(c.every((x) => x.trim().length > 0));
});

test('tak ada isi yang HILANG', async () => {
  const { chunkText } = await load();
  const teks = Array.from({ length: 60 }, (_, i) => `Baris ${i} berisi keterangan penting.`).join('\n');
  const gabung = chunkText(teks, 300, 40).join('\n');
  for (let i = 0; i < 60; i++) {
    assert.ok(gabung.includes(`Baris ${i} `), `Baris ${i} hilang dari seluruh potongan`);
  }
});

test('teks pendek tak disentuh', async () => {
  const { chunkText } = await load();
  assert.deepEqual(chunkText('pendek saja'), ['pendek saja']);
  assert.deepEqual(chunkText('   '), []);
  assert.equal(chunkText('x'.repeat(800)).length, 1);
});

test('jumlah potongan tak membengkak jauh dari pemotong lama', async () => {
  /* Memotong di batas makna memang menghasilkan potongan sedikit lebih
     pendek, dan itu ditukar dengan sadar. Tapi versi pertama membengkak 15%
     pada korpus produksi karena memilih batas PERTAMA, bukan terakhir — dan
     pada produk yang kuota Free-nya 10 potongan, pemborosan itu langsung
     terasa di tagihan pelanggan. */
  const { chunkText } = await load();
  const teks = 'Kalimat isi dokumen yang cukup panjang untuk diuji. '.repeat(200);
  const n = chunkText(teks).length;
  const ideal = Math.ceil(teks.length / (800 - 120));
  assert.ok(n <= ideal * 1.25,
    `${n} potongan untuk teks yang idealnya ±${ideal} — pemotong membengkak`);
});
