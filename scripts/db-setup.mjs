import postgres from 'postgres';

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL tidak ada'); process.exit(1); }
const sql = postgres(url, { ssl: 'require', max: 1, prepare: false });

try {
  const v = await sql.unsafe('select version()');
  await sql.unsafe('CREATE EXTENSION IF NOT EXISTS vector');
  const e = await sql.unsafe("select extversion from pg_extension where extname='vector'");
  console.log('CONNECTED:', v[0].version.split(',')[0]);
  console.log('pgvector:', e[0]?.extversion || 'MISSING');
} catch (err) {
  console.error('ERR:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
