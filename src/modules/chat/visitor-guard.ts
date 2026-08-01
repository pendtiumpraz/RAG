import { decryptSecret } from '@/modules/core/crypto';
import type { EmbedChatbot } from '@/modules/core/db/tenant-context';
import { IdentitasDitolak, kanonPenanda } from './visitor-identity';

/**
 * Jembatan antara chatbot yang sudah di-resolve dan aturan murni di
 * `visitor-identity.ts`.
 *
 * Dipisah supaya aturannya tetap bisa diuji tanpa basis data, tanpa
 * enkripsi, dan tanpa HTTP — dan supaya ketiga jalur publik yang menyentuh
 * penanda pengunjung (chat, history, sessions) memakai jalan yang SAMA
 * PERSIS. Tiga salinan aturan keamanan adalah tiga tempat untuk lupa.
 */

/**
 * Penanda yang boleh dipakai menyimpan & mencari, atau `null` bila ditolak.
 *
 * Mengembalikan null alih-alih melempar karena ketiga pemanggilnya menjawab
 * hal yang berbeda pada penolakan: chat membalas 403, history & sessions
 * membalas daftar KOSONG — sengaja tak dibedakan dari "tak ada", supaya
 * endpointnya tak bisa dipakai memastikan sebuah penanda itu nyata.
 */
export function penandaSah(
  bot: Pick<EmbedChatbot, 'visitor_secret'>,
  visitorId: string | null | undefined,
  visitorSig: string | null | undefined,
): string | null {
  try {
    return kanonPenanda({
      visitorId,
      visitorSig,
      /* Didekripsi HANYA saat tanda tangan benar-benar dikirim. Chatbot
         tanpa identitas suntikan — mayoritasnya — tak membayar biaya
         dekripsi apa pun di jalur permintaannya. */
      rahasia: visitorSig && bot.visitor_secret ? decryptSecret(bot.visitor_secret) : null,
    });
  } catch (e) {
    if (e instanceof IdentitasDitolak) return null;
    /* Galat dekripsi (kunci enkripsi berubah / data rusak) BUKAN penolakan
       identitas — ia kerusakan konfigurasi, dan menelannya di sini akan
       membuat seluruh riwayat pelanggan diam-diam tak terjangkau tanpa satu
       pun jejak. */
    throw e;
  }
}
