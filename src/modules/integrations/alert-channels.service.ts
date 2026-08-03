import { eq } from 'drizzle-orm';
import { db } from '@/modules/core/db';
import { tenantSettings } from '@/modules/core/db/schema';
import { decryptSecret, encryptSecret } from '@/modules/core/crypto';
import { on } from '@/modules/core/events';
import { audit } from '@/modules/core/guardrails';
import { assertPublicHttpUrl } from '@/modules/core/net';
import type { TingkatPeringatan } from '@/modules/core/alerts';

/**
 * SALURAN PERINGATAN LANGSUNG — email & Slack (kartu a-alert-channels).
 *
 * Peringatan sudah terbit dan sudah disebarkan ke webhook keluar sejak kartu
 * a-alerting. Yang tak tertutup di sana: pelanggan yang TIDAK punya sistem
 * penerima webhook, yaitu mayoritasnya. Bagi mereka sync yang gagal jam dua
 * pagi tetap tak memberi tahu siapa pun sampai ada yang kebetulan membuka
 * halaman Knowledge — dan pada saat itu dokumen sudah berhenti masuk berhari-
 * hari tanpa satu pun tanda.
 *
 * MENUMPANG BUS EVENT, bukan dipanggil dari core/alerts.ts. Aturan modular-
 * monolith: modul tak saling impor untuk side-effect. Bentuknya sama persis
 * dengan webhook keluar, dan langganannya dipasang dari rute lewat
 * `ensureIntegrations()` — kalau tidak, urutan pemuatan modul yang menentukan
 * apakah peringatan terkirim, dan gagalnya senyap.
 *
 * TIGA HAL YANG MENAHAN SALURAN INI TETAP LAYAK DIPERCAYA:
 *
 * 1. TIDAK MENGGAGALKAN APA PUN. Peringatan yang gagal terkirim tak boleh
 *    meledakkan sync yang sedang memicunya — kerusakan kedua yang menutupi
 *    kerusakan pertama. Tapi ia WAJIB berteriak di log.
 * 2. AMBANG TINGKAT. Bawaannya hanya 'gawat'. Tanpa itu, tiap kuota yang
 *    menyentuh 80% mengirim email, dan orang belajar menyaringnya ke folder
 *    sampah — termasuk yang kemudian benar-benar penting.
 * 3. URL SLACK DIPERIKSA SEBAGAI URL PIHAK KETIGA. Ia dipasok pengguna dan
 *    diketuk server kita, jadi tanpa penjagaan ia alat SSRF yang persis sama
 *    dengan webhook keluar. Penjagaannya memang dipakai bersama.
 */

/** Batas waktu ketukan Slack — kanal mati tak boleh menahan lambda. */
const TIMEOUT_MS = 8_000;

const URUTAN: Record<TingkatPeringatan, number> = { perhatian: 1, gawat: 2 };

export interface SaluranPeringatan {
  email: string | null;
  /** Hanya BOOLEAN yang keluar ke peramban — URL-nya kredensial. */
  slackTerpasang: boolean;
  minLevel: TingkatPeringatan;
}

/**
 * Layak kirim? Perbandingan tingkat, dipisah supaya bisa diuji tanpa DB.
 *
 * Nilai tingkat yang tak dikenal diperlakukan sebagai LAYAK KIRIM, bukan
 * diabaikan. Bila suatu hari ada tingkat baru yang lupa didaftarkan di sini,
 * akibat yang benar adalah peringatan yang terlalu berisik — bukan peringatan
 * yang diam-diam tak pernah sampai.
 */
export function layakKirim(tingkat: string, minLevel: string): boolean {
  const t = URUTAN[tingkat as TingkatPeringatan];
  const m = URUTAN[minLevel as TingkatPeringatan];
  if (t == null || m == null) return true;
  return t >= m;
}

/** Bentuk pesan Slack. Dipisah supaya isinya bisa diuji tanpa jaringan. */
export function pesanSlack(p: {
  jenis: string; tingkat: string; pesan: string; konteks?: Record<string, unknown>;
}): { text: string; blocks: unknown[] } {
  const ikon = p.tingkat === 'gawat' ? '🔴' : '🟡';
  const judul = `${ikon} Nalar — ${p.jenis}`;
  const rinci = Object.entries(p.konteks ?? {})
    .filter(([, v]) => v != null && typeof v !== 'object')
    .slice(0, 6)
    .map(([k, v]) => `• *${k}*: ${String(v)}`)
    .join('\n');
  return {
    /* `text` tetap diisi walau blocks ada: itulah yang dipakai Slack untuk
       pemberitahuan di ponsel dan daftar kanal. Mengosongkannya membuat
       peringatan tiba sebagai baris kosong di layar kunci. */
    text: `${judul}: ${p.pesan}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*${judul}*\n${p.pesan}` } },
      ...(rinci ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: rinci }] }] : []),
    ],
  };
}

async function bacaSaluran(tenantId: string) {
  const rows = await db.select({
    email: tenantSettings.alertEmail,
    slack: tenantSettings.encryptedSlackUrl,
    minLevel: tenantSettings.alertMinLevel,
  }).from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1);
  return rows[0] ?? null;
}

async function ketukSlack(url: string, body: unknown): Promise<void> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`Slack menolak: HTTP ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

export const alertChannelService = {
  /** Untuk UI. URL Slack TIDAK ikut keluar — hanya keterpasangannya. */
  async baca(tenantId: string): Promise<SaluranPeringatan> {
    const r = await bacaSaluran(tenantId);
    return {
      email: r?.email ?? null,
      slackTerpasang: Boolean(r?.slack),
      minLevel: (r?.minLevel as TingkatPeringatan) ?? 'gawat',
    };
  },

  /**
   * Simpan saluran.
   *
   * `slackUrl` undefined = jangan sentuh yang tersimpan; string kosong =
   * hapus. Dua makna yang berbeda, dan menyatukannya berarti setiap
   * penyimpanan form tanpa mengetik ulang URL akan diam-diam mencabutnya —
   * pola yang sama dengan password SMTP di mailer.service.
   */
  async simpan(actor: { id: string; tenantId: string }, input: {
    email?: string | null; slackUrl?: string | null; minLevel?: string;
  }): Promise<SaluranPeringatan> {
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (input.email !== undefined) {
      const e = (input.email ?? '').trim();
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        throw new Error('Alamat email peringatan tidak sah');
      }
      patch.alertEmail = e || null;
    }

    if (input.slackUrl !== undefined) {
      const u = (input.slackUrl ?? '').trim();
      if (!u) patch.encryptedSlackUrl = null;
      else {
        /* Penjagaan yang SAMA dengan webhook keluar — bukan salinannya.
           Loopback diizinkan supaya on-premise bisa menguji ke penerima di
           jaringannya sendiri. */
        const bersih = assertPublicHttpUrl(u, { allowLoopback: true, label: 'URL Slack' });
        patch.encryptedSlackUrl = encryptSecret(bersih);
      }
    }

    if (input.minLevel !== undefined) {
      if (!(input.minLevel in URUTAN)) throw new Error('Tingkat peringatan tidak dikenal');
      patch.alertMinLevel = input.minLevel;
    }

    await db.insert(tenantSettings).values({ tenantId: actor.tenantId }).onConflictDoNothing();
    await db.update(tenantSettings).set(patch)
      .where(eq(tenantSettings.tenantId, actor.tenantId));

    await audit(actor.tenantId, actor.id, 'alerts.channels_saved', 'settings', {
      email: patch.alertEmail !== undefined ? Boolean(patch.alertEmail) : 'tak diubah',
      slack: patch.encryptedSlackUrl !== undefined ? Boolean(patch.encryptedSlackUrl) : 'tak diubah',
      minLevel: patch.alertMinLevel ?? 'tak diubah',
    });
    return this.baca(actor.tenantId);
  },

  /**
   * Kirim satu peringatan ke saluran langsung tenant.
   *
   * Mengembalikan APA yang benar-benar terkirim, bukan boolean — supaya
   * "tak ada saluran terpasang" bisa dibedakan dari "terpasang tapi gagal".
   * Menyatukan keduanya adalah cara paling rapi membuat pemantauan mati tanpa
   * ada yang tahu, dan pelajaran itu sudah dibayar sekali di core/alerts.ts.
   */
  async kirim(tenantId: string, p: {
    jenis: string; tingkat: string; pesan: string; konteks?: Record<string, unknown>;
  }): Promise<{ email: boolean; slack: boolean; dilewati: boolean }> {
    const hasil = { email: false, slack: false, dilewati: false };
    const r = await bacaSaluran(tenantId);
    if (!r) return { ...hasil, dilewati: true };
    if (!layakKirim(p.tingkat, r.minLevel)) return { ...hasil, dilewati: true };

    if (r.email) {
      try {
        const { mailerService } = await import('@/modules/mail/mailer.service');
        hasil.email = await mailerService.sendAlert(r.email, p);
      } catch (e) {
        console.error(`[alerts] email peringatan gagal utk tenant ${tenantId}:`, e);
      }
    }

    if (r.slack) {
      try {
        await ketukSlack(decryptSecret(r.slack), pesanSlack(p));
        hasil.slack = true;
      } catch (e) {
        console.error(`[alerts] Slack peringatan gagal utk tenant ${tenantId}:`, e);
      }
    }
    return hasil;
  },

  /** Uji saluran tanpa menunggu ada yang benar-benar rusak. */
  async uji(tenantId: string) {
    return this.kirim(tenantId, {
      jenis: 'uji.saluran',
      /* Sengaja 'gawat': uji yang tak sampai karena ambangnya menyaringnya
         akan terbaca sebagai saluran yang rusak, dan orang akan mencabut
         konfigurasi yang sebenarnya benar. */
      tingkat: 'gawat',
      pesan: 'Ini uji saluran peringatan. Kalau kamu membaca ini, peringatan sungguhan akan sampai lewat jalur yang sama.',
      konteks: { uji: true },
    });
  },
};

/* ── langganan bus event ────────────────────────────────────────────── */

let wired = false;
/**
 * Dipasang sekali, dari rute — sama alasannya dengan `wireWebhooks()`:
 * `instrumentation.ts` ikut dikompilasi untuk runtime Edge (tanpa `postgres`
 * dan `node:crypto`), dan impor silang untuk side-effect melanggar aturan
 * modular-monolith.
 */
export function wireAlertChannels(): void {
  if (wired) return;
  wired = true;
  on('alert.raised', async (p) => {
    if (!p?.tenantId) return;
    try { await alertChannelService.kirim(p.tenantId, p); }
    catch (e) { console.error('[alerts] saluran langsung gagal:', e); }
  });
}
