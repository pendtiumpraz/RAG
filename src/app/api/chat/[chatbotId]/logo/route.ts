import { NextRequest } from 'next/server';
import { resolveChatbotLogoByPublicKey } from '@/modules/core/db/tenant-context';

export const runtime = 'nodejs';

/**
 * GET /api/chat/{publicKey}/logo — byte logo unggahan chatbot utk widget.
 *
 * PUBLIK tanpa cek origin (seperti embed.js sendiri): logo memang tampil di
 * situs mana pun widget dipasang, dan <img> lintas-origin tak mengirim
 * header Origin yang bisa diandalkan. publicKey acak 24 char adalah
 * kapabilitasnya. Cache 1 jam — ganti logo terasa dalam ≤1 jam.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ chatbotId: string }> }) {
  const { chatbotId: publicKey } = await ctx.params;
  const dataUrl = await resolveChatbotLogoByPublicKey(publicKey);
  if (!dataUrl) return new Response('Not found', { status: 404 });

  const m = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!m) return new Response('Corrupt logo', { status: 500 });

  return new Response(Buffer.from(m[2], 'base64'), {
    headers: {
      'Content-Type': m[1],
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
