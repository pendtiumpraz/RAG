/**
 * Penjagaan URL keluar — dipakai di mana pun server MENGETUK alamat yang
 * ditentukan pengguna.
 *
 * Tanpa ini, setiap fitur "masukkan URL" berubah jadi alat SSRF: pengguna
 * menyuruh server kita mengetuk 169.254.169.254 (metadata cloud), Postgres
 * internal, atau layanan apa pun di jaringan privat — lalu membaca hasilnya
 * lewat status/isi yang kita laporkan kembali. Dua fitur sudah bergantung
 * padanya (webhook keluar, sumber pengetahuan dari URL), jadi ia tinggal di
 * core supaya keduanya tak pernah menyimpang aturannya.
 */

/**
 * Pastikan URL layak diketuk server. Melempar dengan pesan yang bisa dibaca
 * pengguna — kesalahan tempel URL adalah kegagalan paling sering di alur ini.
 *
 * `allowLoopback` hanya untuk kebutuhan pengembangan lokal & on-premise
 * (mis. webhook ke layanan di mesin yang sama).
 */
export function assertPublicHttpUrl(
  raw: string,
  opts: { allowLoopback?: boolean; label?: string } = {},
): string {
  const label = opts.label ?? 'URL';
  let u: URL;
  try { u = new URL(String(raw).trim()); } catch {
    throw new Error(`${label} tidak sah.`);
  }
  const host = u.hostname.toLowerCase();
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';

  if (u.protocol !== 'https:' && !(opts.allowLoopback && loopback && u.protocol === 'http:')) {
    throw new Error(
      opts.allowLoopback
        ? `${label} harus https (kecuali loopback untuk pengujian lokal).`
        : `${label} harus https.`);
  }
  if (loopback && !opts.allowLoopback) {
    throw new Error(`${label} tak boleh menunjuk alamat jaringan internal.`);
  }

  const privateRange =
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^0\./.test(host) ||
    host.endsWith('.internal') || host.endsWith('.local');
  if (privateRange) {
    throw new Error(`${label} tak boleh menunjuk alamat jaringan internal.`);
  }
  return u.toString();
}
