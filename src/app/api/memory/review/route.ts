import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, requireRole } from '@/modules/core/auth';
import { documentSummaryService } from '@/modules/memory/document-summary.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/** GET /api/memory/review — antrean ringkasan yang menunggu persetujuan. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const chatbotId = req.nextUrl.searchParams.get('chatbotId') ?? undefined;
  return NextResponse.json(await documentSummaryService.pending(user.tenantId, chatbotId));
}

const Body = z.object({
  noteId: z.string().uuid().optional(),
  status: z.enum(['active', 'rejected']).optional(),
  /** Setujui seluruh antrean; `noteId` diabaikan bila ini true. */
  all: z.boolean().optional(),
  chatbotId: z.string().uuid().optional(),
});

/** POST /api/memory/review — setujui / tolak ringkasan (satu atau semua). */
export async function POST(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { noteId, status, all, chatbotId } = parsed.data;
  try {
    if (all) {
      const n = await documentSummaryService.approveAll(user.tenantId, chatbotId);
      return NextResponse.json({ ok: true, approved: n });
    }
    if (!noteId || !status) {
      return NextResponse.json({ error: 'noteId & status wajib bila bukan `all`' }, { status: 400 });
    }
    return NextResponse.json(await documentSummaryService.review(user.tenantId, noteId, status));
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
