import { NextRequest } from 'next/server';
import { resolveChatbotByPublicKey } from '@/lib/db/tenant';
import { chatTurn } from '@/lib/rag/chat';

export const runtime = 'nodejs';

/**
 * PUBLIC embed endpoint. The `[chatbotId]` param is the chatbot's
 * publicKey (safe to expose in a website's HTML). Flow:
 *   - resolve publicKey → tenant + chatbot (routing only)
 *   - enforce this chatbot's allowedOrigins (per-chatbot CORS)
 *   - run one RAG turn and stream the answer back as SSE
 *
 * Every downstream DB access happens under withTenant(), so one chatbot
 * can only ever read its own tenant's / its own KB rows.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ chatbotId: string }> }) {
  const { chatbotId: publicKey } = await ctx.params;
  const bot = await resolveChatbotByPublicKey(publicKey);

  if (!bot || !bot.enabled) {
    return new Response('Chatbot not found', { status: 404 });
  }

  // Per-chatbot origin allow-list. Empty ⇒ embeddable anywhere.
  const origin = req.headers.get('origin');
  const allowed = bot.allowed_origins ?? [];
  if (allowed.length > 0 && origin && !allowed.includes(origin)) {
    return new Response('Origin not allowed', { status: 403 });
  }
  const corsOrigin = allowed.length === 0 ? '*' : (origin ?? '');

  const body = await req.json().catch(() => ({}));
  const question: string = body.message ?? '';
  const conversationId: string | undefined = body.conversationId;
  const visitorId: string | undefined = body.visitorId;
  if (!question.trim()) return new Response('Empty message', { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        for await (const delta of chatTurn({
          tenantId: bot.tenant_id,
          chatbotId: bot.id,
          conversationId,
          visitorId,
          question,
        })) {
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
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': corsOrigin,
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
