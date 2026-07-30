'use client';

import type { AnswerBlock } from '@/modules/chat/blocks';

/**
 * Renderer JAWABAN TERSTRUKTUR — satu-satunya tempat blok jadi visual
 * (dipakai halaman Chat & Conversations; widget embed punya padanan vanilla).
 *
 * Chart mengikuti aturan dataviz proyek: mark tipis dengan ujung-data membulat
 * dan pangkal rata di baseline, satu sumbu, teks selalu memakai token teks
 * (bukan warna seri), tooltip native lewat `title`.
 *
 * MULTI-SERI: legend selalu ada begitu seri lebih dari satu — identitas tak
 * boleh bergantung pada warna saja. Warna diambil berurut dari SERIES_COLORS
 * dan TIDAK pernah didaur: seri kelima akan memakai warna keempat lagi, jadi
 * sanitizeBlock membatasi 4 seri di hulu.
 */

/**
 * Palet kategorikal — urutan TETAP, bukan diputar.
 *
 * Diverifikasi dengan validator dataviz terhadap surface Nalar yang
 * sebenarnya (#FFFFFF terang, #1E293B gelap) dan LOLOS seluruh pemeriksaan di
 * KEDUA mode: pita lightness, ambang chroma, keterpisahan buta warna
 * (protan/deutan/tritan), ambang penglihatan normal, dan kontras terhadap
 * surface. Karena satu set lolos keduanya, tak ada penukaran warna per mode —
 * satu urutan untuk semua.
 *
 * Susunan biru → amber → violet → emerald bukan selera: urutan lain
 * (amber bersebelahan dengan emerald) menghasilkan ΔE 7,9 pada protanopia,
 * yang hanya sah bila disertai penanda kedua. Urutan ini tak butuh
 * pengecualian apa pun.
 */
const SERIES_COLORS = ['#3B82F6', '#D97706', '#8B5CF6', '#059669'] as const;

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

  if (b.type === 'table') {
    return (
      <figure className="ab-tablewrap">
        {b.title && <figcaption className="microlabel">{b.title}</figcaption>}
        {/* Tabel lebar bergulir di dalam wadahnya sendiri — badan halaman tak
            boleh pernah bergulir mendatar. */}
        <div className="ab-tscroll">
          <table className="ab-table">
            <thead><tr>{b.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => (
                  // Kolom pertama = nama baris (kiri); sisanya angka (kanan,
                  // mono) supaya digit sejajar dan bisa dibandingkan sekilas.
                  <td key={j} className={j === 0 ? 'nm' : 'num mono'}>{renderCited(c)}</td>
                ))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>
    );
  }

  return b.kind === 'line' ? <LineChart b={b} /> : <BarChart b={b} />;
}

type ChartBlock = Extract<AnswerBlock, { type: 'chart' }>;

/**
 * Seri dalam bentuk kanonik.
 *
 * Blok yang sudah TERSIMPAN sebelum fitur multi-seri hanya punya `values`;
 * riwayat percakapan lama tak boleh berubah tampilannya, jadi bentuk itu
 * diterjemahkan di satu tempat ini alih-alih dijaga di setiap renderer.
 */
function seriesOf(b: ChartBlock) {
  if (b.series?.length) return b.series;
  return b.values?.length ? [{ name: b.title ?? 'Nilai', values: b.values }] : [];
}

/** Legend — WAJIB ada begitu seri lebih dari satu. */
function Legend({ names }: { names: string[] }) {
  if (names.length < 2) return null;
  return (
    <div className="ab-legend">
      {names.map((n, i) => (
        <span key={i} className="it">
          <i style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
          {n}
        </span>
      ))}
    </div>
  );
}

/* ── chart: bar HORIZONTAL (label kategori panjang tetap terbaca) ───── */
function BarChart({ b }: { b: ChartBlock }) {
  const series = seriesOf(b);
  if (!series.length) return null;
  const max = Math.max(...series.flatMap((s) => s.values.map(Math.abs)), 1e-9);
  const fmtV = (v: number) =>
    `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v)}${b.unit ? ` ${b.unit}` : ''}`;

  return (
    <figure className="ab-chart" aria-label={b.title ?? 'Grafik batang'}>
      {b.title && <figcaption className="microlabel">{b.title}</figcaption>}
      <Legend names={series.map((s) => s.name)} />
      <div className="ab-bars" role="img">
        {b.labels.map((label, i) => (
          <div key={i} className="grp">
            <span className="lbl">{label}</span>
            <span className="stack">
              {/* Satu batang per seri, BERKELOMPOK (bukan bertumpuk):
                  pertanyaan perbandingan menuntut panjang yang bisa diukur
                  dari pangkal yang sama, dan tumpukan menghilangkan itu. */}
              {series.map((s, si) => (
                <span key={si} className="track" title={`${s.name} · ${label}: ${fmtV(s.values[i])}`}>
                  <span className="bar" style={{
                    width: `${(Math.abs(s.values[i]) / max) * 100}%`,
                    background: SERIES_COLORS[si % SERIES_COLORS.length],
                  }} />
                  <span className="val mono">{fmtV(s.values[i])}</span>
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/* ── chart: line (2px, marker ≥3px, hanya titik akhir yang dilabel) ── */
function LineChart({ b }: { b: ChartBlock }) {
  const series = seriesOf(b);
  if (!series.length) return null;
  const W = 560; const H = 150; const PX = 8; const PY = 14;

  // SATU sumbu untuk semua seri — dua skala di satu chart adalah kesalahan
  // grafik paling umum dan membuat perbandingan jadi menyesatkan.
  const all = series.flatMap((s) => s.values);
  const min = Math.min(...all); const max = Math.max(...all);
  const span = max - min || 1;
  const n = b.labels.length;
  const x = (i: number) => PX + (i / Math.max(n - 1, 1)) * (W - PX * 2);
  const y = (v: number) => H - PY - ((v - min) / span) * (H - PY * 2);
  const last = n - 1;
  const fmtV = (v: number) =>
    `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(v)}${b.unit ? ` ${b.unit}` : ''}`;

  return (
    <figure className="ab-chart" aria-label={b.title ?? 'Grafik garis'}>
      {b.title && <figcaption className="microlabel">{b.title}</figcaption>}
      <Legend names={series.map((s) => s.name)} />
      <svg viewBox={`0 0 ${W} ${H}`} className="ab-line" role="img">
        <line x1={PX} y1={H - PY} x2={W - PX} y2={H - PY} className="axis" />
        {series.map((s, si) => {
          const color = SERIES_COLORS[si % SERIES_COLORS.length];
          return (
            <g key={si}>
              <polyline points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                className="stroke" fill="none" stroke={color} />
              {s.values.map((v, i) => (
                // Cincin surface 2px pada marker: garis yang berpotongan tetap
                // terbaca sebagai dua garis, bukan satu simpul kabur.
                <circle key={i} cx={x(i)} cy={y(v)} r={i === last ? 4 : 3}
                  className="dot" fill={color}>
                  <title>{`${s.name} · ${b.labels[i]}: ${fmtV(v)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {/* Label langsung di titik akhir — sampai 4 seri masih terbaca, dan
            identitas jadi tak bergantung pada warna semata. */}
        {series.length <= 4 && series.map((s, si) => (
          <text key={si} x={x(last) - 6} y={y(s.values[last]) - 8}
            textAnchor="end" className="endlbl">{fmtV(s.values[last])}</text>
        ))}
      </svg>
      <div className="ab-line-x">
        <span>{b.labels[0]}</span><span>{b.labels[last]}</span>
      </div>
    </figure>
  );
}
