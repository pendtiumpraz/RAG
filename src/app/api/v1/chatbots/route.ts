import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { chatbots } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { chatbotService } from '@/modules/chatbot/chatbot.service';
import { apiRoute } from '../_guard';
import { API_AKTOR, tenantOwner } from '../_actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/chatbots — daftar chatbot tenant.
 *
 * `publicKey` sengaja IKUT: ia memang dirancang untuk disebar (dipasang di
 * halaman pelanggan lewat embed.js). `snippet` (B5) ikut juga supaya
 * integrator bisa langsung mengambil kode embed tanpa membuka dashboard.
 */
export const GET = apiRoute('read', async (_req, _ctx, caller) => {
  const rows = await withTenant(caller.tenantId, (tx) =>
    tx.select({
      id: chatbots.id, name: chatbots.name, publicKey: chatbots.publicKey,
      enabled: chatbots.enabled, context: chatbots.context,
      greeting: chatbots.greeting, createdAt: chatbots.createdAt,
    }).from(chatbots)
      // Penyaring tenant EKSPLISIT di samping RLS. RLS tetap penjaga utama,
      // tapi ia lumpuh total bila peran database boleh melewatinya — dan itu
      // pernah terjadi di produksi. Baris ini yang menahan datanya saat itu.
      .where(and(eq(chatbots.tenantId, caller.tenantId), isNull(chatbots.deletedAt)))
      .orderBy(desc(chatbots.createdAt)));
  return NextResponse.json({
    chatbots: rows.map((r) => ({ ...r, snippet: chatbotService.embedSnippet(r.publicKey) })),
  });
});

/* Field kustomisasi = re-expose CreateBody dashboard (chatbots/route.ts).
   `temperature` bukan bagian dari chatbotService.create (ia field kebijakan
   jawaban) — bila dikirim, di-set lewat update setelah chatbot dibuat. */
const CreateBody = z.object({
  name: z.string().min(1).default('Chatbot Baru'),
  allowedOrigins: z.array(z.string()).optional(),
  greeting: z.string().optional(),
  themeConfig: z.record(z.unknown()).optional(),
  context: z.string().max(2000).nullable().optional(),
  divisionId: z.string().uuid().nullable().optional(),
  temperature: z.number().min(0).max(1).optional(),
});

/** POST /api/v1/chatbots — buat chatbot (scope write) → balikan + embed snippet. */
export const POST = apiRoute('write', async (req, _ctx, caller) => {
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const owner = await tenantOwner(caller.tenantId);
  if (!owner) return NextResponse.json({ error: 'Tenant tak punya admin aktif.' }, { status: 409 });

  const { temperature, ...create } = parsed.data;
  let chatbot = await chatbotService.create(caller.tenantId, API_AKTOR, {
    ownerId: owner.id, ...create, themeConfig: create.themeConfig as never,
  });
  if (temperature !== undefined) {
    chatbot = await chatbotService.update(caller.tenantId, API_AKTOR, chatbot.id, { temperature });
  }
  return NextResponse.json({
    chatbot: chatbotService.tanpaRahasia(chatbot),
    snippet: chatbotService.embedSnippet(chatbot.publicKey),
  }, { status: 201 });
});
