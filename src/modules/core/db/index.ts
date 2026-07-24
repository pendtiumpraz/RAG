import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// `prepare: false` wajib untuk pooler pgbouncer (Neon/Vercel Postgres).
// Serverless: 1 koneksi per invocation agar tidak menghabiskan pool;
// server long-lived (VPS/on-prem): pool lebih besar.
// Neon/cloud butuh TLS; `require` = TLS tanpa verifikasi CA (Neon cert valid).
const needSsl = /sslmode=require|neon\.tech|\.aws\./.test(connectionString);
const client = postgres(connectionString, {
  max: process.env.VERCEL ? 1 : 10,
  prepare: false,
  idle_timeout: 20,
  ssl: needSsl ? 'require' : undefined,
});

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { client };
export * from './schema';
