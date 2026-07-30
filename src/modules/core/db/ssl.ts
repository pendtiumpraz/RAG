/**
 * KEPUTUSAN TLS untuk koneksi Postgres.
 *
 * Versi sebelumnya MENEBAK dari nama host: `neon.tech`, `.aws.`, atau
 * `sslmode=require`. Itu bekerja selama basis datanya Neon — dan diam-diam
 * gagal begitu pindah. Host seperti `srv123.hostinger.com` tak cocok pola
 * mana pun, sehingga TLS MATI tanpa satu pun peringatan, dan seluruh isi
 * dokumen pelanggan beserta kredensial terenkripsi menyeberang internet
 * sebagai teks polos. Kegagalan yang tak menimbulkan galat apa pun adalah
 * kegagalan yang paling lama tak ketahuan.
 *
 * Logikanya kini DIBALIK: TLS menyala untuk host apa pun, kecuali
 * (a) sambungan lokal, atau (b) dimatikan SECARA EKSPLISIT lewat
 * `sslmode=disable` di connection string.
 *
 * Prinsipnya sama dengan klien server embedding, yang menolak URL non-https
 * kecuali loopback — karena teks dokumen tenant melintasi kabel yang sama.
 */

/** Host yang tak pernah keluar dari mesin/jaringan pribadi. */
function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '::1' || h.endsWith('.local')) return true;
  if (h === '127.0.0.1' || h.startsWith('127.')) return true;
  // Rentang privat RFC 1918 + link-local — lazim pada on-premise, tempat
  // basis datanya berada di jaringan yang sama dengan aplikasinya.
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  // Nama layanan docker-compose ("db", "postgres") — tanpa titik sama sekali.
  if (!h.includes('.')) return true;
  return false;
}

export interface SslDecision {
  /** Nilai untuk opsi `ssl` postgres.js. */
  ssl: 'require' | undefined;
  /** Alasannya — dicatat sekali saat start agar keputusannya bisa diaudit. */
  reason: string;
}

export function decideSsl(connectionString: string): SslDecision {
  let host = '';
  try {
    host = new URL(connectionString).hostname;
  } catch {
    // Connection string berbentuk aneh: pilih yang AMAN, bukan yang longgar.
    return { ssl: 'require', reason: 'connection string tak terbaca — TLS dipaksa' };
  }

  // Satu-satunya jalan mematikan TLS pada host publik: menyatakannya.
  if (/[?&]sslmode=disable(&|$)/.test(connectionString)) {
    return { ssl: undefined, reason: 'sslmode=disable dinyatakan eksplisit' };
  }
  if (isLocalHost(host)) {
    return { ssl: undefined, reason: `host lokal/privat (${host})` };
  }
  return { ssl: 'require', reason: `host publik (${host})` };
}
