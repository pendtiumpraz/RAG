import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

const DECKS = readFileSync('src/app/(app)/dataroom/decks.ts', 'utf8');
const SCENES = readFileSync('src/app/(app)/dataroom/scenes.tsx', 'utf8');
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
  const dipakai = [...DECKS.matchAll(/scene: '([a-z]+)'/g)].map((m) => m[1]);
  assert.ok(dipakai.length >= 8, 'dek HLA kehilangan slide ilustrasi');
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
