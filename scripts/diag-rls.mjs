import postgres from 'postgres';
const url = process.env.DATABASE_URL;
// TLS hanya untuk endpoint cloud; Postgres lokal/Docker tak melayaninya.
const needSsl = /sslmode=require|neon[.]tech|[.]aws[.]/.test(url);
const sql = postgres(url, { ssl: needSsl ? 'require' : undefined, max: 1, prepare: false });
try {
  const role = await sql.unsafe("select current_user");
  const attr = await sql.unsafe("select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user");
  const rls = await sql.unsafe("select relname, relrowsecurity, relforcerowsecurity from pg_class where relname in ('users','chatbots','documents') order by relname");
  const pol = await sql.unsafe("select count(*)::int n from pg_policies where tablename='users'");
  console.log('current_user:', role[0].current_user);
  console.log('role attrs:', JSON.stringify(attr[0]));
  console.log('rls flags:', JSON.stringify(rls));
  console.log('policies on users:', pol[0].n);
  // uji manual set_config di dalam 1 transaksi
  await sql.begin(async (t) => {
    await t.unsafe("select set_config('app.current_tenant','00000000-0000-0000-0000-000000000000', true)");
    const cnt = await t.unsafe('select count(*)::int n from users');
    console.log('users terlihat utk tenant dummy (harus 0 jika RLS jalan):', cnt[0].n);
  });
} catch (e) { console.error('ERR', e.message); process.exit(1); }
finally { await sql.end(); }
