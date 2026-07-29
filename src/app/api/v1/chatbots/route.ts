import { NextResponse } from 'next/server';
import { desc, isNull } from 'drizzle-orm';
import { chatbots } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { apiRoute } from '../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/chatbots — daftar chatbot tenant.
 *
 * `publicKey` sengaja IKUT: ia memang dirancang untuk disebar (dipasang di
 * halaman pelanggan lewat embed.js), dan tanpa itu integrator harus membuka
 * dashboard hanya untuk menyalin satu nilai.
 */
export const GET = apiRoute('read', async (_req, _ctx, caller) => {
  const rows = await withTenant(caller.tenantId, (tx) =>
    tx.select({
      id: chatbots.id, name: chatbots.name, publicKey: chatbots.publicKey,
      enabled: chatbots.enabled, context: chatbots.context,
      greeting: chatbots.greeting, createdAt: chatbots.createdAt,
    }).from(chatbots)
      .where(isNull(chatbots.deletedAt))
      .orderBy(desc(chatbots.createdAt)));
  return NextResponse.json({ chatbots: rows });
});
