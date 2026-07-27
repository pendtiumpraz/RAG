'use client';

import Image from 'next/image';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

/* ── Logo resmi (PNG di public/brand) ─────────────────────────────── */
export function Logo({ variant = 'full', height = 28 }:
  { variant?: 'full' | 'mark'; height?: number }) {
  if (variant === 'mark') {
    return <Image src="/brand/favicon-48.png" alt="Nalar" width={height} height={height} priority />;
  }
  // rasio wordmark ≈ 1983:793 ≈ 2.5
  return <Image src="/brand/nalar-logo-400.png" alt="Nalar — Enterprise Knowledge Intelligence"
    width={Math.round(height * 2.5)} height={height} priority style={{ height, width: 'auto' }} />;
}

/* ── Toast ─────────────────────────────────────────────────────────── */
type ToastKind = 'ok' | 'error';
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; kind: ToastKind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, kind: ToastKind = 'ok') => {
    setMsg({ text, kind });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className={`toast${msg ? ' show' : ''}`} role="status" aria-live="polite">
        <span className="led" style={{ background: msg?.kind === 'error' ? 'var(--danger)' : 'var(--good-mark)' }} />
        <span>{msg?.text}</span>
      </div>
    </ToastCtx.Provider>
  );
}

/* ── Skeleton / states ─────────────────────────────────────────────── */
export interface PageMeta { total: number; page: number; pageSize: number; pages: number }

/**
 * Pager daftar. Menyebut TOTAL, bukan sekadar tombol maju-mundur — tanpa itu
 * orang tak tahu ada berapa banyak data dan berhenti menggali terlalu cepat.
 * Menghilang sendiri kalau hanya ada satu halaman.
 */
export function Pager({ meta, onPage }: { meta: PageMeta; onPage: (p: number) => void }) {
  if (!meta || meta.total === 0) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <div className="cluster" style={{
      justifyContent: 'space-between', padding: 'var(--sp-3) var(--sp-5)',
      borderTop: '1px solid var(--line)', fontSize: 13,
    }}>
      <span style={{ color: 'var(--muted)' }}>
        {from.toLocaleString('id-ID')}–{to.toLocaleString('id-ID')} dari{' '}
        <b>{meta.total.toLocaleString('id-ID')}</b>
      </span>
      {meta.pages > 1 && (
        <div className="cluster gap-2">
          <button className="btn btn-sm" disabled={meta.page <= 1}
            onClick={() => onPage(meta.page - 1)}>Sebelumnya</button>
          <span className="mono" style={{ color: 'var(--muted)' }}>{meta.page}/{meta.pages}</span>
          <button className="btn btn-sm" disabled={meta.page >= meta.pages}
            onClick={() => onPage(meta.page + 1)}>Berikutnya</button>
        </div>
      )}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack gap-3 card-pad" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton sk-line" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ title, hint, action }:
  { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div className="glyph">[ ]</div>
      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{title}</div>
      {hint && <p style={{ marginTop: 6 }}>{hint}</p>}
      {action && <div style={{ marginTop: 'var(--sp-4)' }}>{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty-state">
      <div className="glyph" style={{ color: 'var(--danger)' }}>!</div>
      <div style={{ fontWeight: 700, color: 'var(--ink)' }}>Gagal memuat</div>
      <p style={{ marginTop: 6 }}>{message}</p>
      {onRetry && <button className="btn btn-sm" style={{ marginTop: 'var(--sp-4)' }} onClick={onRetry}>Coba lagi</button>}
    </div>
  );
}
