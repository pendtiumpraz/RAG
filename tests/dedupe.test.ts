import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

const load = () => import('../src/modules/knowledge/dedupe');

test('sidik jari tahan beda spasi hasil ekstraksi', async () => {
  const { contentFingerprint } = await load();
  // Ekstraksi PDF/DOCX menghasilkan spasi & baris kosong yang berbeda antar
  // jalankan untuk berkas yang SAMA. Tanpa normalisasi, sidik jarinya beda dan
  // dedup gagal persis pada kasus yang mestinya ia tangani.
  const a = 'Pasal 1\n\nPara pihak sepakat.\n\nPasal 2\nNilai kontrak Rp 500.000.000.';
  const b = 'Pasal 1\nPara  pihak   sepakat.\n\n\nPasal 2\nNilai kontrak Rp 500.000.000.  ';
  assert.equal(contentFingerprint(a), contentFingerprint(b));
});

test('huruf besar-kecil & tanda baca TIDAK dinormalkan', async () => {
  const { contentFingerprint } = await load();
  // Keduanya membawa makna pada dokumen hukum & keuangan. Menyamakannya
  // berarti dua dokumen yang sungguh berbeda bisa dianggap satu — kegagalan
  // yang membuang dokumen sah, jauh lebih mahal daripada menyimpan kembar.
  const a = 'Nilai kontrak Rp 500.000.000. '.repeat(10);
  assert.notEqual(contentFingerprint(a), contentFingerprint(a.toUpperCase()));
  assert.notEqual(contentFingerprint(a), contentFingerprint(a.replace(/\./g, ',')));
});

test('teks terlalu pendek TIDAK dipakai sebagai bukti kembar', async () => {
  const { fingerprintable, MIN_FINGERPRINT_CHARS } = await load();
  // PDF hasil pindai tanpa OCR mengekstrak nyaris kosong. Banyak berkas yang
  // isinya sungguh berbeda akan menghasilkan sidik jari sama, dan men-dedup
  // atas dasar itu membuang dokumen yang sah.
  assert.equal(fingerprintable(''), false);
  assert.equal(fingerprintable('   \n  '), false);
  assert.equal(fingerprintable('a'.repeat(MIN_FINGERPRINT_CHARS - 1)), false);
  assert.equal(fingerprintable('a'.repeat(MIN_FINGERPRINT_CHARS)), true);
});

test('ukuran 0 / tak diketahui bukan kunci yang sah', async () => {
  const { nameSizeKey } = await load();
  // Banyak konektor melaporkan 0 untuk berkas yang ukurannya tak mereka
  // ketahui (dokumen Google native). Menganggapnya nilai sah akan menyatukan
  // SEMUA berkas semacam itu jadi satu.
  assert.equal(nameSizeKey('Kontrak.pdf', 0), null);
  assert.equal(nameSizeKey('Kontrak.pdf', undefined), null);
  assert.equal(nameSizeKey('Kontrak.pdf', -1), null);
  assert.equal(nameSizeKey('', 100), null);
  assert.ok(nameSizeKey('Kontrak.pdf', 100));
});

test('nama dibandingkan tanpa peduli huruf besar-kecil & spasi tepi', async () => {
  const { nameSizeKey } = await load();
  assert.equal(nameSizeKey('Kontrak.PDF', 100), nameSizeKey('  kontrak.pdf ', 100));
  assert.notEqual(nameSizeKey('Kontrak.pdf', 100), nameSizeKey('Kontrak.pdf', 101));
});

/* ── invarian yang hidup di dalam kueri / alur ────────────────────── */

const KS = readFileSync('src/modules/knowledge/knowledge.service.ts', 'utf8');
const SYNC = readFileSync('src/modules/knowledge/sync.service.ts', 'utf8');
const MIG = readFileSync('migrations/0033_dedupe.sql', 'utf8');

test('dedup dilakukan SEBELUM chunk & embed', () => {
  // Yang mahal bukan unduhannya, melainkan embedding dan penyimpanan
  // vektornya. Men-dedup setelah embed berarti membayar seluruh biayanya
  // lalu membuang hasilnya.
  const i = KS.indexOf('const hash = fingerprintable(input.text)');
  const c = KS.indexOf('const chunks = chunkText(input.text)');
  assert.ok(i > 0 && c > 0 && i < c, 'pemeriksaan kembar terjadi setelah chunking');
});

test('dedup dipasang di ingest(), bukan hanya di sync', () => {
  // Ingest adalah satu-satunya jalur yang dilewati SEMUA cara dokumen masuk:
  // sync, unggahan manual, konektor URL, dan API publik. Memasangnya hanya di
  // sync membuat tiga jalur lain tetap bisa menyisipkan kembar.
  assert.ok(/contentFingerprint\(input\.text\)/.test(KS), 'ingest tak menghitung sidik jari');
});

test('berkas TIDAK dianggap kembar dengan dirinya sendiri', () => {
  // Pada sync ulang atau update versi, berkas yang sama tentu cocok dengan
  // barisnya sendiri. Tanpa penjagaan ini, setiap update akan membuang
  // dokumennya sendiri dan KB perlahan kosong.
  assert.ok(/kembar !== diriSendiri/.test(KS), 'penjagaan diri-sendiri hilang di ingest');
  assert.ok(/kembar !== f\.externalId/.test(SYNC), 'penjagaan diri-sendiri hilang di sync');
  assert.ok(/!isUpdate\.has\(f\.externalId\)/.test(SYNC),
    'update versi bisa terbuang sebagai kembar');
});

test('lingkup dedup satu KB, bukan lintas KB', () => {
  // D11 menjadikan KB entitas mandiri yang di-assign N:M ke chatbot. Dedup
  // lintas KB akan mencabut dokumen dari KB milik chatbot divisi lain yang
  // justru membutuhkannya — diam-diam, tanpa pesan apa pun.
  // KEDUA kueri pencarian kembar (sidik jari isi dan nama+ukuran) harus
  // dibatasi, bukan salah satunya.
  const kueri = KS.split('select doc_ref from documents').slice(1);
  assert.equal(kueri.length, 2, 'jumlah kueri pencarian kembar berubah — uji perlu diperbarui');
  for (const q of kueri) {
    const badan = q.slice(0, q.indexOf('limit 1'));
    assert.ok(/knowledge_base_id = \$\{/.test(badan),
      'ada pencarian kembar yang tak dibatasi ke satu knowledge base');
  }
  assert.ok(/on documents \(knowledge_base_id, content_hash\)/.test(MIG),
    'indeks kembar tak diawali knowledge_base_id');
});

test('berkas kembar DICATAT, bukan dibuang diam-diam', () => {
  // Kalau berkas hilang begitu saja, pemiliknya mengira sync gagal — dan tak
  // ada cara mengetahui bedanya.
  assert.ok(/create table if not exists document_duplicates/.test(MIG));
  assert.ok(/canonical_doc_ref text not null/.test(MIG), 'tak menyimpan dokumen aslinya');
  assert.ok(/recordDuplicate/.test(KS) && /recordDuplicate/.test(SYNC));
});

test('kembar dilaporkan TERPISAH dari format tak didukung', () => {
  // "dilewati karena formatnya tak didukung" dan "dilewati karena kembar"
  // menuntut tindakan berbeda dari pemilik data; menggabungkannya
  // menyembunyikan keduanya.
  // Dicocokkan per-nama, bukan per-urutan: uji yang mengunci urutan field
  // akan gagal setiap kali ada sebab baru disisipkan — dan gagalnya tak
  // menandakan apa pun yang rusak.
  const mulai = SYNC.indexOf('const stats = {');
  // Dicari SESUDAH `mulai`: `setStatus('syncing')` muncul jauh lebih awal di
  // berkas ini, dan mencarinya dari nol menghasilkan potongan kosong yang
  // membuat uji gagal tanpa ada yang rusak.
  const stats = SYNC.slice(mulai, SYNC.indexOf('await setStatus(', mulai));
  for (const k of ['duplicates', 'skipped', 'failed', 'pending']) {
    assert.ok(new RegExp(`\\b${k}\\b`).test(stats), `hitungan ${k} tak dilaporkan`);
  }
});

/* ── petunjuk format & pelaporan sebab ─────────────────────────────── */

test('PDF pindaian dilaporkan TERPISAH dari format tak didukung', () => {
  // Keduanya sama-sama tak masuk, tapi menuntut tindakan yang berbeda:
  // "format tak didukung" berarti berkasnya memang bukan dokumen teks;
  // "tanpa teks" berarti berkasnya DOKUMEN tapi isinya gambar, dan
  // pemiliknya perlu menjalankan OCR. Menggabungkannya menghasilkan laporan
  // "5.000 dilewati" yang tak menuntun ke mana pun.
  assert.match(SYNC, /noText\+\+/, 'sync tak memisahkan berkas tanpa teks');
  assert.match(SYNC, /skipped, noText, failed/, 'noText tak dilaporkan terpisah');
});

test('petunjuk format ada SEBELUM pemilih berkas', async () => {
  const { readFileSync } = await import('node:fs');
  const ui = readFileSync('src/app/(app)/knowledge/page.tsx', 'utf8');
  const iPetunjuk = ui.indexOf('Markdown memberi jawaban paling tepat');
  const iInput = ui.indexOf('<input className="input" type="file" multiple');
  // Nasihat yang datang setelah orang memilih berkas bukan nasihat.
  assert.ok(iPetunjuk > 0, 'petunjuk format hilang dari UI unggah');
  assert.ok(iPetunjuk < iInput, 'petunjuk format muncul setelah pemilih berkas');
  // Peringatan PDF pindaian adalah yang paling menyelamatkan — tanpa itu
  // orang mengunggah puluhan megabyte dan bot-nya tak tahu apa-apa.
  assert.match(ui, /PDF hasil pindai/i, 'peringatan PDF pindaian hilang');
});
