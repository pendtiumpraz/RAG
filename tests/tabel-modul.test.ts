import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SETIAP TABEL DATA WAJIB PUNYA CARI · SARING · URUT · HALAMAN · NOMOR.
 *
 * Aturan ini gampang benar hari ini dan gampang bocor besok: satu halaman baru
 * dengan `rows.map()` langsung ke `<tbody>` terlihat sempurna pada data demo,
 * dan baru terasa salah di pemasangan pelanggan yang barisnya ribuan — di
 * layar orang lain, berbulan-bulan kemudian.
 *
 * Yang diperiksa BUKAN estetika melainkan lima hal yang tak bisa diakali:
 * tabelnya memakai alat bersama, kepalanya punya kolom nomor, kakinya punya
 * penggalan, dan penomorannya GLOBAL (bukan indeks baris halaman).
 *
 * PENGECUALIAN DITULIS, BUKAN DIDIAMKAN. Ada tabel yang memang tak boleh
 * dipenggal — matriks perbandingan paket, kuitansi, slide dataroom, blok
 * jawaban chat. Semuanya terdaftar di bawah lengkap dengan alasannya, jadi
 * yang menambah tabel baru harus MEMUTUSKAN ia yang mana, bukan lupa.
 */

const AKAR = 'src/app';
const ALAT = '_components/tabel';

/** Berkas yang memuat <table> tapi TIDAK menampilkan daftar data. */
const DIKECUALIKAN: Record<string, string> = {
  'src/app/(app)/dataroom/page.tsx':
    'slide dataroom — tabel di sini adalah ISI slide (biaya, perbandingan), bukan daftar baris yang tumbuh',
  'src/app/(app)/dataroom/Calculator.tsx':
    'keluaran kalkulator: barisnya dihitung dari input, jumlahnya tetap',
  'src/app/(app)/bantuan/page.tsx':
    'halaman panduan — tabel penjelasan yang ditulis tangan',
  'src/app/(app)/kuitansi/[id]/page.tsx':
    'kuitansi: satu dokumen cetak, memenggalnya akan menghasilkan bukti bayar yang tak utuh',
  'src/app/(app)/settings/TwoFactor.tsx':
    'tata letak kunci-nilai (tanpa thead), bukan daftar',
  'src/app/(app)/settings/Penyimpanan.tsx':
    'daftar koneksi penyimpanan PER-USER — kecil dan terbatas (paling banyak beberapa), memenggal/menyaringnya justru menyulitkan orang melihat semua koneksinya sendiri sekaligus',
  'src/app/_components/answer-blocks.tsx':
    'blok tabel di dalam jawaban chat — isinya dari model, sudah dibatasi 5 kolom di blocks.ts',
  'src/app/status/page.tsx':
    'tata letak kunci-nilai status layanan (tanpa thead)',
  'src/app/terms/page.tsx':
    'ketentuan layanan — dokumen hukum yang harus terbaca utuh; memenggalnya mengubah apa yang disetujui orang',
  'src/app/privacy/page.tsx':
    'kebijakan privasi — sama: dokumen hukum, dan Google membacanya saat verifikasi OAuth',
};

/** Tabel yang ADA di berkas ber-alat, tapi memang tak boleh dipenggal. */
const CATATAN_DALAM_BERKAS = [
  'kredensial OAuth (dua baris tetap: Google & Microsoft)',
  'matriks perbandingan paket & kuota',
  'pemilih folder di dalam laci',
];

function berkasTsx(dir: string): string[] {
  const out: string[] = [];
  for (const nama of readdirSync(dir)) {
    const p = join(dir, nama);
    if (statSync(p).isDirectory()) out.push(...berkasTsx(p));
    else if (nama.endsWith('.tsx')) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}

const SEMUA = berkasTsx(AKAR).filter((p) => readFileSync(p, 'utf8').includes('<table'));

test('pemindainya benar-benar menemukan tabel — kalau nol, ia tak menjaga apa pun', () => {
  /* Uji kendali. Pemindai yang polanya meleset akan lulus tanpa memeriksa
     satu berkas pun, dan itu bentuk kegagalan paling tenang yang ada. */
  assert.ok(SEMUA.length >= 15, `hanya ${SEMUA.length} berkas bertabel ditemukan — pola pemindainya meleset`);
});

test('daftar pengecualian tidak menyimpan nama berkas yang sudah tak ada', () => {
  /* Pengecualian yang berkasnya sudah dihapus/dipindah berhenti berarti apa
     pun, dan sisa barisnya membuat daftar ini terbaca lebih longgar daripada
     kenyataannya. */
  const hilang = Object.keys(DIKECUALIKAN).filter((p) => !SEMUA.includes(p));
  assert.deepEqual(hilang, [], `pengecualian menunjuk berkas yang tak lagi bertabel: ${hilang.join(', ')}`);
});

test('setiap halaman modul bertabel memakai alat tabel bersama', () => {
  const bolong: string[] = [];
  for (const p of SEMUA) {
    if (DIKECUALIKAN[p]) continue;
    const isi = readFileSync(p, 'utf8');
    if (!isi.includes(ALAT)) bolong.push(p);
  }
  assert.deepEqual(bolong, [],
    `tabel data tanpa cari/saring/urut/halaman: ${bolong.join(', ')}\n`
    + 'Pakai _components/tabel, atau daftarkan di DIKECUALIKAN beserta alasannya.');
});

test('tiap berkas ber-alat benar-benar MEMAKAI keempatnya', () => {
  /* Mengimpor tanpa memakai akan lolos uji di atas — dan itu persis bentuk
     "sudah dikerjakan" yang tak mengubah apa pun di layar. */
  const kurang: string[] = [];
  for (const p of SEMUA) {
    const isi = readFileSync(p, 'utf8');
    if (!isi.includes(ALAT)) continue;
    const perlu = ['useTabel(', '<TabelAlat', '<TabelKaki', '<ThNo', '<TdNo'];
    const tak = perlu.filter((k) => !isi.includes(k));
    if (tak.length) kurang.push(`${p} → ${tak.join(', ')}`);
  }
  assert.deepEqual(kurang, [], `berkas mengimpor alat tabel tapi tak memakainya: ${kurang.join(' · ')}`);
});

test('PENOMORAN GLOBAL — tak ada satu pun tabel yang menomori dari indeks baris', () => {
  /* Bentuk kegagalannya: `<TdNo n={i + 1} />`. Benar di halaman pertama —
     satu-satunya halaman yang biasanya dibuka saat membangunnya — dan salah
     di semua halaman berikutnya, sehingga dua baris berbeda bernomor sama.
     `t.nomor(i)` menambahkan offset halaman; `i + 1` tidak. */
  const salah: string[] = [];
  for (const p of SEMUA) {
    const isi = readFileSync(p, 'utf8');
    for (const m of isi.matchAll(/<TdNo\s+n=\{([^}]+)\}/g)) {
      const ekspresi = m[1].trim();
      // Yang sah: `x.nomor(i)` — apa pun nama variabel kendalinya.
      if (!/^\w+\.nomor\(/.test(ekspresi)) salah.push(`${p}: <TdNo n={${ekspresi}}>`);
    }
  }
  assert.deepEqual(salah, [], `penomoran tak memakai offset halaman: ${salah.join(' · ')}`);
});

test('penomoran di tabel berhalaman-SERVER juga memakai offset', () => {
  /* Dua tabel tak memakai useTabel karena penggalannya di server (Dokumen,
     antrean verifikasi). Keduanya tetap harus menomori global — dan di sana
     offsetnya dihitung tangan, jadi justru lebih gampang salah. */
  for (const [berkas, pola] of [
    ['src/app/(app)/documents/page.tsx', /page \* docs\.data!\.pageSize \+ i \+ 1/],
    ['src/app/(app)/team/page.tsx', /\(data\.page - 1\) \* data\.pageSize \+ i \+ 1/],
  ] as const) {
    const isi = readFileSync(berkas, 'utf8');
    assert.ok(pola.test(isi), `${berkas} menomori baris tanpa offset halaman server`);
  }
});

test('pencarian pada daftar berhalaman-SERVER dikirim ke server', () => {
  /* Menyaring di peramban hanya menyaring baris yang kebetulan tampil.
     Mengetik sebuah nama lalu tak menemukannya akan terbaca sebagai "tak ada",
     padahal ia di halaman berikutnya — dan salah satu layar ini dipakai
     memutuskan siapa boleh masuk ke aplikasi. */
  const team = readFileSync('src/app/(app)/team/page.tsx', 'utf8');
  assert.ok(/\&q=\$\{encodeURIComponent/.test(team), 'antrean verifikasi menyaring di peramban, bukan di server');
  const svc = readFileSync('src/modules/auth/user-approval.service.ts', 'utf8');
  assert.ok(/ilike/.test(svc), 'layanan antrean verifikasi tak punya pencarian sama sekali');
  /* Hitungan totalnya harus ikut di-join ke `tenants`, karena penyaring
     pencariannya menyebut kolom itu — tanpa join, kueri hitungan GAGAL dan
     seluruh halaman ikut jatuh. */
  const blokHitung = svc.slice(svc.indexOf('count()'));
  assert.ok(/leftJoin\(tenants/.test(blokHitung.slice(0, 400)),
    'kueri hitungan tak ikut men-join tenants — penyaring pencarian akan menjatuhkannya');
});

test('urutan pada daftar berhalaman-SERVER dikerjakan server, lewat DAFTAR PUTIH', () => {
  /* Dua hal sekaligus. (1) Mengurutkan 20 baris yang kebetulan tampil bukan
     mengurutkan apa pun. (2) Kunci urut datang dari query string, dan SQL yang
     dirakit dari masukan pengguna adalah cara paling langsung membuka injeksi
     — jadi ia harus dipetakan, tak pernah disisipkan apa adanya. */
  const svc = readFileSync('src/modules/memory/document-summary.service.ts', 'utf8');
  assert.ok(/const KOLOM: Record<string,/.test(svc), 'kolom urut tak dipetakan lewat daftar putih');
  assert.ok(/opts\.urut \? KOLOM\[opts\.urut\]/.test(svc), 'kunci urut tak dicari di daftar putih');
  assert.ok(!/sql\.raw\(\s*(opts\.urut|`\$\{opts\.urut)/.test(svc),
    'kunci urut dari query string disisipkan mentah ke SQL');
});

test('alasan tiap pengecualian benar-benar ditulis, bukan sekadar didaftar', () => {
  for (const [berkas, alasan] of Object.entries(DIKECUALIKAN)) {
    assert.ok(alasan.length > 25, `pengecualian ${berkas} tak menjelaskan apa pun`);
  }
  assert.ok(CATATAN_DALAM_BERKAS.length >= 3);
});
