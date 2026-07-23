import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db, chatbots } from '@/lib/db';
import { withTenant } from '@/lib/db/tenant';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

// List this tenant's chatbots (each = one isolated knowledge base).
export async function GET() {
  const user = await getCurrentUser();
  const rows = await withTenant(user.tenantId, async (tx) => tx.select().from(chatbots));
  return NextResponse.json(rows);
}

// Create a new chatbot → returns its public embed key + snippet.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const name: string = body.name ?? 'My Chatbot';
  const allowedOrigins: string[] = Array.isArray(body.allowedOrigins) ? body.allowedOrigins : [];

  const publicKey = 'cb_live_' + nanoid(24);
  const created = await withTenant(user.tenantId, async (tx) =>
    (await tx.insert(chatbots).values({
      tenantId: user.tenantId,
      ownerId: user.id,
      name,
      publicKey,
      allowedOrigins,
    }).returning())[0],
  );

  const host = process.env.NEXTAUTH_URL ?? '';
  const snippet = `<script src="${host}/embed.js" data-chatbot="${publicKey}" data-color="#4f46e5"></script>`;
  return NextResponse.json({ chatbot: created, snippet });
}
