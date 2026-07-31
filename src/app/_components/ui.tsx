'use client';

import Image from 'next/image';
import { Children, cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';

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

/* ── Field: label yang BENAR-BENAR terkait ke kontrolnya ──────────── */

/**
 * Satu baris form: label + kontrol, terhubung lewat id.
 *
 * ADA KARENA seluruh 89 form di aplikasi ini menulis
 * `<Field label="Nama"><input …/></Field>` — label sebagai
 * SAUDARA input, tanpa `htmlFor`, dan tanpa membungkusnya. Secara visual
 * benar, secara mesin tak terhubung sama sekali: pembaca layar mengumumkan
 * "kotak isian, kosong" tanpa menyebut ini kotak apa, dan mengeklik labelnya
 * tidak memindahkan fokus ke inputnya. Tak ada yang terlihat rusak, dan
 * karena itu tak pernah diperbaiki.
 *
 * `useId()` dipakai, bukan id yang ditulis tangan: satu komponen form bisa
 * muncul dua kali di satu halaman (dua drawer, dua kartu), dan id kembar
 * membuat label menunjuk kontrol yang salah — bug aksesibilitas BARU yang
 * dibuat oleh perbaikan aksesibilitas.
 *
 * Anaknya di-clone untuk menerima `id`. Kontrol native (`input`, `textarea`,
 * `select`) langsung mengerti; `Select` buatan sendiri meneruskannya ke
 * tombol pemicunya.
 */
export function Field({ label, hint, children, className, style }: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = useId();
  /* `id` disuntikkan ke elemen PERTAMA saja. Sebagian field menaruh petunjuk
     di bawah kontrolnya ("KOSONGKAN = TANPA BATAS WAKTU"), dan petunjuk itu
     bukan yang dilabeli — menyuntikkan id ke semuanya akan membuat beberapa
     elemen berbagi id yang sama, yaitu bug aksesibilitas baru. */
  let sudah = false;
  const anak = Children.map(children, (c) => {
    if (sudah || !isValidElement(c)) return c;
    sudah = true;
    return cloneElement(c as React.ReactElement<{ id?: string }>, { id });
  });
  return (
    <div className={className ? `field ${className}` : 'field'} style={style}>
      <label htmlFor={id}>{label}</label>
      {anak}
      {hint != null && <span className="microlabel">{hint}</span>}
    </div>
  );
}

/* ── Drawer: dialog yang benar-benar berperilaku seperti dialog ───── */

/**
 * Panel samping 400px untuk form create/edit.
 *
 * ADA KARENA sebelas drawer di aplikasi ini menuliskan `role="dialog"` dan
 * `aria-modal="true"` tanpa satu pun perilaku yang membuatnya dialog: Escape
 * tak menutup, Tab keluar ke halaman di belakangnya, dan fokus tak pernah
 * kembali ke tombol yang membukanya. Itu LEBIH buruk daripada tak menuliskan
 * perannya sama sekali — teknologi bantu memercayai deklarasi itu, memberi
 * tahu penggunanya "ini dialog, isinya terkurung", lalu penggunanya menemukan
 * dirinya berpindah entah ke mana tanpa cara kembali.
 */
/**
 * Perilaku DIALOG untuk elemen apa pun yang mengaku `role="dialog"`.
 *
 * Dipisah dari <Drawer> karena bukan cuma drawer yang mengakuinya: modal
 * kartu di Dataroom memakai kelas dan bentuk sendiri, dan menyalin logika ini
 * ke sana berarti dua salinan yang akan menyimpang. Yang menentukan bukan
 * bentuk panelnya, melainkan janji yang ditulis `aria-modal`.
 */
export function useDialogFokus(onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  /* onClose disimpan di ref, BUKAN dijadikan dependensi efek. Hampir semua
     pemanggil mengirim fungsi anonim yang baru tiap render; menjadikannya
     dependensi membuat efek ini dipasang ulang tiap ketikan — dan pemasangan
     ulang memindahkan fokus kembali ke kolom pertama di tengah orang
     mengetik. Bug yang terasa seperti papan ketik rusak. */
  const tutup = useRef(onClose);
  tutup.current = onClose;

  useEffect(() => {
    const sebelumnya = document.activeElement as HTMLElement | null;
    const bisaFokus = () => Array.from(
      ref.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),'
        + 'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? [],
    ).filter((el) => el.offsetParent !== null);

    bisaFokus()[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); tutup.current(); return; }
      if (e.key !== 'Tab') return;
      const f = bisaFokus();
      if (!f.length) return;
      const awal = f[0], akhir = f[f.length - 1];
      // Tab dari elemen terakhir kembali ke awal, dan sebaliknya. Tanpa ini
      // fokus keluar ke halaman di belakang tirai yang tak bisa dilihat.
      if (!e.shiftKey && document.activeElement === akhir) { e.preventDefault(); awal.focus(); }
      else if (e.shiftKey && document.activeElement === awal) { e.preventDefault(); akhir.focus(); }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Fokus dikembalikan ke tombol yang membukanya. Tanpa ini fokus jatuh
      // ke <body> dan pengguna papan ketik harus menelusuri halaman dari awal.
      sebelumnya?.focus?.();
    };
  }, []);

  return ref;
}

export function Drawer({ label, onClose, children }: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useDialogFokus(onClose);
  return (
    <>
      {/* Tirai tak punya isi yang perlu dibaca; menutup lewat kliknya adalah
          kemudahan tetikus, dan Escape adalah padanannya untuk papan ketik. */}
      <div className="backdrop show" onClick={onClose} aria-hidden />
      <aside ref={ref} className="drawer open" role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </aside>
    </>
  );
}
