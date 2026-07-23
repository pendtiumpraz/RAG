import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { memoryService } from '@/modules/memory/memory.service';

export const runtime = 'nodejs';

/**
 * GET /api/memory/vault?chatbotId=… — export vault `_nalar-memory/` sebagai
 * daftar file markdown (path + content). Kompatibel Obsidian; sync-back ke
 * Drive user menyusul saat token OAuth per-user tersedia.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const chatbotId = req.nextUrl.searchParams.get('chatbotId');
  if (!chatbotId) return NextResponse.json({ error: 'chatbotId wajib' }, { status: 400 });
  const files = await memoryService.exportVault(user.tenantId, chatbotId);
  return NextResponse.json({ files });
}

/** POST /api/memory/vault — write-back vault ke Google Drive user. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const chatbotId: string | undefined = body.chatbotId;
  if (!chatbotId) return NextResponse.json({ error: 'chatbotId wajib' }, { status: 400 });
  try {
    const result = await memoryService.syncVaultToDrive(user.tenantId, user.id, chatbotId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
