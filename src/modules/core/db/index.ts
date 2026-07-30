import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { decideSsl } from './ssl';

const connectionString = process.env.DATABASE_URL!;

// `prepare: false` wajib untuk pooler pgbouncer (Neon/Vercel Postgres).
// Serverless: 1 koneksi per invocation agar tidak menghabiskan pool;
// server long-lived (VPS/on-prem): pool lebih besar.
// TLS: MENYALA untuk host publik apa pun; mati hanya untuk host lokal/privat
// atau bila dinyatakan `sslmode=disable`. Dulu ditebak dari nama host
// (`neon.tech`, `.aws.`), yang diam-diam mematikan TLS begitu basis datanya
// bukan Neon — persis yang terjadi kalau pindah ke VPS. Lihat db/ssl.ts.
const { ssl: sslMode } = decideSsl(connectionString);
const client = postgres(connectionString, {
  max: process.env.VERCEL ? 1 : 10,
  prepare: false,
  idle_timeout: 20,
  ssl: sslMode,
});

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { client };
export * from './schema';
