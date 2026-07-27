import { NextResponse } from 'next/server';
import { userApprovalService } from '@/modules/auth/user-approval.service';
import { parsePaging } from '@/modules/core/pagination';
import { superadminRoute } from '../_guard';

export const runtime = 'nodejs';

/**
 * GET /api/admin/users?status=pending&page=1&pageSize=25 — antrean verifikasi.
 * `?status=all` untuk meninjau semua akun.
 *
 * Dijaga superadmin: daftar ini menembus batas tenant (tiap signup punya
 * tenant sendiri), jadi hanya peran platform yang boleh melihatnya.
 * Berhalaman karena jumlah akun tumbuh tanpa batas seiring pendaftaran.
 */
export const GET = superadminRoute(async (req) => {
  const status = req.nextUrl.searchParams.get('status') ?? 'pending';
  const paging = parsePaging(req.nextUrl.searchParams, { defaultSize: 25, maxSize: 100 });
  const page = status === 'all'
    ? await userApprovalService.listAll(paging)
    : await userApprovalService.listPending(paging);
  return NextResponse.json(page);
});
