import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

const DECKS = readFileSync('src/app/(app)/dataroom/decks.ts', 'utf8');
/**
 * SELURUH berkas adegan, bukan scenes.tsx saja.
 *
 * Adegan sudah lama dipecah ke beberapa berkas (biaya, batas, penyimpanan,
 * vektor, memori), tetapi tes ini masih membaca satu berkas — jadi pemeriksaan
 * gradien, glow, dan aria-label diam-diam TIDAK berlaku pada adegan yang
 * ditulis belakangan. Membaca semuanya menutup celah itu.
 */
const BERKAS_ADEGAN = [
  'scenes.tsx', 'scenes-cost.tsx', 'scenes-limits.tsx',
  'scenes-storage.tsx', 'scenes-vector.tsx', 'scenes-ram.tsx',
  'scenes-vercel-besar.tsx',
];
const SCENES = BERKAS_ADEGAN
  .map((f) => readFileSync(`src/app/(app)/dataroom/${f}`, 'utf8'))
  .join('\n');
const EXPORT = readFileSync('src/app/(app)/dataroom/export.ts', 'utf8');
const CSS = readFileSync('src/app/(app)/dataroom/dataroom.css', 'utf8');

const load = () => import('../src/app/(app)/dataroom/scene-text');

test('tiap adegan punya komponen SVG DAN padanan teks', async () => {
  // Padanan teks bukan pelengkap: PPTX tak bisa membawa SVG beranimasi, jadi
  // adegan tanpa padanan akan terekspor sebagai slide KOSONG — dek yang di
  // layar paling jelas justru jadi yang di PowerPoint paling hampa.
  const { SCENE_STEPS } = await load();
  const ids = Object.keys(SCENE_STEPS);
  assert.ok(ids.length >= 8, 'jumlah adegan menyusut — periksa apakah ada yang terhapus');
  for (const id of ids) {
    assert.ok(SCENES.includes(`${id}: Scene`), `adegan "${id}" tak punya komponen SVG`);
    assert.ok(SCENE_STEPS[id as keyof typeof SCENE_STEPS].length >= 4,
      `padanan teks "${id}" terlalu tipis untuk berdiri sendiri di PPTX`);
  }
});

test('setiap slide anim menunjuk adegan yang benar-benar ada', async () => {
  const { SCENE_STEPS } = await load();
  // [a-zA-Z], bukan [a-z]: pola lama diam-diam MELEWATI id camelCase seperti
  // "ramShape", jadi slide yang menunjuk adegan tak terdaftar akan lolos tes
  // tanpa suara. Tes yang tak menjaring apa-apa lebih buruk daripada tak ada.
  const dipakai = [...DECKS.matchAll(/scene: '([a-zA-Z]+)'/g)].map((m) => m[1]);
  assert.ok(dipakai.length >= 8, 'dek HLA kehilangan slide ilustrasi');
  assert.ok(dipakai.some((s) => /[A-Z]/.test(s)), 'pola penjaring tak lagi menangkap id camelCase');
  for (const s of dipakai) {
    assert.ok(s in SCENE_STEPS, `slide menunjuk adegan "${s}" yang tak terdaftar`);
  }
});

test('ekspor PPTX menangani slide anim', () => {
  // Tanpa cabang ini, slide anim jatuh ke akhir fungsi dan menghasilkan
  // halaman berisi judul saja — gagal yang tak menimbulkan galat apa pun.
  assert.ok(/if \(s\.kind === 'anim'\)/.test(EXPORT), 'ekspor PPTX tak menangani slide anim');
  assert.ok(/SCENE_STEPS\[s\.scene\]/.test(EXPORT), 'ekspor tak memakai padanan teks');
});

test('gerak mati pada prefers-reduced-motion, isinya tetap tampil', () => {
  // Gerak bisa memicu mual dan migrain. Yang dimatikan HANYA geraknya —
  // kalau isinya ikut hilang, slide jadi kosong bagi orang yang paling
  // membutuhkan versi tenangnya.
  const blok = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion'));
  assert.ok(blok.length > 0, 'tak ada penanganan prefers-reduced-motion');
  assert.ok(/\.an-in,\.an-pop\{ opacity:1/.test(blok),
    'elemen yang muncul bertahap tetap tersembunyi saat gerak dimatikan');
  assert.ok(/stroke-dashoffset:0/.test(blok), 'garis tetap tak tergambar saat gerak dimatikan');
});

test('versi cetak menampilkan keadaan akhir, bukan keadaan awal', () => {
  // PDF dicetak dari halaman yang sama. Tanpa ini, seluruh slide ilustrasi
  // tercetak kosong karena animasinya berhenti di frame pertama.
  const blok = CSS.slice(CSS.indexOf('@media print{', CSS.indexOf('.sl-anim')));
  assert.ok(/opacity:1/.test(blok) && /animation:none/.test(blok),
    'slide ilustrasi tercetak dalam keadaan awal (kosong)');
});

test('adegan tak memakai gradien atau glow', () => {
  // D4v3 — sistem desain resmi menolak keduanya secara eksplisit.
  assert.ok(!/linearGradient|radialGradient/i.test(SCENES), 'ada gradien di adegan');
  assert.ok(!/feGaussianBlur|filter="url\(#glow/i.test(SCENES), 'ada efek glow di adegan');
});

test('tiap adegan punya label aksesibilitas', () => {
  // Animasi SVG tanpa label adalah kotak kosong bagi pembaca layar.
  const svg = [...SCENES.matchAll(/<svg[^>]*>/g)];
  assert.ok(svg.length >= 8);
  for (const [tag] of svg) {
    assert.ok(/role="img"/.test(tag), `ada <svg> tanpa role="img"`);
  }
  const labels = [...SCENES.matchAll(/aria-label="/g)];
  assert.ok(labels.length >= svg.length, 'ada adegan tanpa aria-label');
});

/* ══ MEMORI — tiga slide yang paling mudah dibaca keliru ═══════════════ */

const RAM = readFileSync('src/app/(app)/dataroom/scenes-ram.tsx', 'utf8');

test('dek HLA memuat ketiga slide memori', async () => {
  // Ketiganya menjawab satu pertanyaan bertingkat — apa yang tetap, apa yang
  // bertambah saat mencari, dan berapa pada 100/500/1.000 pengguna. Hilang
  // satu, sisanya berubah arti: tanpa yang pertama angka konkurensinya
  // terbaca sebagai TOTAL, dan pembacanya akan menaksir server terlalu kecil.
  const { SCENE_STEPS } = await load();
  for (const id of ['ramShape', 'ramQuery', 'ramUsers'] as const) {
    assert.ok(id in SCENE_STEPS, `padanan teks "${id}" hilang`);
    assert.ok(DECKS.includes(`scene: '${id}'`), `slide "${id}" tak ada di dek`);
  }
});

test('angka terukur dan angka turunan DIBEDAKAN, tidak dicampur', async () => {
  // Mencampur keduanya membuat yang terukur ikut diragukan. Byte per potongan
  // memang diukur dengan pg_column_size; kebutuhan per permintaan tidak —
  // dan itu harus terbaca di slidenya sendiri, bukan cuma di komentar kode.
  const { SCENE_STEPS } = await load();
  assert.ok(/TERUKUR/.test(RAM) && /DITURUNKAN/.test(RAM),
    'adegan memori tak lagi membedakan angka terukur dari angka turunan');
  const teks = SCENE_STEPS.ramShape.map((s) => `${s.t} ${s.d}`).join(' ');
  assert.ok(/belum diukur di bawah beban/i.test(teks),
    'padanan teks memori tak menyebut batas angkanya — di PPTX peringatan itu hilang');
});

test('kebutuhan memori tidak tumbuh lurus mengikuti pengguna', async () => {
  // Inilah isi slidenya, dan ia hanya benar selama kolam koneksi memberi ATAP
  // pada kueri serentak. Bila suatu saat Math.min(n, KOLAM) diganti jadi n,
  // angka di slide berbohong — dan tes ini yang menangkapnya.
  assert.ok(/Math\.min\(n, KOLAM\)/.test(RAM),
    'bagian basis data tak lagi dibatasi kolam koneksi — angka slide jadi salah');

  const { SCENE_STEPS } = await load();
  const gb = SCENE_STEPS.ramUsers
    .map((s) => /±([\d,]+) GB/.exec(s.t)?.[1])
    .filter(Boolean)
    .map((v) => Number(v!.replace(',', '.')));
  assert.equal(gb.length, 3, 'tiga skenario pengguna tak lagi menyebut angkanya');
  const [seratus, , seribu] = gb;
  assert.ok(seribu < seratus * 2,
    `sepuluh kali pengguna menaikkan memori jadi ${seribu} GB dari ${seratus} GB — itu pertumbuhan lurus, periksa modelnya`);
});

test('spesifikasi server proposal menutup mode langsung, bukan cuma bertingkat', () => {
  // Mode bertingkat sudah terpasang, tapi recall-nya BELUM diukur pada korpus
  // sebesar milik klien. Selama itu belum terjadi, RAM yang direkomendasikan
  // harus tetap memuat mode langsung seutuhnya — supaya mode bertingkat bisa
  // dimatikan tanpa membeli perangkat lagi. Menjual 32 GB saja berarti
  // menjanjikan sesuatu yang belum terukur.
  const baris = /\['RAM', '(\d+) GB', '(\d+) GB'/.exec(DECKS);
  assert.ok(baris, 'baris RAM di tabel spesifikasi server berubah bentuk');
  const [, min, rekomendasi] = baris!;

  // 47,4 jt potongan (30 GB teks, rasio perencanaan 3%) × 804 byte indeks.
  const langsungGb = (47.4e6 * 804) / 1024 ** 3;
  assert.ok(Number(rekomendasi) >= langsungGb,
    `rekomendasi ${rekomendasi} GB tak memuat mode langsung (${langsungGb.toFixed(0)} GB)`);
  assert.ok(Number(min) < Number(rekomendasi), 'minimum tak lagi di bawah rekomendasi');
  assert.ok(!/'128 GB', '256 GB'/.test(DECKS), 'spesifikasi lama pra-halfvec masih terpasang');
});

/* ══ TABRAKAN TEKS — SVG tak punya pembungkus baris otomatis ═══════════ */

test('keterangan lapis penjaga cukup pendek untuk kotaknya', () => {
  // Kotak selebar 110 dengan jarak 12 antar kotak, teks rata TENGAH pada 9px
  // (±4,6 px/karakter). Lebih dari ±16 karakter meluber ke KIRI dan ke KANAN
  // sekaligus dan menabrak kedua tetangganya. Ini pernah terjadi pada
  // "dokumen = data, bukan perintah" (29 karakter, ±133 px).
  // Batasnya `];` — bukan `]` pertama, yang justru menutup array baris di
  // dalam entri pertama dan membuat penjaringnya hanya melihat satu lapis.
  const blok = SCENES.slice(SCENES.indexOf('const lapis = ['));
  const isi = blok.slice(0, blok.indexOf('];'));
  const baris = [...isi.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(baris.length >= 10, 'daftar lapis penjaga berubah bentuk — periksa penjaringnya');
  for (const b of baris) {
    assert.ok(b.length <= 16, `"${b}" (${b.length} karakter) meluber dari kotak 110 px`);
  }
});

test('penanda "perkiraan" tak menabrak kolom paket pertama', () => {
  // Kolom paket pertama mulai di x=216. Penandanya dulu diletakkan pada
  // x = panjang_label × 6,2 — perkiraan lebar dengan metrik font yang SALAH
  // (sc-t, padahal barisnya dirender sc-s) — dan berakhir menimpa angka Free.
  const limits = readFileSync('src/app/(app)/dataroom/scenes-limits.tsx', 'utf8');
  assert.ok(!/k\.t\.length \* 6\.2/.test(limits),
    'lebar teks kembali ditaksir dari jumlah karakter — itu yang menyebabkan tabrakannya');
  assert.ok(/perkiraan, bukan kuota/.test(limits), 'penandanya hilang, bukan dipindah');
  assert.ok(/H_TAMBAHAN/.test(limits),
    'baris terakhir tak lagi diberi tinggi tambahan untuk baris keduanya');
});
