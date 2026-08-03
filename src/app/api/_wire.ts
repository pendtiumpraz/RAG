import { wireWebhooks } from '@/modules/integrations/webhook.service';
import { wireAlertChannels } from '@/modules/integrations/alert-channels.service';

/**
 * Pemasangan langganan lintas-modul, dipanggil dari RUTE.
 *
 * Webhook keluar mendengarkan bus event in-process, jadi langganannya harus
 * sudah terpasang sebelum event pertama diterbitkan. Tiga jalan sempat dicoba
 * dan dua di antaranya salah:
 *
 *  • `instrumentation.ts` — alat yang paling tepat secara konsep (jalan sekali
 *    per proses), TAPI Next.js ikut mengompilasinya untuk runtime Edge, dan
 *    di sana `postgres` + `node:crypto` tak ada. Build gagal total.
 *  • Impor silang dari modul yang menerbitkan event — melanggar aturan
 *    modular-monolith: modul tak saling impor untuk side-effect.
 *
 * Yang tersisa, dan memang benar: RUTE adalah lapisan komposisi, jadi di
 * situlah wiring dipasang. Pemanggilannya idempotent dan hanya memeriksa satu
 * boolean, jadi aman diletakkan di jalur terpanas sekalipun.
 *
 * WAJIB dipanggil oleh setiap rute yang (langsung atau lewat service) men-
 * dispatch salah satu WEBHOOK_EVENTS. Tanpa itu kejadiannya hilang tanpa
 * jejak — dan gagalnya senyap, yang jauh lebih buruk daripada galat.
 */
export function ensureIntegrations(): void {
  wireWebhooks();
  /* Saluran langsung mendengarkan bus yang SAMA (`alert.raised`). Dipasang di
     sini bersama webhook, bukan di tempatnya sendiri: dua titik pemasangan
     berarti satu di antaranya akan lupa dipanggil oleh rute berikutnya, dan
     gagalnya senyap — peringatan yang tak pernah dikirim tak menimbulkan
     galat apa pun. */
  wireAlertChannels();
}
