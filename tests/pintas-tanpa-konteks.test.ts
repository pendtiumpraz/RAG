import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { bahasaBalasan, deteksiBahasa } from '../src/modules/chat/bahasa';
import { deteksiPenolakan, nilaiKeyakinan, penolakanTanpaKonteks } from '../src/modules/chat/confidence';

/**
 * PINTAS TANPA KONTEKS — tak memanggil model saat jawabannya sudah pasti.
 *
 * Penghematan yang salah pasang jauh lebih mahal daripada tak berhemat: ia
 * mematikan jawaban yang seharusnya keluar, dan gejalanya adalah chatbot yang
 * "tiba-tiba tak tahu apa-apa" — keluhan yang paling sulit ditelusuri karena
 * tak ada satu pun galat yang tercatat.
 */

const SVC = readFileSync('src/modules/chat/chat.service.ts', 'utf8');

/* ── kapan boleh memintas ────────────────────────────────────────────── */

test('pintas HANYA pada grounding ketat DAN nol potongan', () => {
  /* Mode `balanced` dan `open` MEMANG boleh menjawab tanpa dokumen —
     memintas keduanya mematikan fitur, bukan menghemat biaya. Dan "skor
     rendah" bukan alasan yang sah: skor kemiripan terbukti tidak memisahkan
     pertanyaan berjawab dari yang tidak (0,420–0,581 melawan 0,382–0,546). */
  assert.ok(/const pintasTanpaKonteks = policy\.grounding === 'strict' && context\.length === 0;/.test(SVC),
    'syarat pintas berubah — periksa apakah ia kini mematikan mode balanced/open');
  assert.ok(!/pintas[\s\S]{0,200}minScore|pintas[\s\S]{0,200}score >/.test(SVC),
    'pintas memakai ambang skor, yang terbukti tak memisahkan');
});

test('jalur normal tetap memanggil model', () => {
  /* Bila cabangnya terbalik, SEMUA jawaban jadi penolakan tetap dan tak ada
     satu pun galat yang muncul. */
  const blok = SVC.slice(SVC.indexOf('if (pintasTanpaKonteks)'), SVC.indexOf('parser.finalize()'));
  assert.ok(/\} else \{[\s\S]*streamChat\(/.test(blok), 'streamChat tak ada di cabang non-pintas');
  assert.ok(/emit\(\{ type: 'text', text: penolakanTanpaKonteks\(input\.question\) \}\)/.test(blok),
    'cabang pintas tak memancarkan blok penolakan');
});

test('token masuk DAN keluar dicatat NOL saat dipintas', () => {
  /* Prompt-nya dibangun tapi tak pernah dikirim, dan kalimat penolakannya
     kita sendiri yang menulis. Mencatat keduanya seolah lewat penyedia
     membuat laporan biaya menagih token yang tak pernah ada — dan justru
     menyembunyikan penghematan yang baru dibuat. */
  assert.ok(/const tokensIn = pintasTanpaKonteks \? 0 :/.test(SVC),
    'token masuk tetap dihitung dari prompt yang tak terkirim');
  assert.ok(/const tokensOut = pintasTanpaKonteks \? 0 :/.test(SVC),
    'token keluar tetap dihitung dari kalimat yang kita tulis sendiri');
});

test('penolakan TETAP memotong kuota — keputusan, bukan kelalaian', () => {
  /* Kartu a-abuse-cost, diputuskan pemilik produk 31 Jul 2026: permintaan di
     luar korpus tetap memakai embedding kueri, pencarian vektor, penyimpanan
     percakapan, dan satu giliran perhatian sistem. Menggratiskannya berarti
     penyalahgunaan yang berulang tak berbiaya apa pun bagi pelakunya.

     Uji ini ada karena kombinasi "token 0 tapi pesan tetap +1" TERLIHAT
     seperti bug bagi pembaca berikutnya — cukup masuk akal untuk "diperbaiki"
     jadi tak menghitung sama sekali. Yang dijaga di sini bentuk kegagalannya:
     penambahan pesan harus TANPA SYARAT, bukan bergantung pada apakah model
     dipanggil. */
  const usage = readFileSync('src/modules/usage/usage.service.ts', 'utf8');
  const blok = usage.slice(usage.indexOf('async recordTurn'), usage.indexOf('async recordTurn') + 900);
  assert.ok(/messages\s*=\s*usage_counters\.messages \+ 1/.test(blok),
    'penambahan pesan tak lagi tetap +1');
  assert.ok(!/pintas|penolakan|refus/i.test(blok),
    'recordTurn kini membedakan penolakan — kuota jadi gratis bagi penyalahguna');
  /* Dan panggilannya tak boleh disyaratkan: `if (!pintasTanpaKonteks) await
     usageService.recordTurn(...)` akan lolos pemeriksaan di atas namun
     membuat penolakan tak berbiaya sama sekali. */
  const baris = SVC.split('\n').filter((b) => b.includes('usageService.recordTurn'));
  assert.equal(baris.length, 1, 'recordTurn dipanggil lebih dari sekali');
  // Dua spasi = tingkat teratas fungsi. Lebih dalam berarti ia bersarang di
  // dalam `if`/`else`, dan penolakan bisa melewatinya.
  assert.match(baris[0], /^ {2}await usageService\.recordTurn\(/,
    `recordTurn bersarang di dalam cabang — penolakan lolos dari kuota: "${baris[0]}"`);
});

test('bentuk balasan tak berubah — blok, keyakinan, penyimpanan, audit tetap jalan', () => {
  /* Klien membaca urutan SSE yang sama (sources → block* → keyakinan → done).
     Cabang pintas yang melompati finalisasi akan membuat widget menunggu
     `done` yang tak pernah datang. */
  const iPintas = SVC.indexOf('if (pintasTanpaKonteks)');
  for (const wajib of ['nilaiKeyakinan(full, context.length)', 'usageService.recordTurn', "'chat.turn'"]) {
    assert.ok(SVC.indexOf(wajib) > iPintas, `${wajib} tak dijalankan setelah cabang pintas`);
  }
  /* appendMessage muncul DUA kali: pesan pengguna (sebelum pintas, memang
     seharusnya) dan pesan jawaban (sesudah). Yang diperiksa yang kedua —
     memakai indexOf akan menemukan yang pertama dan meluluskan uji ini
     bahkan bila jawabannya tak pernah tersimpan. */
  assert.equal((SVC.match(/convo\.appendMessage/g) ?? []).length, 2,
    'jumlah penyimpanan pesan berubah — periksa apakah jawaban masih disimpan');
  assert.ok(SVC.lastIndexOf('convo.appendMessage') > iPintas,
    'jawaban tak disimpan setelah cabang pintas');
  // Sitasi tetap dikirim SEBELUM pintas dinilai — panel sumber tak berubah.
  assert.ok(SVC.indexOf('onSources?.(') < iPintas);
});

/* ── kalimat penolakannya ────────────────────────────────────────────── */

test('penolakan tetap DIKENALI sebagai penolakan oleh pendeteksi', () => {
  /* Ini cacat yang benar-benar terjadi saat kartu ini dikerjakan: kalimat
     pertama yang ditulis ("saya tidak menemukan apa pun") lolos dari
     deteksiPenolakan, sehingga penolakan ini akan dinilai sebagai jawaban
     biasa tanpa sitasi — dan UI menampilkannya sebagai jawaban, bukan sebagai
     "tak ditemukan". Yang disesuaikan wordingnya, BUKAN pendeteksinya. */
  const id = penolakanTanpaKonteks('Berapa lama garansi produk ini dan bagaimana cara klaimnya');
  const en = penolakanTanpaKonteks('What is the warranty period for this product and how do I claim it');
  assert.equal(deteksiPenolakan(id), true, 'penolakan berbahasa Indonesia tak dikenali');
  assert.equal(deteksiPenolakan(en), true, 'penolakan berbahasa Inggris tak dikenali');
  assert.equal(nilaiKeyakinan(id, 0).status, 'tak-ditemukan');
  assert.equal(nilaiKeyakinan(en, 0).status, 'tak-ditemukan');
});

test('bahasa penolakan mengikuti penanya', () => {
  /* Kalimat tetap berbahasa Indonesia merusak kepatuhan bahasa yang baru
     diperbaiki — dan penolakan berbahasa asing terasa seperti kerusakan,
     bukan seperti jawaban. */
  const en = penolakanTanpaKonteks('What is the warranty period for this product and how do I claim it');
  assert.ok(/documents/.test(en) && !/dokumen/.test(en), `balasan Inggris bercampur: ${en}`);
  const id = penolakanTanpaKonteks('Berapa lama garansi produk ini dan bagaimana cara klaimnya');
  assert.ok(/dokumen/.test(id) && !/documents/.test(id));
});

test('pertanyaan pendek jatuh ke bahasa Indonesia, bukan ke Inggris', () => {
  /* Pertanyaan memang sering pendek, dan pendeteksi menjawab null untuk teks
     kurang dari enam kata. Menebak Inggris membuat pengunjung Indonesia
     menerima penolakan berbahasa asing. */
  assert.equal(deteksiBahasa('npwp?'), null);
  assert.equal(bahasaBalasan('npwp?'), 'id');
  assert.equal(bahasaBalasan(''), 'id');
});

test('penolakan menawarkan langkah berikutnya, bukan sekadar menolak', () => {
  const id = penolakanTanpaKonteks('Tolong jelaskan kebijakan pengembalian barang di perusahaan ini');
  assert.ok(/ubah kalimat|tanyakan/.test(id), 'penolakan buntu tanpa saran');
  assert.ok(id.length > 80, 'penolakan terlalu singkat untuk menjelaskan sebabnya');
});

/* ── arah ketergantungan ─────────────────────────────────────────────── */

test('deteksi bahasa milik PRODUK, eval yang mengimpor', () => {
  /* Kalau terbalik, mematikan atau menyetel modul eval akan ikut mengubah
     kalimat yang dilihat pengunjung — alat ukur berubah jadi perilaku. */
  const evalSrc = readFileSync('src/modules/eval/policy-checks.ts', 'utf8');
  assert.ok(/from '@\/modules\/chat\/bahasa'/.test(evalSrc), 'eval tak mengimpor dari produk');
  assert.ok(!/const KATA_ID = \[/.test(evalSrc), 'eval masih menyimpan salinan daftar katanya');
  const chatSrc = readFileSync('src/modules/chat/confidence.ts', 'utf8');
  assert.ok(!/modules\/eval/.test(chatSrc), 'jalur chat bergantung pada modul eval');
});
