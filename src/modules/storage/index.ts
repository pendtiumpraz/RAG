/**
 * MODUL STORAGE (BYOB) — penyimpanan objek per-user.
 *
 * Bawaan platform (Vercel Blob dari env) tetap utuh; yang ini menambah
 * kemampuan pelanggan NON-superadmin menghubungkan penyimpanan sendiri.
 */
export * from './adapter';
export * from './storage.service';

/* Side-effect: impor semua adapter agar TERDAFTAR ke registry setelah
   adapter.ts selesai dievaluasi. Sengaja DIPISAH dari adapter.ts — kalau
   adapter.ts yang mengimpornya sendiri (sebagaimana struktur aslinya), terjadi
   perputaran impor yang membuat bundler mengeksekusi daftarkanPenyedia()
   SEBELUM PENYEDIA_MAP lahir (temporal dead zone), dan halaman yang memuat
   modul ini gagal dibangun. Dengan menaruhnya di sini, adapter.ts dievaluasi
   penuh lebih dulu; baru registrasi adapter dijalankan. */
import './adapters/registrasi';
