import { NextResponse } from 'next/server';
import { and, asc, gt, isNull, sql } from 'drizzle-orm';
import { conversations, messages } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { batasiAmbil, halaman, tafsirSejak } from '@/modules/chat/ekspor';
import { apiRoute } from '../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/conversations — daftar percakapan tenant, untuk ditarik SERVER
 * pelanggan ke sistem mereka sendiri (CRM, gudang data, arsip).
 *
 * KENAPA INI PERLU ADA, padahal /api/chat/{publicKey}/history sudah lama ada.
 * Endpoint publik itu menuntut `visitorId` milik peramban DAN origin yang
 * diizinkan — dirancang untuk widget memulihkan percakapan yang sedang
 * berjalan, bukan untuk mesin. Server pelanggan tak punya keduanya, jadi
 * sampai sekarang tak ada satu pun jalan bagi mereka mengambil transkripnya
 * sendiri, meskipun datanya memang tinggal di server kita.
 *
 * PAGINASI BERBASIS WAKTU, bukan offset. Percakapan baru lahir terus-menerus,
 * dan dengan offset baris akan bergeser di antara dua permintaan: penarik
 * berkala melewatkan sebagian dan menggandakan sebagian lain, tanpa pernah
 * tahu. Kursor `sejak` bergerak maju dan tak bisa melompat.
 *
 * LINTAS DIVISI DENGAN SENGAJA. Kunci API milik TENANT, bukan orang, dan
 * setaranya adalah admin tenant — yang menurut keputusan pemilik produk
 * memang melihat seluruh divisi (lihat chatbot/divisi.ts). Menyaringnya per
 * divisi di sini berarti kunci API punya pandangan yang lebih sempit dari
 * pemiliknya, dan arsip pelanggan jadi bolong tanpa penjelasan.
 */
export const GET = apiRoute('read', async (req, _ctx, caller) => {
  const q = new URL(req.url).searchParams;
  const batas = batasiAmbil(q.get('limit'));

  let sejak: Date | null;
  try {
    sejak = tafsirSejak(q.get('sejak') ?? q.get('since'));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const chatbotId = q.get('chatbotId');

  const baris = await withTenant(caller.tenantId, (tx) => tx
    .select({
      id: conversations.id,
      chatbotId: conversations.chatbotId,
      visitorId: conversations.visitorId,
      startedAt: conversations.startedAt,
      updatedAt: conversations.updatedAt,
      pesan: sql<number>`(
        select count(*)::int from ${messages}
        where ${messages.conversationId} = ${conversations.id}
          and ${messages.deletedAt} is null)`,
    })
    .from(conversations)
    .where(and(
      isNull(conversations.deletedAt),
      sejak ? gt(conversations.updatedAt, sejak) : undefined,
      chatbotId ? sql`${conversations.chatbotId} = ${chatbotId}::uuid` : undefined,
    ))
    /* Menaik, mengikuti kursor. Menurun akan membuat `sejak` menunjuk ke
       baris terbaru dan seluruh sisa riwayat tak pernah terjangkau. */
    .orderBy(asc(conversations.updatedAt))
    .limit(batas + 1));

  const h = halaman(baris, batas);
  return NextResponse.json({
    conversations: h.items,
    adaLagi: h.adaLagi,
    berikutnya: h.berikutnya,
  });
});
