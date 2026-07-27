import type { MetadataRoute } from 'next';

/**
 * Sitemap halaman PUBLIK saja.
 *
 * Membantu peninjau OAuth Google menemukan beranda, kebijakan privasi, dan
 * ketentuan layanan — ketiganya diperiksa saat pengajuan scope sensitif.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXTAUTH_URL ?? 'https://rag.sainskerta.net').replace(/\/+$/, '');
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.8 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.8 },
    { url: `${base}/auth`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
  ];
}
