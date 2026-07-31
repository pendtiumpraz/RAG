/**
 * KONTRAS WARNA — WCAG 2.1 (1.4.3 Contrast Minimum, 1.4.11 Non-text Contrast).
 *
 * Ada karena angka rasio di `nalar-ds.css` selama ini ditulis sebagai KOMENTAR
 * ("7.5:1 AAA") dan tak pernah dihitung ulang. Komentar tak ikut berubah saat
 * warnanya diubah, jadi ia berhenti benar tanpa memberi tanda apa pun — dan
 * kepatuhan aksesibilitas justru hal yang diminta tertulis dalam pengadaan
 * institusi.
 *
 * Rumusnya dari spesifikasi, bukan perkiraan: luminansi relatif dengan koreksi
 * gamma sRGB, lalu (L_terang + 0,05) / (L_gelap + 0,05).
 */

/** Ambang WCAG AA untuk teks berukuran biasa. */
export const AA_TEKS = 4.5;
/** AA untuk teks besar (≥18,66px tebal atau ≥24px) dan komponen antarmuka. */
export const AA_BESAR = 3;

export interface Rgb { r: number; g: number; b: number }

/**
 * Baca `#rgb`, `#rrggbb`, atau `rgb(a, b, c)`.
 *
 * Mengembalikan null — bukan hitam — untuk yang tak terbaca. Memulangkan
 * hitam diam-diam akan membuat warna yang salah tulis lolos sebagai kontras
 * sempurna, yaitu kebalikan persis dari gunanya modul ini.
 */
export function bacaWarna(s: string): Rgb | null {
  const t = s.trim().toLowerCase();
  const heks = t.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (heks) {
    const h = heks[1];
    const p = h.length === 3
      ? [h[0] + h[0], h[1] + h[1], h[2] + h[2]]
      : [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)];
    return { r: parseInt(p[0], 16), g: parseInt(p[1], 16), b: parseInt(p[2], 16) };
  }
  const rgb = t.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (rgb) {
    const n = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    if (n.some((x) => x > 255)) return null;
    return { r: n[0], g: n[1], b: n[2] };
  }
  return null;
}

/** Luminansi relatif sRGB (WCAG 2.1). */
export function luminansi({ r, g, b }: Rgb): number {
  const k = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
}

/** Rasio kontras dua warna. Selalu ≥ 1, dan urutan argumen tak berpengaruh. */
export function rasio(a: Rgb, b: Rgb): number {
  const la = luminansi(a), lb = luminansi(b);
  const terang = Math.max(la, lb), gelap = Math.min(la, lb);
  return (terang + 0.05) / (gelap + 0.05);
}

/** Rasio dari dua string warna; melempar bila salah satunya tak terbaca. */
export function rasioWarna(depan: string, belakang: string): number {
  const a = bacaWarna(depan), b = bacaWarna(belakang);
  if (!a) throw new Error(`Warna depan tak terbaca: ${depan}`);
  if (!b) throw new Error(`Warna belakang tak terbaca: ${belakang}`);
  return rasio(a, b);
}

/** Dibulatkan ke satu desimal, seperti cara alat audit menuliskannya. */
export function bulat(r: number): number {
  return Math.round(r * 10) / 10;
}

/**
 * Ambil variabel warna dari satu blok CSS.
 *
 * Sengaja hanya menerima nilai LITERAL. `var(--x)` sudah diselesaikan
 * pemanggil lewat `resolusi`, dan `color-mix()` tidak diselesaikan sama
 * sekali — nilainya tergantung latar yang ditumpuknya, jadi memperlakukannya
 * sebagai warna padat akan melaporkan kontras yang tak pernah terjadi di
 * layar. Yang tak bisa dihitung dilewati secara TERBUKA, bukan ditebak.
 */
export function bacaToken(css: string, pemilih: string): Record<string, string> {
  const i = css.indexOf(pemilih);
  if (i < 0) throw new Error(`Blok CSS tak ditemukan: ${pemilih}`);
  const buka = css.indexOf('{', i);
  const tutup = css.indexOf('}', buka);
  if (buka < 0 || tutup < 0) throw new Error(`Blok CSS tak lengkap: ${pemilih}`);

  /* Komentar dibuang SEBELUM memecah, bukan sesudah.
     Di berkas ini komentar ditulis setelah titik koma —
     `--muted:#475569;   /* Slate 600 *​/` — sehingga ia jatuh di AWAL segmen
     BERIKUTNYA. Membersihkannya belakangan membuat token yang didahului
     komentar tak pernah cocok, dan token yang hilang itu dilaporkan sebagai
     "tak bisa dihitung": kegagalan yang terlihat seperti pengecualian yang
     disengaja, bukan seperti pembaca yang rusak. */
  const isi = css.slice(buka + 1, tutup).replace(/\/\*[\s\S]*?\*\//g, '');

  const keluar: Record<string, string> = {};
  for (const b of isi.split(';')) {
    const m = b.match(/^\s*(--[\w-]+)\s*:\s*([^;]+?)\s*$/);
    if (m) keluar[m[1]] = m[2].trim();
  }
  return keluar;
}

/**
 * Selesaikan rantai `var(--x)` menjadi warna literal.
 * Mengembalikan null bila ujungnya bukan warna yang bisa dihitung.
 */
export function resolusi(token: Record<string, string>, nama: string, sisa = 8): string | null {
  const nilai = token[nama];
  if (!nilai || sisa <= 0) return null;
  const v = nilai.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (v) return resolusi(token, v[1], sisa - 1);
  return bacaWarna(nilai) ? nilai : null;
}
