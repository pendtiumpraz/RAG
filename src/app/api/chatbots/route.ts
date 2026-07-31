import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, requireRole } from '@/modules/core/auth';
import { AksesDitolakError, chatbotService, ValidationError } from '@/modules/chatbot/chatbot.service';
import { divisionService } from '@/modules/settings/division.service';
import { ensureIntegrations } from '../_wire';

export const runtime = 'nodejs';

/** GET /api/chatbots — daftar chatbot aktif yang BOLEH dilihat pemanggil. */
export async function GET() {
  const user = await getCurrentUser();
  const rows = await chatbotService.list(user.tenantId, await divisionService.aktor(user));
  return NextResponse.json(rows);
}

const CreateBody = z.object({
  name: z.string().min(1).default('Chatbot Baru'),
  allowedOrigins: z.array(z.string()).optional(),
  greeting: z.string().optional(),
  themeConfig: z.record(z.unknown()).optional(),
  /** D11: konteks divisi/persona chatbot. */
  context: z.string().max(2000).optional(),
  /* Divisi PEMILIK (migrasi 0040) — beda dari `context` di atas, yang cuma
     prosa untuk system prompt. Hanya dihormati bila pembuatnya berperan
     lintas divisi; member selalu mengikuti divisinya sendiri. */
  divisionId: z.string().uuid().nullable().optional(),
});

/** POST /api/chatbots — buat chatbot → balikan termasuk embed snippet. */
export async function POST(req: NextRequest) {
  ensureIntegrations();
  const user = await requireRole('superadmin', 'admin');
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    const chatbot = await chatbotService.create(user.tenantId, await divisionService.aktor(user), {
      ownerId: user.id, ...parsed.data,
      themeConfig: parsed.data.themeConfig as never,
    });
    return NextResponse.json({ chatbot, snippet: chatbotService.embedSnippet(chatbot.publicKey) }, { status: 201 });
  } catch (e) {
    if (e instanceof AksesDitolakError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
