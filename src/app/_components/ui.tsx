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
