import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { analyticsService } from '@/modules/chat/analytics.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics?chatbotId=…&days=30 — analitik SATU chatbot.
 *
 * Per chatbot, bukan per tenant: satu tenant bisa punya banyak chatbot dengan
 * knowledge base yang berbeda, jadi angka gabungan tak bisa ditindaklanjuti.
 * withTenant() di service memastikan chatbot milik tenant lain tak terbaca.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const chatbotId = req.nextUrl.searchParams.get('chatbotId');
  if (!chatbotId) return NextResponse.json({ error: 'chatbotId wajib' }, { status: 400 });

  const raw = Number(req.nextUrl.searchParams.get('days') ?? 30);
  // Dibatasi di server: jendela terlalu lebar memindai messages yang terus tumbuh.
  const days = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 365) : 30;

  return NextResponse.json(await analyticsService.forChatbot(user.tenantId, chatbotId, days));
}
