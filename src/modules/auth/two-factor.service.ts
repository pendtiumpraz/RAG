import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, users } from '@/modules/core/db';
import { encryptSecret, decryptSecret } from '@/modules/core/crypto';
import { audit } from '@/modules/core/guardrails';
import { hashPassword, verifyPassword } from './password';
import {
  buatKodeCadangan, buatRahasia, normalisasiCadangan, otpauthUrl, verifikasiTotp,
} from './totp';

/**
 * DUA FAKTOR — pendaftaran, verifikasi, pemulihan.
 *
 * MEMBACA TABEL `users` LANGSUNG lewat `db`, BUKAN withTenant.
 *
 * Itu keputusan sadar dan sejalan dengan jalur auth yang sudah ada: login
 * terjadi SEBELUM ada tenant untuk dipasang ke konteks — pada saat kode
 * diperiksa, kita baru tahu emailnya, belum tahu (atau belum boleh percaya)
 * tenant-nya. Memaksakan withTenant di sini berarti menetapkan tenant dari
 * masukan yang belum terbukti, dan itu justru melubangi isolasi yang hendak
 * dijaga. Setiap kueri di bawah dikunci pada `users.id` atau `users.email`,
 * bukan pada penyaring tenant.
 */

export interface PendaftaranTotp {
  /** Rahasia base32 — ditampilkan sekali, untuk dimasukkan manual. */
  rahasia: string;
  /** URI yang dipindai aplikasi authenticator. */
  otpauth: string;
}

async function ambil(userId: string) {
  const r = await db.select({
    id: users.id, email: users.email, tenantId: users.tenantId,
    secret: users.totpSecret, enabledAt: users.totpEnabledAt,
    lastStep: users.totpLastStep, backup: users.totpBackupCodes,
  }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt))).limit(1);
  return r[0] ?? null;
}

export const twoFactorService = {
  /** Sudahkah akun ini memakai 2FA? Dipakai jalur login & UI. */
  async aktif(userId: string): Promise<boolean> {
    const u = await ambil(userId);
    return !!u?.enabledAt && !!u.secret;
  },

  /**
   * Mulai pendaftaran: buat rahasia baru, simpan TERENKRIPSI, tapi JANGAN
   * aktifkan.
   *
   * Rahasia yang langsung berlaku akan mengunci orang yang salah memindai QR
   * dari akunnya sendiri — ia tak akan pernah punya kode yang cocok, dan
   * tak ada yang bisa dilakukannya. Aktivasi baru terjadi di `konfirmasi()`,
   * setelah satu kode yang benar membuktikan perangkatnya memang terpasang.
   *
   * Memanggil ini lagi MENIMPA rahasia yang belum dikonfirmasi — orang yang
   * gagal memindai lalu mengulang harus mendapat QR baru, bukan yang lama.
   */
  async mulai(userId: string): Promise<PendaftaranTotp> {
    const u = await ambil(userId);
    if (!u) throw new Error('Pengguna tidak ditemukan');
    if (u.enabledAt) throw new Error('Dua faktor sudah aktif untuk akun ini');

    const rahasia = buatRahasia();
    await db.update(users).set({
      totpSecret: encryptSecret(rahasia),
      totpEnabledAt: null, totpLastStep: null, totpBackupCodes: null,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));

    return { rahasia, otpauth: otpauthUrl(rahasia, u.email) };
  },

  /**
   * Selesaikan pendaftaran dengan satu kode yang benar.
   *
   * Mengembalikan kode cadangan SEKALI SAJA — sesudah ini hanya hash-nya yang
   * tersimpan, persis seperti kata sandi. Menyimpannya dalam bentuk terbaca
   * berarti satu kebocoran basis data melewati seluruh 2FA sekaligus.
   */
  async konfirmasi(userId: string, kode: string): Promise<{ kodeCadangan: string[] }> {
    const u = await ambil(userId);
    if (!u?.secret) throw new Error('Pendaftaran dua faktor belum dimulai');
    if (u.enabledAt) throw new Error('Dua faktor sudah aktif untuk akun ini');

    const hasil = verifikasiTotp(decryptSecret(u.secret), kode);
    if (!hasil.sah) throw new Error('Kode tidak cocok. Periksa jam perangkatmu, lalu coba kode berikutnya.');

    const kodeCadangan = buatKodeCadangan();
    const hash = await Promise.all(kodeCadangan.map((k) => hashPassword(normalisasiCadangan(k))));

    await db.update(users).set({
      totpEnabledAt: new Date(), totpLastStep: hasil.langkah,
      totpBackupCodes: hash, updatedAt: new Date(),
    }).where(eq(users.id, userId));

    await audit(u.tenantId, userId, 'auth.2fa.enabled', userId, {});
    return { kodeCadangan };
  },

  /**
   * Periksa kode saat login. Menerima kode TOTP maupun kode cadangan.
   *
   * Kode cadangan dicoba HANYA setelah TOTP gagal: mencobanya lebih dulu
   * berarti setiap upaya login membandingkan sepuluh hash scrypt, dan scrypt
   * memang dibuat lambat. Itu mengubah jalur login jadi alat penghabis CPU
   * bagi siapa pun yang mengirimi kita angka acak.
   */
  async verifikasi(userId: string, kode: string): Promise<boolean> {
    const u = await ambil(userId);
    if (!u?.enabledAt || !u.secret) return false;

    const hasil = verifikasiTotp(decryptSecret(u.secret), kode, { langkahTerakhir: u.lastStep });
    if (hasil.sah) {
      /* Langkah dicatat SEBELUM login diluluskan — kalau sesudah, dua
         permintaan yang tiba bersamaan dengan kode yang sama akan lolos
         keduanya, dan penahan pemakaian-ulang jadi hiasan. */
      await db.update(users).set({ totpLastStep: hasil.langkah, updatedAt: new Date() })
        .where(eq(users.id, userId));
      return true;
    }

    const sisa = u.backup ?? [];
    if (!sisa.length) return false;
    const bersih = normalisasiCadangan(kode);
    for (let i = 0; i < sisa.length; i++) {
      if (!(await verifyPassword(bersih, sisa[i]))) continue;
      /* SEKALI PAKAI: kode yang terpakai dibuang seketika. Kode cadangan yang
         bisa dipakai berulang adalah kata sandi kedua yang ditulis di kertas
         dan tak pernah kedaluwarsa. */
      const tersisa = sisa.filter((_, j) => j !== i);
      await db.update(users).set({ totpBackupCodes: tersisa, updatedAt: new Date() })
        .where(eq(users.id, userId));
      await audit(u.tenantId, userId, 'auth.2fa.backup_used', userId, { tersisa: tersisa.length });
      return true;
    }
    return false;
  },

  /**
   * Matikan 2FA — MENUNTUT kata sandi, bukan sesi yang sedang hidup.
   *
   * Sesi yang hidup adalah persis yang dimiliki penyerang yang berhasil
   * mencuri cookie. Kalau mematikan 2FA cukup dengan sesi, lapisan keduanya
   * bisa dilepas oleh orang yang justru harus ditahannya.
   */
  async matikan(userId: string, kataSandi: string): Promise<void> {
    const r = await db.select({
      tenantId: users.tenantId, hash: users.passwordHash, enabledAt: users.totpEnabledAt,
    }).from(users).where(and(eq(users.id, userId), isNull(users.deletedAt))).limit(1);
    const u = r[0];
    if (!u?.enabledAt) throw new Error('Dua faktor belum aktif');
    if (!u.hash || !(await verifyPassword(kataSandi, u.hash))) {
      throw new Error('Kata sandi salah');
    }
    await db.update(users).set({
      totpSecret: null, totpEnabledAt: null, totpLastStep: null,
      totpBackupCodes: null, updatedAt: new Date(),
    }).where(eq(users.id, userId));
    await audit(u.tenantId, userId, 'auth.2fa.disabled', userId, {});
  },

  /** Berapa kode cadangan yang masih tersisa — ditampilkan di pengaturan. */
  async sisaCadangan(userId: string): Promise<number> {
    const u = await ambil(userId);
    return (u?.backup ?? []).length;
  },

  /**
   * Apakah email ini memakai 2FA? Dipakai jalur LOGIN, yang baru punya email.
   *
   * Sengaja tak menyentuh rahasianya: pemanggilnya hanya perlu tahu apakah
   * kolom kode harus ditampilkan.
   */
  async aktifUntukEmail(email: string): Promise<boolean> {
    const r = await db.select({ id: users.id }).from(users).where(and(
      eq(users.email, email.trim().toLowerCase()),
      isNull(users.deletedAt),
      sql`${users.totpEnabledAt} is not null`,
    )).limit(1);
    return r.length > 0;
  },
};
