import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/modules/core/auth';
import { twoFactorService } from '@/modules/auth/two-factor.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DUA FAKTOR untuk akun yang SEDANG login.
 *
 *   GET     keadaan 2FA akun ini
 *   POST    { aksi: 'mulai' }                 → rahasia + otpauth (belum aktif)
 *   POST    { aksi: 'konfirmasi', kode }      → aktifkan + kode cadangan
 *   POST    { aksi: 'matikan', kataSandi }    → matikan
 *
 * Seluruhnya menyentuh AKUN PEMANGGIL saja — `userId` diambil dari sesi, tak
 * pernah dari badan permintaan. Menerimanya dari badan permintaan akan
 * membuat siapa pun yang punya sesi bisa mematikan 2FA milik orang lain, dan
 * itu bug yang bentuknya persis seperti fitur.
 */

export async function GET() {
  const user = await getCurrentUser();
  const aktif = await twoFactorService.aktif(user.id);
  return NextResponse.json({
    aktif,
    sisaCadangan: aktif ? await twoFactorService.sisaCadangan(user.id) : 0,
  });
}

const Body = z.discriminatedUnion('aksi', [
  z.object({ aksi: z.literal('mulai') }),
  z.object({ aksi: z.literal('konfirmasi'), kode: z.string().min(1) }),
  z.object({ aksi: z.literal('matikan'), kataSandi: z.string().min(1) }),
]);

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    if (parsed.data.aksi === 'mulai') {
      const daftar = await twoFactorService.mulai(user.id);
      /* QR dirender DI SINI, bukan di browser: gambarnya cuma pembungkus
         `otpauth` yang sudah kita kirim, jadi tak ada rahasia tambahan yang
         menyeberang — tapi memindahkan pustakanya ke klien akan menambah
         berat bundel untuk satu layar yang dibuka sekali seumur akun. */
      const QR = (await import('qrcode')).default;
      const qr = await QR.toDataURL(daftar.otpauth, { margin: 1, width: 220 })
        .catch(() => null);   // gagal render ≠ gagal daftar: rahasianya tetap bisa diketik manual
      return NextResponse.json({ ...daftar, qr });
    }
    if (parsed.data.aksi === 'konfirmasi') {
      return NextResponse.json(await twoFactorService.konfirmasi(user.id, parsed.data.kode));
    }
    await twoFactorService.matikan(user.id, parsed.data.kataSandi);
    return NextResponse.json({ ok: true });
  } catch (e) {
    /* Pesannya sudah ditulis untuk manusia di service ("Kode tidak cocok.
       Periksa jam perangkatmu…"). Melipatnya jadi 500 generik akan membuat
       orang menebak — dan orang yang menebak di layar 2FA biasanya berhenti
       memakainya. */
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
