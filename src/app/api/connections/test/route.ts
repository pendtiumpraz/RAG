import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { oauthConnections } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { getCurrentUser } from '@/modules/core/auth';
import { connectionService } from '@/modules/connections/connection.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/connections/test — buktikan sebuah koneksi BENAR-BENAR bekerja.
 *
 * Kenapa perlu endpoint sendiri: baris "tersambung" di UI hanya membuktikan ada
 * baris di database. Ia tak membuktikan tokennya masih hidup, refresh-nya
 * berhasil, atau izinnya cukup untuk apa yang mau dilakukan. Ketiganya bisa
 * gagal diam-diam — token dicabut dari sisi Google/Microsoft, refresh token
 * hilang, atau scope-nya kurang — dan pengguna baru tahu saat sync gagal
 * berjam-jam kemudian tanpa sebab yang terlihat.
 *
 * Yang diketuk adalah endpoint TERMURAH yang tetap membuktikan hal yang
 * penting: Drive `about` (siapa pemiliknya + kuota) dan Graph `/me`. Keduanya
 * tak menyentuh dokumen pelanggan sama sekali.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id wajib' }, { status: 400 });

  const conn = await withTenant(user.tenantId, async (tx) =>
    (await tx.select({
      id: oauthConnections.id, provider: oauthConnections.provider,
      accountEmail: oauthConnections.accountEmail, scope: oauthConnections.scope,
    }).from(oauthConnections).where(and(
      eq(oauthConnections.id, String(id)),
      eq(oauthConnections.userId, user.id),
      isNull(oauthConnections.deletedAt),
    )).limit(1))[0]);
  if (!conn) return NextResponse.json({ error: 'Koneksi tidak ditemukan' }, { status: 404 });

  // Ini juga sekaligus menguji jalur REFRESH: probeAccessToken memperbarui
  // token yang hampir kedaluwarsa, jadi kegagalan refresh muncul di sini
  // alih-alih di tengah sync — dan MENYEBUT sebabnya.
  const { token, failure, detail } = await connectionService.probeAccessToken(
    user.tenantId, user.id, conn.provider as 'google' | 'microsoft', conn.accountEmail);
  if (!token) {
    /* Menyuruh menyambung ulang pada kegagalan KONFIGURASI adalah saran yang
       mustahil dijalankan: alur connect memakai kredensial database dan akan
       berhasil, lalu satu jam kemudian refresh gagal lagi persis sama.
       Pesannya harus menunjuk orang yang benar-benar bisa memperbaikinya. */
    return NextResponse.json({
      ok: false,
      fatal: failure === 'config',
      reason: failure === 'config'
        ? `Kredensial aplikasi OAuth ${conn.provider} bermasalah (${detail ?? 'tak diketahui'}) — menyambung ulang akun TIDAK akan menolong. Superadmin perlu memeriksa Client ID/Secret di Pengaturan → OAuth.`
        : failure === 'network'
          ? `Gagal menghubungi penyedia saat memperbarui token (${detail ?? '—'}). Coba lagi sebentar; akunnya sendiri kemungkinan sehat.`
          : 'Token ditolak penyedia. Sambungkan ulang akun ini.',
    });
  }

  try {
    if (conn.provider === 'google') {
      const r = await fetch(
        'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName),storageQuota(usage,limit)',
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
      if (!r.ok) return NextResponse.json({ ok: false, reason: explain(r.status, 'Google Drive') });
      const j = await r.json() as {
        user?: { emailAddress?: string; displayName?: string };
        storageQuota?: { usage?: string; limit?: string };
      };
      return NextResponse.json({
        ok: true,
        account: j.user?.emailAddress ?? conn.accountEmail,
        name: j.user?.displayName ?? null,
        // Izin dilaporkan apa adanya: inilah yang menentukan mode mana yang
        // bisa dipakai, dan menyembunyikannya membuat kegagalan mode folder
        // tampak misterius.
        canPickFiles: (conn.scope ?? '').includes('drive.file'),
        canScanFolder: (conn.scope ?? '').includes('drive.readonly'),
        quota: j.storageQuota?.limit
          ? `${gb(j.storageQuota.usage)} / ${gb(j.storageQuota.limit)} GB`
          : null,
      });
    }

    const r = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName',
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return NextResponse.json({ ok: false, reason: explain(r.status, 'Microsoft Graph') });
    const j = await r.json() as { displayName?: string; mail?: string; userPrincipalName?: string };
    return NextResponse.json({
      ok: true,
      account: j.mail ?? j.userPrincipalName ?? conn.accountEmail,
      name: j.displayName ?? null,
      canPickFiles: true,
      canScanFolder: /Files\.Read/i.test(conn.scope ?? '') || !conn.scope,
      quota: null,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      reason: (e as Error).name === 'TimeoutError'
        ? 'Penyedia tak menjawab dalam 10 detik.'
        : `Gagal menghubungi penyedia: ${(e as Error).message.slice(0, 120)}`,
    });
  }
}

/** Status HTTP → sebab yang bisa ditindaklanjuti, bukan angka telanjang. */
function explain(status: number, provider: string): string {
  if (status === 401) return `${provider} menolak token — sambungkan ulang akun ini.`;
  if (status === 403) return `${provider} menolak izinnya. Tambahkan izin yang dibutuhkan.`;
  if (status === 429) return `${provider} sedang membatasi laju. Coba beberapa saat lagi.`;
  return `${provider} menjawab ${status}.`;
}

const gb = (v?: string) => (v ? (Number(v) / 1024 ** 3).toFixed(1) : '?');
