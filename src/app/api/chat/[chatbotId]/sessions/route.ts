import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { resolveChatbotByPublicKey, withTenant } from '@/modules/core/db/tenant-context';

import { penandaSah } from '@/modules/chat/visitor-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/chat/{publicKey}/sessions?visitorId=…
 *
 * PUBLIK — daftar percakapan milik SATU pengunjung pada SATU chatbot.
 *
 * Kenapa perlu terpisah dari /history: `history` mengambil isi satu
 * percakapan yang id-nya sudah diketahui pemanggil. Itu cukup untuk widget
 * gelembung, yang memang hanya punya satu sesi berjalan. Tampilan halaman
 * penuh menampilkan DAFTAR sesi di samping, dan daftar itu tak bisa disusun
 * dari localStorage: pengunjung yang berganti perangkat, membersihkan
 * penyimpanan peramban, atau membuka tautan yang sama esok hari akan melihat
 * riwayatnya kosong padahal servernya menyimpan semuanya.
 *
 * PENJAGAAN — sama persis dengan /history, dan ketiganya tetap perlu:
 *  1. Origin harus lolos daftar izin chatbot.
 *  2. Percakapan harus milik chatbot itu (satu publicKey tak boleh membaca
 *     percakapan chatbot lain di tenant yang sama).
 *  3. `visitorId` harus cocok. Inilah satu-satunya yang memisahkan riwayat
 *     antar pengunjung, jadi ia WAJIB ikut kondisi kueri — bukan disaring
 *     belakangan di aplikasi.
 *
 * Yang tak cocok dijawab daftar KOSONG, bukan galat: endpoint ini tak boleh
 * bisa dipakai memastikan sebuah visitorId itu nyata.
 */

const MAX_SESSIONS = 50;
/** Panjang judul turunan. Cukup mengenali, tak cukup membocorkan isi di layar sempit. */
const JUDUL_CHARS = 80;

function corsFor(origin: string | null, allowed: string[]) {
  if (allowed.length === 0) return '*';
  return origin && allowed.includes(origin) ? origin : '';
}

export interface SessionRow {
  id: string;
  /** Diturunkan dari pesan pertama pengunjung — percakapan tak punya judul sendiri. */
  title: string;
  startedAt: string;
  lastAt: string | null;
  messages: number;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ chatbotId: string }> }) {
  const { chatbotId: publicKey } = await ctx.params;
  const bot = await resolveChatbotByPublicKey(publicKey);
  if (!bot || !bot.enabled) return new Response('Chatbot not found', { status: 404 });

  const cors = corsFor(req.headers.get('origin'), bot.allowed_origins ?? []);
  if (!cors) return new Response('Origin not allowed', { status: 403 });

  /* Dikanonkan lewat jalur yang sama dengan chat & history — tiga salinan
     aturan keamanan adalah tiga tempat untuk lupa. */
  const visitorId = penandaSah(bot, req.nextUrl.searchParams.get('visitorId'),
    req.nextUrl.searchParams.get('visitorSig'));
  const kosong = () => Response.json({ sessions: [] }, {
    headers: { 'Access-Control-Allow-Origin': cors, 'Cache-Control': 'no-store' },
  });
  if (!visitorId) return kosong();

  const rows = await withTenant(bot.tenant_id, (tx) => tx.execute(sql`
    select c.id::text                                   as "id",
           c.started_at                                 as "startedAt",
           max(m.created_at)                            as "lastAt",
           count(m.id)::int                             as "messages",
           -- Judul diturunkan dari pesan PERTAMA pengunjung. Percakapan tak
           -- punya kolom judul, dan menambahkannya berarti memanggil model
           -- sekali lagi per sesi hanya untuk memberi nama sesuatu yang
           -- pengunjung sendiri sudah menamainya lewat pertanyaan pembuka.
           coalesce(
             substring(
               (array_agg(m.content order by m.created_at)
                filter (where m.role = 'user'))[1]
               for ${JUDUL_CHARS}),
             'Percakapan baru')                         as "title"
      from conversations c
      left join messages m
             on m.conversation_id = c.id and m.deleted_at is null
     where c.chatbot_id  = ${bot.id}::uuid
       and c.visitor_id  = ${visitorId}
       and c.deleted_at is null
     group by c.id, c.started_at
     -- Percakapan yang belum berisi pesan apa pun tetap muncul; ia sesi yang
     -- baru dibuka dan menyembunyikannya membuat tombol "percakapan baru"
     -- terasa tak melakukan apa-apa.
     order by coalesce(max(m.created_at), c.started_at) desc
     limit ${MAX_SESSIONS}
  `)) as unknown as SessionRow[];

  return Response.json({ sessions: rows }, {
    headers: { 'Access-Control-Allow-Origin': cors, 'Cache-Control': 'no-store' },
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
