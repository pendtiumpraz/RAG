import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { knowledgeService } from '@/modules/knowledge/knowledge.service';

export const runtime = 'nodejs';

/**
 * GET /api/usage/storage — pemakaian penyimpanan terhadap kuota paket.
 *
 * Ada supaya batasnya terlihat SEBELUM tertabrak. Kuota yang baru terasa saat
 * sync gagal di tengah jalan adalah kuota yang buruk: pemilik data sudah
 * terlanjur menunggu, dan pesannya datang di tempat yang tak mereka lihat.
 */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(await knowledgeService.storageUsage(user.tenantId));
}
