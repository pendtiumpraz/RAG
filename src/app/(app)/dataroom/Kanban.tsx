'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../_components/ui';
import { Select } from '../../_components/select';

/**
 * KANBAN BACKLOG (D15) — papan sisa pekerjaan di Dataroom.
 *
 * Dua papan terpisah: yang butuh MANUSIA vs yang bisa dikerjakan AGEN.
 * Tiga kolom: belum tersentuh → sedang dikerjakan → selesai.
 *
 * Status disimpan di server, jadi papan ini ingat posisinya lintas sesi &
 * perangkat. Tiap perpindahan optimistik dulu (papan tak boleh terasa
 * lambat saat kartu dilepas), lalu disinkronkan; kalau server menolak,
 * keadaan sebelumnya dikembalikan utuh.
 *
 * Seret-lepas HTML5 hanya bekerja dengan tetikus, jadi tiap kartu juga
 * punya tombol ←/→ — itu jalur keyboard sekaligus jalur sentuh di ponsel.
 */

type Track = 'human' | 'agent';
type Status = 'todo' | 'doing' | 'done';
type Dim = 'uiux' | 'agentic' | 'feature' | 'launch';

interface Row {
  id: string; key: string; track: Track; dimension: Dim;
  title: string; why: string; size: 'S' | 'M' | 'L';
  blocked: string | null; status: Status; position: number;
}

const COLUMNS: Array<{ id: Status; label: string; hint: string }> = [
  { id: 'todo', label: 'Belum tersentuh', hint: 'Antrean' },
  { id: 'doing', label: 'Sedang dikerjakan', hint: 'Berjalan' },
  { id: 'done', label: 'Selesai', hint: 'Tuntas' },
];

const DIM_LABEL: Record<Dim, string> = {
  uiux: 'UI/UX', agentic: 'Agentic', feature: 'Feature', launch: 'Launching',
};

const TRACKS: Array<{ id: Track; label: string; sub: string }> = [
  { id: 'agent', label: 'Bisa dikerjakan Claude', sub: 'Tak menunggu siapa pun — sebut judulnya, langsung kugarap.' },
  { id: 'human', label: 'Butuh tanganmu', sub: 'Tersandera kredensial, keputusan bisnis, atau pihak ketiga.' },
];

export default function Kanban() {
  const [items, setItems] = useState<Row[] | null>(null);
  const [track, setTrack] = useState<Track>('agent');
  const [err, setErr] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Status | null>(null);
  const [adding, setAdding] = useState(false);
  const [dim, setDim] = useState<Dim | 'all'>('all');
  /** kartu yang alasannya sedang dibentangkan */
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toast = useToast();
  /** salinan sebelum perpindahan — untuk mengembalikan bila server menolak */
  const undo = useRef<Row[] | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/backlog', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Gagal memuat papan');
      setItems(j.items as Row[]);
      setErr(null);
    } catch (e) { setErr((e as Error).message); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const byTrack = useMemo(
    () => (items ?? []).filter((i) => i.track === track),
    [items, track],
  );
  /** Isi kolom SEBENARNYA — tak pernah tersaring. Penulisan ulang urutan
   *  harus melihat seluruh kolom; kalau tidak, menyeret kartu saat saringan
   *  menyala akan mengacak posisi kartu yang sedang tersembunyi. */
  const col = useCallback(
    (s: Status) => byTrack.filter((i) => i.status === s).sort((a, b) => a.position - b.position),
    [byTrack],
  );
  /** Yang ditampilkan — inilah yang tunduk pada saringan. */
  const shown = useCallback(
    (s: Status) => col(s).filter((i) => dim === 'all' || i.dimension === dim),
    [col, dim],
  );

  const done = byTrack.filter((i) => i.status === 'done').length;
  const doing = byTrack.filter((i) => i.status === 'doing').length;

  /** Menempatkan `id` di kolom `status`, sebelum `beforeId` (atau di ujung). */
  async function place(id: string, status: Status, beforeId?: string) {
    if (!items) return;
    const moved = items.find((i) => i.id === id);
    if (!moved) return;
    if (moved.status === status && beforeId === id) return;

    undo.current = items;
    const rest = col(status).filter((i) => i.id !== id);
    const at = beforeId ? rest.findIndex((i) => i.id === beforeId) : -1;
    const ordered = [...rest];
    ordered.splice(at < 0 ? ordered.length : at, 0, { ...moved, status });
    const order = ordered.map((i) => i.id);

    const posOf = new Map(order.map((v, idx) => [v, idx]));
    setItems(items.map((i) => (
      i.id === id ? { ...i, status, position: posOf.get(i.id) ?? i.position }
        : posOf.has(i.id) ? { ...i, position: posOf.get(i.id)! } : i
    )));

    try {
      const r = await fetch('/api/admin/backlog', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, order }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Gagal menyimpan');
    } catch (e) {
      setItems(undo.current);              // kembalikan persis seperti semula
      toast((e as Error).message, 'error');
    }
  }

  /** Tombol ←/→: jalur non-tetikus, memindahkan satu kolom. */
  function shift(row: Row, delta: 1 | -1) {
    const idx = COLUMNS.findIndex((c) => c.id === row.status) + delta;
    if (idx < 0 || idx >= COLUMNS.length) return;
    void place(row.id, COLUMNS[idx].id);
  }

  async function remove(row: Row) {
    if (!items) return;
    undo.current = items;
    setItems(items.filter((i) => i.id !== row.id));
    try {
      const r = await fetch(`/api/admin/backlog?id=${row.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Gagal menghapus');
      toast('Kartu dihapus');
    } catch (e) { setItems(undo.current); toast((e as Error).message, 'error'); }
  }

  if (err && !items) {
    return <div className="kb-msg err">{err}</div>;
  }
  if (!items) return <div className="kb-msg">Memuat papan…</div>;

  const meta = TRACKS.find((t) => t.id === track)!;

  return (
    <div className="kb">
      <div className="kb-head">
        <div className="kb-switch" role="tablist">
          {TRACKS.map((t) => {
            const n = (items ?? []).filter((i) => i.track === t.id);
            const d = n.filter((i) => i.status === 'done').length;
            return (
              <button key={t.id} role="tab" aria-selected={t.id === track}
                className={`kb-tk${t.id === track ? ' on' : ''} ${t.id}`}
                onClick={() => setTrack(t.id)}>
                {t.label}
                <span className="n">{d}/{n.length}</span>
              </button>
            );
          })}
        </div>
        <button className="btn btn-sm" onClick={() => setAdding(true)}>+ Kartu</button>
      </div>

      <p className="kb-sub">{meta.sub}</p>

      <div className="kb-filter">
        <button className={`kb-fc${dim === 'all' ? ' on' : ''}`} onClick={() => setDim('all')}>
          Semua <b>{byTrack.length}</b>
        </button>
        {(Object.keys(DIM_LABEL) as Dim[]).map((d) => {
          const n = byTrack.filter((i) => i.dimension === d).length;
          if (!n) return null;
          return (
            <button key={d} className={`kb-fc${dim === d ? ' on' : ''}`}
              onClick={() => setDim(dim === d ? 'all' : d)}>
              {DIM_LABEL[d]} <b>{n}</b>
            </button>
          );
        })}
      </div>

      <div className="kb-bar">
        <span className="meter">
          <span className="fill-done" style={{ width: `${byTrack.length ? (done / byTrack.length) * 100 : 0}%` }} />
          <span className="fill-doing" style={{ width: `${byTrack.length ? (doing / byTrack.length) * 100 : 0}%` }} />
        </span>
        <span className="mono">{done} selesai · {doing} berjalan · {byTrack.length - done - doing} belum</span>
      </div>

      <div className="kb-board">
        {COLUMNS.map((c) => {
          const cards = shown(c.id);
          const hidden = col(c.id).length - cards.length;
          return (
            <section key={c.id}
              className={`kb-col${overCol === c.id ? ' over' : ''} c-${c.id}`}
              onDragOver={(e) => { e.preventDefault(); setOverCol(c.id); }}
              onDragLeave={() => setOverCol((v) => (v === c.id ? null : v))}
              onDrop={(e) => {
                e.preventDefault(); setOverCol(null);
                if (dragId) void place(dragId, c.id);
                setDragId(null);
              }}>
              <header>
                <b>{c.label}</b>
                {/* jumlah tersaring vs sebenarnya — supaya saringan tak
                    pernah menyamar sebagai "tinggal segini yang tersisa" */}
                <span className="ct">{hidden ? `${cards.length}/${cards.length + hidden}` : cards.length}</span>
              </header>

              <div className="kb-cards">
                {cards.map((row) => (
                  <article key={row.id} draggable
                    className={`kb-card ${row.track}${dragId === row.id ? ' dragging' : ''}${row.status === 'done' ? ' is-done' : ''}${open.has(row.id) ? ' open' : ''}`}
                    onDragStart={(e) => { setDragId(row.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => {
                      e.preventDefault(); e.stopPropagation(); setOverCol(null);
                      if (dragId && dragId !== row.id) void place(dragId, c.id, row.id);
                      setDragId(null);
                    }}>
                    <div className="kb-top">
                      <span className={`kb-dim d-${row.dimension}`}>{DIM_LABEL[row.dimension]}</span>
                      <span className={`kb-sz s-${row.size}`}>{row.size}</span>
                      <button className="kb-x" aria-label="Hapus kartu" onClick={() => void remove(row)}>×</button>
                    </div>
                    <b onClick={() => setOpen((s) => {
                      const n = new Set(s);
                      if (!n.delete(row.id)) n.add(row.id);
                      return n;
                    })}>{row.title}</b>
                    {row.why && <p>{row.why}</p>}
                    {row.why.length > 90 && !open.has(row.id) && <span className="kb-more">KLIK JUDUL UNTUK SELENGKAPNYA</span>}
                    {row.blocked && <span className="kb-bl">MENUNGGU: {row.blocked}</span>}
                    <div className="kb-move">
                      <button aria-label="Pindah ke kolom sebelumnya" disabled={c.id === 'todo'}
                        onClick={() => shift(row, -1)}>←</button>
                      <button aria-label="Pindah ke kolom berikutnya" disabled={c.id === 'done'}
                        onClick={() => shift(row, 1)}>→</button>
                    </div>
                  </article>
                ))}
                {!cards.length && <p className="kb-empty">{c.id === 'done' ? 'Belum ada yang tuntas di sini.' : 'Kosong — seret kartu ke sini.'}</p>}
              </div>
            </section>
          );
        })}
      </div>

      {adding && <AddCard track={track} onClose={() => setAdding(false)}
        onSaved={(row) => { setItems((v) => [...(v ?? []), row]); setAdding(false); toast('Kartu ditambahkan'); }} />}
    </div>
  );
}

/* ── penambahan kartu (drawer kanan, sesuai pola CRUD proyek) ────────── */
function AddCard({ track, onClose, onSaved }: {
  track: Track; onClose: () => void; onSaved: (r: Row) => void;
}) {
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [dimension, setDim] = useState<Dim>('feature');
  const [size, setSize] = useState<'S' | 'M' | 'L'>('M');
  const [blocked, setBlocked] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/admin/backlog', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track, dimension, title, why, size, blocked: blocked || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Gagal menyimpan');
      onSaved(j.item as Row);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="backdrop show" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-label="Form kartu backlog">
        <div className="dh">
          <h3>Kartu baru · {track === 'human' ? 'butuh tanganmu' : 'bisa kukerjakan'}</h3>
          <button className="icon-btn" aria-label="Tutup" onClick={onClose}>×</button>
        </div>
        <div className="db stack gap-4">
          <div className="field"><label>Judul</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Apa yang harus dikerjakan" /></div>
          <div className="field"><label>Kenapa penting</label>
            <textarea className="input" rows={4} value={why} onChange={(e) => setWhy(e.target.value)}
              placeholder="Apa yang rusak atau hilang tanpa ini" /></div>
          <div className="field"><label>Dimensi</label>
            <Select className="select-sm"  value={dimension} onChange={(e) => setDim(e.target.value as Dim)}>
              {(Object.keys(DIM_LABEL) as Dim[]).map((d) => <option key={d} value={d}>{DIM_LABEL[d]}</option>)}
            </Select></div>
          <div className="field"><label>Bobot</label>
            <Select className="select-sm"  value={size} onChange={(e) => setSize(e.target.value as 'S' | 'M' | 'L')}>
              <option value="S">S — hitungan jam</option>
              <option value="M">M — setengah hari</option>
              <option value="L">L — berhari-hari</option>
            </Select></div>
          {track === 'human' && (
            <div className="field"><label>Tersandera apa</label>
              <input className="input" value={blocked} onChange={(e) => setBlocked(e.target.value)}
                placeholder="mis. akun merchant, keputusan bisnis" /></div>
          )}
          {err && <div className="field"><span className="error">{err}</span></div>}
        </div>
        <div className="df">
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} style={{ flex: 1 }}
            disabled={busy || title.trim().length < 3} onClick={() => void save()}>Simpan</button>
          <button className="btn" onClick={onClose}>Batal</button>
        </div>
      </aside>
    </>
  );
}
