export { default } from 'next-auth/middleware';

/**
 * Proteksi route ber-sesi. SENGAJA TIDAK dilindungi:
 *  • /api/chat/*  — endpoint embed publik (auth via publicKey + origin check)
 *  • /api/auth/*  — NextAuth + signup + pra-cek alasan login
 *  • /api/invitations/* — pratinjau & penerimaan undangan (belum ada sesi)
 *  • /api/health  — uptime monitor
 *  • /api/v1/*    — API publik pelanggan; autentikasinya API key (Bearer),
 *                   dan pemanggilnya mesin — mengalihkan mereka ke halaman
 *                   login jelas tak berguna. Penjagaannya di app/api/v1/_guard.
 *  • /invite/*    — halaman penerimaan undangan
 *  • /            — landing
 *  • /auth        — halaman masuk/daftar
 *  • /demo/*      — halaman coba chatbot per publicKey
 *  • /embed.js    — asset widget publik
 *
 * Daftar di bawah harus mencakup SEMUA halaman di grup `(app)` dan SEMUA rute
 * API ber-sesi. Rute yang lupa didaftarkan tidak bocor datanya (service tetap
 * memanggil getCurrentUser/requireRole), tapi gagalnya jadi 500 alih-alih
 * pengalihan ke login — dan itu menyamarkan galat auth sebagai galat server.
 */
export const config = {
  matcher: [
    // halaman aplikasi
    '/dashboard/:path*',
    '/chat/:path*',
    '/chatbots/:path*',
    '/knowledge/:path*',
    '/graf/:path*',
    '/memory/:path*',
    '/models/:path*',
    '/branding/:path*',
    '/conversations/:path*',
    '/analytics/:path*',
    '/categories/:path*',
    '/documents/:path*',
    '/bantuan',
    '/kuitansi/:path*',
    '/team/:path*',
    '/divisions/:path*',
    '/billing/:path*',
    '/observability/:path*',
    '/settings/:path*',
    '/usage/:path*',
    '/dataroom/:path*',
    '/arsitektur/:path*',
    /* Berkas HTML peta arsitektur itu sendiri. Ia statis di public/, jadi
       tanpa baris ini siapa pun yang tahu URL-nya bisa membacanya — dan
       gerbang superadmin di halamannya jadi pagar tanpa tembok. */
    '/hla/:path*',
    '/welcome',
    // API ber-sesi
    '/api/chatbots/:path*',
    '/api/documents/:path*',
    '/api/ingest/:path*',
    '/api/settings/:path*',
    '/api/usage/:path*',
    '/api/chat/internal',
    '/api/conversations/:path*',
    '/api/analytics/:path*',
    '/api/memory/:path*',
    '/api/sources/:path*',
    '/api/connections/:path*',
    '/api/team/:path*',
    '/api/billing/:path*',
    // Pengelolaan kunci & webhook butuh sesi; PEMAKAIANNYA (/api/v1/*) tidak.
    '/api/keys/:path*',
    '/api/keys',
    '/api/webhooks/:path*',
    '/api/webhooks',
    '/api/admin/:path*',
    // D12: buat/lihat tagihan butuh sesi. Webhook gateway
    // (/api/payments/callback/*) TIDAK didaftarkan — publik, otentikasinya
    // verifikasi signature. Halaman bayar ikut '/billing/:path*' di atas.
    '/api/entitlements',
    '/api/payments',
    // Ditulis per-pola dan BUKAN ':path*'. ':path*' memang menutup
    // /api/payments/<id>/kuitansi yang tadinya luput, tapi ia juga menyeret
    // /api/payments/callback/<provider> — webhook gateway yang HARUS tetap
    // publik karena otentikasinya verifikasi signature, bukan sesi.
    // Melindunginya berarti setiap pemberitahuan pembayaran dialihkan ke
    // halaman login dan tak satu pun tagihan pernah ditandai lunas.
    '/api/payments/:id',
    '/api/payments/:id/kuitansi',
  ],
};
