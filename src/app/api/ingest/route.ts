import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/modules/core/auth';
import { knowledgeService } from '@/modules/knowledge/knowledge.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

const Body = z.object({
  chatbotId: z.string().uuid(),
  title: z.string().optional(),
  text: z.string().min(1),
  sourceId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

/** POST /api/ingest — teks → chunk → embed → simpan ke KB chatbot. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    const chunks = await knowledgeService.ingest(user.tenantId, parsed.data);
    return NextResponse.json({ ok: true, chunks });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
