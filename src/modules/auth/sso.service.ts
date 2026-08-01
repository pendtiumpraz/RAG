import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, ssoConnections } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { decryptSecret, encryptSecret } from '@/modules/core/crypto';
import { audit } from '@/modules/core/guardrails';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import {
  issuerDari, normalDomain, KonfigurasiSsoDitolak, type JenisSso,
} from './sso';

/**
 * KONEKSI SSO PER TENANT (D16).
 *
 * Aturan murninya di `sso.ts`; berkas ini yang menyimpan dan mencarinya.
 */

export interface KoneksiSso {
  id: string; tenantId: string; kind: JenisSso;
  issuer: string; clientId: string; domain: string; enabled: boolean;
}

/** Bentuk yang boleh dilihat dasbor — TANPA client secret, bahkan ciphertextnya. */
function tampak(r: typeof ssoConnections.$inferSelect): KoneksiSso {
  return {
    id: r.id, tenantId: r.tenantId, kind: r.kind as JenisSso,
    issuer: r.issuer, clientId: r.clientId, domain: r.domain, enabled: r.enabled,
  };
}

export const ssoService = {
  list(tenantId: string): Promise<KoneksiSso[]> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx.select().from(ssoConnections)
        .where(and(eq(ssoConnections.tenantId, tenantId), isNull(ssoConnections.deletedAt)));
      return rows.map(tampak);
    });
  },

  async simpan(tenantId: string, aktorId: string, input: {
    kind: JenisSso; isian: string; clientId: string; clientSecret: string; domain: string;
  }): Promise<KoneksiSso> {
    /* Diturunkan & divalidasi SEBELUM menyentuh basis data: konfigurasi yang
       tak sah tak boleh sempat tersimpan, karena baris yang tersimpan akan
       dipakai jalur login dan gagalnya baru terlihat pada orang yang sedang
       mencoba masuk. */
    let issuer: string; let domain: string;
    try {
      issuer = issuerDari(input.kind, input.isian);
      domain = normalDomain(input.domain);
    } catch (e) {
      if (e instanceof KonfigurasiSsoDitolak) throw new ValidationError(e.message);
      throw e;
    }
    if (!input.clientId.trim() || !input.clientSecret.trim()) {
      throw new ValidationError('Client ID dan client secret wajib diisi');
    }

    const dibuat = await withTenant(tenantId, async (tx) => {
      try {
        const [row] = await tx.insert(ssoConnections).values({
          tenantId, kind: input.kind, issuer,
          clientId: input.clientId.trim(),
          clientSecret: encryptSecret(input.clientSecret),
          domain, enabled: true,
        }).returning();
        return row;
      } catch (e) {
        /* Indeks unik GLOBAL yang menolak. Pesannya harus menyebut sebab
           sebenarnya: pemeriksaan di aplikasi tak pernah bisa melihat baris
           tenant lain (RLS), jadi tanpa terjemahan ini pelanggan cuma melihat
           galat basis data mentah pada domain yang menurut layarnya bebas. */
        if (String((e as { message?: string }).message ?? '').includes('uq_sso_connections_domain')) {
          throw new ValidationError(
            `Domain ${domain} sudah dipakai koneksi SSO lain. Satu domain hanya boleh menunjuk satu identity provider.`);
        }
        throw e;
      }
    });

    /* audit() membuka withTenant SENDIRI — di luar transaksi, selalu. */
    await audit(tenantId, aktorId, 'sso.connection_created', 'auth', { kind: input.kind, domain });
    return tampak(dibuat);
  },

  async hapus(tenantId: string, aktorId: string, id: string): Promise<void> {
    await withTenant(tenantId, async (tx) => {
      const rows = await tx.update(ssoConnections)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(ssoConnections.id, id), isNull(ssoConnections.deletedAt)))
        .returning({ id: ssoConnections.id });
      if (!rows[0]) throw new ValidationError('Koneksi SSO tidak ditemukan');
    });
    await audit(tenantId, aktorId, 'sso.connection_removed', 'auth', { id });
  },

  /**
   * Cari koneksi dari domain email — DI LUAR konteks tenant.
   *
   * Orang yang sedang mencoba masuk belum punya tenant; itulah keadaan yang
   * membuat pencarian ini ada. Karena `sso_connections` FORCE RLS, query
   * biasa di sini mengembalikan NOL BARIS tanpa galat apa pun, dan SSO akan
   * tampak "tak pernah menemukan koneksi" tanpa satu pun petunjuk.
   *
   * Dibuka lewat GUC `app.sso_context`, yang HANYA diset di sini — sama
   * seperti escape hatch login lintas tenant dan resolusi widget publik.
   * Kebijakannya hanya SELECT dan hanya baris yang `enabled`, jadi konteks
   * ini tak bisa menulis apa pun dan koneksi yang dimatikan tak bisa dipakai
   * masuk.
   */
  async resolveByDomain(domain: string): Promise<{
    id: string; tenantId: string; kind: JenisSso; issuer: string;
    clientId: string; clientSecret: string; domain: string;
  } | null> {
    let d: string;
    try { d = normalDomain(domain); } catch { return null; }

    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.sso_context', 'domain_lookup', true)`);
      return tx.select().from(ssoConnections)
        .where(and(
          sql`lower(${ssoConnections.domain}) = ${d}`,
          eq(ssoConnections.enabled, true),
          isNull(ssoConnections.deletedAt),
        )).limit(1);
    });

    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id, tenantId: r.tenantId, kind: r.kind as JenisSso, issuer: r.issuer,
      clientId: r.clientId,
      /* Didekripsi hanya di sini, dan hanya untuk dipakai server menukar kode
         otorisasi. Tak pernah dikembalikan ke pemanggil HTTP mana pun. */
      clientSecret: decryptSecret(r.clientSecret),
      domain: r.domain,
    };
  },

  /** Dipakai jalur login setelah kuki menyebut koneksi mana yang dipilih. */
  async resolveById(id: string) {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.sso_context', 'domain_lookup', true)`);
      return tx.select().from(ssoConnections)
        .where(and(eq(ssoConnections.id, id), eq(ssoConnections.enabled, true),
          isNull(ssoConnections.deletedAt))).limit(1);
    });
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id, tenantId: r.tenantId, kind: r.kind as JenisSso, issuer: r.issuer,
      clientId: r.clientId, clientSecret: decryptSecret(r.clientSecret), domain: r.domain,
    };
  },
};
