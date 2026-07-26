/* Pasang ekstensi Postgres yang dibutuhkan SEBELUM skema didorong.
   node --env-file=.env scripts/ensure-extensions.mjs

   KENAPA HARUS DULUAN: schema.ts mendeklarasikan kolom `vector(1536)` dan index
   HNSW (`vector_cosine_ops`). Keduanya mustahil dibuat kalau ekstensi `vector`
   belum ada — jadi `drizzle-kit push` pada database BARU akan gagal, padahal
   ekstensinya baru dibuat di migrasi 0001 yang jalannya SESUDAH push.

   Di Neon ini tak pernah kelihatan karena ekstensinya sudah terpasang sejak
   lama; yang kena adalah database bersih — CI dan pemasangan on-prem baru,
   persis alur yang ditulis README (`db:push && db:migrate`). */
import postgres from 'postgres';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL wajib'); process.exit(1); }

// TLS hanya untuk endpoint cloud; Postgres lokal/Docker tak melayaninya.
const needSsl = /sslmode=require|neon\.tech|\.aws\./.test(url);
const sql = postgres(url, { ssl: needSsl ? 'require' : undefined, max: 1, prepare: false });

try {
  await sql.unsafe('CREATE EXTENSION IF NOT EXISTS vector');
  const [v] = await sql.unsafe("select extversion from pg_extension where extname='vector'");
  console.log('ekstensi vector siap:', v?.extversion ?? '(tidak terdeteksi)');
} catch (e) {
  console.error('ERR gagal memasang ekstensi vector:', e.message);
  console.error('Pastikan servernya menyediakan pgvector (mis. image pgvector/pgvector).');
  process.exit(1);
} finally {
  await sql.end();
}
