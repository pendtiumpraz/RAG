'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * SELECT — dropdown milik sendiri, bukan `<select>` bawaan.
 *
 * KENAPA ADA. Popup daftar opsi pada `<select>` native digambar oleh sistem
 * operasi, bukan oleh halaman. CSS tak menjangkaunya sama sekali: apa pun yang
 * dilakukan pada kotak tertutup — ukuran huruf, radius, warna — tak diikuti
 * popup-nya. Hasilnya ketimpangan yang selalu terlihat: nilai terpilih besar
 * mengikuti design system, daftar opsinya kecil dan kaku mengikuti Windows.
 * `appearance:base-select` sempat dicoba dan dicabut karena dukungannya belum
 * merata. Maka satu-satunya cara menutup jurang itu adalah menggambar
 * popup-nya sendiri — dan itulah komponen ini.
 *
 * DIPAKAI SEPERTI `<select>`. Menerima `<option>` dan `<optgroup>` sebagai
 * children supaya 27 titik pakai yang sudah ada cukup berganti nama tag, tak
 * perlu ditulis ulang satu per satu:
 *
 *   <Select value={v} onChange={(e) => setV(e.target.value)}>
 *     <option value="a">A</option>
 *     <optgroup label="Grup"><option value="b">B</option></optgroup>
 *   </Select>
 *
 * `onChange` sengaja meniru bentuk event asli (`e.target.value`) agar pemanggil
 * lama tak berubah sedikit pun.
 *
 * AKSESIBILITAS. Pola listbox WAI-ARIA: tombol pemicu `combobox`, daftar
 * `listbox`, penanda posisi lewat `aria-activedescendant`. Papan ketik:
 * ↑/↓ pindah, Home/End ujung, Enter/Space pilih, Esc tutup, dan ketik huruf
 * untuk melompat (typeahead) — persis kebiasaan yang sudah dipunyai orang dari
 * `<select>` native, jadi tak ada yang perlu dipelajari ulang.
 */

export interface SelectItem { value: string; label: string; disabled?: boolean; group?: string }

interface Props {
  /** Angka diterima juga — sebagian pemanggil memakai nilai numerik (rentang hari). */
  value: string | number;
  onChange: (e: { target: { value: string } }) => void;
  children?: React.ReactNode;
  /** alternatif children — dipakai bila opsinya datang dari data */
  items?: SelectItem[];
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  'aria-label'?: string;
  id?: string;
  style?: React.CSSProperties;
}

/** Membaca `<option>`/`<optgroup>` jadi daftar datar + label grupnya. */
function readChildren(children: React.ReactNode): SelectItem[] {
  const out: SelectItem[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const el = child as React.ReactElement<{
      label?: unknown; children?: React.ReactNode; value?: unknown; disabled?: unknown;
    }>;
    if (el.type === 'optgroup') {
      const group = String(el.props.label ?? '');
      React.Children.forEach(el.props.children, (sub) => {
        if (!React.isValidElement(sub)) return;
        const o = sub as React.ReactElement<{
          children?: React.ReactNode; value?: unknown; disabled?: unknown;
        }>;
        out.push({
          value: String(o.props.value ?? ''),
          label: textOf(o.props.children),
          disabled: !!o.props.disabled,
          group,
        });
      });
      return;
    }
    if (el.type === 'option') {
      out.push({
        value: String(el.props.value ?? ''),
        label: textOf(el.props.children),
        disabled: !!el.props.disabled,
      });
    }
  });
  return out;
}

/** Label opsi kerap berisi fragmen ({a} — {b}); ratakan jadi teks biasa. */
function textOf(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement(node)) {
    return textOf((node as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return '';
}

export function Select({
  value, onChange, children, items, className = '', disabled, placeholder = 'Pilih…',
  id, style, ...rest
}: Props) {
  const opts = useMemo(() => items ?? readChildren(children), [items, children]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const typed = useRef({ buf: '', at: 0 });
  const uid = useId();
  const listId = `${uid}-list`;

  // Nilai dinormalkan ke string SEKALI di sini. Tanpa itu, pemanggil yang
  // memakai angka (<option value={7}>) tak akan pernah cocok dengan value-nya
  // dan dropdown tampak tak punya pilihan terpilih — gagal yang senyap.
  const val = String(value ?? '');
  const selected = opts.find((o) => o.value === val) ?? null;
  const enabledIdx = useCallback(
    (from: number, dir: 1 | -1) => {
      for (let i = from; i >= 0 && i < opts.length; i += dir) if (!opts[i].disabled) return i;
      return -1;
    }, [opts]);

  // Buka pada posisi nilai yang sedang aktif — bukan selalu dari puncak.
  useEffect(() => {
    if (!open) return;
    const i = opts.findIndex((o) => o.value === val);
    setActive(i >= 0 ? i : Math.max(0, enabledIdx(0, 1)));
  }, [open, val, opts, enabledIdx]);

  // Gulir opsi aktif ke dalam pandangan saat berpindah dengan papan ketik.
  //
  // scrollTop LANGSUNG, bukan scrollIntoView. scrollIntoView boleh menggulir
  // leluhur mana pun — termasuk halaman — dan gulir halaman itulah yang
  // dianggap "pengguna menggulir" oleh penutup di bawah. Hasilnya dropdown
  // menutup dirinya sendiri sepersekian detik setelah dibuka, tepat ketika
  // nilai terpilihnya berada di luar 280px pertama daftar. Terlihat di
  // produksi pada "model chat aktif" (14 model); dropdown embedding yang cuma
  // 6 opsi tak pernah menunjukkannya, karena tak pernah perlu menggulir.
  useEffect(() => {
    if (!open) return;
    const pop = listRef.current;
    const el = pop?.querySelector<HTMLElement>('[data-active="1"]');
    if (!pop || !el) return;
    const atas = el.offsetTop;
    const bawah = atas + el.offsetHeight;
    if (atas < pop.scrollTop) pop.scrollTop = atas;
    else if (bawah > pop.scrollTop + pop.clientHeight) pop.scrollTop = bawah - pop.clientHeight;
  }, [active, open]);

  // Tutup saat klik di luar, atau saat halaman digulir/diubah ukurannya —
  // popup melayang di atas konten, jadi ia harus ikut menghilang bersamanya.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    /* Gulir DI DALAM popup tidak menutupnya. Daftar opsi memang bisa digulir
       (max-height 280px), jadi menutup pada gulir apa pun berarti daftar
       panjang mustahil dijelajahi dengan roda tetikus — dan lebih buruk lagi,
       menutup dirinya sendiri saat dibuka pada nilai yang letaknya jauh. Yang
       harus menutup popup adalah halaman yang bergerak DI BAWAHNYA, karena
       posisinya dipatok ke pemicu. */
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && listRef.current && (listRef.current === t || listRef.current.contains(t))) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', close);
    // capture: menangkap gulir dari kontainer mana pun, bukan hanya window
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  function pick(i: number) {
    const o = opts[i];
    if (!o || o.disabled) return;
    if (o.value !== val) onChange({ target: { value: o.value } });
    setOpen(false);
    btnRef.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    switch (e.key) {
      case 'Escape': e.preventDefault(); setOpen(false); btnRef.current?.focus(); break;
      case 'Enter': case ' ': e.preventDefault(); pick(active); break;
      case 'ArrowDown': { e.preventDefault(); const n = enabledIdx(active + 1, 1); if (n >= 0) setActive(n); break; }
      case 'ArrowUp': { e.preventDefault(); const n = enabledIdx(active - 1, -1); if (n >= 0) setActive(n); break; }
      case 'Home': { e.preventDefault(); const n = enabledIdx(0, 1); if (n >= 0) setActive(n); break; }
      case 'End': { e.preventDefault(); const n = enabledIdx(opts.length - 1, -1); if (n >= 0) setActive(n); break; }
      default:
        // typeahead: ketik beberapa huruf beruntun untuk melompat
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const now = Date.now();
          typed.current.buf = now - typed.current.at > 700 ? e.key : typed.current.buf + e.key;
          typed.current.at = now;
          const q = typed.current.buf.toLowerCase();
          const hit = opts.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(q));
          if (hit >= 0) setActive(hit);
        }
    }
  }

  // Sisipkan judul grup di antara opsi — hanya saat grupnya berganti.
  let lastGroup: string | undefined;

  return (
    <div ref={wrapRef} className={`nsel ${className}`} style={style}>
      <button
        ref={btnRef} type="button" id={id} disabled={disabled}
        className="nsel-btn" onKeyDown={onKey}
        onClick={() => !disabled && setOpen((v) => !v)}
        role="combobox" aria-expanded={open} aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && opts[active] ? `${uid}-o${active}` : undefined}
        aria-label={rest['aria-label']}
      >
        <span className={`nsel-val${selected ? '' : ' ph'}`}>{selected?.label ?? placeholder}</span>
        <svg className="nsel-chev" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div ref={listRef} id={listId} className="nsel-pop" role="listbox" tabIndex={-1}
          aria-label={rest['aria-label']}>
          {opts.map((o, i) => {
            const head = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <React.Fragment key={`${o.value}-${i}`}>
                {head && <div className="nsel-grp">{head}</div>}
                <div
                  id={`${uid}-o${i}`} role="option"
                  aria-selected={o.value === val} aria-disabled={o.disabled || undefined}
                  data-active={i === active ? '1' : undefined}
                  className={`nsel-opt${o.value === val ? ' on' : ''}${o.disabled ? ' off' : ''}`}
                  onMouseEnter={() => !o.disabled && setActive(i)}
                  onClick={() => pick(i)}
                >
                  <span>{o.label}</span>
                  {o.value === val && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
