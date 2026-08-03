import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/modules/core/db';
import { users } from '@/modules/core/db/schema';
import { authTokenService } from './auth-token.service';
import { audit } from '@/modules/core/guardrails';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

/**
 * PEMULIHAN AKUN SAAT EMAIL TAK BISA DIAKSES (kartu a-account-recovery).
 *
 * Lupa-password, verifikasi email, dan 2FA semuanya sudah ada — dan justru
 * kelengkapan itu yang menciptakan jalan buntu baru: SETIAP jalur pemulihan
 * bermuara ke email yang sama. Orang yang kehilangan akses ke kotak surat
 * kerjanya (resign, domain pindah, kotak dihapus IT) tak punya satu pun jalan
 * kembali. Untuk akun admin tenant, itu berarti seluruh organisasi kehilangan
 * kendali atas workspace-nya.
 *
 * BENTUKNYA: ADMIN LAIN YANG MENERBITKAN, BUKAN SISTEM YANG MEMPERCAYAI.
 * Tak ada "pertanyaan rahasia", tak ada verifikasi lewat nomor telepon, tak
 * ada apa pun yang bisa ditebak orang luar. Yang memulihkan adalah manusia
 * yang MENGENAL orangnya dan sudah dipercaya organisasi itu. Setiap jalur
 * pemulihan otomatis adalah jalur masuk baru bagi yang bukan pemiliknya, dan
 * pada akun yang memegang seluruh dokumen perusahaan, itu pertukaran yang
 * salah.
 *
 * TAUTANNYA TIDAK DIKIRIM LEWAT EMAIL — itu inti kartunya. Ia ditampilkan
 * SEKALI di layar penerbitnya, lalu disampaikan lewat jalur apa pun yang
 * sudah dipercaya organisasi itu (tatap muka, telepon, chat internal).
 * Mengirimkannya lewat email akan mengembalikan buntu yang sama persis.
 *
 * TIGA PAGAR, dan ketiganya perlu:
 *   1. Hanya admin/superadmin yang boleh menerbitkan.
 *   2. Hanya untuk anggota TENANT YANG SAMA — kecuali superadmin platform.
 *   3. TIDAK untuk diri sendiri. Menerbitkan tautan pemulihan untuk diri
 *      sendiri bukan pemulihan, itu cuma jalan pintas melewati kata sandi —
 *      dan ia mengubah satu sesi yang dibajak jadi penguasaan akun permanen.
 */

export interface HasilPemulihan {
  /** Tautan sekali pakai. HANYA dikembalikan di sini, tak pernah disimpan. */
  tautan: string;
  email: string;
  /** Kapan tautannya mati. Sengaja pendek. */
  berlakuSampai: string;
}

/** Jam berlaku tautan pemulihan. */
export const JAM_BERLAKU = 1;

function basis(): string {
  return (process.env.NEXTAUTH_URL ?? '').replace(/\/+$/, '');
}

export const pemulihanService = {
  /**
   * Terbitkan tautan atur-ulang-password untuk anggota lain.
   *
   * `actor` sudah lolos pemeriksaan sesi di rutenya; di sini yang diperiksa
   * adalah WEWENANGNYA atas target — dua hal berbeda, dan menggabungkannya
   * adalah cara paling umum membuat endpoint admin bisa dipakai lintas tenant.
   */
  async terbitkan(
    actor: { id: string; tenantId: string; role: string },
    targetUserId: string,
  ): Promise<HasilPemulihan> {
    if (!['admin', 'superadmin'].includes(actor.role)) {
      throw new ValidationError('Hanya admin organisasi yang bisa memulihkan akun anggota');
    }
    if (actor.id === targetUserId) {
      throw new ValidationError(
        'Untuk akunmu sendiri, pakai "Lupa password" di halaman masuk. '
        + 'Menerbitkan tautan pemulihan untuk diri sendiri melewati kata sandi tanpa membuktikan apa pun.',
      );
    }

    const rows = await db.select({
      id: users.id, email: users.email, tenantId: users.tenantId,
      role: users.role, status: users.status,
    }).from(users)
      .where(and(eq(users.id, targetUserId), isNull(users.deletedAt)))
      .limit(1);
    const target = rows[0];
    if (!target) throw new ValidationError('Anggota tidak ditemukan');

    /* Batas tenant ditegakkan DI SINI, bukan dipercayakan pada RLS: kueri di
       atas memakai koneksi tanpa konteks tenant supaya superadmin platform
       bisa menolong tenant mana pun. Yang membuat itu aman adalah pemeriksaan
       eksplisit berikut — bukan ketiadaan kebocoran. */
    if (actor.role !== 'superadmin' && target.tenantId !== actor.tenantId) {
      throw new ValidationError('Anggota tidak ditemukan');
    }
    /* Admin tenant TIDAK boleh memulihkan superadmin platform. Tanpa pagar
       ini, satu akun admin di tenant mana pun cukup untuk mengambil alih akun
       yang memegang kredensial SELURUH platform. */
    if (target.role === 'superadmin' && actor.role !== 'superadmin') {
      throw new ValidationError('Akun ini hanya bisa dipulihkan oleh superadmin platform');
    }
    if (target.status === 'rejected') {
      throw new ValidationError('Akun ini ditolak. Setujui dulu di antrean verifikasi, baru pulihkan.');
    }

    const token = await authTokenService.issue(target.id, 'reset');

    /* DICATAT SELALU, dan sengaja menyebut siapa memulihkan siapa. Ini satu-
       satunya jalur di seluruh aplikasi tempat seseorang bisa membuka akses ke
       akun orang lain; jejak yang tak bisa dibantah adalah yang membuatnya
       layak ada. */
    await audit(target.tenantId, actor.id, 'auth.recovery_issued', target.id, {
      olehPeran: actor.role, targetEmail: target.email, lintasTenant: target.tenantId !== actor.tenantId,
    });

    return {
      tautan: `${basis()}/auth/reset?token=${token}`,
      email: target.email,
      berlakuSampai: new Date(Date.now() + JAM_BERLAKU * 3600_000).toISOString(),
    };
  },

  /**
   * Riwayat pemulihan tenant ini — supaya penyalahgunaannya terlihat.
   *
   * Kemampuan memulihkan akun orang lain hanya layak ada kalau pemakaiannya
   * bisa dilihat oleh selain yang memakainya. Tanpa daftar ini, seorang admin
   * bisa membuka akun rekannya berulang kali dan satu-satunya jejaknya ada di
   * tabel yang tak punya layar.
   */
  async riwayat(tenantId: string, batas = 50) {
    const rows = await db.execute(sql`
      select a.created_at as "createdAt", a.actor_id as "actorId",
             a.target_id as "targetId", a.meta
        from audit_logs a
       where a.tenant_id = ${tenantId}
         and a.action = 'auth.recovery_issued'
         and a.deleted_at is null
       order by a.created_at desc
       limit ${batas}
    `);
    return rows as unknown as Array<{
      createdAt: string; actorId: string; targetId: string; meta: Record<string, unknown>;
    }>;
  },
};
