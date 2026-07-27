import type { Metadata } from 'next';
import { Manrope, Inter, JetBrains_Mono } from 'next/font/google';
import './nalar-ds.css';
import { Providers } from './providers';

// Brand fonts resmi — di-load & self-host via next/font (tanpa CDN runtime).
const manrope = Manrope({ subsets: ['latin'], variable: '--font-brand-display', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-brand-ui', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-brand-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Nalar — Enterprise Knowledge Intelligence', template: '%s · Nalar' },
  description: 'Platform RAG multi-tenant: menghubungkan seluruh pengetahuan perusahaan menjadi jawaban yang akurat, aman, dan dapat dipertanggungjawabkan.',
  applicationName: 'Nalar',
  // Verifikasi kepemilikan domain untuk Google Search Console — disyaratkan
  // sebelum Google menyetujui OAuth consent screen dengan scope Drive.
  // Diisi lewat env supaya tak perlu meng-commit token verifikasi.
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {}),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${manrope.variable} ${inter.variable} ${mono.variable}`}>
      <head>
        {/* Petakan token DS ke font brand yang di-load next/font */}
        <style>{`:root{
          --font-display:var(--font-brand-display),"Segoe UI",system-ui,sans-serif;
          --font-ui:var(--font-brand-ui),"Segoe UI",system-ui,sans-serif;
          --font-mono:var(--font-brand-mono),ui-monospace,Consolas,monospace;
        }`}</style>
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
