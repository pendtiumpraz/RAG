import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL!;

// One shared pool. `prepare: false` keeps things simple with pgbouncer.
const client = postgres(connectionString, { max: 10, prepare: false });

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { client };
export * from './schema';
