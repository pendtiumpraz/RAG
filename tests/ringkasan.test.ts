import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { abstrakBersih, bukaWikilink, ringkasanBersih } from '../src/modules/memory/ringkasan';

/**
 * RINGKASAN CATATAN → teks yang dibaca manusia.
 *
 * Catatan Memory disimpan sebagai Markdown ala Obsidian supaya vault-nya bisa
 * diekspor dan dibuka di Obsidian sungguhan. Bentuk itu benar untuk BERKAS,
 * dan salah untuk LAYAR: pengguna melihat `---`, `# Judul`, `**tebal**`, dan
 * `[[nib-ssn]]` lalu menyangka ringkasannya rusak.
 */

const HAL = readFileSync('src/app/(app)/documents/page.tsx', 'utf8');

const catatan = [
  '---',
  'title: "NIB SSN"',
  'type: moc',
  '---',
  '',
  '# NIB',
  '',
  'Peta konten topik **NIB**. Terkait: [[nib-ssn]] dan [[Kebijakan Garansi]]',
  '',
  'Topik: [[a]] [[b]]',
  '',
  '- poin pertama',
  '- poin kedua',
].join('\n');

test('frontmatter, judul, dan penanda Markdown TIDAK sampai ke layar', () => {
  const b = ringkasanBersih(catatan);
  for (const bocor of ['---', 'title:', '# NIB', '**', '[[', ']]']) {
    assert.ok(!b.includes(bocor), `penanda "${bocor}" masih tampil:\n${b}`);
  }
  assert.ok(b.includes('Peta konten topik NIB'), 'isi ringkasannya ikut terbuang');
});

test('judul H1 dibuang karena SUDAH ditampilkan di atas ringkasan', () => {
  /* Mengulanginya membuat pembaca mengira ada dua hal berbeda, lalu
     membandingkan keduanya — pekerjaan yang tak perlu ada. */
  assert.ok(!ringkasanBersih(catatan).startsWith('NIB\n'));
  // Hanya H1 PERTAMA. Subjudul di tengah catatan tetap jadi barisnya sendiri.
  const dua = '# Judul\n\nisi\n\n## Bagian\n\nisi dua';
  const b = ringkasanBersih(dua);
  assert.ok(b.includes('Bagian'), 'subjudul di tengah ikut terbuang');
  assert.ok(!b.startsWith('Judul'), 'judul pertama tak dibuang');
});

test('wikilink jadi kata terbaca, bukan slug bertanda hubung', () => {
  /* `[[nib-ssn]]` yang dicetak apa adanya tak terbaca siapa pun. Yang sudah
     berupa kalimat dibiarkan utuh, karena tanda hubung di dalamnya mungkin
     memang bagian dari namanya. */
  assert.equal(bukaWikilink('lihat [[nib-ssn]]'), 'lihat nib ssn');
  assert.equal(bukaWikilink('lihat [[Kebijakan Garansi]]'), 'lihat Kebijakan Garansi');
  assert.equal(bukaWikilink('lihat [[Surat-Menyurat Resmi]]'), 'lihat Surat-Menyurat Resmi');
  assert.equal(bukaWikilink('tanpa tautan'), 'tanpa tautan');
});

test('baris "Topik:" dibuang — itu metadata graf, bukan ringkasan', () => {
  assert.ok(!ringkasanBersih(catatan).includes('Topik:'));
});

test('daftar tetap jadi daftar, bukan larut jadi satu paragraf', () => {
  /* Poin-poin yang menyatu jadi satu baris panjang justru lebih sulit dibaca
     daripada Markdown mentahnya. */
  const b = ringkasanBersih(catatan);
  assert.ok(b.includes('• poin pertama'), 'daftar kehilangan penandanya');
  assert.ok(b.includes('• poin kedua'));
});

test('kosong dan null dibedakan dari "ada tapi kosong"', () => {
  /* Pemanggilnya perlu membedakan "belum ada ringkasan" dari "ringkasannya
     kosong"; string kosong menyamarkan keduanya jadi sama. */
  assert.equal(ringkasanBersih(null), '');
  assert.equal(ringkasanBersih(undefined), '');
  assert.equal(abstrakBersih(null), null);
  assert.equal(abstrakBersih('---\ntitle: x\n---\n'), null,
    'catatan yang isinya cuma frontmatter dilaporkan punya abstrak');
});

test('abstrak mengambil KALIMAT, bukan butir daftar', () => {
  /* Butir daftar tanpa kalimat pembukanya kehilangan konteks, dan di kolom
     tabel yang sempit ia terbaca seperti potongan acak. */
  assert.equal(abstrakBersih(catatan), 'Peta konten topik NIB. Terkait: nib ssn dan Kebijakan Garansi');
  assert.equal(abstrakBersih('---\nt: 1\n---\n\n# J\n\n- hanya butir\n- butir lain'), null,
    'butir daftar dipakai sebagai abstrak');
});

test('halaman Dokumen memakai pembersih bersama di KEDUA tempat', () => {
  /* Dua aturan terpisah untuk hal yang sama akan menyimpang, dan yang
     menyimpang adalah yang lebih jarang dilihat — persis bagaimana penanda
     Markdown bertahan di kolom tabel sementara laci sudah dibersihkan. */
  assert.ok(/abstrakBersih\(d\.summary\)/.test(HAL), 'pratinjau tabel tak memakai pembersih bersama');
  assert.ok(/ringkasanBersih\(doc\.summary\)/.test(HAL), 'laci tak memakai pembersih bersama');
  assert.ok(!/function abstrakDari/.test(HAL), 'pembersih lama yang terpisah masih ada');
  // Dan isinya dirender sebagai BLOK, bukan ditempel apa adanya.
  assert.ok(/<AnswerBlocks blocks=\{blok\} \/>/.test(HAL), 'ringkasan tak dirender jadi blok');
  assert.ok(!/whiteSpace: 'pre-wrap'[^}]*\}\}>\s*\{md/.test(HAL), 'masih menempel teks mentah');
});
