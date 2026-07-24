import { promises as fs } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

/**
 * Applies drizzle-generated SQL, then our hand-written RLS migration.
 * Run with: npm run db:push && npm run db:migrate
 * (db:push creates tables from schema; this adds pgvector + RLS policies.)
 */
async function main() {
  // DDL (CREATE EXTENSION/INDEX) → pakai endpoint UNPOOLED bila ada (hindari
  // kuirk pgbouncer). TLS untuk Neon/cloud.
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!;
  const needSsl = /sslmode=require|neon\.tech|\.aws\./.test(url);
  const sql = postgres(url, { max: 1, prepare: false, ssl: needSsl ? 'require' : undefined });
  const dir = path.join(process.cwd(), 'migrations');
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const text = await fs.readFile(path.join(dir, f), 'utf8');
    console.log(`Applying ${f}...`);
    await sql.unsafe(text);
  }
  await sql.end();
  console.log('Migrations applied.');
}

main().catch((e) => { console.error(e); process.exit(1); });
