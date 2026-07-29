import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superadminRoute } from '../_guard';
import { backlogService, DIMENSION_LABEL, STATUS_LABEL } from '@/modules/core/backlog.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — seluruh kartu papan (seed disisipkan otomatis bila ada yang baru). */
export const GET = superadminRoute(async () => {
  const items = await backlogService.list();
  return NextResponse.json({ items, labels: { dimension: DIMENSION_LABEL, status: STATUS_LABEL } });
});

const MoveBody = z.object({
  id: z.string().uuid(),
  status: z.enum(['todo', 'doing', 'done']),
  /** seluruh id kolom tujuan SESUDAH perpindahan, berurutan */
  order: z.array(z.string().uuid()).max(500),
});

/** PATCH — pindahkan kartu antar kolom sekaligus tulis ulang urutannya. */
export const PATCH = superadminRoute(async (req, _ctx, actor) => {
  const parsed = MoveBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  await backlogService.move(actor, parsed.data);
  return NextResponse.json({ ok: true });
});

const CreateBody = z.object({
  track: z.enum(['human', 'agent']),
  dimension: z.enum(['uiux', 'agentic', 'feature', 'launch']),
  title: z.string().min(3).max(160),
  why: z.string().max(600).default(''),
  size: z.enum(['S', 'M', 'L']).default('M'),
  blocked: z.string().max(200).optional(),
});

/** POST — tambah kartu sendiri (papan yang tak bisa ditambahi tak berguna). */
export const POST = superadminRoute(async (req, _ctx, actor) => {
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const item = await backlogService.create(actor, parsed.data);
  return NextResponse.json({ item }, { status: 201 });
});

/** DELETE — soft delete; kartu seed yang dihapus tak dibangkitkan lagi. */
export const DELETE = superadminRoute(async (req, _ctx, actor) => {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id wajib' }, { status: 400 });
  await backlogService.remove(actor, id);
  return NextResponse.json({ ok: true });
});
