import { NextRequest } from 'next/server';
import { resolveChatbotByPublicKey } from '@/modules/core/db/tenant-context';
import { chatTurn } from '@/modules/chat/chat.service';

export const runtime = 'nodejs';

/**
 * PUBLIC embed endpoint. `[chatbotId]` = publicKey chatbot (aman diekspos).
 * Widget hanya membawa public key; API key provider didekripsi & dipakai
 * SERVER-SIDE (server-to-server) — tidak pernah menyentuh browser.
 */

function corsFor(origin: string | null, allowed: string[]) {
  if (allowed.length === 0) return '*';
  return origin && allowed.includes(origin) ? origin : '';
}

/** GET — theme/white-label config untuk widget (dibaca embed.js saat boot). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ chatbotId: string }> }) {
  const { chatbotId: publicKey } = await ctx.params;
  const bot = await resolveChatbotByPublicKey(publicKey);
  if (!bot || !bot.enabled) return new Response('Chatbot not found', { status: 404 });

  const origin = req.headers.get('origin');
  const allowed = bot.allowed_origins ?? [];
  const cors = corsFor(origin, allowed);
  if (!cors) return new Response('Origin not allowed', { status: 403 });

  return Response.json(
    { themeConfig: bot.theme_config ?? null },
    { headers: { 'Access-Control-Allow-Origin': cors, 'Cache-Control': 'public, max-age=300' } },
  );
}

/** POST — satu giliran chat, jawaban distream sebagai SSE. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ chatbotId: string }> }) {
  const { chatbotId: publicKey } = await ctx.params;
  const bot = await resolveChatbotByPublicKey(publicKey);
  if (!bot || !bot.enabled) return new Response('Chatbot not found', { status: 404 });

  const origin = req.headers.get('origin');
  const allowed = bot.allowed_origins ?? [];
  const cors = corsFor(origin, allowed);
  if (!cors) return new Response('Origin not allowed', { status: 403 });

  const body = await req.json().catch(() => ({}));
  const question: string = body.message ?? '';
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
          conversationId: body.conversationId,
          visitorId: body.visitorId,
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
      'Access-Control-Allow-Origin': cors,
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
