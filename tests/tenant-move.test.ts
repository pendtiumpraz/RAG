import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

const load = () => import('../src/modules/core/db/tenant-tables');
const SCHEMA = readFileSync('src/modules/core/db/schema.ts', 'utf8');
const MOVE = readFileSync('scripts/tenant-move.ts', 'utf8');

/**
 * Nama tabel yang punya kolom `tenant_id` MENURUT schema.ts.
 *
 * Dicocokkan dengan `tenant_id` PERSIS — bukan substring. Pembacaan longgar
 * pernah menyeret `oauth_apps` ke daftar tenant hanya karena ia punya kolom
 * `ms_tenant_id` (id direktori Microsoft, sama sekali bukan tenant Nalar).
 */
function tabelBerTenantId(): Set<string> {
  const out = new Set<string>();
  for (const blok of SCHEMA.split("pgTable('").slice(1)) {
    const nama = blok.slice(0, blok.indexOf("'"));
    const badan = blok.slice(0, blok.indexOf('} as const') > 0 ? blok.indexOf('} as const') : 4000);
    if (/uuid\('tenant_id'\)/.test(badan)) out.add(nama);
  }
  return out;
}

test('daftar tabel tenant LENGKAP — tak ada yang terlewat', async () => {
  const { TENANT_TABLES, PLATFORM_TABLES, TENANT_ROOT_TABLE } = await load();
  const nyata = tabelBerTenantId();
  const terdaftar = new Set<string>([...TENANT_TABLES, ...PLATFORM_TABLES, TENANT_ROOT_TABLE]);

  const terlewat = [...nyata].filter((t) => !terdaftar.has(t));
  // Inilah uji yang paling penting di berkas ini. Tabel yang terlewat berarti
  // datanya HILANG DIAM-DIAM saat tenant dipindahkan — tak ada galat, tak ada
  // selisih yang terlihat, dan baru ketahuan berbulan-bulan kemudian saat
  // seseorang mencari sesuatu yang tak pernah ikut berpindah.
  assert.deepEqual(terlewat, [],
    `tabel ber-tenant_id belum terdaftar di tenant-tables.ts: ${terlewat.join(', ')}`);
});

test('tak ada tabel yang masuk dua daftar sekaligus', async () => {
  const { TENANT_TABLES, PLATFORM_TABLES } = await load();
  const dua = TENANT_TABLES.filter((t) => (PLATFORM_TABLES as readonly string[]).includes(t));
  assert.deepEqual(dua, [], `terdaftar ganda: ${dua.join(', ')}`);
});

test('tabel platform memang TIDAK ber-tenant_id', async () => {
  const { PLATFORM_TABLES } = await load();
  const nyata = tabelBerTenantId();
  const salah = PLATFORM_TABLES.filter((t) => nyata.has(t));
  // Kebalikannya juga berbahaya: tabel ber-tenant_id yang dianggap milik
  // platform akan tertinggal saat pindah, dan tenant di tujuan kehilangan
  // sebagian datanya tanpa satu pun peringatan.
  assert.deepEqual(salah, [],
    `tabel ini punya tenant_id tapi dianggap milik platform: ${salah.join(', ')}`);
});

test('ekspor DAN impor sama-sama memasang app.current_tenant', () => {
  // Peran aplikasi tunduk pada RLS. Tanpa GUC ini ekspor membaca NOL baris —
  // berhasil, berkasnya kosong, tanpa galat apa pun. Itu kegagalan paling
  // berbahaya dari alat semacam ini: melapor sukses sambil tak memindahkan
  // apa-apa. Terjadi sungguhan saat alat ini pertama dijalankan.
  const n = MOVE.match(/set_config\('app\.current_tenant'/g) ?? [];
  assert.equal(n.length, 2, 'app.current_tenant tak dipasang di kedua arah');
});

test('impor menolak menimpa tenant yang sudah ada', () => {
  // Impor yang menimpa berarti tak ada jalan pulang. Bentrok harus jadi
  // penolakan yang jelas, bukan penggabungan diam-diam.
  assert.match(MOVE, /SUDAH ADA di tujuan/);
  assert.ok(!/on conflict do update/i.test(MOVE), 'impor menimpa baris yang ada');
  assert.ok(!/truncate|delete from/i.test(MOVE), 'impor menghapus data di tujuan');
});

test('jumlah baris diverifikasi terhadap manifest', () => {
  // Tanpa ini, impor yang separuh jadi tak bisa dibedakan dari yang tuntas.
  assert.match(MOVE, /diharapkan \$\{manifest\.rows\[tabel\]\}/);
  assert.match(MOVE, /process\.exit\(4\)/, 'selisih baris tak menghentikan proses');
});

test('memakai COPY, bukan JSON buatan sendiri', () => {
  // Format teks Postgres menangani vector, jsonb, dan timestamp dengan tepat
  // dan bolak-balik tanpa kehilangan apa pun. Vektor 1.536 dimensi sebagai
  // JSON membengkak dua kali lipat dan membuka peluang salah pembulatan yang
  // baru terlihat saat hasil pencariannya berubah.
  assert.match(MOVE, /copy \(select \* from/);
  assert.match(MOVE, /copy \$\{tabel\} from stdin/);
});

test('urutan ekspor menempatkan tenants paling depan', async () => {
  const { TENANT_TABLES, TENANT_ROOT_TABLE } = await load();
  // Tanpa foreign key, urutan tak dijaga basis data — ia dijaga daftar ini.
  assert.ok(!(TENANT_TABLES as readonly string[]).includes(TENANT_ROOT_TABLE));
  assert.match(MOVE, /\[TENANT_ROOT_TABLE, \.\.\.TENANT_TABLES\]/);
  // Dokumen harus lebih dulu dari vektor & catatan yang menunjuk padanya.
  const i = (t: string) => TENANT_TABLES.indexOf(t as never);
  assert.ok(i('knowledge_bases') < i('documents'));
  assert.ok(i('documents') < i('document_vectors'));
  assert.ok(i('memory_notes') < i('memory_edges'));
  assert.ok(i('conversations') < i('messages'));
});
