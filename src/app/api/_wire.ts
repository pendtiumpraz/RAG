import { wireWebhooks } from '@/modules/integrations/webhook.service';

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
}
