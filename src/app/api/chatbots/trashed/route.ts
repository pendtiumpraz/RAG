import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { chatbotService } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/** GET /api/chatbots/trashed — chatbot ter-soft-delete (Rule #3). */
export async function GET() {
  const user = await getCurrentUser();
  const rows = await chatbotService.listTrashed(user.tenantId);
  return NextResponse.json(rows);
}
