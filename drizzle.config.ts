import type { Config } from 'drizzle-kit';

export default {
  schema: './src/modules/core/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
