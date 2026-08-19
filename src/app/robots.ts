import type { MetadataRoute } from 'next';

/**
 * robots.txt — sebelumnya TIDAK ADA (404).
 *
 * Secara teknis 404 berarti "boleh dirayapi", tapi peninjau OAuth Google
 * memeriksa apakah beranda dan kebijakan privasi dapat diakses; robots.txt
 * yang eksplisit menghapus keraguan itu. Halaman dashboard dan API sengaja
 * dilarang — isinya butuh sesi dan tak ada gunanya di indeks.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXTAUTH_URL ?? 'https://nalar.sainskerta.net';
  return {
    rules: [{
      userAgent: '*',
      allow: ['/', '/privacy', '/terms', '/docs/'],
      disallow: [
        '/api/', '/dashboard', '/chat', '/chatbots', '/knowledge', '/memory',
        '/models', '/branding', '/conversations', '/analytics', '/team',
        '/billing', '/observability', '/settings', '/invite/',
      ],
    }],
    sitemap: `${base}/sitemap.xml`,
  };
}
