import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * KATEGORISASI ULANG DARI RINGKASAN.
 *
 * Fitur ini menulis ke kolom yang dipakai penyaring graf, legenda warna, dan
 * penyaring pencarian dokumen sekaligus. Salah sedikit, akibatnya menyebar ke
 * tiga tempat dan tak satu pun melaporkan galat — hanya dokumen yang pindah
 * kelompok tanpa ada yang memindahkannya.
 *
 * Yang dijaga di sini adalah SIFATNYA, bukan jalur modelnya (itu butuh
 * penyedia sungguhan): apa yang boleh disentuh, apa yang tak boleh, dan
 * apakah kegagalan dilaporkan atau ditelan.
 */

const SVC = readFileSync('src/modules/memory/recategorize.service.ts', 'utf8');
const RUTE = readFileSync('src/app/api/memory/recategorize/route.ts', 'utf8');
const UI = readFileSync('src/app/(app)/memory/page.tsx', 'utf8');

test('HANYA menyentuh dokumen yang belum berkategori', async () => {
  /* Invarian paling penting di fitur ini. Seseorang yang sudah sengaja
     mengarsipkan dokumen ke kategori tertentu tak boleh menemukannya pindah
     karena orang lain menekan tombol. Sekali itu terjadi, seluruh master data
     kategori berhenti dipercaya — dan kepercayaan itu tak kembali dengan
     memperbaiki bugnya. */
  const { FALLBACK_SLUG } = await import('../src/modules/memory/categories');
  const pilih = SVC.slice(SVC.indexOf('const semua = await'), SVC.indexOf('const tersisa ='));
  assert.ok(pilih.includes('n.category = ${FALLBACK_SLUG}'),
    'pemilihan kandidat tak lagi dibatasi ke penampung');
  assert.equal(FALLBACK_SLUG, 'belum', 'slug penampung berubah — periksa migrasi 0034');

  // UPDATE-nya pun hanya menyentuh id yang terpilih tadi, bukan seluruh tabel.
  const update = SVC.slice(SVC.indexOf('update memory_notes n'));
  assert.ok(/where n\.id = v\.id/.test(update), 'UPDATE tak dibatasi ke id hasil penilaian');
  assert.ok(/deleted_at is null/.test(update), 'UPDATE menyentuh baris yang sudah dihapus');
});

test('kategori tak dikenal jadi USULAN, bukan langsung dipakai', () => {
  // Aturan yang sama dengan agen Memory. Dua jalur yang menulis kolom
  // `category` tak boleh punya aturan berbeda — kalau berbeda, hasilnya
  // bergantung pada jalur mana yang kebetulan menyentuh dokumen lebih dulu.
  assert.ok(/categoryService\.propose\(tenantId, usul\)/.test(SVC),
    'usulan kategori baru tak lewat propose() — bisa langsung terpakai lalu jadi yatim saat ditolak');
  assert.ok(/namaTerlaluSamar\(usul\)/.test(SVC),
    'nama samar tak disaring; "umum" dan "lainnya" akan lolos jadi kategori');
});

test('ringkasan kosong dilaporkan terpisah, bukan diam-diam dilewati', () => {
  // Dua keadaan yang berbeda dan mengarah ke tindakan berbeda: "belum
  // diringkas" menyuruh orang menjalankan agen Memory, "tak bisa diputuskan"
  // tidak menyuruh apa-apa. Menyatukannya jadi satu angka menghapus arahnya.
  assert.ok(/tanpaRingkasan/.test(SVC), 'dokumen tanpa ringkasan tak dihitung terpisah');
  assert.ok(/tetapBelum/.test(SVC), 'dokumen yang gagal dinilai tak dilaporkan');
  assert.ok(/tersisa/.test(SVC), 'sisa di luar batas satu kali jalan tak dilaporkan');
  assert.ok(/tanpaRingkasan/.test(UI) && /tetapBelum/.test(UI) && /tersisa/.test(UI),
    'UI hanya menampilkan yang berhasil — sisa penampung akan tampak seperti kegagalan diam-diam');
});

test('satu batch cacat tidak menggagalkan sisanya', () => {
  // Jawaban JSON yang rusak pada satu bundel tak boleh membuang pekerjaan
  // sembilan bundel lainnya; dokumen di dalamnya cukup tetap di penampung —
  // keadaan yang sama seperti sebelum tombol ditekan, jadi aman ditekan lagi.
  /* KOMENTAR DIBUANG dulu, dan jaraknya tak dipatok. Versi sebelumnya
     memakai jendela 400 karakter setelah `} catch {`, lalu gagal begitu
     penjelasan di dalam catch itu bertambah panjang — tesnya tersandung
     komentarnya sendiri, bukan perubahan perilaku. */
  const kode = SVC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const loop = kode.slice(kode.indexOf('for (let i = 0; i < siap.length'));
  const iCatch = loop.indexOf('} catch {');
  assert.ok(iCatch > 0, 'blok catch per-bundel hilang');
  const isiCatch = loop.slice(iCatch, loop.indexOf('}', loop.indexOf('{', iCatch + 8)));
  assert.ok(/continue;/.test(isiCatch),
    'kegagalan parse membatalkan seluruh proses, bukan hanya bundelnya');
});

test('panggilan model DIBUNDEL, bukan satu per dokumen', () => {
  // Alasan fitur ini ada adalah biaya. Satu panggilan per dokumen membuatnya
  // semahal menjalankan ulang agen Memory — yang justru sedang dihindari.
  assert.ok(/PER_BATCH\s*=\s*\d+/.test(SVC), 'tak ada pembundelan');
  const per = Number(/PER_BATCH\s*=\s*(\d+)/.exec(SVC)![1]);
  assert.ok(per >= 5, `bundel ${per} terlalu kecil untuk membenarkan biayanya`);
  assert.ok(/completeChat\(/.test(SVC));
  assert.equal((SVC.match(/completeChat\(/g) ?? []).length, 1,
    'lebih dari satu tempat memanggil model — pembundelan bisa terlewat di salah satunya');
});

test('endpoint butuh admin dan menyebut angkanya sebelum ditekan', () => {
  assert.ok(/requireRole\('superadmin', 'admin'\)/.test(RUTE),
    'siapa pun bisa membakar kuota model milik tenant');
  assert.ok(/export async function GET/.test(RUTE),
    'tak ada cara mengetahui berapa yang akan dikerjakan sebelum menekannya');
  assert.ok(/API key/i.test(RUTE),
    'kunci API yang belum diisi jatuh jadi 500 — pengguna disuruh menebak sebabnya');
});

/* ══ TOMBOL "KERJAKAN SEMUA" ═══════════════════════════════════════════ */

test('mode semua BERHENTI saat mandek, bukan memutar sampai batas', async () => {
  /* Kalau model terus mengusulkan kategori yang belum disetujui, tiap
     putaran akan sibuk tanpa memindahkan satu dokumen pun. Tanpa penjaga
     ini, tombol "kerjakan semua" memutar sepuluh kali, membakar kuota model,
     lalu melaporkan nol — dan tak seorang pun tahu kenapa. */
  const blok = SVC.slice(SVC.indexOf('async semuanya('));
  assert.ok(/if \(r\.diperbarui === 0\) \{ gabungan\.mandek = true; break; \}/.test(blok),
    'putaran yang tak memindahkan apa pun tidak menghentikan pengulangan');
  assert.ok(/MAX_PUTARAN/.test(blok), 'tak ada atap jumlah putaran');
  assert.ok(/if \(r\.tersisa === 0 && r\.tetapBelum === 0\) break;/.test(blok),
    'pengulangan tak berhenti saat benar-benar tuntas');
});

test('mandek DIBEDAKAN dari tuntas di UI', () => {
  // Menyamakannya membuat penampung yang macet terbaca sebagai pekerjaan
  // selesai — kegagalan yang tak menimbulkan galat apa pun.
  assert.ok(/hasilKat\.mandek/.test(UI), 'UI tak membedakan mandek dari tuntas');
  assert.ok(/Berhenti karena mandek/.test(UI), 'sebab berhentinya tak disebutkan');
});

test('tombol MATI saat tak ada yang bisa dinilai, dan sebabnya disebut', () => {
  /* `siap === 0` berarti sisanya belum punya ringkasan sama sekali; menekan
     tombol tak akan memindahkan apa pun. Tombol yang bisa ditekan tapi tak
     melakukan apa-apa terbaca sebagai produk rusak, bukan sebagai keadaan
     yang memang begitu. */
  assert.ok(/disabled=\{!!busy \|\| kandidat\.data!\.siap === 0\}/.test(UI),
    'tombol tetap menyala walau tak ada yang bisa dinilai');
  assert.ok(/title=\{kandidat\.data!\.siap === 0/.test(UI),
    'tombol mati tanpa menyebutkan sebabnya');
  // Panelnya sendiri hanya muncul bila penampungnya berisi.
  assert.ok(/\(kandidat\.data\?\.siap \?\? 0\) > 0 \|\| \(kandidat\.data\?\.tanpaRingkasan \?\? 0\) > 0/.test(UI),
    'panel muncul walau tak ada dokumen yang belum dikategorikan');
});

test('UI meminta mode semua, bukan satu bundel', () => {
  assert.ok(/JSON\.stringify\(\{ semua: true \}\)/.test(UI),
    'tombol masih mengirim satu bundel — pengguna disuruh menekan berkali-kali');
});

test('UPDATE massal tidak memakai cast larik yang ditolak Postgres', () => {
  /* Drizzle memperluas larik JavaScript jadi TUPLE ($1,$2,…), dan Postgres
     menolak cast record → uuid[] dengan 42846. Cacat ini tak terlihat saat
     menulis maupun saat typecheck — hanya muncul ketika kuerinya
     benar-benar dijalankan, yaitu ketika ADA dokumen yang berhasil dinilai.
     Jadi jalur bahagianya justru yang meledak. */
  /* Diperiksa pada TEMPLATE SQL-nya saja, bukan seluruh berkas: komentar di
     atasnya menyebut pola yang salah justru untuk menjelaskan kenapa ia
     ditinggalkan, dan penjaring yang membaca seluruh berkas akan tertipu
     oleh penjelasannya sendiri. */
  const kueri = SVC.slice(SVC.indexOf('update memory_notes n'), SVC.indexOf('const slugs ='));
  assert.ok(!/unnest\(/.test(kueri),
    'kembali memakai unnest(${larik}::uuid[]) — akan gagal 42846 saat benar-benar dipakai');
  assert.ok(/from \(values \$\{nilai\}\) as v\(id, slug\)/.test(SVC),
    'pasangan (id, slug) tak dirakit sebagai VALUES berparameter');
});
