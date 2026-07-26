import { NextResponse } from 'next/server';
import { userApprovalService } from '@/modules/auth/user-approval.service';
import { superadminRoute } from '../_guard';

export const runtime = 'nodejs';

/**
 * GET /api/admin/users?status=pending — antrean verifikasi pendaftaran.
 * `?status=all` untuk meninjau semua akun.
 *
 * Dijaga superadmin: daftar ini menembus batas tenant (tiap signup punya
 * tenant sendiri), jadi hanya peran platform yang boleh melihatnya.
 */
export const GET = superadminRoute(async (req) => {
  const status = req.nextUrl.searchParams.get('status') ?? 'pending';
  const rows = status === 'all'
    ? await userApprovalService.listAll()
    : await userApprovalService.listPending();
  return NextResponse.json(rows);
});
