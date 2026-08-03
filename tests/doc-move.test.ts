import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { irisBlok } from './_iris';

/**
 * PINDAH DOKUMEN ANTAR KNOWLEDGE BASE (kartu a-doc-move).
 *
 * Yang paling menentukan di fitur ini bukan pemindahannya — itu satu UPDATE —
 * melainkan PENOLAKANNYA. Dokumen yang dimiliki sumber tersinkron berulang
 * akan ditarik kembali oleh sync berikutnya, jadi pemindahannya batal sendiri:
 * diam-diam, berjam-jam kemudian, tanpa satu pun galat. Yang memakainya akan
 * menyimpulkan fiturnya rusak, bukan bahwa sumbernya yang harus dipindah.
 *
 * Seluruh tes di sini menjaga kelas itu: perubahan yang BENAR hari ini dan
 * batal sendiri besok.
 */

const SVC = readFileSync('src/modules/knowledge/knowledge.service.ts', 'utf8');
const BLOK = irisBlok(SVC, 'async pindahDokumen(');
const RUTE = readFileSync('src/app/api/documents/move/route.ts', 'utf8');
const UI = readFileSync('src/app/(app)/documents/page.tsx', 'utf8');

test('sumber tersinkron BERULANG ditolak — hanya `upload` yang boleh', () => {
  /* Daftar putih, bukan daftar hitam. Konektor baru (Notion & Slack sudah
     terjadi sekali) akan otomatis masuk kategori "berulang" tanpa siapa pun
     perlu ingat menambahkannya ke daftar larangan — dan yang lupa ditambahkan
     ke daftar larangan adalah yang diam-diam boleh dipindah lalu batal. */
  assert.ok(/filter\(\(k\) => k !== 'upload'\)/.test(BLOK),
    'penyaringnya bukan daftar putih — konektor baru akan lolos diam-diam');
  assert.ok(/berulang\.length > 0/.test(BLOK), 'sumber berulang tak ditolak');
  assert.ok(/Pindahkan SUMBER-nya, bukan dokumennya/.test(BLOK),
    'penolakannya tak memberi tahu apa yang HARUS dilakukan');
});

test('alasan penolakan menyebut AKIBATNYA, bukan cuma aturannya', () => {
  /* "Tidak diizinkan" membuat orang mencari cara mengakalinya. "Sync
     berikutnya akan menariknya kembali" membuat orang berhenti mencoba. */
  assert.ok(/batal sendiri tanpa pemberitahuan/.test(BLOK));
});

test('VEKTOR LAPISAN PERTAMA ikut pindah', () => {
  /* Kalau centroid tertinggal di KB lama, dokumennya tetap ketemu lewat
     pencarian datar tapi TAK PERNAH lolos lapisan pertama di KB barunya —
     recall yang turun diam-diam, gejala nol, dan tak ada yang
     menghubungkannya dengan pemindahan berbulan lalu. */
  assert.ok(/update documents set knowledge_base_id/.test(BLOK), 'potongan tak dipindah');
  assert.ok(/update document_vectors set knowledge_base_id/.test(BLOK),
    'centroid lapisan pertama tertinggal di KB lama');
});

test('nama yang BENTROK di tujuan ditolak, tidak digabung', () => {
  /* doc_ref adalah identitas dokumen logis. Dua berkas berbeda dengan doc_ref
     sama di satu KB akan tergabung jadi satu dokumen di mata retrieval — dan
     jawaban yang mencampur dua kontrak berbeda jauh lebih buruk daripada
     pemindahan yang ditolak. */
  assert.ok(/menggabungkan dua berkas berbeda jadi satu jawaban/.test(BLOK));
  assert.ok(/where knowledge_base_id = \$\{keKbId\} and doc_ref = \$\{docRef\}/.test(BLOK),
    'bentrok tak diperiksa di KB tujuan');
});

test('KB tujuan diperiksa ADA dan belum dihapus', () => {
  /* Tanpa ini, salah ketik id memindahkan dokumen ke KB yang tak ada — dan
     dokumennya lenyap dari seluruh antarmuka tanpa terhapus. */
  assert.ok(/isNull\(knowledgeBases\.deletedAt\)/.test(BLOK), 'KB tujuan yang sudah dihapus diterima');
  assert.ok(/dariKbId === keKbId/.test(BLOK), 'memindahkan ke KB yang sama tak ditolak');
});

test('audit DI LUAR transaksi — kolam koneksi max:1', () => {
  /* Pelajaran yang sudah dibayar enam kali di sesi audit koneksi: memanggil
     audit() (yang membuka withTenant sendiri) dari DALAM transaksi membuat
     permintaan menggantung selamanya di Vercel. */
  const posAudit = BLOK.indexOf('await audit(');
  const posTutup = BLOK.indexOf('});', BLOK.indexOf('await withTenant'));
  assert.ok(posAudit > posTutup, 'audit dipanggil di dalam transaksi — buntu di Vercel');
});

test('penolakan dilaporkan 422, bukan 500', () => {
  /* Seluruh penolakan di jalur ini adalah keadaan yang DIHARAPKAN. Melaporkan
     mereka sebagai galat server membuatnya masuk pemantauan sebagai kerusakan,
     lalu ditelusuri orang yang mengira ada bug. */
  assert.ok(/ValidationError \? 422 : 500/.test(RUTE), 'penolakan wajar dilaporkan sebagai galat server');
});

test('batas ini dikatakan DI MUKA di layar, bukan hanya saat ditolak', () => {
  /* Yang menemukan sendiri bahwa pemindahannya batal setelah sync berikutnya
     akan menyimpulkan fiturnya rusak. */
  assert.ok(/TAK BISA DIPINDAH SENDIRI/.test(UI), 'UI tak menyebut batasnya sebelum dicoba');
  assert.ok(/PINDAHKAN SUMBERNYA/.test(UI), 'UI tak memberi tahu jalan keluarnya');
  assert.ok(/TIDAK DI-EMBED ULANG/.test(UI),
    'UI tak menyebut bahwa pemindahan tak berbiaya — padahal itu alasan fitur ini ada');
});

test('KB tujuan tak menawarkan KB yang sedang ditempati dokumennya', () => {
  assert.ok(/filter\(\(k\) => k\.id !== doc\.knowledgeBaseId\)/.test(UI),
    'daftar tujuan memuat KB asalnya sendiri');
});

test('kuota TIDAK dihitung ulang, dan alasannya tertulis', () => {
  /* Kalau suatu hari ada yang "memperbaiki" ini dengan menambah pemeriksaan
     kuota, pemindahan akan ditolak pada tenant yang kuotanya sudah penuh —
     padahal totalnya tak bergerak sedikit pun. */
  assert.ok(/totalnya tak bergerak sedikit pun/.test(SVC.slice(SVC.indexOf('async pindahDokumen(') - 900,
    SVC.indexOf('async pindahDokumen('))), 'alasan tak menghitung ulang kuota tak tertulis');
  assert.ok(!/assertKuota|periksaKuota|storageUsage/.test(BLOK),
    'pemindahan antar-KB memeriksa kuota — padahal totalnya tak berubah');
});
