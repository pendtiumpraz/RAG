'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import './dataroom.css';
import { DECKS, type Deck, type Slide } from './decks';
import { EmptyState, useToast } from '../../_components/ui';

/**
 * DATAROOM — pitch deck Nalar (superadmin saja).
 *
 * Slide dirender dari model data (decks.ts) yang juga menjadi sumber ekspor
 * PPTX — layar, PDF, dan PPTX tidak pernah saling menyimpang.
 *  • PDF  : window.print() + CSS @media print (1 slide = 1 halaman 16:9)
 *  • PPTX : pptxgenjs, di-import dinamis saat tombol ditekan
 *  • Fullscreen: requestFullscreen pada panggung slide + navigasi keyboard
 */
export default function DataroomPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const [deckId, setDeckId] = useState<Deck['id']>('technical');
  const [i, setI] = useState(0);
  const [exporting, setExporting] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const deck = DECKS.find((d) => d.id === deckId)!;
  const total = deck.slides.length;

  const go = useCallback((delta: number) => {
    setI((prev) => Math.min(Math.max(prev + delta, 0), total - 1));
  }, [total]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
      else if (e.key === 'Home') { e.preventDefault(); setI(0); }
      else if (e.key === 'End') { e.preventDefault(); setI(total - 1); }
      else if (e.key === 'f' || e.key === 'F') { void stageRef.current?.requestFullscreen?.(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, total]);

  if (role && role !== 'superadmin') {
    return <EmptyState title="Khusus superadmin" hint="Dataroom berisi materi pitch internal." />;
  }

  async function toPptx() {
    setExporting(true);
    try {
      const { exportPptx } = await import('./export');
      await exportPptx(deck);
      toast('PPTX terunduh');
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setExporting(false); }
  }

  return (
    <div className="dr">
      <div className="page-head dr-noprint">
        <div><h1>Dataroom</h1><p className="sub">Pitch deck Nalar — layar, PDF, dan PPTX dari satu sumber. Navigasi: ←/→ · F = fullscreen.</p></div>
        <div className="cluster gap-2">
          <button className="btn btn-sm" onClick={() => window.print()}>Export PDF</button>
          <button className={`btn btn-sm${exporting ? ' is-loading' : ''}`} disabled={exporting} onClick={toPptx}>
            Export PPTX
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => void stageRef.current?.requestFullscreen?.()}>
            <Fs /> Fullscreen
          </button>
        </div>
      </div>

      {/* tab deck */}
      <div className="dr-tabs dr-noprint" role="tablist">
        {DECKS.map((d) => (
          <button key={d.id} role="tab" aria-selected={d.id === deckId}
            className={`dr-tab${d.id === deckId ? ' on' : ''}`}
            onClick={() => { setDeckId(d.id); setI(0); }}>
            {d.label}
          </button>
        ))}
      </div>

      {/* panggung — juga target fullscreen */}
      <div className="dr-stage" ref={stageRef}>
        <div className="dr-slidebox">
          <SlideView s={deck.slides[i]} />
        </div>
        <div className="dr-ctl dr-noprint">
          <button className="icon-btn" aria-label="Sebelumnya" disabled={i === 0} onClick={() => go(-1)}>
            <Chev dir="l" />
          </button>
          <div className="dr-dots">
            {deck.slides.map((_, j) => (
              <button key={j} aria-label={`Slide ${j + 1}`} className={`d${j === i ? ' on' : ''}`} onClick={() => setI(j)} />
            ))}
          </div>
          <span className="mono dr-count">{i + 1} / {total}</span>
          <button className="icon-btn" aria-label="Berikutnya" disabled={i === total - 1} onClick={() => go(1)}>
            <Chev dir="r" />
          </button>
        </div>
      </div>

      {/* versi cetak: SEMUA slide berurutan (hanya tampak di @media print) */}
      <div className="dr-print-all">
        {deck.slides.map((s, j) => (
          <div key={j} className="dr-slidebox print"><SlideView s={s} /></div>
        ))}
      </div>
    </div>
  );
}

/* ── renderer slide ─────────────────────────────────────────────────── */
function SlideView({ s }: { s: Slide }) {
  if (s.kind === 'cover' || s.kind === 'closing') {
    return (
      <section className={`sl sl-dark`}>
        {s.kind === 'cover' && <span className="sl-kicker light">{s.kicker}</span>}
        <h2 className={s.kind === 'cover' ? 'sl-mega' : 'sl-big'}>{s.title}</h2>
        <div className="sl-rule" />
        <p className="sl-lede">{s.subtitle}</p>
        <span className="sl-foot">{s.foot}</span>
        <Nmark />
      </section>
    );
  }

  return (
    <section className="sl">
      <header className="sl-head">
        <span className="sl-kicker">{s.kicker}</span>
        <h2>{s.title}</h2>
      </header>

      {s.kind === 'bullets' && (
        <ul className="sl-bullets">{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
      )}

      {s.kind === 'twocol' && (
        <div className="sl-cols">
          {s.cols.map((c, i) => (
            <div key={i} className="col">
              <h3>{c.h}</h3>
              <ul>{c.bullets.map((b, j) => <li key={j}>{b}</li>)}</ul>
            </div>
          ))}
        </div>
      )}

      {s.kind === 'stats' && (
        <div className="sl-stats">
          {s.stats.map((st, i) => (
            <div key={i} className="stat">
              <b>{st.v}</b>
              <span className="l">{st.l}</span>
              {st.n && <span className="n">{st.n}</span>}
            </div>
          ))}
        </div>
      )}

      {s.kind === 'flow' && (
        <div className="sl-flow">
          {s.steps.map((st, i) => (
            <div key={i} className="stepwrap">
              <div className="step">
                <span className="num">{i + 1}</span>
                <b>{st.t}</b>
                {st.d && <span>{st.d}</span>}
              </div>
              {i < s.steps.length - 1 && <span className="arrow">→</span>}
            </div>
          ))}
        </div>
      )}

      {s.kind === 'table' && (
        <table className={`sl-table${s.small ? ' small' : ''}`}>
          <thead><tr>{s.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
          <tbody>{s.rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}</tbody>
        </table>
      )}

      {'note' in s && s.note && <p className="sl-note">{s.note}</p>}
    </section>
  );
}

function Chev({ dir }: { dir: 'l' | 'r' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {dir === 'l' ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 6l6 6-6 6" />}
    </svg>
  );
}
function Fs() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

/** Mark N konstelasi — motif brand di pojok slide gelap. */
function Nmark() {
  return (
    <svg className="sl-mark" viewBox="0 0 48 48" fill="none" aria-hidden>
      <path d="M15 16 L33 24 M15 24 L33 24 M15 32 L33 24" stroke="#60A5FA" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="15" cy="16" r="3" fill="#fff" /><circle cx="33" cy="24" r="4" fill="#F59E0B" />
    </svg>
  );
}
