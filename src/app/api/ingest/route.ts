import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { ingestDocument } from '@/lib/rag/ingest';

export const runtime = 'nodejs';

/**
 * Ingest raw text into a chatbot's knowledge base. In production this is
 * called by the Drive/SharePoint sync workers after extracting text from
 * each file; exposed here for direct uploads too.
 */
const Body = z.object({
  chatbotId: z.string().uuid(),
  title: z.string().optional(),
  text: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  const chunks = await ingestDocument({
    tenantId: user.tenantId,
    chatbotId: parsed.data.chatbotId,
    title: parsed.data.title,
    text: parsed.data.text,
    metadata: parsed.data.metadata,
  });

  return NextResponse.json({ ok: true, chunks });
}
