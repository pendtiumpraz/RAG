'use client';

import { useCallback, useEffect, useState } from 'react';

/** Wrapper fetch JSON dengan error terstruktur. */
export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(pesanGalat(body.error, res.status), res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Hook GET dengan state loading/error/data + refetch (Rule #7: data nyata). */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!path) return;
    setLoading(true); setError(null);
    try { setData(await api<T>(path)); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [path]);

  useEffect(() => { void refetch(); }, [refetch]);
  return { data, loading, error, refetch, setData };
}

/**
 * Ubah `error` apa pun dari server jadi kalimat yang bisa dibaca orang.
 *
 * SEBABNYA NYATA, bukan kerapian. Rute yang menolak validasi membalas
 * `{ error: parsed.error.issues }` — sebuah ARRAY objek zod. Dilempar apa
 * adanya ke `new Error(...)`, ia jadi string "[object Object]", dan itulah
 * yang dilihat pengguna: pesan yang tak menyebutkan apa pun tentang sebabnya.
 * Satu bug nyata (kolom Konteks kosong ditolak POST /api/chatbots) tersembunyi
 * di baliknya sampai skemanya diperiksa satu per satu.
 *
 * Yang diambil dari tiap isu: NAMA MEDANNYA. Tanpa itu pesannya jadi
 * "Expected string, received null" — benar, tapi tak memberi tahu medan mana,
 * dan pada form berisi belasan kolom itu sama tak bergunanya dengan
 * "[object Object]".
 */
export function pesanGalat(error: unknown, status: number): string {
  if (typeof error === 'string' && error.trim()) return error;

  if (Array.isArray(error)) {
    const bagian = error.map((it) => {
      const o = it as { path?: unknown[]; message?: string };
      const medan = Array.isArray(o.path) ? o.path.filter(Boolean).join('.') : '';
      const pesan = o.message ?? 'tidak valid';
      return medan ? `${medan}: ${pesan}` : pesan;
    }).filter(Boolean);
    if (bagian.length) return bagian.join('; ');
  }

  if (error && typeof error === 'object') {
    const o = error as { message?: unknown };
    if (typeof o.message === 'string' && o.message.trim()) return o.message;
    /* Objek yang tak dikenal bentuknya TIDAK di-JSON.stringify ke layar:
       ia bisa memuat apa saja, termasuk hal yang tak pantas dilihat
       pengguna. Statusnya sendiri lebih menolong daripada isi yang acak. */
  }

  return `Permintaan gagal (HTTP ${status})`;
}
