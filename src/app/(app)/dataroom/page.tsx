'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import './dataroom.css';
import { DECKS, type Deck, type Slide } from './decks';
import { SCENES } from './scenes';
import { DIMENSIONS, PRIORITIES, OVERALL, PREV, ASSESSED_AT, type AssessArea } from './assessment';
import { SHIPPED, SHIPPED_AT } from './updates';
import Kanban from './Kanban';
import Calculator from './Calculator';
import BuktiFitur from './BuktiFitur';
import { buildZip, standaloneSvg, svgToWebp, slideFileName, KETERANGAN_EKSPOR } from './slide-export';
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
  const [deckId, setDeckId] = useState<Deck['id'] | 'assessment' | 'bukti' | 'updates' | 'calculator'>('technical');
  const [i, setI] = useState(0);
  const [exporting, setExporting] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const isAssess = deckId === 'assessment';
  const isUpdates = deckId === 'updates';
  const isCalc = deckId === 'calculator';
  const isBukti = deckId === 'bukti';
  const isDoc = isAssess || isUpdates || isCalc || isBukti;   // tab dokumen (bukan deck slide)
  const deck = DECKS.find((d) => d.id === deckId) ?? DECKS[0];
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

  /**
   * Ekspor tiap slide ILUSTRASI jadi SVG + WebP dalam satu ZIP.
   *
   * SVG-nya mandiri (gaya disalin masuk) sehingga tetap tajam di segala
   * ukuran dan animasinya masih hidup bila dibuka di peramban; WebP-nya
   * statis pada keadaan akhir, untuk ditempel ke dokumen atau dikirim.
   *
   * Bedanya IKUT DIKIRIM sebagai BACA-DULU.txt di dalam ZIP — kode ini sejak
   * awal tahu WebP-nya diam, tapi yang membaca komentar bukan orang yang
   * mengekspor.
   *
   * Merender dari DOM yang sedang tampil, bukan dari data: yang diekspor
   * persis yang dilihat, termasuk angka yang dihitung saat render.
   */
  async function toImages() {
    setExporting(true);
    try {
      // Panggung hanya memuat SATU slide; versi cetak memuat SEMUANYA, dan
      // itulah yang dipakai supaya tak perlu berpindah slide satu per satu.
      const nodes = Array.from(document.querySelectorAll<SVGSVGElement>('.dr-print-all .sl-anim svg'));
      if (!nodes.length) { toast('Dek ini tak punya slide ilustrasi', 'error'); return; }

      const files: Array<{ name: string; data: Uint8Array<ArrayBuffer> }> = [];
      const enc = new TextEncoder();
      let n = 0;
      for (const svg of nodes) {
        const label = svg.getAttribute('aria-label') ?? `slide-${n + 1}`;
        const base = slideFileName(n, label);
        const text = standaloneSvg(svg);
        const b = svg.viewBox.baseVal;
        files.push({ name: `svg/${base}.svg`, data: enc.encode(text) as Uint8Array<ArrayBuffer> });
        files.push({ name: `webp/${base}.webp`, data: await svgToWebp(text, b.width || 760, b.height || 250) });
        n++;
      }

      /* Keterangan ikut masuk ZIP — di situlah orangnya berada saat ia
         menemukan WebP-nya diam, bukan di dasbor ini. */
      files.push({ name: 'BACA-DULU.txt', data: enc.encode(KETERANGAN_EKSPOR) as Uint8Array<ArrayBuffer> });

      const url = URL.createObjectURL(buildZip(files));
      const a = document.createElement('a');
      a.href = url; a.download = `nalar-${deck.id}-slides.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast(`${n} slide diekspor. SVG beranimasi; WebP gambar diam — lihat BACA-DULU.txt.`);
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setExporting(false); }
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
          {!isDoc && (
            <button className={`btn btn-sm${exporting ? ' is-loading' : ''}`} disabled={exporting} onClick={toPptx}>
              Export PPTX
            </button>
          )}
          {/* Judul tombol tetap menyebut formatnya, tapi `title` menyebut
              BENTUKNYA: "SVG + WebP" tak memberi tahu siapa pun bahwa yang
              satu beranimasi dan yang lain tidak. */}
          {!isDoc && deck.slides.some((s) => s.kind === 'anim') && (
            <button className={`btn btn-sm${exporting ? ' is-loading' : ''}`} disabled={exporting}
              onClick={toImages} title="SVG beranimasi · WebP gambar diam (satu bingkai)">
              Export SVG + WebP
            </button>
          )}
          {!isDoc && (
            <button className="btn btn-primary btn-sm" onClick={() => void stageRef.current?.requestFullscreen?.()}>
              <Fs /> Fullscreen
            </button>
          )}
        </div>
      </div>

      {/* tab deck */}
      <div className="dr-tabs dr-noprint" role="tablist">
        {DECKS.map((d) => (
          <button key={d.id} role="tab" aria-selected={d.id === deckId}
            className={`dr-tab${d.id === deckId ? ' on' : ''}`}
            onClick={() => { setDeckId(d.id); setI(0); }}>
            {d.tab}
          </button>
        ))}
        <button role="tab" aria-selected={isAssess}
          className={`dr-tab${isAssess ? ' on' : ''}`}
          onClick={() => setDeckId('assessment')}>
          Assessment
        </button>
        <button role="tab" aria-selected={isBukti}
          className={`dr-tab${isBukti ? ' on' : ''}`}
          onClick={() => setDeckId('bukti')}>
          Bukti Fitur
        </button>
        <button role="tab" aria-selected={isCalc}
          className={`dr-tab${isCalc ? ' on' : ''}`}
          onClick={() => setDeckId('calculator')}>
          Kalkulator
        </button>
        <button role="tab" aria-selected={isUpdates}
          className={`dr-tab${isUpdates ? ' on' : ''}`}
          onClick={() => setDeckId('updates')}>
          Backlog
        </button>
      </div>

      {isCalc && <Calculator />}
      {isAssess && <AssessmentView />}
      {isBukti && <BuktiFitur />}
      {isUpdates && <UpdatesView />}

      {/* panggung — juga target fullscreen */}
      {!isDoc && <div className="dr-stage" ref={stageRef}>
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
      </div>}

      {/* versi cetak: SEMUA slide berurutan (hanya tampak di @media print) */}
      {!isDoc && <div className="dr-print-all">
        {deck.slides.map((s, j) => (
          <div key={j} className="dr-slidebox print"><SlideView s={s} /></div>
        ))}
      </div>}
    </div>
  );
}

/* ── tab Update & Backlog ────────────────────────────────────────────
   Dua bagian: catatan perubahan (statis, updates.ts) dan PAPAN KANBAN
   (D15, tersimpan di DB). Papan dipisah tegas: yang butuh MANUSIA
   (kredensial, keputusan bisnis, pihak ketiga) vs yang bisa dikerjakan
   AGEN — tanpa pemisahan itu backlog cuma panjang, tak menuntun apa pun. */
function UpdatesView() {
  return (
    <div className="dr-assess up">
      <section className="as-sec">
        <header>
          <h2>Papan pekerjaan</h2>
          <span className="microlabel">SERET KARTU ANTAR KOLOM · TERSIMPAN OTOMATIS</span>
        </header>
        <p className="desc">
          Daftar lengkap yang tersisa menuju 10/10 di semua dimensi, diturunkan
          dari tiap celah di tab Assessment. Seret kartu (atau pakai tombol ←/→)
          untuk menandai apa yang sedang berjalan dan apa yang sudah tuntas —
          posisinya tersimpan di server.
        </p>
        <Kanban />
      </section>

      <div className="as-summary" style={{ gridTemplateColumns: '1fr' }}>
        <div className="as-overall">
          <span className="microlabel">SUDAH JALAN · {SHIPPED_AT}</span>
          <b>{SHIPPED.reduce((n, g) => n + g.items.length, 0)}<small> perubahan</small></b>
          <span className="delta">4 keputusan arsitektur · 5 insiden ditutup</span>
        </div>
      </div>

      {SHIPPED.map((g) => (
        <section key={g.group} className="as-sec">
          <header><h2>{g.group}</h2><span className="microlabel">SUDAH JALAN</span></header>
          <div className="up-ship">
            {g.items.map((it) => (
              <div key={it.title} className="row">
                <span className="tick">✓</span>
                <div>
                  <b>{it.decision && <span className="dec">{it.decision}</span>}{it.title}</b>
                  <p>{it.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="as-method">
        S = hitungan jam · M = setengah hari · L = berhari-hari. Kartu di papan
        bisa ditambah sendiri lewat tombol <b>+ Kartu</b>; kartu bawaan yang
        dihapus tak akan muncul lagi.
      </p>
    </div>
  );
}

/* ── tab Assessment — meter skor visual (data: assessment.ts) ────────
   Warna angka mengikuti pita kesiapan (status): ≥8 baik · 6–7,9 waspada
   (amber) · <6 bahaya. Batang meter selalu satu warna signal (magnitudo). */
function band(score: number): string {
  return score >= 8 ? 'ok' : score >= 6 ? 'warn' : 'bad';
}
const fmtScore = (n: number) => n.toFixed(1).replace('.', ',');
const avgOf = (a: AssessArea[]) => a.reduce((s, x) => s + x.score, 0) / (a.length || 1);

/* Cincin skor SVG — busur terisi sepanjang skor/10, warnanya pita kesiapan.
   Murni SVG (tanpa pustaka), skala dari viewBox jadi tetap tajam di segala
   ukuran. `dark` menyalakan varian utk kartu KESELURUHAN yang berlatar navy. */
function Gauge({ score, size, dark }: { score: number; size: number; dark?: boolean }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const b = band(score);
  const col = b === 'ok' ? 'var(--signal)' : b === 'warn' ? 'var(--source)' : 'var(--danger)';
  return (
    <svg className="as-gauge" width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      role="img" aria-label={`Skor ${fmtScore(score)} dari 10`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="6"
        stroke={dark ? '#334155' : 'var(--card-3)'} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="6" strokeLinecap="round"
        stroke={col} strokeDasharray={c} strokeDashoffset={c * (1 - score / 10)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        className="as-gval" fill={dark ? '#fff' : col} style={{ fontSize: size * 0.3 }}>
        {fmtScore(score)}
      </text>
    </svg>
  );
}

function AssessmentView() {
  return (
    <div className="dr-assess">
      <div className="as-summary">
        <div className="as-overall">
          <span className="microlabel">KESELURUHAN · {ASSESSED_AT}</span>
          <div className="as-og">
            <Gauge score={OVERALL} size={92} dark />
            <div className="as-ol">
              <b>{fmtScore(OVERALL)}<small>/10</small></b>
              <span className="delta">↑ dari {fmtScore(PREV.score)} ({PREV.at})</span>
              <span className="sub">{DIMENSIONS.length} dimensi · {DIMENSIONS.reduce((n, d) => n + d.areas.length, 0)} area dinilai</span>
            </div>
          </div>
        </div>
        {DIMENSIONS.map((d) => (
          <div key={d.id} className="as-dim">
            <Gauge score={d.score} size={68} />
            <span className="microlabel">{d.label.toUpperCase()}</span>
            <span className="as-dmeta">{d.areas.length} area · rata-rata {fmtScore(avgOf(d.areas))}</span>
          </div>
        ))}
      </div>

      {DIMENSIONS.map((d) => (
        <section key={d.id} className="as-sec">
          <header>
            <h2>{d.label}</h2>
            <span className={`as-badge ${band(d.score)}`}>{fmtScore(d.score)}/10</span>
          </header>
          <p className="desc">{d.desc}</p>
          <div className="as-rows">
            {d.areas.map((a) => (
              <div key={a.name} className="row" title={`Celah: ${a.gap}`}>
                <span className="nm">{a.name}</span>
                <span className={`meter ${band(a.score)}`}><span style={{ width: `${a.score * 10}%` }} /></span>
                <b className={`sc ${band(a.score)}`}>{fmtScore(a.score)}</b>
                <span className="gap">{a.gap}</span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="as-sec">
        <header><h2>Prioritas berikutnya</h2><span className="microlabel">DAMPAK ÷ USAHA</span></header>
        <ol className="as-prio">
          {PRIORITIES.map((p, i) => (
            <li key={i}><b>{p.t}</b><span>{p.d}</span></li>
          ))}
        </ol>
      </section>

      <p className="as-method">
        Metodologi: seluruh halaman dijelajahi &amp; di-screenshot via
        agent-browser pada <b>lingkungan staging</b> (<code>rag.sainskerta.net</code>,
        login superadmin demo); chat &amp; widget diuji dengan pertanyaan nyata.
        Tak ada skor untuk fitur yang belum disaksikan bekerja.
        Bukti: <code>docs/assessment/</code> &amp; tab Bukti Fitur.
        {' '}<b>Staging, bukan pemasangan pelanggan</b> — korpusnya kecil, jadi
        angka yang bergantung pada ukuran data (latensi, rencana kueri) belum
        terwakili di sini.
      </p>
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
        {/* wordmark resmi (aset landing page) — chip putih krn wordmark-nya navy */}
        <span className="sl-logochip">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/nalar-logo-400.png" alt="Nalar" />
        </span>
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

      {s.kind === 'anim' && (
        /* `key` pada scene MEMAKSA remount tiap slide dibuka — tanpa itu,
           React memakai ulang node yang sama dan animasinya tak pernah
           berjalan lagi saat pengguna kembali ke slide ini. */
        <div className="sl-anim" key={s.scene}>{SCENES[s.scene]()}</div>
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

