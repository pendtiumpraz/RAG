import { eq } from 'drizzle-orm';
import { db, platformSettings } from '@/modules/core/db';
import { encryptSecret, decryptSecret } from '@/modules/core/crypto';
import { audit } from '@/modules/core/guardrails';

/**
 * MAILER — SMTP dikonfigurasi SUPERADMIN dari database (D13), bukan env.
 * Gmail + App Password langsung jalan (smtp.gmail.com:465 secure).
 *
 * Sadar-gagal di kedua arah:
 *  • SMTP belum diisi  → isConfigured() false; SEMUA alur yang butuh email
 *    berjalan seperti sebelum fitur ini ada (tanpa paksa verifikasi) —
 *    on-prem tanpa mail server tidak rusak.
 *  • Kirim gagal       → dicatat, TIDAK melempar; pendaftaran/approval tak
 *    boleh mati hanya karena SMTP sedang rewel.
 */

export interface SmtpConfig {
  host: string; port: number; secure: boolean;
  user: string; fromName: string; fromEmail: string;
}

const TTL = 30_000;
let cache: { value: (SmtpConfig & { password: string }) | null; at: number } | null = null;

async function getConfig(): Promise<(SmtpConfig & { password: string }) | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.value;
  let value: (SmtpConfig & { password: string }) | null = null;
  try {
    const row = (await db.select().from(platformSettings)
      .where(eq(platformSettings.id, 1)).limit(1))[0];
    const c = row?.smtpConfig as Record<string, unknown> | null;
    if (c?.host && c?.user && row?.encryptedSmtpPassword) {
      value = {
        host: String(c.host), port: Number(c.port) || 465,
        secure: c.secure !== false, user: String(c.user),
        fromName: String(c.fromName || 'Nalar'),
        fromEmail: String(c.fromEmail || c.user),
        password: decryptSecret(row.encryptedSmtpPassword),
      };
    }
  } catch (err) { console.error('[mailer] gagal baca config:', err); }
  cache = { value, at: Date.now() };
  return value;
}

/**
 * Loloskan teks yang akan masuk ke HTML email.
 *
 * ADA KARENA email peringatan memuat teks yang TIDAK kita tulis: nama berkas
 * dari Drive, pesan galat dari server upstream, nilai konteks apa pun yang
 * dititipkan pemanggil `terbitkanPeringatan`. Seluruh email lain di berkas ini
 * hanya menempelkan kalimat tetap dan token yang bentuknya kita jamin, jadi
 * kebutuhannya baru muncul sekarang — dan justru itu yang membuatnya mudah
 * terlewat. Klien email memang tak menjalankan script, tapi markup yang bocor
 * cukup untuk merusak tata letak atau menyelundupkan tautan palsu ke dalam
 * pesan yang tampak resmi.
 */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Kerangka email branded — inline style (klien email tak membaca CSS luar). */
function layout(title: string, bodyHtml: string, ctaLabel?: string, ctaUrl?: string): string {
  return `<!doctype html><body style="margin:0;padding:32px 16px;background:#F1F5F9;font-family:Segoe UI,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%">
    <tr><td style="padding:0 4px 14px;font-size:18px;font-weight:800;letter-spacing:-.02em;color:#0F172A">Nalar</td></tr>
    <tr><td style="background:#ffffff;border:1px solid #D8E0EA;border-radius:12px;padding:28px">
      <h1 style="margin:0 0 12px;font-size:20px;letter-spacing:-.01em;color:#0F172A">${title}</h1>
      <div style="font-size:14.5px;line-height:1.7;color:#475569">${bodyHtml}</div>
      ${ctaLabel && ctaUrl ? `<div style="margin-top:22px"><a href="${ctaUrl}"
        style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;
        font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px">${ctaLabel}</a></div>
        <p style="margin:16px 0 0;font-size:12px;color:#8494A8;word-break:break-all">
        Tombol tidak berfungsi? Salin tautan ini: ${ctaUrl}</p>` : ''}
    </td></tr>
    <tr><td style="padding:14px 4px 0;font-size:11px;color:#8494A8;font-family:Consolas,monospace">
      NALAR · REASONING, SOURCED · email otomatis, tak perlu dibalas</td></tr>
  </table></td></tr></table></body>`;
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const cfg = await getConfig();
  if (!cfg) return false;
  try {
    const nodemailer = (await import('nodemailer')).default;
    const t = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.password },
    });
    await t.sendMail({ from: `"${cfg.fromName}" <${cfg.fromEmail}>`, to, subject, html });
    return true;
  } catch (err) {
    console.error('[mailer] kirim gagal:', (err as Error).message);
    return false;
  }
}

const base = () => (process.env.NEXTAUTH_URL ?? '').replace(/\/+$/, '');

export const mailerService = {
  async isConfigured(): Promise<boolean> { return !!(await getConfig()); },
  invalidate() { cache = null; },

  /** Simpan config (superadmin). Password kosong = pertahankan tersimpan. */
  async saveConfig(actor: { id: string; tenantId: string }, input: {
    config: Omit<SmtpConfig, 'port' | 'secure'> & { port: number; secure: boolean };
    password?: string;
  }): Promise<void> {
    await db.insert(platformSettings).values({ id: 1 }).onConflictDoNothing();
    await db.update(platformSettings).set({
      smtpConfig: input.config as unknown as Record<string, string | number | boolean>,
      ...(input.password?.trim() ? { encryptedSmtpPassword: encryptSecret(input.password) } : {}),
      updatedAt: new Date(),
    }).where(eq(platformSettings.id, 1));
    cache = null;
    await audit(actor.tenantId, actor.id, 'platform.smtp_saved', 'platform', { host: input.config.host });
  },

  sendTest(to: string): Promise<boolean> {
    return send(to, 'Uji SMTP Nalar berhasil',
      layout('SMTP tersambung', 'Konfigurasi email platform Nalar-mu bekerja. Verifikasi pendaftar, persetujuan akun, undangan tim, dan reset password kini terkirim otomatis.'));
  },

  sendVerification(to: string, token: string): Promise<boolean> {
    const url = `${base()}/verify-email?token=${token}`;
    return send(to, 'Verifikasi email — Nalar',
      layout('Satu klik lagi',
        'Terima kasih sudah mendaftar di <b>Nalar</b>. Klik tombol di bawah untuk membuktikan email ini milikmu — setelah itu pendaftaranmu masuk antrean persetujuan admin.<br><br>Tautan berlaku 24 jam.',
        'Verifikasi email', url));
  },

  sendApproved(to: string): Promise<boolean> {
    return send(to, 'Akunmu disetujui — Nalar',
      layout('Selamat datang di Nalar',
        'Pendaftaranmu sudah <b>disetujui</b>. Silakan masuk dan mulai hubungkan dokumen organisasimu.',
        'Masuk sekarang', `${base()}/auth`));
  },

  sendInvitation(to: string, orgName: string, token: string): Promise<boolean> {
    const url = `${base()}/invite/${token}`;
    return send(to, `Undangan bergabung ke ${orgName} — Nalar`,
      layout(`Kamu diundang ke ${orgName}`,
        `Seseorang mengundangmu bergabung ke workspace <b>${orgName}</b> di Nalar. Undangan berlaku 7 hari dan sekali pakai.`,
        'Terima undangan', url));
  },

  /**
   * Peringatan operasional ke alamat yang dipilih tenant (kartu
   * a-alert-channels).
   *
   * Subjeknya MENYEBUT jenis kerusakannya, bukan sekadar "Peringatan Nalar":
   * email peringatan dibaca dari daftar masuk yang penuh, sering di ponsel,
   * dan yang menentukan apakah ia dibuka sekarang atau nanti adalah barisnya
   * sendiri. Konteks mesin ikut dilampirkan supaya penerimanya tak perlu
   * membuka dasbor untuk tahu sumber mana yang rusak.
   */
  sendAlert(to: string, p: {
    jenis: string; tingkat: string; pesan: string; konteks?: Record<string, unknown>;
  }): Promise<boolean> {
    const ikon = p.tingkat === 'gawat' ? '🔴' : '🟡';
    const rinci = Object.entries(p.konteks ?? {})
      .filter(([, v]) => v != null && typeof v !== 'object')
      .slice(0, 8)
      .map(([k, v]) => `<li><b>${esc(k)}</b>: ${esc(String(v))}</li>`)
      .join('');
    return send(to, `${ikon} ${p.jenis} — peringatan Nalar`,
      layout(`Peringatan: ${esc(p.jenis)}`,
        `${esc(p.pesan)}${rinci ? `<br><br><ul style="margin:0;padding-left:18px">${rinci}</ul>` : ''}`
        + '<br><br>Kamu menerima ini karena alamat ini terdaftar sebagai saluran peringatan '
        + 'workspace. Ubah atau matikan di Settings → Peringatan.',
        'Buka Observability', `${base()}/observability`));
  },

  sendPasswordReset(to: string, token: string): Promise<boolean> {
    const url = `${base()}/auth/reset?token=${token}`;
    return send(to, 'Atur ulang password — Nalar',
      layout('Atur ulang password',
        'Ada permintaan atur ulang password untuk akun ini. Bila itu bukan kamu, abaikan email ini — tak ada yang berubah.<br><br>Tautan berlaku 1 jam.',
        'Atur password baru', url));
  },
};
