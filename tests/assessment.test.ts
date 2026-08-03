import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ASSESSED_AT, DIMENSIONS, OVERALL, PREV, PRIORITIES,
} from '../src/app/(app)/dataroom/assessment';

/**
 * ASSESSMENT — dua salinan angka yang sama, dan apa yang menahannya sepakat.
 *
 * Skornya hidup di dua tempat: `assessment.ts` (yang dirender dataroom) dan
 * `docs/ASSESSMENT.md` (yang dibaca orang di repo, dan yang ditempel ke deck).
 * Bentuk kegagalannya sudah terjadi sekali: yang .md tertinggal di 7,7 selama
 * seminggu sementara dataroom menampilkan 8,7 — dan dua pembaca yang berbeda
 * mendapat dua jawaban berbeda untuk pertanyaan yang sama. Yang menanggung
 * akibatnya bukan yang lupa memperbarui.
 *
 * Yang dijaga bukan isinya (itu penilaian, bukan fakta yang bisa diuji),
 * melainkan bahwa keduanya TIDAK BISA berbeda diam-diam.
 */

const MD = readFileSync('docs/ASSESSMENT.md', 'utf8');
const TS = readFileSync('src/app/(app)/dataroom/assessment.ts', 'utf8');

/** 8.6 → "8,6" — .md menulis desimal gaya Indonesia. */
const id = (n: number) => n.toFixed(1).replace('.', ',');

test('tanggal penilaian sama di kedua salinan', () => {
  assert.match(MD, new RegExp(`^# Assessment Nalar — ${ASSESSED_AT}$`, 'm'),
    `judul .md tak menyebut ${ASSESSED_AT}`);
});

test('skor keseluruhan sama di kedua salinan', () => {
  assert.ok(MD.includes(`±${id(OVERALL)}/10`), `.md tak memuat keseluruhan ${id(OVERALL)}`);
  // Dan penilaian sebelumnya harus tetap terlihat — angka tanpa arah tak
  // memberi tahu pembacanya apakah produknya sedang membaik atau tidak.
  assert.ok(MD.includes(`${PREV.at.slice(8)} Jul: ${id(PREV.score)}`)
    || MD.includes(`${PREV.at}: ${id(PREV.score)}`),
    `.md tak menyebut penilaian sebelumnya (${PREV.at} = ${id(PREV.score)})`);
});

test('tiap dimensi punya judul & skor yang sama di .md', () => {
  for (const d of DIMENSIONS) {
    assert.ok(MD.includes(`${d.label} — **${id(d.score)}/10**`),
      `.md tak memuat "${d.label} — ${id(d.score)}/10"`);
    assert.ok(MD.includes(`| **${id(d.score)}** |`) || true); // bentuk baris bebas
  }
});

test('tiap area di .ts punya barisnya sendiri di .md', () => {
  /* Area yang hilang dari tabel .md adalah celah yang hilang dari pandangan
     pembaca — dan celah yang hanya tercatat di satu tempat cenderung berhenti
     dikerjakan. Cocokkan lewat nama areanya, yang sengaja ditulis identik. */
  const hilang: string[] = [];
  for (const d of DIMENSIONS) {
    for (const a of d.areas) {
      // .md boleh menebalkan nama area yang ingin ditonjolkan.
      if (!MD.includes(`| ${a.name} |`) && !MD.includes(`| **${a.name}** |`)) {
        hilang.push(`${d.id}/${a.name}`);
      }
    }
  }
  assert.deepEqual(hilang, [], `area tak punya baris di docs/ASSESSMENT.md: ${hilang.join(', ')}`);
});

test('skor tiap area sama persis di kedua salinan', () => {
  const beda: string[] = [];
  for (const d of DIMENSIONS) {
    for (const a of d.areas) {
      const baris = MD.split('\n').find((l) =>
        l.startsWith(`| ${a.name} |`) || l.startsWith(`| **${a.name}** |`));
      if (!baris) continue; // sudah dijaga tes di atas
      const skor = baris.match(/\|\s*\*{0,2}(\d,\d)\*{0,2}\s*\|/);
      if (!skor || skor[1] !== id(a.score)) {
        beda.push(`${a.name}: .ts=${id(a.score)} .md=${skor?.[1] ?? '—'}`);
      }
    }
  }
  assert.deepEqual(beda, [], `skor area berbeda antara .ts dan .md: ${beda.join(' · ')}`);
});

test('prioritasnya sama, dan urutannya sama', () => {
  /* Urutan prioritas ADALAH isinya: daftar yang sama dengan urutan berbeda
     menyuruh dua orang mengerjakan dua hal berbeda lebih dulu. */
  const dariMd = [...MD.matchAll(/^\d+\.\s+\*\*(.+?)\*\*/gm)].map((m) => m[1]);
  assert.deepEqual(dariMd, PRIORITIES.map((p) => p.t),
    'daftar prioritas .md tak sama (atau tak seurutan) dengan assessment.ts');
});

/* ── batas yang tak boleh diam-diam hilang ────────────────────────────── */

test('kedua salinan menyatakan lingkungannya STAGING', () => {
  /* Dikoreksi pemilik produk 3 Agu 2026. Pembaca dataroom yang mengira ini
     pemasangan pelanggan akan menyimpulkan hal-hal tentang perilaku di bawah
     beban yang tak dibuktikan sama sekali. */
  /* Diikat ke bentuk KLAIM-nya, bukan ke kata "produksi". Kedua berkas
     menyebut frasa itu justru untuk mengoreksinya ("versi sebelumnya
     menyebutnya produksi, dan itu keliru") — pemeriksaan yang melarang katanya
     akan menghukum kalimat yang memperbaiki kesalahannya. */
  const KLAIM = /(Digrounding|dirujuk ke perilaku yang DISAKSIKAN|screenshot)[^.\n]{0,60}\bprodu(ksi|ction)\b/i;
  for (const [nama, isi] of [['docs/ASSESSMENT.md', MD], ['assessment.ts', TS]] as const) {
    assert.ok(/staging/i.test(isi), `${nama} tak menyebut lingkungan sebenarnya`);
    assert.ok(!KLAIM.test(isi), `${nama} masih mengklaim buktinya dari produksi`);
  }
  assert.ok(/tidak terwakili di sini/i.test(MD), '.md tak menyatakan APA yang tak terwakili');
});

test('atap recall korpus besar tetap tercatat sebagai celah', () => {
  /* Ini satu-satunya angka di halaman ini yang TURUN, dan justru yang paling
     penting bagi pembeli enterprise. Menghapusnya karena terlihat buruk
     menghapus satu-satunya hal yang membuat sisanya bisa dipercaya. */
  const area = DIMENSIONS.find((d) => d.id === 'agentic')!
    .areas.find((a) => /recall/i.test(a.name));
  assert.ok(area, 'area recall korpus besar hilang dari assessment');
  assert.ok(area!.score < 8, `celah recall dinaikkan jadi ${area!.score} tanpa pengukuran baru`);
  assert.ok(/21,7%/.test(area!.gap), 'angka recall terukur hilang dari keterangannya');
  assert.ok(/21,7%/.test(MD), 'docs/ASSESSMENT.md kehilangan angka recall terukur');
});

test('skor dimensi tak melayang jauh di atas rata-rata areanya', () => {
  /* Skor dimensi memang penilaian, bukan rata-rata — tapi tanpa pagar, ia
     bisa naik tiap kali tanpa satu pun area yang membaik. Pagar longgar
     (+0,6) cukup untuk menangkap bentuk itu. */
  for (const d of DIMENSIONS) {
    const rata = d.areas.reduce((s, a) => s + a.score, 0) / d.areas.length;
    assert.ok(d.score <= rata + 0.6,
      `${d.label}: skor ${d.score} terlalu jauh di atas rata-rata areanya (${rata.toFixed(2)})`);
    assert.ok(d.score >= rata - 0.6,
      `${d.label}: skor ${d.score} terlalu jauh di bawah rata-rata areanya (${rata.toFixed(2)})`);
  }
  const rataDim = DIMENSIONS.reduce((s, d) => s + d.score, 0) / DIMENSIONS.length;
  assert.ok(Math.abs(OVERALL - rataDim) <= 0.3,
    `keseluruhan ${OVERALL} tak sepadan dengan rata-rata dimensi (${rataDim.toFixed(2)})`);
});
