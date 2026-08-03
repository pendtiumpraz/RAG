import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { irisBlok } from './_iris';
import {
  MAKS_EXT, adaSaring, bersihkanSaring, ekstensi, folderDari, waktuUbah,
} from '../src/modules/knowledge/saring';

/**
 * PENYARING METADATA SEBELUM PENCARIAN VEKTOR.
 *
 * Pertanyaan "SOP pengadaan 2024" tak perlu menyentuh 750 ribu dokumen milik
 * satu chatbot; ia perlu menyentuh beberapa ribu. Satu WHERE berindeks mengalahkan setiap
 * pengoptimalan vektor yang bisa ditulis di lapisan mana pun — dan bedanya
 * MEMBESAR saat korpusnya membesar, tepat ketika segala hal lain memburuk.
 *
 * Yang dijaga di sini bukan "penyaringnya menyaring" — itu jalur bahagia yang
 * kerusakannya langsung terlihat. Yang dijaga: penyaring yang salah TIDAK
 * membuang dokumen yang sebenarnya cocok, karena kegagalan itu tak
 * bergejala. Hasilnya tetap terlihat masuk akal; ia cuma kehilangan jawaban
 * yang benar, dan tak seorang pun punya cara tahu.
 */

/* ── menurunkan nilainya ──────────────────────────────────────────────── */

test('ekstensi dinormalkan huruf kecil', () => {
  /* SharePoint & Drive mengembalikan `.PDF` dan `.pdf` bergantian untuk
     berkas yang sama-sama PDF. Penyaring yang peka huruf besar-kecil akan
     membuang separuhnya tanpa alasan yang bisa dilihat siapa pun. */
  assert.equal(ekstensi('SOP Pengadaan.PDF'), 'pdf');
  assert.equal(ekstensi('laporan.docx'), 'docx');
});

test('nama tanpa ekstensi jadi NULL, bukan string kosong', () => {
  /* String kosong akan cocok dengan penyaring `ext=''` yang tak pernah
     dimaksudkan siapa pun. */
  assert.equal(ekstensi('README'), null);
  assert.equal(ekstensi('berkas.'), null);
  assert.equal(ekstensi(''), null);
  assert.equal(ekstensi(null), null);
});

test('titik di TENGAH nama tidak melahirkan ekstensi karangan', () => {
  /* "Rapat 12.03.2026 revisi final" pernah jadi contoh nyata bentuk ini:
     tanpa penjagaan, ekstensinya jadi "03 2026 revisi final" dan mengotori
     daftar pilihan penyaring dengan sampah yang tak bisa dipilih siapa pun. */
  assert.equal(ekstensi('Rapat 12.03.2026 revisi final'), null);
  assert.equal(ekstensi('notulen.v2.final.docx'), 'docx');
});

test('folder = jalur TANPA nama berkas; di akar berarti NULL', () => {
  assert.equal(folderDari('kebijakan/2026/sop.pdf'), 'kebijakan/2026');
  assert.equal(folderDari('/kebijakan/sop.pdf'), 'kebijakan');
  assert.equal(folderDari('sop.pdf'), null, 'berkas di akar dianggap punya folder');
  assert.equal(folderDari(null), null);
});

test('pemisah Windows diterima — sumbernya tak selalu POSIX', () => {
  assert.equal(folderDari('kebijakan\\2026\\sop.pdf'), 'kebijakan/2026');
});

test('waktu ubah hanya diambil bila penandanya MEMANG waktu', () => {
  /* Drive memberi modifiedTime RFC3339. Graph memberi eTag ("{GUID},3") dan
     S3 memberi hash — memaksa keduanya jadi tanggal menghasilkan kolom berisi
     angka acak, dan penyaring rentang tanggal di atasnya membuang dokumen
     yang sebenarnya cocok. Lebih baik penyaring yang jujur tak tersedia. */
  assert.ok(waktuUbah('2026-07-31T10:22:00.000Z') instanceof Date);
  assert.equal(waktuUbah('"{9A8B7C6D-1234},3"'), null, 'eTag Graph diterima sebagai tanggal');
  assert.equal(waktuUbah('d41d8cd98f00b204e9800998ecf8427e'), null, 'ETag S3 diterima sebagai tanggal');
  assert.equal(waktuUbah('3'), null, 'angka telanjang diterima — Date.parse terlalu longgar');
  assert.equal(waktuUbah(null), null);
});

/* ── membersihkan kiriman dari luar ───────────────────────────────────── */

test('ekstensi dibersihkan: titik dibuang, huruf kecil, tanpa kembar', () => {
  const s = bersihkanSaring({ ext: ['.PDF', 'pdf', 'DOCX', ' xlsx '] });
  assert.deepEqual(s.ext, ['pdf', 'docx', 'xlsx']);
});

test('daftar ext DIBATASI', () => {
  /* `IN (...)` sepanjang seribu entri membuat perencana kueri menyerah dan
     jatuh ke pemindaian penuh — persis kebalikan dari gunanya penyaring ini. */
  const banyak = Array.from({ length: 200 }, (_, i) => `e${i}`);
  assert.equal(bersihkanSaring({ ext: banyak }).ext!.length, MAKS_EXT);
});

test('masukan sampah dibuang, bukan diteruskan ke SQL', () => {
  const s = bersihkanSaring({ ext: [123, null, 'a b', '../etc', 'pdf'] });
  assert.deepEqual(s.ext, ['pdf']);
});

test('tanggal NGAWUR MELEMPAR — tidak diam-diam jadi "tanpa penyaring"', () => {
  /* Bentuk kegagalan yang paling mahal di sini: penyaring yang hilang
     diam-diam membuat orang melihat hasil dari SELURUH korpus sambil mengira
     ia sedang melihat satu folder — dan menyimpulkan hal yang salah tentang
     datanya sendiri. */
  assert.throws(() => bersihkanSaring({ sejak: 'kemarin' }), /Tanggal sejak tidak sah/);
  assert.throws(() => bersihkanSaring({ sampai: '32 Desember' }), /Tanggal sampai tidak sah/);
});

test('penyaring kosong dikenali kosong', () => {
  assert.equal(adaSaring(bersihkanSaring({})), false);
  assert.equal(adaSaring(null), false);
  assert.equal(adaSaring(bersihkanSaring({ ext: [] })), false);
  assert.equal(adaSaring(bersihkanSaring({ folder: '   ' })), false);
  assert.equal(adaSaring(bersihkanSaring({ ext: ['pdf'] })), true);
});

/* ── penegakannya di SQL ──────────────────────────────────────────────── */

const SVC = readFileSync('src/modules/chat/retrieval.service.ts', 'utf8');

test('penyaring dipasang di KETIGA tempat, bukan hanya di kaki potongan', () => {
  /* Menerapkannya hanya di kaki potongan berarti lapisan pertama tetap
     memilih 120 dokumennya TANPA memperhatikan penyaring — dan ke-120 itu
     bisa habis tersaring semuanya, sehingga jawabannya kosong padahal
     dokumennya ada. */
  /* EMPAT titik pakai:
       1. hitungan ukuran korpus efektif (v) — ditambahkan kartu
          a-tier1-adaptif; tanpa ini ambangnya menjawab pertanyaan tentang
          korpus yang tak sedang dicari
       2. lapisan pertama (v)
       3. kaki vektor satu tahap (d)
       4. tahap penyaring biner (d)
     Definisinya sendiri tak ikut terhitung — `const saringSql = (alias…` tak
     memuat `${saringSql(`. */
  const dipakai = (SVC.match(/\$\{saringSql\(/g) ?? []).length;
  assert.equal(dipakai, 4, `saringSql dipakai ${dipakai}×, seharusnya di 4 titik`);
  assert.ok(/\$\{saringSql\('v'\)\}/.test(SVC), 'lapisan pertama (document_vectors) tak disaring');
  assert.ok(/\$\{saringSql\('d'\)\}/.test(SVC), 'kaki dokumen tak disaring');
});

test('folder dicocokkan sebagai PREFIKS BERPEMISAH, bukan awalan telanjang', () => {
  /* `LIKE 'kebijakan%'` ikut menyapu "kebijakan-lama/", yaitu folder yang
     berbeda sama sekali — dan hasilnya bercampur tanpa satu pun tanda. */
  const blok = irisBlok(SVC, 'const saringSql = (alias: string)');
  assert.ok(/folder = \$\{saring!\.folder\}/.test(blok), 'folder persis tak ikut dicocokkan');
  assert.ok(/\$\{`\$\{saring!\.folder\}\/%`\}/.test(blok),
    'prefiks folder tak memakai pemisah — folder lain ikut tersapu');
});

test('tanpa penyaring, SQL-nya TIDAK tumbuh sama sekali', () => {
  /* Jalur yang sudah terbukti tak boleh ikut membayar fitur yang tak
     dipakainya. */
  const blok = irisBlok(SVC, 'const saringSql = (alias: string)');
  assert.ok(/if \(!adaSaring\(saring\)\) return sql``;/.test(blok),
    'penyaring kosong tetap menghasilkan potongan SQL');
});

test('satu perakit, bukan tiga salinan syarat yang sama', () => {
  /* Tiga salinan adalah tiga kesempatan untuk menyimpang, dan yang menyimpang
     di lapisan pertama tak menghasilkan galat — cuma jawaban kosong tanpa
     sebab yang bisa dilihat. */
  assert.equal((SVC.match(/const saringSql = /g) ?? []).length, 1);
});

/* ── jalur masuknya ───────────────────────────────────────────────────── */

test('kolomnya diisi saat ingest, bukan disimpulkan saat kueri', () => {
  const ing = readFileSync('src/modules/knowledge/knowledge.service.ts', 'utf8');
  assert.ok(/ext: saringExt/.test(ing) && /folder: saringFolder/.test(ing)
    && /modifiedAt: saringWaktu/.test(ing), 'potongan tak membawa kolom penyaring');
  /* Diturunkan SEKALI di luar perulangan potongan — dokumen tebal punya
     ratusan potongan, dan nilainya sama untuk semuanya. */
  const iTurun = ing.indexOf('const saringExt = ');
  const iPakai = ing.indexOf('ext: saringExt');
  assert.ok(iTurun > 0 && iTurun < iPakai, 'nilainya dihitung ulang di dalam perulangan');
});

test('lapisan pertama ikut membawa kolom penyaring', () => {
  /* Kalau tidak, penyaring di document_vectors tak punya apa pun untuk
     disaring dan seluruh lapisan pertama lolos begitu saja. */
  const dv = readFileSync('src/modules/knowledge/document-vectors.service.ts', 'utf8');
  assert.ok(/max\(d\.ext\), max\(d\.folder\), max\(d\.modified_at\)/.test(dv),
    'rebuild tier-1 tak menyalin kolom penyaring');
  assert.ok(/ext = excluded\.ext/.test(dv), 'upsert tak memperbarui kolom penyaring');
});

test('konektor yang TAHU jalurnya meneruskannya; yang tidak, tidak mengarang', () => {
  /* Notion & Slack tak punya folder. Konektor yang mengarang jalur akan
     membuat penyaring folder membuang dokumen yang sebenarnya cocok. */
  const sync = readFileSync('src/modules/knowledge/sync.service.ts', 'utf8');
  assert.ok(/path: o\.key/.test(sync), 'S3 tak meneruskan kunci sebagai jalur');
  assert.ok(/path: f\.path/.test(sync), 'jalur tak diteruskan ke ingest');
  const notion = irisBlok(sync, "if (kind === 'notion') {");
  assert.ok(!/path:/.test(notion), 'Notion mengarang jalur padahal tak punya folder');
});

test('API pencarian menerima penyaring lewat pembersih yang SAMA', () => {
  /* Dua pembersih berarti dua aturan yang suatu hari berbeda — dan yang
     berbeda adalah aturan tentang data siapa yang boleh terbaca. */
  const route = readFileSync('src/app/api/v1/search/route.ts', 'utf8');
  assert.ok(/bersihkanSaring\(parsed\.data\.saring\)/.test(route), 'rute tak membersihkan penyaring');
  assert.ok(/retrieve\([\s\S]{0,120}saring\)/.test(route), 'penyaring tak diteruskan ke retrieve');
  assert.ok(/status: 400/.test(route), 'tanggal ngawur tak ditolak dengan jujur');
});

/* ── batas antara konsol internal dan widget publik ───────────────────── */

test('penyaring dibuka di konsol internal, TIDAK di endpoint widget', () => {
  /* Bukan kelalaian — keputusan. Pengunjung situs pelanggan tak punya dasar
     untuk memilih folder, dan membuka penyaring folder di sana memberi cara
     memetakan struktur folder pelanggan dari luar: satu permintaan per
     tebakan nama, dan jawabannya berbeda antara folder yang ada dan yang
     tidak. */
  const internal = readFileSync('src/app/api/chat/internal/route.ts', 'utf8');
  assert.ok(/bersihkanSaring\(body\.saring\)/.test(internal),
    'konsol internal tak meneruskan penyaring');

  const publik = readFileSync('src/app/api/chat/[chatbotId]/route.ts', 'utf8');
  assert.ok(!/saring/.test(publik),
    'endpoint widget publik menerima penyaring — struktur folder pelanggan jadi bisa dipetakan dari luar');
});

test('konsol Chat punya kontrolnya, bukan cuma API-nya', () => {
  /* Kemampuan yang hanya bisa dipakai lewat curl bukan kemampuan yang dipakai
     siapa pun. */
  const page = readFileSync('src/app/(app)/chat/page.tsx', 'utf8');
  assert.ok(/setSaringExt/.test(page) && /setSaringFolder/.test(page), 'kontrol penyaring tak ada');
  assert.ok(/saring: \{ ext: saringExt/.test(page), 'kontrolnya tak ikut terkirim ke server');
});
