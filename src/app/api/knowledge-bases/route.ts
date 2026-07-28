import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, requireRole } from '@/modules/core/auth';
import { knowledgeBaseService } from '@/modules/knowledge/knowledge-base.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/** GET /api/knowledge-bases — daftar KB + ringkasan (sumber, chunk, chatbot). */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(await knowledgeBaseService.list(user.tenantId));
}

const Body = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

/** POST /api/knowledge-bases — buat KB baru (D11). */
export async function POST(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  try {
    const kb = await knowledgeBaseService.create(user.tenantId, user.id, parsed.data);
    return NextResponse.json(kb, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
