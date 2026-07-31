import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

/**
 * JEBAKAN INTERPOLASI KOLOM DI DALAM SUBKUERI.
 *
 * Drizzle merender `${tabel.kolom}` di dalam template `sql` sebagai nama
 * kolom TELANJANG — tanpa nama tabelnya. Di dalam subkueri, nama telanjang
 * itu tertangkap ke tabel subkueri sendiri, bukan ke tabel luar:
 *
 *     select count(*)::int from "messages"
 *     where "conversation_id" = "id"     <- keduanya kolom messages
 *
 * SQL-nya tetap SAH. Ia berjalan, tak melempar apa pun, dan hanya menjawab
 * angka yang salah.
 *
 * KENAPA PENJAGA INI ADA, dan ini sebabnya ia berbentuk uji dan bukan
 * komentar: basis kode ini SUDAH tahu jebakannya. Ada dua komentar
 * peringatan — di knowledge-base.service.ts dan category.service.ts —
 * yang menyebutnya "bug nyata: endpoint 500 di produksi". Pengetahuan itu
 * hanya hidup di tempat yang SUDAH diperbaiki, jadi ia tak menolong siapa
 * pun yang menulis kueri baru di berkas lain. Dan memang tidak: jebakan yang
 * sama terulang pada /api/v1/conversations (commit 938264c), lolos tsc, lint,
 * build, dan 587 uji, lalu menjawab `pesan: 0` untuk percakapan berisi 12
 * pesan sampai diperiksa langsung ke basis data.
 *
 * Bentuk yang aman: tulis kolom luar sebagai teks LITERAL
 * (`where s.knowledge_base_id = knowledge_bases.id`), atau — lebih baik —
 * pakai LEFT JOIN + GROUP BY, yang kondisinya dikualifikasi Drizzle sendiri.
 */

function berkasSumber(dir = 'src'): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = `${dir}/${f}`;
    if (statSync(p).isDirectory()) out.push(...berkasSumber(p));
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const NAMA_TABEL = new Set(
  [...readFileSync('src/modules/core/db/schema.ts', 'utf8')
    .matchAll(/export const (\w+) = pgTable\(/g)].map((m) => m[1]),
);

/**
 * Pembuka template `sql`, TIDAK termasuk kata `sql` yang dikutip gaya
 * markdown di dalam komentar. Tanpa penjagaan itu, tulisan "template `sql`:"
 * di sebuah komentar terbaca sebagai awal template dan pemindaiannya berjalan
 * sampai backtick berikutnya — persis yang terjadi pada percobaan pertama,
 * dan menghasilkan tiga temuan palsu di berkas yang justru sudah benar.
 */
const PEMBUKA = /(?<![`\w])sql(?:<[^>]*>)?`/g;

export interface TemuanSql { berkas: string; baris: number; kutipan: string }

/** Pindai satu isi berkas; dipisah supaya bisa diberi kontrol positif. */
export function pindai(sumber: string, berkas = '(uji)'): TemuanSql[] {
  const temuan: TemuanSql[] = [];
  for (const m of sumber.matchAll(PEMBUKA)) {
    let i = (m.index ?? 0) + m[0].length;
    let dalam = 0;
    let isi = '';
    for (; i < sumber.length; i++) {
      const c = sumber[i];
      if (c === '\\') { i++; continue; }
      if (c === '$' && sumber[i + 1] === '{') { dalam++; isi += '${'; i++; continue; }
      if (c === '}' && dalam > 0) { dalam--; isi += '}'; continue; }
      if (c === '`' && dalam === 0) break;
      isi += c;
    }
    // Hanya template yang memuat SUBKUERI yang berbahaya; interpolasi kolom
    // di kueri datar dirender di konteks yang benar.
    if (!/\bselect\b[\s\S]*\bfrom\b/i.test(isi)) continue;
    for (const it of isi.matchAll(/\$\{\s*(\w+)\.(\w+)\s*\}/g)) {
      if (NAMA_TABEL.has(it[1])) {
        temuan.push({
          berkas,
          baris: sumber.slice(0, m.index ?? 0).split('\n').length,
          kutipan: it[0],
        });
      }
    }
  }
  return temuan;
}

/* ── kontrol positif: buktikan pemindainya memang menggigit ──────────── */

test('bentuk yang PERSIS jadi bug terdeteksi', () => {
  /* Tanpa kontrol positif, "nol temuan" di seluruh repo tak membuktikan apa
     pun — pemindai yang rusak juga menjawab nol, dan menjawabnya selamanya. */
  const buruk = 'const q = sql<number>`(select count(*)::int from ${messages}'
    + ' where ${messages.conversationId} = ${conversations.id})`;';
  const t = pindai(buruk);
  assert.equal(t.length, 2, `seharusnya 2 interpolasi kolom terdeteksi: ${JSON.stringify(t)}`);
  assert.deepEqual(t.map((x) => x.kutipan).sort(),
    ['${conversations.id}', '${messages.conversationId}']);
});

test('bentuk AMAN tidak ikut ditandai', () => {
  /* Pemindai yang menandai kode benar akan dimatikan orang dalam seminggu,
     dan matinya permanen. Tiga bentuk sah yang nyata ada di repo ini. */
  // 1. kolom luar ditulis literal — cara yang dipakai knowledge-base.service
  assert.deepEqual(pindai(
    'sql<number>`(select count(*)::int from data_sources s'
    + ' where s.knowledge_base_id = knowledge_bases.id)`'), []);
  // 2. interpolasi NILAI, bukan kolom
  assert.deepEqual(pindai(
    'sql`select * from documents where tenant_id = ${tenantId} and id = ${id}`'), []);
  // 3. interpolasi kolom di kueri DATAR (tanpa subkueri) — dirender di
  //    konteks yang benar, jadi memang tak berbahaya.
  assert.deepEqual(pindai('sql`count(${messages.id})::int`'), []);
});

test('kata `sql` yang dikutip di komentar bukan pembuka template', () => {
  /* Percobaan pertama penjaga ini menandai tiga temuan palsu justru di berkas
     yang sudah benar, karena kalimat "ditulis di dalam template `sql`:" di
     sebuah komentar terbaca sebagai awal template. */
  const komentar = '/* ditulis di dalam template `sql`:\n'
    + ' *   select count(*) from ${messages} where ${messages.id} = ${conversations.id}\n */';
  assert.deepEqual(pindai(komentar), []);
});

/* ── pemindaian repo: keadaan yang harus dipertahankan ───────────────── */

test('tak ada satu pun subkueri berinterpolasi kolom di seluruh src/', () => {
  const semua = berkasSumber().flatMap((p) => pindai(readFileSync(p, 'utf8'), p));
  assert.deepEqual(semua, [],
    'Interpolasi ${tabel.kolom} di dalam subkueri: Drizzle merendernya tanpa nama tabel, '
    + 'dan di dalam subkueri ia tertangkap ke tabel subkueri sendiri. SQL-nya tetap sah — '
    + 'ia hanya menjawab angka yang salah, diam-diam. Tulis kolom luar sebagai teks literal, '
    + 'atau pakai LEFT JOIN + GROUP BY.\n'
    + semua.map((t) => `  ${t.berkas}:${t.baris}  ${t.kutipan}`).join('\n'));
});

test('pemindai benar-benar melihat berkas, bukan daftar kosong', () => {
  /* Kalau penelusuran direktorinya rusak, uji di atas lulus selamanya tanpa
     memeriksa apa pun — bentuk kegagalan yang paling sepi dari semuanya. */
  const berkas = berkasSumber();
  assert.ok(berkas.length > 150, `hanya ${berkas.length} berkas terpindai — penelusuran rusak?`);
  assert.ok(berkas.includes('src/modules/chat/ekspor.ts'));
  assert.ok(NAMA_TABEL.size > 25, `hanya ${NAMA_TABEL.size} tabel dikenal — pembacaan schema rusak?`);
  assert.ok(NAMA_TABEL.has('messages') && NAMA_TABEL.has('conversations'));
});
