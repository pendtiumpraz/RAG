'use client';

import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';

/**
 * Client providers: sesi NextAuth + inisialisasi tema (light default sesuai
 * brand resmi; preferensi tersimpan di localStorage).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const saved = localStorage.getItem('nalar-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  }, []);
  return <SessionProvider>{children}</SessionProvider>;
}

export function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('nalar-theme', next);
}
