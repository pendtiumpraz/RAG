/**
 * RENTANG TANGGAL untuk analitik.
 *
 * Dipisah dari service supaya bisa diuji tanpa basis data — dan karena
 * kesalahannya bukan kesalahan yang melempar. Rentang yang salah tetap
 * mengembalikan angka; angkanya saja yang keliru, dan tak ada yang tahu.
 */

/** Batas atas jendela. Jendela lebar memindai `messages` yang terus tumbuh. */
export const MAKS_HARI = 365;

export interface Rentang {
  /** Awal jendela, inklusif (ISO). */
  awal: string;
  /** Akhir jendela, EKSKLUSIF (ISO) — lihat catatan di bawah. */
  akhir: string;
  /** Panjang jendela dalam hari, untuk ditampilkan. */
  hari: number;
  /** Tanggal akhir yang DITAMPILKAN ke pengguna (inklusif, YYYY-MM-DD). */
  akhirTampil: string;
}

const HARI_MS = 86_400_000;
const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

function hariAwal(iso: string): number {
  return Date.parse(`${iso}T00:00:00.000Z`);
}

/**
 * Susun rentang dari parameter yang dikirim peramban.
 *
 * `dari`/`sampai` berbentuk YYYY-MM-DD dan dibaca sebagai UTC. `sampai`
 * bersifat INKLUSIF bagi pengguna — orang yang memilih 1–31 Juli bermaksud
 * ikut menghitung tanggal 31 — sementara kueri memakai `< akhir`, jadi
 * batasnya digeser satu hari ke depan. Tanpa pergeseran itu laporan diam-diam
 * kehilangan hari terakhir, dan itu justru hari yang paling sering dilihat.
 *
 * Tanpa `dari`/`sampai`, jatuh kembali ke `hari` terakhir (perilaku lama).
 */
export function susunRentang(
  p: { dari?: string | null; sampai?: string | null; hari?: string | number | null },
  sekarangMs: number,
): Rentang {
  const dari = p.dari?.trim() || '';
  const sampai = p.sampai?.trim() || '';

  if (dari && sampai) {
    if (!TANGGAL.test(dari) || !TANGGAL.test(sampai)) {
      throw new Error('Tanggal harus berbentuk YYYY-MM-DD');
    }
    const a = hariAwal(dari), b = hariAwal(sampai);
    if (Number.isNaN(a) || Number.isNaN(b)) throw new Error('Tanggal tidak sah');
    /* Terbalik DITOLAK, bukan ditukar diam-diam. Menukarnya akan mengubah
       laporan yang salah ketik jadi laporan yang terlihat benar, dan orang
       yang membawanya ke rapat takkan pernah tahu ia memilih rentang lain. */
    if (b < a) throw new Error('Tanggal akhir mendahului tanggal awal');

    const hari = Math.round((b - a) / HARI_MS) + 1;
    if (hari > MAKS_HARI) throw new Error(`Rentang maksimal ${MAKS_HARI} hari`);
    return { awal: new Date(a).toISOString(), akhir: new Date(b + HARI_MS).toISOString(), hari, akhirTampil: sampai };
  }

  /* Satu ujung saja tidak cukup: menebak ujung yang lain berarti mengarang
     separuh rentang yang diminta pengguna. */
  if (dari || sampai) throw new Error('Isi kedua tanggal, atau kosongkan keduanya');

  const mentah = Number(p.hari ?? 30);
  const hari = Number.isFinite(mentah) ? Math.min(Math.max(Math.trunc(mentah), 1), MAKS_HARI) : 30;
  const akhirMs = sekarangMs;
  return {
    awal: new Date(akhirMs - hari * HARI_MS).toISOString(),
    akhir: new Date(akhirMs).toISOString(),
    hari,
    akhirTampil: new Date(akhirMs).toISOString().slice(0, 10),
  };
}

/** Tanggal awal untuk ditampilkan (YYYY-MM-DD). */
export function awalTampil(r: Rentang): string {
  return r.awal.slice(0, 10);
}
