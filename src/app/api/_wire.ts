import { wireWebhooks } from '@/modules/integrations/webhook.service';
import { wireAlertChannels } from '@/modules/integrations/alert-channels.service';
import { barisLogLisensi, periksaLisensi } from '@/modules/core/lisensi';

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
  lapurLisensiSekali();
}

let lisensiDilaporkan = false;
/**
 * Satu baris lisensi di log, sekali per proses.
 *
 * Pemasangan on-premise tak punya siapa pun yang membuka konsol pada hari
 * biasa. Baris log saat proses menyala adalah satu-satunya tempat lisensi yang
 * hampir habis pasti terlihat oleh tim IT yang sedang menyalakan ulang layanan
 * — yaitu satu-satunya orang di sana yang bisa menindaklanjutinya.
 *
 * DIAM SEPENUHNYA di SaaS: `periksaLisensi` mengembalikan 'tak-berlaku', dan
 * `barisLogLisensi` mengembalikan null. Log produksi yang memuat baris tak
 * berguna pada tiap permintaan adalah log yang berhenti dibaca.
 */
function lapurLisensiSekali(): void {
  if (lisensiDilaporkan) return;
  lisensiDilaporkan = true;
  const baris = barisLogLisensi(periksaLisensi());
  if (baris) console.log(baris);
}
