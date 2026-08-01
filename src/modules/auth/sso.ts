/**
 * SSO ENTERPRISE — aturan murninya (D16).
 *
 * Tenant menyalakan dan mengisi kredensial identity provider MILIKNYA
 * sendiri; kita tak mendaftarkan aplikasi apa pun. Polanya sama dengan kunci
 * API penyedia LLM dan kunci S3, dan bedanya menentukan: kalau kita yang
 * mendaftarkan, tiap pelanggan baru menunggu kita — dan itu justru penghalang
 * yang membuat kartu ini tertahan berbulan-bulan di produk lain.
 *
 * Berkas ini tak menyentuh basis data, jaringan, maupun NextAuth. Yang
 * dijalankan di sini cuma penurunan endpoint dan pencocokan domain — dan
 * justru itulah bagian yang bisa dibuktikan tanpa IdP sungguhan.
 */

export type JenisSso = 'entra' | 'google' | 'okta' | 'oidc';

export class KonfigurasiSsoDitolak extends Error {}

export interface PresetSso {
  jenis: JenisSso;
  label: string;
  /** Apa yang harus diisi pelanggan selain client id & secret. */
  labelIssuer: string;
  petunjuk: string;
}

export const PRESET_SSO: PresetSso[] = [
  {
    jenis: 'entra',
    label: 'Microsoft Entra ID (Azure AD)',
    labelIssuer: 'Directory (tenant) ID',
    petunjuk: 'Azure Portal → Microsoft Entra ID → App registrations → aplikasi Anda. '
      + 'Salin "Directory (tenant) ID" dan "Application (client) ID", lalu buat client secret baru.',
  },
  {
    jenis: 'google',
    label: 'Google Workspace',
    labelIssuer: 'Domain Workspace (mis. perusahaan.co.id)',
    petunjuk: 'Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application). '
      + 'Tambahkan URL callback Nalar ke Authorized redirect URIs.',
  },
  {
    jenis: 'okta',
    label: 'Okta',
    labelIssuer: 'URL organisasi Okta (mis. https://perusahaan.okta.com)',
    petunjuk: 'Okta Admin → Applications → Create App Integration → OIDC, Web Application. '
      + 'Salin Client ID & Client secret, dan pastikan authorization server-nya "default".',
  },
  {
    jenis: 'oidc',
    label: 'OIDC generik (Keycloak, Authentik, Auth0, lainnya)',
    labelIssuer: 'Issuer URL (yang menerbitkan /.well-known/openid-configuration)',
    petunjuk: 'Isi issuer persis seperti yang tertulis di metadata IdP Anda — biasanya tanpa '
      + 'garis miring di ujung, dan tanpa "/.well-known/openid-configuration".',
  },
];

/**
 * Turunkan issuer OIDC dari apa yang diisi pelanggan.
 *
 * Tiap penyedia menyebut hal yang sama dengan nama berbeda, dan memaksa
 * pelanggan menerjemahkannya sendiri adalah sumber kesalahan yang paling
 * sering: satu garis miring di ujung, atau "/.well-known/…" yang ikut
 * ditempel, menghasilkan penemuan yang gagal dengan pesan yang tak
 * menjelaskan apa pun.
 */
export function issuerDari(jenis: JenisSso, isian: string): string {
  const v = isian.trim().replace(/\/+$/, '').replace(/\/\.well-known\/openid-configuration$/i, '');
  if (!v) throw new KonfigurasiSsoDitolak('Isian issuer tidak boleh kosong');

  switch (jenis) {
    case 'entra': {
      /* Yang diisi adalah Directory (tenant) ID — sebuah UUID. Menerima URL
         penuh juga akan "bekerja", tapi lalu tak ada yang memeriksa bahwa
         yang ditempel benar-benar tenant Entra dan bukan endpoint lain. */
      if (!/^[0-9a-f-]{36}$/i.test(v)) {
        throw new KonfigurasiSsoDitolak('Directory (tenant) ID Entra harus berupa UUID');
      }
      return `https://login.microsoftonline.com/${v}/v2.0`;
    }
    case 'google':
      /* Issuer Google SATU untuk semua Workspace; domainnya dipakai memilih
         koneksi, bukan menyusun endpoint. */
      return 'https://accounts.google.com';
    case 'okta': {
      const u = urlAman(v, 'URL organisasi Okta');
      return `${u.origin}/oauth2/default`;
    }
    case 'oidc':
      return urlAman(v, 'Issuer URL').toString().replace(/\/+$/, '');
    default:
      throw new KonfigurasiSsoDitolak(`Jenis SSO tak dikenal: ${jenis}`);
  }
}

/**
 * URL yang boleh dihubungi server kita.
 *
 * WAJIB https. Endpoint ini menerima pengalihan login dan menukar kode
 * otorisasi memakai client secret pelanggan; http polos berarti keduanya
 * terbaca siapa pun di jalur itu. Loopback pun TIDAK dikecualikan di sini —
 * berbeda dari server embedding, IdP tak pernah berjalan di mesin yang sama
 * dengan aplikasi, jadi pengecualian itu hanya membuka lubang tanpa melayani
 * satu kasus nyata pun.
 */
function urlAman(nilai: string, label: string): URL {
  let u: URL;
  try { u = new URL(nilai); } catch { throw new KonfigurasiSsoDitolak(`${label} bukan URL yang sah`); }
  if (u.protocol !== 'https:') throw new KonfigurasiSsoDitolak(`${label} harus memakai https`);
  if (u.username || u.password) throw new KonfigurasiSsoDitolak(`${label} tak boleh memuat kredensial`);
  return u;
}

/** Alamat metadata OIDC — dari sinilah endpoint sebenarnya ditemukan. */
export function urlPenemuan(issuer: string): string {
  return `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
}

/**
 * Domain email yang dipakai memilih koneksi.
 *
 * Dinormalkan huruf kecil dan tanpa spasi. Domain yang ditulis dua cara
 * berbeda akan tersimpan sebagai dua koneksi berbeda, dan separuh karyawan
 * pelanggan diarahkan ke tempat yang salah.
 */
export function normalDomain(domain: string): string {
  const v = domain.trim().toLowerCase().replace(/^@+/, '');
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)) {
    throw new KonfigurasiSsoDitolak(`Domain tidak sah: ${domain}`);
  }
  return v;
}

/** Domain dari sebuah alamat email, atau null bila bukan email. */
export function domainEmail(email: string): string | null {
  const v = email.trim().toLowerCase();
  const at = v.lastIndexOf('@');
  if (at <= 0 || at === v.length - 1) return null;
  try { return normalDomain(v.slice(at + 1)); } catch { return null; }
}

/**
 * Apakah email ini boleh masuk lewat koneksi tersebut.
 *
 * DIPERIKSA ULANG SESUDAH IdP menjawab, bukan hanya saat memilih koneksi.
 * Tanpa ini, IdP yang salah konfigurasi — atau sengaja dibuat begitu — bisa
 * memulangkan alamat di domain lain, dan orang itu akan mendarat di tenant
 * yang bukan miliknya. IdP menjamin orangnya memegang akun di direktori
 * mereka; ia tak menjamin alamat yang dipulangkan ada di domain kita.
 */
export function emailCocokKoneksi(email: string, domain: string): boolean {
  const d = domainEmail(email);
  return d !== null && d === domain;
}

/**
 * Nama kuki pemilih koneksi SSO.
 *
 * Tinggal DI SINI, bukan di berkas route: Next.js melarang route mengekspor
 * apa pun selain handler HTTP, dan `tsc --noEmit` TIDAK menangkapnya — hanya
 * `next build` yang menolak. Konstanta yang dipakai bersama karena itu tak
 * boleh menumpang di route, betapa pun dekatnya ia dengan pemakainya.
 */
export const NAMA_KUKI_SSO = 'nalar_sso';
