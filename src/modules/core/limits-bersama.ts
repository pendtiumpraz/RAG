import { sql } from 'drizzle-orm';
import { db } from './db';
import { rateLimit, type RateResult } from './limits';

/**
 * EMBER TOKEN BERSAMA — penghitung laju yang berlaku lintas instance.
 *
 * MASALAH YANG DIPERBAIKI. `rateLimit()` di limits.ts menyimpan embernya di
 * MEMORI proses. Di Vercel tiap lambda punya memorinya sendiri, jadi batas
 * yang dijanjikan berlipat sebanyak instance yang hidup: burst 5 untuk paket
 * gratis menjadi 50 saat sepuluh lambda melayani bersamaan. Yang paling
 * terluka bukan endpoint chat melainkan endpoint AUTH — signup, forgot,
 * reset, login-status, invite-accept semuanya dibatasi per IP lewat ember
 * yang sama, dan perlindungan tebak-sandi yang N kali lebih longgar dari
 * yang tertulis adalah lubang keamanan, bukan sekadar kuota meleset.
 *
 * DUA LAPIS, DAN URUTANNYA MENENTUKAN.
 *   1. ember MEMORI diperiksa lebih dulu. Permintaan yang sudah jelas
 *      melewati batas ditolak TANPA menyentuh basis data sama sekali —
 *      dan justru serangan bertubi-tubilah yang paling banyak menghasilkan
 *      penolakan, jadi lapisan inilah yang menahan beban terberat.
 *   2. ember POSTGRES memutuskan sisanya. Satu perjalanan tambahan ke jalur
 *      yang di endpoint chat sudah menempuh dua sebelum ini.
 *
 * GAGAL-TERBUKA, dan itu keputusan sadar. Bila basis data tak terjangkau,
 * permintaannya DILOLOSKAN — ember memori tetap menjaga. Penghitung laju
 * yang gagal-tertutup mengubah gangguan basis data jadi pemadaman total:
 * chatbot berhenti menjawab bukan karena disalahgunakan, melainkan karena
 * penjaganya sendiri sedang sakit. Dari dua cara gagal, membiarkan batas
 * kembali longgar sesaat jauh lebih murah daripada mematikan produk.
 */

/** Batas bawah token — mencegah ember menumpuk utang tak berhingga. */
export const LANTAI_TOKEN = -1;
/** Baris seusia ini dianggap mati dan dipangkas fisik. */
export const UMUR_MATI_DETIK = 3_600;
/** Sesering apa pemangkasan boleh dicoba, per instance. */
export const JEDA_PANGKAS_MS = 300_000;

/**
 * Berapa detik lagi sampai satu token tersedia lagi.
 *
 * Dihitung dari sisa token SETELAH pengurangan. Sisa -0,4 berarti kurang 0,4
 * token; pada laju 0,2/detik itu 2 detik. Dibulatkan ke ATAS dan minimal 1:
 * `Retry-After: 0` mengundang klien mencoba lagi seketika, dan itu justru
 * memperbesar beban yang sedang ditahan.
 */
export function detikTunggu(sisaToken: number, refillPerSec: number): number {
  if (refillPerSec <= 0) return 60;
  return Math.max(1, Math.ceil(-sisaToken / refillPerSec));
}

/**
 * Apakah ember bersama perlu dipakai sama sekali.
 *
 * Pemasangan on-premise berjalan sebagai SATU proses; di sana ember memori
 * sudah benar seluruhnya, dan perjalanan tambahan ke basis data cuma beban
 * tanpa manfaat. Bisa juga dimatikan lewat env bila suatu saat perlu.
 */
export function pakaiEmberBersama(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.RATE_LIMIT_BERSAMA === 'off') return false;
  if (env.RATE_LIMIT_BERSAMA === 'on') return true;
  return env.DEPLOYMENT_MODE !== 'onprem';
}

let pangkasTerakhir = 0;

/**
 * Ambil satu token dari ember bersama.
 *
 * SATU PERNYATAAN SQL, dan itu bukan kerapian melainkan syarat kebenaran:
 * baca-lalu-tulis dalam dua langkah membuat dua lambda yang datang bersamaan
 * sama-sama membaca sisa yang sama dan sama-sama merasa berhak — persis
 * kondisi balapan yang membuat batasnya kembali berlipat, dan justru itulah
 * yang hendak diperbaiki.
 *
 * Pengisian ulang dihitung DI DALAM basis data dari selisih waktunya
 * sendiri, bukan dari jam aplikasi: sepuluh lambda punya sepuluh jam yang
 * tak pernah persis sama, dan selisih beberapa ratus milidetik sudah cukup
 * membuat ember terisi dua kali untuk satu detik yang sama.
 */
export async function ambilTokenBersama(
  key: string, burst: number, refillPerSec: number,
): Promise<RateResult> {
  const rows = await db.execute(sql`
    insert into rate_buckets as b (key, tokens, last_at)
    values (${key}, ${burst - 1}::double precision, now())
    on conflict (key) do update set
      tokens = greatest(${LANTAI_TOKEN}::double precision,
        least(${burst}::double precision,
          b.tokens + extract(epoch from (now() - b.last_at)) * ${refillPerSec}::double precision)
        - 1),
      last_at = now()
    returning tokens`);

  const sisa = Number((rows as unknown as Array<{ tokens: number }>)[0]?.tokens ?? 0);
  return sisa >= 0
    ? { ok: true, retryAfterSec: 0 }
    : { ok: false, retryAfterSec: detikTunggu(sisa, refillPerSec) };
}

/**
 * Pangkas baris mati — FISIK, bukan soft delete.
 *
 * Tabel ini satu-satunya dari 32 yang dikecualikan dari aturan soft delete
 * (disetujui pemilik produk, 1 Agu 2026): ember kedaluwarsa tak menjawab
 * pertanyaan apa pun, dan menyimpannya membuat tabel tumbuh tanpa batas
 * sehingga memperlambat justru hal yang ia jaga.
 *
 * Dijalankan menumpang permintaan biasa, paling sering tiap lima menit per
 * instance, dan galatnya DITELAN: pemangkasan yang gagal tak boleh menjadi
 * sebab satu pun permintaan pengguna ditolak.
 */
export async function pangkasEmberMati(sekarangMs: number): Promise<void> {
  if (sekarangMs - pangkasTerakhir < JEDA_PANGKAS_MS) return;
  pangkasTerakhir = sekarangMs;
  try {
    await db.execute(sql`
      delete from rate_buckets
      where last_at < now() - make_interval(secs => ${UMUR_MATI_DETIK})`);
  } catch { /* diam: kebersihan tak boleh mengalahkan ketersediaan */ }
}

/**
 * Penghitung laju yang sebenarnya dipakai rute — ember memori DULU, lalu
 * ember bersama.
 */
export async function rateLimitBersama(
  key: string, burst: number, refillPerSec: number,
): Promise<RateResult> {
  const lokal = rateLimit(key, burst, refillPerSec);
  if (!lokal.ok) return lokal;
  if (!pakaiEmberBersama()) return lokal;

  try {
    const hasil = await ambilTokenBersama(key, burst, refillPerSec);
    void pangkasEmberMati(Date.now());
    return hasil;
  } catch {
    /* GAGAL-TERBUKA. Ember memori sudah meloloskannya, dan penghitung laju
       yang mematikan produk saat basis data terganggu adalah obat yang lebih
       buruk daripada penyakitnya. */
    return lokal;
  }
}
