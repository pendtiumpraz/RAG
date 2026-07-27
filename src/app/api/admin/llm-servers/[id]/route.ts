import { NextResponse } from 'next/server';
import { z } from 'zod';
import { llmServerService } from '@/modules/chat/llm-server.service';
import { superadminRoute } from '../../_guard';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().min(1).optional(),
  token: z.string().optional(),
  enabled: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = superadminRoute<Ctx>(async (req, ctx) => {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  return NextResponse.json(await llmServerService.update(id, parsed.data));
});

/** Soft delete (Rule #3). */
export const DELETE = superadminRoute<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json(await llmServerService.softDelete(id));
});
