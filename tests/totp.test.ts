import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * TOTP.
 *
 * Implementasi TOTP yang SALAH tetap menghasilkan angka enam digit yang
 * berubah tiap 30 detik dan terlihat benar sepenuhnya — sampai pengguna
 * memasang aplikasi authenticator sungguhan dan tak satu pun kodenya
 * diterima. Karena itu kebenarannya dibuktikan dengan VEKTOR UJI RFC 6238,
 * bukan dengan contoh buatan sendiri: contoh yang ditulis penulisnya akan
 * cocok dengan bug-nya sendiri.
 */

const load = () => import('../src/modules/auth/totp');

/* RFC 6238 Appendix B — rahasia ASCII "12345678901234567890" (SHA1).
   Nilai resminya 8 digit; implementasi 6 digit mengambil enam terakhir. */
const RAHASIA_RFC = '12345678901234567890';
const VEKTOR: Array<[number, string]> = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

test('cocok dengan VEKTOR UJI RFC 6238', async () => {
  const { hotp, langkahUntuk } = await load();
  const rahasia = Buffer.from(RAHASIA_RFC, 'ascii');
  for (const [detik, delapanDigit] of VEKTOR) {
    const harap = delapanDigit.slice(-6);
    const dapat = hotp(rahasia, langkahUntuk(detik * 1000));
    assert.equal(dapat, harap,
      `T=${detik}: RFC menyebut ${harap} (dari ${delapanDigit}), implementasi memberi ${dapat}`);
  }
});

test('penghitung 64-bit — tetap benar setelah 2038', async () => {
  /* T=20000000000 detik ada di tahun 2603. Pergeseran 32-bit akan meluap
     diam-diam di sana, dan bug yang muncul bertahun-tahun kemudian adalah
     bug yang tak seorang pun hubungkan dengan barisnya. Vektor RFC terakhir
     ada justru untuk menangkap ini. */
  const { hotp, langkahUntuk } = await load();
  assert.equal(hotp(Buffer.from(RAHASIA_RFC, 'ascii'), langkahUntuk(20000000000 * 1000)), '353130');
});

test('base32 bolak-balik, dan menerima cara orang menyalinnya', async () => {
  const { base32Encode, base32Decode } = await load();
  const asli = Buffer.from('12345678901234567890', 'ascii');
  const b32 = base32Encode(asli);
  assert.ok(base32Decode(b32).equals(asli));
  // Aplikasi authenticator menampilkan rahasia berkelompok empat huruf, dan
  // orang menyalinnya apa adanya — dengan spasi, huruf kecil, tanda hubung.
  const berantakan = b32.toLowerCase().match(/.{1,4}/g)!.join(' ');
  assert.ok(base32Decode(berantakan).equals(asli));
  assert.ok(base32Decode(`${b32}===`).equals(asli));
});

test('jendela toleransi ±1 langkah, tidak lebih', async () => {
  const { verifikasiTotp, totp, buatRahasia, PERIODE_DETIK } = await load();
  const r = buatRahasia();
  const t = 1_700_000_000_000;
  const langkah = PERIODE_DETIK * 1000;

  // Kode dari 30 detik lalu & 30 detik ke depan DITERIMA — jam ponsel yang
  // meleset beberapa detik adalah hal biasa.
  assert.ok(verifikasiTotp(r, totp(r, t - langkah), { ms: t }).sah);
  assert.ok(verifikasiTotp(r, totp(r, t), { ms: t }).sah);
  assert.ok(verifikasiTotp(r, totp(r, t + langkah), { ms: t }).sah);
  // Dua langkah DITOLAK — memperlebar jendela memberi penyerang kesempatan
  // menebak yang berlipat tanpa menolong pengguna yang jamnya benar.
  assert.ok(!verifikasiTotp(r, totp(r, t - 2 * langkah), { ms: t }).sah);
  assert.ok(!verifikasiTotp(r, totp(r, t + 2 * langkah), { ms: t }).sah);
});

test('KODE TAK BISA DIPAKAI DUA KALI', async () => {
  /* Tanpa ini, satu kode berlaku 90 detik penuh dan bisa dipakai berkali-kali
     — penyerang yang sempat melihat layar korban, membaca notifikasi, atau
     mencegat satu kode punya jendela penuh untuk memakainya lagi. Satu kode
     SATU KALI adalah inti dari "sesuatu yang kamu punya". */
  const { verifikasiTotp, totp, buatRahasia } = await load();
  const r = buatRahasia();
  const t = 1_700_000_000_000;

  const pertama = verifikasiTotp(r, totp(r, t), { ms: t });
  assert.ok(pertama.sah && pertama.langkah != null);

  const kedua = verifikasiTotp(r, totp(r, t), { ms: t, langkahTerakhir: pertama.langkah });
  assert.ok(!kedua.sah, 'kode yang sama diterima dua kali');
});

test('kode lama ditolak walau masih di dalam jendela', async () => {
  // Langkah yang lebih TUA dari yang terakhir dipakai juga harus gugur —
  // kalau tidak, penyerang cukup memakai kode 30 detik sebelumnya.
  const { verifikasiTotp, totp, buatRahasia, PERIODE_DETIK, langkahUntuk } = await load();
  const r = buatRahasia();
  const t = 1_700_000_000_000;
  const sekarang = langkahUntuk(t);
  const lama = totp(r, t - PERIODE_DETIK * 1000);
  assert.ok(!verifikasiTotp(r, lama, { ms: t, langkahTerakhir: sekarang }).sah);
});

test('masukan cacat ditolak tanpa melempar', async () => {
  const { verifikasiTotp, buatRahasia } = await load();
  const r = buatRahasia();
  // Halaman login tak boleh 500 karena seseorang mengetik huruf di kolom kode.
  for (const buruk of ['', 'abcdef', '12345', '1234567', 'aaa aaa', '  ']) {
    assert.equal(verifikasiTotp(r, buruk).sah, false, `masukan "${buruk}" tak ditolak dengan tenang`);
  }
});

test('rahasia 160 bit, sesuai rekomendasi RFC 4226', async () => {
  const { buatRahasia, base32Decode } = await load();
  const a = buatRahasia(), b = buatRahasia();
  assert.equal(base32Decode(a).length, 20, 'rahasia bukan 160 bit');
  assert.notEqual(a, b, 'dua rahasia berturut identik — sumber acaknya rusak');
});

test('URL otpauth memuat penerbit DUA KALI, sesuai Key Uri Format', async () => {
  /* Aplikasi lama membaca penerbit dari path, yang baru dari parameter;
     menghilangkan salah satu membuat entri muncul tanpa nama di sebagian
     aplikasi — dan pengguna dengan beberapa akun tak bisa membedakannya. */
  const { otpauthUrl, buatRahasia } = await load();
  const u = otpauthUrl(buatRahasia(), 'orang@contoh.id');
  assert.ok(u.startsWith('otpauth://totp/'));
  assert.ok(u.includes(encodeURIComponent('Nalar:orang@contoh.id')), 'penerbit tak ada di path');
  assert.ok(/[?&]issuer=Nalar/.test(u), 'penerbit tak ada di parameter');
  assert.ok(/algorithm=SHA1/.test(u) && /digits=6/.test(u) && /period=30/.test(u));
});

test('kode cadangan: unik, tanpa vokal, dan ternormalisasi saat dibandingkan', async () => {
  const { buatKodeCadangan, normalisasiCadangan, JUMLAH_CADANGAN } = await load();
  const k = buatKodeCadangan();
  assert.equal(k.length, JUMLAH_CADANGAN);
  assert.equal(new Set(k).size, JUMLAH_CADANGAN, 'ada kode cadangan kembar');
  for (const x of k) {
    // Tanpa vokal: menghapus kemungkinan kode acak membentuk kata tak pantas,
    // sekaligus kebingungan O/0 dan I/1 saat menyalin dari kertas.
    assert.ok(!/[AEIOU01]/.test(x), `kode "${x}" memuat huruf yang membingungkan`);
  }
  // Orang mengetiknya dengan spasi dan huruf kecil.
  assert.equal(normalisasiCadangan(' ab2-cd3 '), 'AB2CD3');
});
