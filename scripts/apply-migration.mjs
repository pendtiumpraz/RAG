/* Terapkan SATU file migrasi. node --env-file=.env scripts/apply-migration.mjs <file.sql> */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const file = process.argv[2];
if (!file) { console.error('usage: apply-migration.mjs <path.sql>'); process.exit(1); }
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
const sql = postgres(url, { ssl: 'require', max: 1, prepare: false });
try {
  await sql.unsafe(readFileSync(file, 'utf8'));
  console.log('applied:', file);
} catch (e) { console.error('ERR', e.message); process.exit(1); }
finally { await sql.end(); }
