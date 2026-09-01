import { sql } from 'drizzle-orm';
import { db, client } from './index';

/**
 * THE tenant-isolation boundary.
 *
 * Runs `fn` inside a transaction with Postgres' `app.current_tenant` pinned
 * to `tenantId`. Combined with the RLS policies (migrations/0001_rls.sql),
 * every statement on a tenant-scoped table is constrained to that tenant —
 * cross-tenant access is impossible by construction, even on buggy queries.
 */
/**
 * PENJAGA PERAN — RLS yang dilewati harus BERTERIAK, bukan bocor diam-diam.
 *
 * ── KEJADIAN NYATA YANG MELAHIRKAN INI ──────────────────────────────────────
 *
 * Kalimat di atas — "cross-tenant access is impossible by construction" —
 * benar HANYA bila peran database tidak boleh melewati RLS. Di produksi,
 * `DATABASE_URL` memakai peran ber-`rolbypassrls`. Akibatnya RLS tidak berlaku
 * sama sekali: satu tenant melihat 33 chatbot, 24 knowledge base, dan 35
 * dokumen milik SELURUH tenant — hidup maupun yang sudah dihapus.
 *
 * Tidak ada satu pun galat, tidak ada peringatan, dan `withTenant` tetap
 * dipanggil dengan benar di setiap rute. Cacatnya bukan di kode; cacatnya satu
 * variabel lingkungan, dan tidak ada apa pun yang menyebutkannya.
 *
 * Kegagalan senyap adalah yang paling mahal — ia baru ketahuan saat pelanggan
 * melihat data pelanggan lain.
 *
 * Sengaja TIDAK menjatuhkan proses: mematikan layanan karena konfigurasi
 * database mengubah kebocoran jadi padam total, dan pada pemasangan on-prem
 * yang memang berjalan sebagai owner tunggal itu hukuman yang salah. Yang
 * dijamin di sini cuma satu: ia tidak bisa lagi terjadi tanpa ada yang
 * berteriak di log. Penahan datanya ada di lapis kedua — penyaring tenant
 * eksplisit di tiap kueri.
 */
let peranSudahDiperiksa = false;

export async function periksaPeranRls(): Promise<{ aman: boolean; peran: string }> {
  const rows = (await client`
    select current_user as peran, r.rolbypassrls, r.rolsuper
      from pg_roles r where r.rolname = current_user`) as unknown as Array<{
    peran: string;
    rolbypassrls: boolean;
    rolsuper: boolean;
  }>;
  const r = rows?.[0];
  const aman = Boolean(r) && !r.rolbypassrls && !r.rolsuper;
  if (r && !aman) {
    console.error(
      `[ISOLASI TENANT LUMPUH] Peran database "${r.peran}" bisa melewati RLS ` +
        `(rolbypassrls=${r.rolbypassrls}, rolsuper=${r.rolsuper}). ` +
        `Setiap tenant dapat membaca data tenant lain. ` +
        `Ganti DATABASE_URL ke peran aplikasi (scripts/create-app-role.mjs), lalu redeploy.`,
    );
  }
  return { aman, peran: r?.peran ?? '(tidak diketahui)' };
}

export async function withTenant<T>(
  tenantId: string,
  fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
  if (!peranSudahDiperiksa) {
    // Ditandai lebih dulu: pemeriksaan yang gagal tidak boleh diulang tiap
    // permintaan, dan tidak boleh menahan permintaan pertama.
    peranSudahDiperiksa = true;
    await periksaPeranRls().catch(() => undefined);
  }
  return db.transaction(async (tx) => {
    // set_config(..., true) => scoped to this transaction only.
    await tx.execute(sql`select set_config('app.current_tenant', ${tenantId}, true)`);
    return fn(tx as unknown as typeof db);
  });
}

export interface EmbedChatbot {
  id: string; tenant_id: string; enabled: boolean;
  allowed_origins: string[]; theme_config: unknown; greeting: string | null;
  has_logo: boolean;
  /** Rahasia identitas pengunjung, MASIH TERENKRIPSI (migrasi 0042).
   *  null = chatbot ini belum menyalakan identitas suntikan. Didekripsi
   *  hanya di sisi server saat memverifikasi tanda tangan; tak pernah
   *  meninggalkan proses. */
  visitor_secret: string | null;
}

/**
 * Resolusi tenant + chatbot dari `publicKey` widget embed.
 *
 * Berjalan DI LUAR konteks tenant — pengunjung situs pelanggan tak punya sesi
 * dan tenantnya memang belum diketahui. Karena `chatbots` FORCE RLS, query
 * biasa di sini mengembalikan NOL BARIS tanpa galat apa pun; itulah yang
 * membuat setiap widget membalas 404 secara diam-diam.
 *
 * Jalan keluarnya sama dengan login by-email (0002) dan penerimaan undangan
 * (0010): buka policy `chatbots_public_lookup` (migrasi 0013) HANYA di dalam
 * transaksi ini lewat GUC `app.embed_context`. Pencariannya tetap sempit —
 * public_key persis — dan hanya kolom routing yang dikembalikan.
 */
export async function resolveChatbotByPublicKey(publicKey: string): Promise<EmbedChatbot | null> {
  const rows = await client.begin(async (sql) => {
    await sql`select set_config('app.embed_context', 'public_key', true)`;
    return sql`
      select id, tenant_id, enabled, allowed_origins, theme_config, greeting,
             visitor_secret,
             (logo is not null) as has_logo
      from chatbots
      where public_key = ${publicKey} and deleted_at is null
      limit 1
    `;
  });
  return (rows as unknown as EmbedChatbot[])[0] ?? null;
}

/**
 * Byte logo unggahan utk widget (data URL) — query TERPISAH dari resolve:
 * logo bisa ratusan KB dan tak boleh menumpang di setiap resolve config/chat.
 */
export async function resolveChatbotLogoByPublicKey(publicKey: string): Promise<string | null> {
  const rows = await client.begin(async (sql) => {
    await sql`select set_config('app.embed_context', 'public_key', true)`;
    return sql`
      select logo from chatbots
      where public_key = ${publicKey} and deleted_at is null and logo is not null
      limit 1
    `;
  });
  return (rows as unknown as Array<{ logo: string }>)[0]?.logo ?? null;
}
