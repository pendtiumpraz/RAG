import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { chatbotService } from '@/modules/chatbot/chatbot.service';
import { divisionService } from '@/modules/settings/division.service';

export const runtime = 'nodejs';

/**
 * GET /api/chatbots/trashed — chatbot ter-soft-delete (Rule #3).
 *
 * Ikut disaring divisi. Sampah yang tak tersaring adalah cara paling sepi
 * membocorkan daftar chatbot divisi lain: namanya tetap terbaca, dan orang
 * jarang memikirkan Sampah saat memeriksa siapa melihat apa.
 */
export async function GET() {
  const user = await getCurrentUser();
  const rows = await chatbotService.listTrashed(user.tenantId, await divisionService.aktor(user));
  return NextResponse.json(rows);
}
