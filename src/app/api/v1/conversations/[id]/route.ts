import { NextResponse } from 'next/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { conversations, messages } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { apiRoute } from '../../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/conversations/{id} — transkrip utuh satu percakapan.
 *
 * `citations` IKUT dikirim, dan itu bagian yang paling berguna justru bagi
 * arsip: jawaban chatbot tanpa rujukannya tak bisa diaudit belakangan, dan
 * "kenapa ia menjawab begitu" adalah pertanyaan yang selalu datang berbulan
 * kemudian. `blocks` juga ikut supaya penampil di sisi pelanggan bisa
 * merender jawaban terstrukturnya, bukan hanya teks polos.
 *
 * Percakapan milik tenant lain dijawab 404, bukan 403 — RLS memang sudah
 * membuatnya tak terlihat, dan membedakan "tak ada" dari "bukan milikmu"
 * berarti endpoint ini bisa dipakai memastikan sebuah id itu nyata.
 */
export const GET = apiRoute<{ params: Promise<{ id: string }> }>('read', async (_req, ctx, caller) => {
  const { id } = await ctx.params;

  const hasil = await withTenant(caller.tenantId, async (tx) => {
    const c = await tx.select({
      id: conversations.id,
      chatbotId: conversations.chatbotId,
      visitorId: conversations.visitorId,
      startedAt: conversations.startedAt,
      updatedAt: conversations.updatedAt,
    }).from(conversations)
      .where(and(eq(conversations.id, id), isNull(conversations.deletedAt)))
      .limit(1);
    if (!c[0]) return null;

    const m = await tx.select({
      id: messages.id, role: messages.role, content: messages.content,
      citations: messages.citations, blocks: messages.blocks,
      createdAt: messages.createdAt,
    }).from(messages)
      .where(and(eq(messages.conversationId, id), isNull(messages.deletedAt)))
      .orderBy(asc(messages.createdAt));

    return { ...c[0], messages: m };
  });

  if (!hasil) return NextResponse.json({ error: 'Percakapan tidak ditemukan.' }, { status: 404 });
  return NextResponse.json({ conversation: hasil });
});
