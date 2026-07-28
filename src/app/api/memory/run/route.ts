import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, requireRole } from '@/modules/core/auth';
import { memoryAgent } from '@/modules/memory/memory-agent.service';
import { jobsSettled } from '@/modules/core/jobs';

export const runtime = 'nodejs';
/** Memory agent (distill/link/graph) butuh waktu setelah respons 202. */
export const maxDuration = 60;

const Body = z.object({ chatbotId: z.string().uuid() });

/** POST /api/memory/run — jalankan Memory Agent (L1–L4) utk satu chatbot. */
export async function POST(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'chatbotId wajib (uuid)' }, { status: 400 });

  const status = memoryAgent.enqueueRun(user.tenantId, parsed.data.chatbotId);
  // Jaga lambda tetap hidup sampai job selesai (lihat jobsSettled di core/jobs).
  after(jobsSettled);
  return NextResponse.json({ ok: true, status }, { status: 202 });
}

/** GET /api/memory/run?chatbotId=… — status run terakhir. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const chatbotId = req.nextUrl.searchParams.get('chatbotId');
  if (!chatbotId) return NextResponse.json({ error: 'chatbotId wajib' }, { status: 400 });
  return NextResponse.json({ status: memoryAgent.runStatus(user.tenantId, chatbotId) });
}
