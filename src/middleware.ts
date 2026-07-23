export { default } from 'next-auth/middleware';

/**
 * Proteksi route ber-sesi. SENGAJA TIDAK dilindungi:
 *  • /api/chat/*  — endpoint embed publik (auth via publicKey + origin check)
 *  • /api/auth/*  — NextAuth + signup
 *  • /            — landing
 *  • /embed.js    — asset widget publik
 */
export const config = {
  matcher: [
    '/settings/:path*',
    '/dashboard/:path*',
    '/api/chatbots/:path*',
    '/api/documents/:path*',
    '/api/ingest/:path*',
    '/api/settings/:path*',
    '/api/usage/:path*',
  ],
};
