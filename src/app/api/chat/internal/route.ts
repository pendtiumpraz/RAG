import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { chatTurn, type ChatSource } from '@/modules/chat/chat.service';

export const runtime = 'nodejs';

/**
 * POST /api/chat/internal — chat console INTERNAL (ber-sesi, bukan embed publik).
 * Body: { chatbotId, message, conversationId? }.
 * SSE events: `sources` (chunk retrieval utk panel Citations) → `delta`* → `done`.
 * Retrieval terkurung tenant user (withTenant) → aman.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const chatbotId: string = body.chatbotId ?? '';
  const message: string = body.message ?? '';
  if (!chatbotId || !message.trim()) return new Response('chatbotId & message wajib', { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        const onSources = (s: ChatSource[]) => send('sources', s);
        // `meta` membawa conversationId — client menyimpannya dan mengirim
        // balik agar seluruh sesi jadi SATU riwayat, bukan 1 baris per pesan.
        const onConversation = (id: string) => send('meta', { conversationId: id });
        for await (const delta of chatTurn({
          tenantId: user.tenantId, chatbotId, conversationId: body.conversationId,
          visitorId: `user:${user.id}`, question: message,
        }, onSources, onConversation)) {
          send('delta', { text: delta });
        }
        send('done', {});
      } catch (err) {
        send('error', { message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
