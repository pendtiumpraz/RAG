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
    throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status);
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
