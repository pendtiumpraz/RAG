import { NextRequest } from 'next/server';
import { resolveChatbotByPublicKey } from '@/modules/core/db/tenant-context';
import { chatTurn } from '@/modules/chat/chat.service';
import { rateLimit } from '@/modules/core/limits';
import { usageService, QuotaExceededError } from '@/modules/usage/usage.service';
import { ensureIntegrations } from '../../_wire';

export const runtime = 'nodejs';

/** Laju per-IP (lapis kedua, lintas chatbot) — konservatif. */
const IP_BURST = 8, IP_REFILL = 0.5;

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip') ?? 'unknown';
}

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

  // Logo unggahan (branding per chatbot): bila ada dan tenant tak menyetel
  // logoUrl kustom sendiri, suntikkan URL absolut route logo — byte-nya
  // TIDAK menumpang di JSON ini (bisa ratusan KB; cache-nya pun beda umur).
  const theme = (bot.theme_config ?? {}) as { brand?: Record<string, unknown> };
  if (bot.has_logo && !theme.brand?.logoUrl) {
    const base = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
    theme.brand = { ...theme.brand, logoUrl: `${base}/api/chat/${publicKey}/logo` };
  }

  return Response.json(
    // `greeting` ikut dikirim: widget menampilkan bubble sapaan dari nilai ini,
    // tapi sebelumnya tak pernah dilayani sehingga sapaan yang diatur per
    // chatbot tidak pernah muncul.
    { themeConfig: Object.keys(theme).length ? theme : null, greeting: bot.greeting ?? null },
    { headers: { 'Access-Control-Allow-Origin': cors, 'Cache-Control': 'public, max-age=300' } },
  );
}

/** POST — satu giliran chat, jawaban distream sebagai SSE. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ chatbotId: string }> }) {
  ensureIntegrations();
  const { chatbotId: publicKey } = await ctx.params;
  const bot = await resolveChatbotByPublicKey(publicKey);
  if (!bot || !bot.enabled) return new Response('Chatbot not found', { status: 404 });

  const origin = req.headers.get('origin');
  const allowed = bot.allowed_origins ?? [];
  const cors = corsFor(origin, allowed);
  if (!cors) return new Response('Origin not allowed', { status: 403 });

  // ── Proteksi biaya: rate limit 2 lapis + kuota plan ──────────────
  // Lapis 1: per chatbot (burst/refill sesuai plan tenant).
  // Lapis 2: per IP pengunjung (konservatif, lintas chatbot).
  const usage = await usageService.snapshot(bot.tenant_id);
  const rlBot = rateLimit(`chat:${publicKey}`, usage.limits.chatBurst, usage.limits.chatRefillPerSec);
  const rlIp = rateLimit(`ip:${clientIp(req)}`, IP_BURST, IP_REFILL);
  const rl = !rlBot.ok ? rlBot : rlIp;
  if (!rl.ok) {
    return Response.json(
      { error: 'Terlalu banyak permintaan. Coba lagi sebentar.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), 'Access-Control-Allow-Origin': cors } },
    );
  }
  if (usage.messages >= usage.limits.messagesPerMonth) {
    return Response.json(
      { error: new QuotaExceededError(usage.limits.messagesPerMonth).message },
      { status: 429, headers: { 'Access-Control-Allow-Origin': cors } },
    );
  }

  const body = await req.json().catch(() => ({}));
  const question: string = body.message ?? '';
  if (!question.trim()) return new Response('Empty message', { status: 400 });
  if (question.length > 4000) return new Response('Message too long', { status: 413 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        // Kontrak SSE: meta {conversationId} → sources → block* → done.
        await chatTurn({
          tenantId: bot.tenant_id,
          chatbotId: bot.id,
          conversationId: body.conversationId,
          visitorId: body.visitorId,
          question,
        }, {
          onConversation: (id) => send('meta', { conversationId: id }),
          // Dokumen rujukan utk footnote widget — judul + skor saja; cuplikan
          // isi TIDAK dikirim ke embed publik (tampil di dashboard saja).
          onSources: (s) => send('sources',
            s.map((c, i) => ({ n: i + 1, title: c.title, score: c.score }))),
          onBlock: (b) => send('block', b),
          /* Keadaan jawaban dikirim SEBELUM 'done' supaya UI bisa
             memutuskan apakah chip sitasi ditampilkan sebagai pendukung.
             Tanpa ini, penolakan 'tidak ada di dokumen' tetap tampil
             beserta enam chip sitasi — dan di layar itu terbaca sebagai
             'jawaban ini bersumber dari enam dokumen'. */
          onKeyakinan: (k) => send('keyakinan', k),
        });
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
