'use client';

import { useEffect, useState } from 'react';

/**
 * Tab internal halaman yang tersimpan di hash URL (`#kunci`).
 *
 * Kenapa hash, bukan useState biasa: halaman yang dipecah jadi tab dipakai
 * untuk isi yang panjang — orang mau bisa mem-bookmark satu bagian, tombol
 * Back jalan, dan refresh tetap di tab yang sama. Hash memberi itu tanpa
 * useSearchParams/router.
 *
 * SSR-safe: render pertama selalu `fallback` (server tak punya hash), lalu
 * disinkronkan ke hash sesudah mount. Hash yang tak dikenal diabaikan
 * (jatuh ke fallback) sehingga link lama tak pernah menampilkan tab kosong.
 *
 * `keys` HARUS konstanta modul (identitas stabil) agar efek tak berulang.
 */
export function useHashTab<T extends string>(keys: readonly T[], fallback: T) {
  const [tab, setTab] = useState<T>(fallback);

  useEffect(() => {
    const sync = () => {
      const h = window.location.hash.slice(1) as T;
      setTab(keys.includes(h) ? h : fallback);
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [keys, fallback]);

  const pick = (k: T) => {
    setTab(k);
    if (window.location.hash.slice(1) !== k) window.history.replaceState(null, '', `#${k}`);
  };

  return [tab, pick] as const;
}
