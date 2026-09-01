'use client';

/**
 * DIALOG & TOAST PLATFORM — satu-satunya jalan menampilkan alert di Nalar.
 *
 * Aturan: TIDAK ADA `window.confirm/alert/prompt` di mana pun di UI. Dialog
 * bawaan peramban tak bisa ditata sama sekali — ia memakai font sistem, tombol
 * sistem, dan menyebut nama domain di judulnya — jadi tepat pada momen paling
 * menegangkan (menghapus KB, mencabut kunci API) produk ini berubah rupa jadi
 * kotak abu-abu asing. Ia juga memblokir thread utama dan tak bisa diuji.
 *
 * Semua dialog di sini memakai SweetAlert2 dengan `buttonsStyling: false`,
 * sehingga tombolnya adalah `.btn`/`.btn-primary`/`.btn-danger` milik design
 * system kita sendiri. Konsekuensi yang disengaja: dialog ikut berubah warna
 * mengikuti WHITE-LABEL tenant (--wl-signal) dan ikut mode gelap tanpa satu
 * baris kode tambahan, karena keduanya hidup di token yang sama.
 *
 * MUATAN DITUNDA. `sweetalert2` diimpor DINAMIS saat dialog pertama dipanggil,
 * bukan di puncak modul: berkasnya ±40 KB dan tak seorang pun membutuhkannya
 * saat halaman pertama digambar. Ini juga menghindari modul menyentuh
 * `document` saat render di server.
 */

import type { SweetAlertOptions, SweetAlertResult } from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.css';

/** Kelas kustom yang dipakai SEMUA dialog — penataannya di nalar-ds.css. */
const KELAS = {
  container: 'nalar-swal-wadah',
  popup: 'nalar-swal',
  title: 'nalar-swal-judul',
  htmlContainer: 'nalar-swal-isi',
  actions: 'nalar-swal-aksi',
  confirmButton: 'btn btn-primary',
  cancelButton: 'btn',
  denyButton: 'btn btn-danger',
  input: 'input nalar-swal-input',
  icon: 'nalar-swal-ikon',
  validationMessage: 'nalar-swal-galat',
} as const;

const KELAS_TOAST = {
  container: 'nalar-toast-wadah',
  popup: 'nalar-toast',
  title: 'nalar-toast-judul',
  timerProgressBar: 'nalar-toast-bilah',
} as const;

type Swal2 = typeof import('sweetalert2').default;
let muat: Promise<Swal2> | null = null;

/** Satu instans, dimuat sekali, dipakai ulang. */
async function swal(): Promise<Swal2> {
  muat ??= import('sweetalert2').then((m) => m.default);
  return muat;
}

async function tampil(opts: SweetAlertOptions): Promise<SweetAlertResult> {
  const Swal = await swal();
  return Swal.fire({
    buttonsStyling: false,
    customClass: KELAS,
    showClass: { popup: 'nalar-swal-masuk' },
    hideClass: { popup: 'nalar-swal-keluar' },
    reverseButtons: true,          // aksi utama di KANAN, sesuai Drawer & form kita
    heightAuto: false,             // jangan utak-atik <body>; layout app punya scroll sendiri
    ...opts,
  });
}

/* ── Konfirmasi ────────────────────────────────────────────────────── */

export interface KonfirmasiOpts {
  /** Kalimat pertanyaannya. Pendek, menyebut objeknya. */
  judul: string;
  /** Akibat yang akan terjadi — inilah yang sebenarnya dibaca orang. */
  pesan?: string;
  /** Teks tombol utama. Kata KERJA, bukan "OK" — "Hapus KB", "Cabut kunci". */
  tegas?: string;
  batal?: string;
  /** `true` untuk tindakan merusak: tombol utama merah + ikon peringatan. */
  merusak?: boolean;
}

/**
 * Pengganti `window.confirm`. Mengembalikan true bila pengguna menegaskan.
 *
 * Sengaja meminta `judul` DAN `pesan` terpisah: dialog konfirmasi yang hanya
 * bertanya "Anda yakin?" memindahkan seluruh beban mengingat akibat kepada
 * pengguna. Yang perlu terbaca adalah apa yang hilang, bukan pertanyaannya.
 */
export async function konfirmasi(o: KonfirmasiOpts): Promise<boolean> {
  const r = await tampil({
    title: o.judul,
    html: o.pesan,
    icon: o.merusak ? 'warning' : 'question',
    showCancelButton: true,
    confirmButtonText: o.tegas ?? (o.merusak ? 'Hapus' : 'Lanjutkan'),
    cancelButtonText: o.batal ?? 'Batal',
    focusCancel: o.merusak,        // tindakan merusak TIDAK boleh terpicu Enter
    customClass: { ...KELAS, confirmButton: o.merusak ? 'btn btn-danger' : 'btn btn-primary' },
  });
  return r.isConfirmed;
}

/* ── Pemberitahuan ─────────────────────────────────────────────────── */

export type JenisPesan = 'ok' | 'error' | 'warn' | 'info';

/**
 * Pengganti `window.alert` — untuk hal yang HARUS dibaca sebelum lanjut.
 * Kabar biasa cukup lewat toast; dialog yang muncul untuk setiap keberhasilan
 * kecil akan segera ditutup orang tanpa dibaca, dan pada saat itu dialog
 * berhenti berguna untuk hal yang benar-benar penting.
 */
export async function beritahu(judul: string, pesan?: string, jenis: JenisPesan = 'info'): Promise<void> {
  await tampil({
    title: judul,
    html: pesan,
    icon: jenis === 'ok' ? 'success' : jenis === 'error' ? 'error' : jenis === 'warn' ? 'warning' : 'info',
    confirmButtonText: 'Tutup',
  });
}

/* ── Isian singkat ─────────────────────────────────────────────────── */

export interface TanyaOpts {
  judul: string;
  pesan?: string;
  nilaiAwal?: string;
  placeholder?: string;
  tegas?: string;
  /** Kembalikan pesan galat bila tak sah; string kosong/null berarti sah. */
  periksa?: (nilai: string) => string | null;
}

/**
 * Pengganti `window.prompt`. Mengembalikan null bila dibatalkan — DIBEDAKAN
 * dari string kosong, karena "batal" dan "dikosongkan" menuntut tindakan yang
 * berbeda di pemanggilnya.
 */
export async function tanya(o: TanyaOpts): Promise<string | null> {
  const r = await tampil({
    title: o.judul,
    html: o.pesan,
    input: 'text',
    inputValue: o.nilaiAwal ?? '',
    inputPlaceholder: o.placeholder,
    inputAttributes: { autocapitalize: 'off', autocorrect: 'off' },
    showCancelButton: true,
    confirmButtonText: o.tegas ?? 'Simpan',
    cancelButtonText: 'Batal',
    inputValidator: (v: string) => o.periksa?.(v) ?? null,
  });
  return r.isConfirmed ? String(r.value ?? '') : null;
}

/* ── Toast ─────────────────────────────────────────────────────────── */

/**
 * Toast platform. Dipakai lewat `useToast()` (ui.tsx) supaya 160+ pemanggil
 * yang sudah ada tak perlu diubah sama sekali; yang berganti hanya isinya.
 *
 * Galat memakai umur 2x lebih panjang: kabar baik cukup dilirik, sedangkan
 * pesan galat perlu sempat dibaca — dan sebelumnya keduanya sama-sama 2,6
 * detik, yang berarti alasan kegagalan lenyap sebelum terbaca.
 */
export async function toastPlatform(pesan: string, jenis: JenisPesan = 'ok'): Promise<void> {
  const Swal = await swal();
  await Swal.fire({
    toast: true,
    position: 'bottom',
    title: pesan,
    icon: jenis === 'ok' ? 'success' : jenis === 'error' ? 'error' : jenis === 'warn' ? 'warning' : 'info',
    showConfirmButton: false,
    timer: jenis === 'error' ? 5200 : 2600,
    timerProgressBar: true,
    heightAuto: false,
    buttonsStyling: false,
    customClass: KELAS_TOAST,
    showClass: { popup: 'nalar-toast-masuk' },
    hideClass: { popup: 'nalar-toast-keluar' },
  });
}
