import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

const MEM = readFileSync('src/modules/memory/memory.service.ts', 'utf8');
const AGENT = readFileSync('src/modules/memory/memory-agent.service.ts', 'utf8');
const RET = readFileSync('src/modules/chat/retrieval.service.ts', 'utf8');
const SCHEMA = readFileSync('src/modules/core/db/schema.ts', 'utf8');
const MIG = readFileSync('migrations/0032_note_review.sql', 'utf8');
const DOCSVC = readFileSync('src/modules/memory/document-summary.service.ts', 'utf8');

test('hanya ringkasan AKTIF yang keluar dari sistem', () => {
  // Tiga pintu keluar, dan ketiganya harus tertutup untuk ringkasan yang
  // belum ditinjau: graf (yang dilihat pemilik data), vault (yang MENDARAT DI
  // DRIVE MEREKA), dan kaki Memory (yang ikut menjawab pelanggan). Melewatkan
  // salah satunya berarti ringkasan yang belum diakui tetap beredar.
  const graph = MEM.slice(MEM.indexOf('graph(tenantId'), MEM.indexOf('exportVault'));
  const vault = MEM.slice(MEM.indexOf('exportVault'), MEM.indexOf('syncVaultToDrive'));
  assert.ok(/status, 'active'/.test(graph), 'graf memuat catatan yang belum ditinjau');
  assert.ok(/status, 'active'/.test(vault), 'vault Drive memuat catatan yang belum ditinjau');
  assert.ok(/m\.status = 'active'/.test(RET), 'kaki Memory memakai catatan yang belum ditinjau');
});

test('keputusan manusia tak dibatalkan agen yang jalan lagi', () => {
  // `status` hanya diisi saat baris DIBUAT. Kalau ia ikut di-update, catatan
  // yang sudah disetujui atau ditolak akan kembali ke antrean tiap sync —
  // dan antreannya tak pernah habis.
  const upd = MEM.slice(MEM.indexOf('await tx.update(memoryNotes).set({'), MEM.indexOf('rebuild wikilink edges'));
  assert.ok(!/status:/.test(upd), 'status ditimpa saat update — keputusan manusia hilang');
  const ins = MEM.slice(MEM.indexOf('await tx.insert(memoryNotes).values({'), MEM.indexOf('noteId = created[0].id'));
  assert.ok(/status: input\.status \?\? 'active'/.test(ins), 'status tak diisi saat insert');
});

test('mode tinjau MATI secara default', () => {
  // Ini bukan kelalaian. Catatan lahir satu per DOKUMEN: korpus ribuan berkas
  // berarti ribuan persetujuan, dan sampai semuanya disetujui kaki Memory tak
  // menyumbang apa pun. Bandingkan kategori yang jumlahnya belasan — di sana
  // tinjau-dulu murah, di sini ia bisa mematikan fiturnya sendiri.
  assert.ok(/memoryReview: boolean\('memory_review'\)\.default\(false\)/.test(SCHEMA),
    'memory_review tidak default false');
  assert.ok(/memory_review boolean not null default false/.test(MIG));
  assert.ok(/status\s+text not null default 'active'/.test(MIG),
    'kolom status tak default active — pelanggan lama tiba-tiba kehilangan seluruh Memory-nya');
});

test('catatan MOC dikecualikan dari antrean tinjauan', () => {
  // MOC adalah simpul penghubung antar topik, bukan ringkasan dokumen.
  // Menahannya akan memutus wikilink antar catatan yang SUDAH disetujui.
  assert.ok(AGENT.includes("n.source === 'moc' ? 'active' : statusBaru"),
    'catatan MOC ikut tertahan mode tinjau — wikilink putus');
});

test('agen mengelompokkan per doc_ref, bukan per judul', () => {
  // doc_ref adalah identitas dokumen logis yang sama dengan yang dipakai
  // retrieval bertingkat dan /api/v1/documents. Mengelompokkan per judul
  // membuat dua berkas berbeda yang kebetulan sejudul menyatu jadi satu
  // catatan, dan membuat catatan tak bisa di-JOIN pasti ke dokumennya.
  const cap = AGENT.slice(AGENT.indexOf('const docs = await'), AGENT.indexOf('kategoriAktif'));
  assert.ok(/group by doc_ref/.test(cap), 'agen masih mengelompokkan per judul');
});

test('migrasi mem-backfill doc_ref catatan lama', () => {
  // Tanpa backfill, setiap pelanggan yang sudah menjalankan agen melihat
  // kolom ringkasan KOSONG sampai agen dijalankan ulang — fitur yang tampak
  // rusak padahal datanya ada, hanya tautannya yang belum.
  assert.ok(/update memory_notes n\s*\n\s*set doc_ref/.test(MIG), 'backfill doc_ref hilang');
  assert.ok(/where n\.doc_ref is null/.test(MIG),
    'backfill tak dibatasi ke baris kosong — bisa menimpa tautan yang sudah benar');
});

test('dokumen tanpa ringkasan tetap muncul di pencarian', () => {
  // LEFT JOIN, bukan INNER. Dokumen yang belum disentuh agen tetap ada di
  // knowledge base dan tetap bisa dicari lewat isinya; menyembunyikannya
  // membuat pengguna mengira berkasnya gagal masuk.
  assert.ok(/left join memory_notes n/.test(DOCSVC), 'dokumen tanpa ringkasan tersaring habis');
});

test('pencarian menyentuh judul, isi, DAN ringkasan', () => {
  const f = DOCSVC.slice(DOCSVC.indexOf('const qFilter'), DOCSVC.indexOf('return withTenant'));
  assert.ok(/d\.title ilike/.test(f), 'judul tak ikut dicari');
  assert.ok(/n\.content_md ilike/.test(f), 'ringkasan tak ikut dicari');
  assert.ok(/d\.fts @@ plainto_tsquery/.test(f), 'isi tak ikut dicari lewat indeks full-text');
});
