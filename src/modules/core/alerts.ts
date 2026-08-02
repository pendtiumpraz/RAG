import { sql } from 'drizzle-orm';
import { withTenant } from './db/tenant-context';
import { dispatch } from './events';
import { audit } from './guardrails';

/**
 * PERINGATAN — memberi tahu saat ada yang rusak, bukan menunggu ditemukan.
 *
 * Observability selama ini hanya papan BACA: kegagalan sync, lonjakan galat,
 * dan kuota yang nyaris habis semuanya terlihat — asal ada yang kebetulan
 * membuka halamannya. Tak ada yang membuka halaman observability pada hari
 * biasa; ia dibuka setelah seseorang mengeluh, dan pada saat itu kerusakannya
 * sudah berjam-jam.
 *
 * DISIMPAN DI `audit_logs`, BUKAN TABEL BARU. Peringatan adalah peristiwa
 * bercap waktu milik satu tenant dengan konteks bebas — persis bentuk yang
 * sudah dilayani audit_logs, lengkap dengan RLS, soft delete, dan indeks
 * (action, created_at) yang justru dibutuhkan kueri riwayat peringatan.
 * Menambah tabel untuk itu berarti migrasi, kebijakan RLS baru, dan satu
 * lagi tempat yang bisa lupa disaring per-tenant.
 *
 * YANG PALING MENENTUKAN DI BERKAS INI BUKAN DETEKSINYA, MELAINKAN
 * PEREDAMANNYA. Peringatan yang berbunyi tiap kali sync berjalan untuk
 * masalah yang SAMA dan masih berlangsung akan melatih orang mengabaikannya
 * — dan pada hari ia berbunyi untuk hal yang benar-benar baru, tak ada yang
 * membacanya lagi. Sistem peringatan yang berisik lebih buruk daripada tak
 * ada sistem peringatan, karena ia memberi rasa aman yang palsu.
 */

export type TingkatPeringatan = 'perhatian' | 'gawat';

export type JenisPeringatan =
  /** Sync sumber gagal — dokumen berhenti masuk tanpa ada yang tahu. */
  | 'sync.gagal'
  /** Kuota penyimpanan mendekati batas; unggahan berikutnya berisiko ditolak. */
  | 'kuota.hampir-habis'
  /** Kuota habis — unggahan & sync sudah ditolak. */
  | 'kuota.habis'
  /** Galat melonjak dibanding jendela sebelumnya. */
  | 'galat.melonjak'
  /**
   * Pilihan folder tak cocok dengan satu berkas pun di sumbernya.
   *
   * Bukan sekadar "sync tak menghasilkan apa-apa": tanpa penjagaan, daftar
   * berkas yang kosong membuat planDelta menyimpulkan SELURUH isi knowledge
   * base lenyap dari upstream lalu menghapusnya. Satu garis miring salah ketik
   * cukup untuk memicunya, jadi keadaannya dihentikan dan diteriakkan.
   */
  | 'sync.folder_kosong';

export interface Peringatan {
  jenis: JenisPeringatan;
  tingkat: TingkatPeringatan;
  /** Kalimat untuk manusia. Menyebut APA yang rusak dan APA akibatnya. */
  pesan: string;
  /** Konteks mesin — id sumber, angka, apa pun yang membantu menelusuri. */
  konteks?: Record<string, unknown>;
}

/**
 * Berapa lama peringatan sejenis DIREDAM setelah berbunyi.
 *
 * Berbeda per jenis, dan bedanya disengaja:
 *
 *   sync.gagal          6 jam. Sync berjalan berkali-kali sehari; tanpa
 *                       redaman, satu folder yang izinnya dicabut akan
 *                       mengirim belasan peringatan identik per hari.
 *   kuota.hampir-habis  24 jam. Keadaan yang bertahan berhari-hari sampai
 *                       seseorang menghapus dokumen atau naik paket —
 *                       mengingatkannya tiap jam tak mempercepat apa pun.
 *   kuota.habis         12 jam. Lebih mendesak, tapi tetap keadaan bertahan.
 *   galat.melonjak      1 jam. Ini justru yang ingin diketahui CEPAT, dan
 *                       lonjakan biasanya reda sendiri — redaman panjang
 *                       akan menyembunyikan gelombang kedua.
 */
export const REDAM_MS: Record<JenisPeringatan, number> = {
  'sync.gagal': 6 * 60 * 60 * 1000,
  'kuota.hampir-habis': 24 * 60 * 60 * 1000,
  'kuota.habis': 12 * 60 * 60 * 1000,
  'galat.melonjak': 60 * 60 * 1000,
  /* 1 jam — SENGAJA pendek. Ini keadaan yang menghentikan sync sepenuhnya dan
     hanya bisa diperbaiki manusia (pilih ulang foldernya). Meredamnya
     berjam-jam berarti pemiliknya menunggu tanpa tahu sinkronisasinya sudah
     berhenti, dan dokumen baru diam-diam tak pernah masuk. */
  'sync.folder_kosong': 60 * 60 * 1000,
};

/** Ambang kuota, sama dengan yang dipakai bilah kuota di UI. */
export const AMBANG_KUOTA_PERHATIAN = 80;

/* ── keputusan MURNI (tanpa I/O, bisa diuji tanpa basis data) ───────── */

/**
 * Perlukah peringatan kuota untuk pemakaian sebesar ini?
 *
 * `null` = tidak. Mengembalikan null di bawah ambang, bukan peringatan
 * bertingkat "informasi", karena peringatan tingkat informasi tak pernah
 * ditindaklanjuti siapa pun dan hanya menambah kebisingan.
 */
export function periksaKuota(
  terpakai: number, batas: number | null,
): Peringatan | null {
  // Kuota tanpa batas (on-premise, tenant platform) tak punya keadaan
  // "hampir habis" — memaksakan angka persen di sana akan berbunyi selamanya.
  if (batas == null || !Number.isFinite(batas) || batas <= 0) return null;

  if (terpakai >= batas) {
    return {
      jenis: 'kuota.habis', tingkat: 'gawat',
      pesan: `Kuota penyimpanan habis (${terpakai.toLocaleString('id-ID')} dari `
        + `${batas.toLocaleString('id-ID')} potongan). Unggahan dan sync berikutnya ditolak.`,
      konteks: { terpakai, batas },
    };
  }
  const persen = Math.round((terpakai / batas) * 100);
  if (persen >= AMBANG_KUOTA_PERHATIAN) {
    return {
      jenis: 'kuota.hampir-habis', tingkat: 'perhatian',
      pesan: `Kuota penyimpanan terpakai ${persen}% (sisa `
        + `${(batas - terpakai).toLocaleString('id-ID')} potongan). `
        + 'Satu kali sync folder besar bisa menghabiskannya sekaligus.',
      konteks: { terpakai, batas, persen },
    };
  }
  return null;
}

/** Berapa kegagalan berturut sebelum sync dianggap layak diperingatkan. */
export const MIN_GAGAL_SYNC = 1;

export function periksaSync(
  input: { sourceId: string; kbId: string; gagal: number; pesan?: string },
): Peringatan | null {
  if (input.gagal < MIN_GAGAL_SYNC) return null;
  return {
    jenis: 'sync.gagal', tingkat: 'gawat',
    pesan: `Sync sumber gagal${input.pesan ? `: ${input.pesan}` : ''}. `
      + 'Dokumen baru berhenti masuk ke knowledge base sampai ini dibereskan.',
    konteks: { sourceId: input.sourceId, knowledgeBaseId: input.kbId, gagal: input.gagal },
  };
}

/** Lonjakan minimum yang dianggap berarti — di bawah ini derau biasa. */
export const MIN_GALAT_LONJAKAN = 5;
export const LIPAT_LONJAKAN = 3;

/**
 * Lonjakan galat: jendela sekarang dibanding jendela sebelumnya.
 *
 * Dua syarat, dan keduanya perlu. LIPAT saja akan berbunyi untuk 1 → 3 galat,
 * yang pada lalu lintas kecil terjadi setiap hari tanpa ada yang rusak.
 * JUMLAH saja akan diam pada tenant besar yang galatnya memang selalu tinggi,
 * lalu tak pernah menyebut ketika ia berlipat.
 */
export function periksaLonjakanGalat(
  sekarang: number, sebelumnya: number,
): Peringatan | null {
  if (sekarang < MIN_GALAT_LONJAKAN) return null;
  // Jendela sebelumnya nol diperlakukan sebagai satu, supaya pembagiannya
  // terdefinisi DAN supaya lonjakan dari nol tetap terbaca sebagai lonjakan.
  const dasar = Math.max(1, sebelumnya);
  if (sekarang < dasar * LIPAT_LONJAKAN) return null;
  return {
    jenis: 'galat.melonjak', tingkat: 'gawat',
    pesan: `Galat melonjak: ${sekarang} kejadian pada jendela terakhir, `
      + `dibanding ${sebelumnya} pada jendela sebelumnya.`,
    konteks: { sekarang, sebelumnya },
  };
}

/* ── penerbitan (menyentuh basis data) ─────────────────────────────── */

const AKSI = (jenis: JenisPeringatan) => `alert.${jenis}`;

/**
 * Sudahkah peringatan sejenis berbunyi dalam jendela redamnya?
 *
 * Memakai indeks (action, created_at) yang sudah ada di audit_logs — jadi
 * pemeriksaan ini murah walau tabelnya sudah berisi jutaan baris.
 */
async function masihDiredam(tenantId: string, jenis: JenisPeringatan): Promise<boolean> {
  /* Jendela dihitung DI SISI POSTGRES lewat make_interval, bukan dengan
     mengirim objek Date sebagai parameter. Versi pertama mengirim Date dan
     jalur `tx.execute` menolaknya (ERR_INVALID_ARG_TYPE: "string" argument
     must be of type string… Received an instance of Date) — seluruh
     penerbitan peringatan gagal, dan karena galatnya tertelan try/catch,
     fungsinya mengembalikan false yang terbaca persis seperti "berhasil
     diredam". Sistem peringatan yang mati sunyi adalah kegagalan yang
     paling tepat dihindari kartu ini. */
  const detik = Math.round(REDAM_MS[jenis] / 1000);
  const rows = await withTenant(tenantId, (tx) => tx.execute(sql`
    select 1 from audit_logs
     where action = ${AKSI(jenis)}
       and created_at >= now() - make_interval(secs => ${detik})
       and deleted_at is null
     limit 1
  `)) as unknown as Array<unknown>;
  return rows.length > 0;
}

/**
 * Hasil penerbitan. TIGA keadaan, bukan boolean.
 *
 * Versi pertama mengembalikan boolean, dan `false` berarti "diredam" ATAU
 * "gagal" sekaligus. Ketika kuerinya benar-benar gagal (Date dikirim sebagai
 * parameter), fungsinya mengembalikan false dan seluruh sistem peringatan
 * tampak bekerja normal — diam karena "sudah diredam". Boolean yang
 * menyatukan sukses-diam dengan gagal-diam adalah cara paling rapi membuat
 * pemantauan mati tanpa ada yang tahu.
 */
export type HasilPeringatan = 'terbit' | 'diredam' | 'gagal';

/**
 * Terbitkan peringatan: catat ke audit, lalu sebarkan ke webhook tenant.
 *
 * Gagal menerbitkan peringatan TIDAK BOLEH menggagalkan alur yang
 * memicunya: sync yang gagal lalu ikut meledak karena peringatannya gagal
 * terkirim adalah kerusakan kedua yang menutupi kerusakan pertama. Tapi ia
 * WAJIB berteriak di log — kegagalan pemantauan yang tak terlihat sama
 * buruknya dengan tak punya pemantauan.
 */
export async function terbitkanPeringatan(
  tenantId: string, p: Peringatan,
): Promise<HasilPeringatan> {
  try {
    if (await masihDiredam(tenantId, p.jenis)) return 'diredam';
    await audit(tenantId, 'system', AKSI(p.jenis), undefined, {
      tingkat: p.tingkat, pesan: p.pesan, ...(p.konteks ?? {}),
    });
    await dispatch('alert.raised', {
      tenantId, jenis: p.jenis, tingkat: p.tingkat,
      pesan: p.pesan, konteks: p.konteks ?? {},
    });
    return 'terbit';
  } catch (err) {
    /* BERTERIAK, bukan berbisik. Kegagalan di sini berarti sistem
       peringatan itu sendiri yang rusak — dan tak ada peringatan kedua
       yang akan memberi tahu soal itu. */
    console.error(
      `[alerts] GAGAL menerbitkan peringatan ${p.jenis} utk tenant ${tenantId}:`, err);
    return 'gagal';
  }
}

/** Riwayat peringatan terakhir — dipakai halaman Observability. */
export async function riwayatPeringatan(tenantId: string, batas = 50) {
  return withTenant(tenantId, (tx) => tx.execute(sql`
    select action, meta, created_at as "createdAt"
      from audit_logs
     where action like 'alert.%' and deleted_at is null
     order by created_at desc
     limit ${batas}
  `)) as unknown as Promise<Array<{
    action: string; meta: Record<string, unknown>; createdAt: string;
  }>>;
}
