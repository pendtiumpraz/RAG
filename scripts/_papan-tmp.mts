import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL_UNPOOLED!, { max: 1, prepare: false });

const r = await sql`select key, priority, size, dimension, title, why
  from backlog_items
  where deleted_at is null and track = 'agent' and status = 'todo'
  order by priority, position`;

for (const k of r) {
  console.log('═'.repeat(78));
  console.log(`${k.priority} · ${k.size} · ${k.dimension} · ${k.key}`);
  console.log(k.title);
  console.log('─'.repeat(78));
  console.log(k.why);
  console.log();
}
console.log(`TOTAL: ${r.length} kartu agent todo`);

await sql.end();
