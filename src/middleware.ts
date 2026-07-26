export { default } from 'next-auth/middleware';

/**
 * Proteksi route ber-sesi. SENGAJA TIDAK dilindungi:
 *  • /api/chat/*  — endpoint embed publik (auth via publicKey + origin check)
 *  • /api/auth/*  — NextAuth + signup + pra-cek alasan login
 *  • /api/invitations/* — pratinjau & penerimaan undangan (belum ada sesi)
 *  • /api/health  — uptime monitor
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
    '/memory/:path*',
    '/models/:path*',
    '/branding/:path*',
    '/conversations/:path*',
    '/team/:path*',
    '/billing/:path*',
    '/observability/:path*',
    '/settings/:path*',
    // API ber-sesi
    '/api/chatbots/:path*',
    '/api/documents/:path*',
    '/api/ingest/:path*',
    '/api/settings/:path*',
    '/api/usage/:path*',
    '/api/chat/internal',
    '/api/conversations/:path*',
    '/api/memory/:path*',
    '/api/sources/:path*',
    '/api/connections/:path*',
    '/api/team/:path*',
    '/api/billing/:path*',
    '/api/admin/:path*',
  ],
};
