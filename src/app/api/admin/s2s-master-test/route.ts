import { NextResponse } from 'next/server';
import { superadminRoute } from '../_guard';
import { platformSettingsService } from '@/modules/payments/platform-settings.service';
import { MIN_KEY_LEN, masterKeyStatus } from '@/app/api/v1/_master';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * TES KONEKSI NALAR_MASTER_KEY (SUPERADMIN) — memverifikasi apakah jalur
 * provisioning S2S siap: env ter-set & panjang >= MIN_KEY_LEN (ambang yang
 * sama dengan `masterRoute`). Nilai kunci TAK PERNAH dikirim ke browser; hanya
 * status boolean + jumlah domain whitelist sebagai info pelengkap.
 */
export const POST = superadminRoute(async () => {
  const { configured, lengthOk } = masterKeyStatus();
  const { s2sAllowedDomains } = await platformSettingsService.get();
  const ok = configured && lengthOk;
  const message = !configured
    ? 'NALAR_MASTER_KEY belum di-set — provisioning S2S nonaktif (503).'
    : !lengthOk
      ? `NALAR_MASTER_KEY terlalu pendek (< ${MIN_KEY_LEN} karakter).`
      : 'NALAR_MASTER_KEY terkonfigurasi & valid.';
  return NextResponse.json({
    ok, configured, lengthOk, minLength: MIN_KEY_LEN,
    domainCount: s2sAllowedDomains.length, message,
  });
});
