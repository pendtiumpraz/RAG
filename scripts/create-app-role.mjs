/* Buat role aplikasi NOBYPASSRLS + grant DML. Jalankan sbg owner (unpooled).
   Env: DATABASE_URL_UNPOOLED (owner), APP_PW (password role baru). */
import postgres from 'postgres';
const owner = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const pw = process.env.APP_PW;
if (!pw) { console.error('APP_PW wajib'); process.exit(1); }
const sql = postgres(owner, { ssl: 'require', max: 1, prepare: false });
try {
  // buat role bila belum ada
  const exists = await sql.unsafe("select 1 from pg_roles where rolname='nalar_app'");
  if (exists.length === 0) {
    await sql.unsafe(`CREATE ROLE nalar_app WITH LOGIN PASSWORD '${pw}' NOBYPASSRLS NOSUPERUSER`);
    console.log('role nalar_app dibuat');
  } else {
    await sql.unsafe(`ALTER ROLE nalar_app WITH LOGIN PASSWORD '${pw}' NOBYPASSRLS NOSUPERUSER`);
    console.log('role nalar_app diupdate');
  }
  await sql.unsafe('GRANT USAGE ON SCHEMA public TO nalar_app');
  await sql.unsafe('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nalar_app');
  await sql.unsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nalar_app');
  await sql.unsafe('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nalar_app');
  await sql.unsafe('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nalar_app');
  const chk = await sql.unsafe("select rolbypassrls, rolsuper from pg_roles where rolname='nalar_app'");
  console.log('nalar_app attrs:', JSON.stringify(chk[0]));
  console.log('GRANTS applied.');
} catch (e) { console.error('ERR', e.message); process.exit(1); }
finally { await sql.end(); }
