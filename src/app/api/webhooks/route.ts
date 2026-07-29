import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, getCurrentUser } from '@/modules/core/auth';
import {
  webhookService, WEBHOOK_EVENTS, EVENT_LABEL, type WebhookEvent,
} from '@/modules/integrations/webhook.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    webhooks: await webhookService.list(user.tenantId),
    events: WEBHOOK_EVENTS.map((e) => ({ id: e, label: EVENT_LABEL[e] })),
  });
}

const Create = z.object({
  url: z.string().min(1),
  events: z.array(z.string()).min(1),
});

/** POST — buat webhook. Rahasianya dibalas SEKALI utk dipasang di penerima. */
export async function POST(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const parsed = Create.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  try {
    const { secret, row } = await webhookService.create(user, {
      url: parsed.data.url,
      events: parsed.data.events as WebhookEvent[],
    });
    return NextResponse.json({ secret, row }, { status: 201 });
  } catch (e) {
    // assertDeliverableUrl melempar pesan yang memang untuk dibaca pengguna.
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}

const Patch = z.object({
  id: z.string().uuid(),
  url: z.string().optional(),
  events: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
  /** true = ketuk sekali dengan kejadian uji */
  test: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const { id, test, ...rest } = parsed.data;
  try {
    if (test) {
      const r = await webhookService.test(user.tenantId, id);
      return NextResponse.json(r);
    }
    await webhookService.update(user, id, {
      ...rest, events: rest.events as WebhookEvent[] | undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id wajib' }, { status: 400 });
  await webhookService.remove(user, id);
  return NextResponse.json({ ok: true });
}
