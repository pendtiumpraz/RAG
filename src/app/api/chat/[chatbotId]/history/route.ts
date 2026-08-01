import { NextRequest } from 'next/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { conversations, messages } from '@/modules/core/db';
import { resolveChatbotByPublicKey } from '@/modules/core/db/tenant-context';
import { withTenant } from '@/modules/core/db/tenant-context';

import { penandaSah } from '@/modules/chat/visitor-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/{publicKey}/history?conversationId=…&visitorId=…
 *
 * PUBLIK — dipanggil widget saat halaman dimuat ulang, supaya percakapan yang
 * sedang berjalan tidak lenyap begitu pengunjung menekan refresh. Sebelum ini
 * widget hanya menyimpan id percakapan di memori, jadi setiap muat ulang
 * memulai sesi baru dan konteks sebelumnya hilang dari pandangan pengunjung
 * (walau tersimpan di server).
 *
 * TIGA LAPIS PENJAGAAN, dan ketiganya perlu:
 *  1. Origin harus lolos daftar izin chatbot — sama dengan endpoint chat.
 *  2. Percakapan harus milik chatbot itu. Tanpa ini, satu publicKey bisa
 *     dipakai membaca percakapan chatbot lain di tenant yang sama.
 *  3. `visitorId` harus cocok. Id percakapan memang UUID yang tak bisa
 *     ditebak, tapi ia beredar di localStorage dan log — mensyaratkan
 *     visitorId membuat kebocoran satu id saja tidak cukup untuk membaca
 *     transkrip orang lain.
 *
 * Yang tak cocok dijawab 404 yang SAMA dengan yang tak ada, supaya endpoint
 * ini tak bisa dipakai memastikan sebuah id percakapan itu nyata.
 */
const MAX_MESSAGES = 100;

function corsFor(origin: string | null, allowed: string[]) {
  if (allowed.length === 0) return '*';
  return origin && allowed.includes(origin) ? origin : '';
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ chatbotId: string }> }) {
  const { chatbotId: publicKey } = await ctx.params;
  const bot = await resolveChatbotByPublicKey(publicKey);
  if (!bot || !bot.enabled) return new Response('Chatbot not found', { status: 404 });

  const cors = corsFor(req.headers.get('origin'), bot.allowed_origins ?? []);
  if (!cors) return new Response('Origin not allowed', { status: 403 });

  const q = req.nextUrl.searchParams;
  const conversationId = q.get('conversationId');
  /* Penanda dikanonkan lewat jalur yang SAMA dengan chat & sessions: kalau
     situs pelanggan menyuntikkan identitas, tanda tangannya diperiksa dan
     penandanya masuk ruang nama terpisah. Penanda yang ditolak dijawab
     daftar KOSONG — sengaja tak dibedakan dari "tak ada", supaya endpoint
     ini tak bisa dipakai memastikan sebuah penanda itu nyata. */
  const visitorId = penandaSah(bot, q.get('visitorId'), q.get('visitorSig'));
  if (!conversationId || !visitorId) {
    return Response.json({ messages: [] }, { headers: { 'Access-Control-Allow-Origin': cors } });
  }

  const rows = await withTenant(bot.tenant_id, async (tx) => {
    const convo = (await tx.select({ id: conversations.id }).from(conversations).where(and(
      eq(conversations.id, conversationId),
      eq(conversations.chatbotId, bot.id),
      eq(conversations.visitorId, visitorId),
      isNull(conversations.deletedAt),
    )).limit(1))[0];
    if (!convo) return null;

    return tx.select({
      role: messages.role, content: messages.content,
      blocks: messages.blocks, citations: messages.citations,
    }).from(messages).where(and(
      eq(messages.conversationId, convo.id),
      isNull(messages.deletedAt),
    )).orderBy(asc(messages.createdAt)).limit(MAX_MESSAGES);
  });

  // Percakapan tak dikenal / bukan milik pengunjung ini → daftar kosong, bukan
  // galat. Widget cukup memulai sesi baru; tak ada yang perlu dijelaskan
  // kepada pengunjung, dan tak ada yang dibocorkan kepada penebak.
  return Response.json({ messages: rows ?? [] }, {
    headers: {
      'Access-Control-Allow-Origin': cors,
      // Riwayat berubah tiap giliran; jangan pernah di-cache di perantara.
      'Cache-Control': 'no-store',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
