import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/modules/core/auth';
import { chatbotService, ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/** GET /api/chatbots — daftar chatbot aktif tenant ini. */
export async function GET() {
  const user = await getCurrentUser();
  const rows = await chatbotService.list(user.tenantId);
  return NextResponse.json(rows);
}

const CreateBody = z.object({
  name: z.string().min(1).default('Chatbot Baru'),
  allowedOrigins: z.array(z.string()).optional(),
  greeting: z.string().optional(),
  themeConfig: z.record(z.unknown()).optional(),
});

/** POST /api/chatbots — buat chatbot → balikan termasuk embed snippet. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    const chatbot = await chatbotService.create(user.tenantId, {
      ownerId: user.id, ...parsed.data,
      themeConfig: parsed.data.themeConfig as never,
    });
    return NextResponse.json({ chatbot, snippet: chatbotService.embedSnippet(chatbot.publicKey) }, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
