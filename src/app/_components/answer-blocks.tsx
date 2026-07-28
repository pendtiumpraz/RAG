'use client';

import type { AnswerBlock } from '@/modules/chat/blocks';

/**
 * Renderer JAWABAN TERSTRUKTUR — satu-satunya tempat blok jadi visual
 * (dipakai halaman Chat & Conversations; widget embed punya padanan vanilla).
 *
 * Chart mengikuti aturan dataviz proyek: SATU seri per chart → satu warna
 * (--signal), tanpa legend (judul yang menamai), mark tipis dgn ujung-data
 * membulat 4px & pangkal rata di baseline, teks selalu memakai token teks
 * (bukan warna seri), tooltip native via title.
 */

/** [1] → chip sitasi. Dibangun sebagai node React — tanpa innerHTML. */
export function renderCited(text: string): React.ReactNode[] {
  return text.split(/(\[\d+\])/g).map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    return m ? <span key={i} className="cite">{m[1]}</span> : <span key={i}>{part}</span>;
  });
}

export function AnswerBlocks({ blocks }: { blocks: AnswerBlock[] }) {
  return (
    <div className="ab-stack">
      {blocks.map((b, i) => <Block key={i} b={b} />)}
    </div>
  );
}

function Block({ b }: { b: AnswerBlock }) {
  if (b.type === 'text') return <p className="ab-text">{renderCited(b.text)}</p>;

  if (b.type === 'list') {
    const items = b.items.map((it, i) => <li key={i}>{renderCited(it)}</li>);
    return b.ordered
      ? <ol className="ab-list ab-ol">{items}</ol>
      : <ul className="ab-list ab-ul">{items}</ul>;
  }

  if (b.type === 'cards') {
    return (
      <div className="ab-cards">
        {b.items.map((c, i) => (
          <div key={i} className="ab-card">
            {c.title && <span className="microlabel">{c.title}</span>}
            <b className="v">{renderCited(c.value)}</b>
            {c.desc && <p>{renderCited(c.desc)}</p>}
          </div>
        ))}
      </div>
    );
  }

  return b.kind === 'line' ? <LineChart b={b} /> : <BarChart b={b} />;
}

/* ── chart: bar HORIZONTAL (label kategori panjang tetap terbaca) ───── */
function BarChart({ b }: { b: Extract<AnswerBlock, { type: 'chart' }> }) {
  const max = Math.max(...b.values.map(Math.abs), 1e-9);
  const fmtV = (v: number) =>
    `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v)}${b.unit ? ` ${b.unit}` : ''}`;
  return (
    <figure className="ab-chart" aria-label={b.title ?? 'Grafik batang'}>
      {b.title && <figcaption className="microlabel">{b.title}</figcaption>}
      <div className="ab-bars" role="img">
        {b.labels.map((label, i) => (
          <div key={i} className="row" title={`${label}: ${fmtV(b.values[i])}`}>
            <span className="lbl">{label}</span>
            <span className="track">
              <span className="bar" style={{ width: `${(Math.abs(b.values[i]) / max) * 100}%` }} />
            </span>
            <span className="val mono">{fmtV(b.values[i])}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/* ── chart: line (2px, marker ≥3px, hanya titik akhir yang dilabel) ── */
function LineChart({ b }: { b: Extract<AnswerBlock, { type: 'chart' }> }) {
  const W = 560; const H = 150; const PX = 8; const PY = 14;
  const min = Math.min(...b.values); const max = Math.max(...b.values);
  const span = max - min || 1;
  const x = (i: number) => PX + (i / Math.max(b.values.length - 1, 1)) * (W - PX * 2);
  const y = (v: number) => H - PY - ((v - min) / span) * (H - PY * 2);
  const pts = b.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = b.values.length - 1;
  const fmtV = (v: number) =>
    `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v)}${b.unit ? ` ${b.unit}` : ''}`;
  return (
    <figure className="ab-chart" aria-label={b.title ?? 'Grafik garis'}>
      {b.title && <figcaption className="microlabel">{b.title}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} className="ab-line" role="img">
        <line x1={PX} y1={H - PY} x2={W - PX} y2={H - PY} className="axis" />
        <polyline points={pts} className="stroke" fill="none" />
        {b.values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === last ? 4 : 3} className="dot">
            <title>{`${b.labels[i]}: ${fmtV(v)}`}</title>
          </circle>
        ))}
        <text x={x(last) - 6} y={y(b.values[last]) - 8} textAnchor="end" className="endlbl">
          {fmtV(b.values[last])}
        </text>
      </svg>
      <div className="ab-line-x">
        <span>{b.labels[0]}</span><span>{b.labels[last]}</span>
      </div>
    </figure>
  );
}
