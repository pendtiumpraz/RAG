/* Terapkan SATU file migrasi. node --env-file=.env scripts/apply-migration.mjs <file.sql> */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const file = process.argv[2];
if (!file) { console.error('usage: apply-migration.mjs <path.sql>'); process.exit(1); }
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
// TLS hanya untuk endpoint cloud (lihat migrate.ts) — Postgres lokal/Docker
// tak melayaninya, dan 'require' yang dipatok membuat skrip ini gagal di sana.
const needSsl = /sslmode=require|neon\.tech|\.aws\./.test(url);
const sql = postgres(url, { ssl: needSsl ? 'require' : undefined, max: 1, prepare: false });
try {
  await sql.unsafe(readFileSync(file, 'utf8'));
  console.log('applied:', file);
} catch (e) { console.error('ERR', e.message); process.exit(1); }
finally { await sql.end(); }
