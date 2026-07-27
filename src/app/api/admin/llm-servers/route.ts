import { NextResponse } from 'next/server';
import { z } from 'zod';
import { llmServerService } from '@/modules/chat/llm-server.service';
import { superadminRoute } from '../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server LLM sendiri (Ollama / vLLM / LM Studio / LocalAI).
 * Dijaga superadmin: tabelnya tanpa RLS, dan menerima URL sembarang dari pihak
 * tak tepercaya akan membuka SSRF.
 */
export const GET = superadminRoute(async () =>
  NextResponse.json(await llmServerService.list()));

const Body = z.object({
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  /** boleh kosong — Ollama/LM Studio di jaringan tertutup lazim tanpa auth */
  token: z.string().optional(),
});

export const POST = superadminRoute(async (req) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  return NextResponse.json(await llmServerService.create(parsed.data), { status: 201 });
});
