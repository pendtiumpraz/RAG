'use client';

import { FeatureGate } from '../../_components/entitlements';
import { Select } from '../../_components/select';
import { useEffect, useRef, useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Skeleton, ErrorState, EmptyState, useToast } from '../../_components/ui';
import { OVERFLOW_COLOR } from '@/modules/memory/categories';

interface Chatbot { id: string; name: string }
interface Node { id: string; slug: string; title: string; linksTo: string[]; category?: string }
interface Edge { from: string; to: string; kind: string; weight: number }
interface Graph { nodes: Node[]; edges: Edge[] }
/** Baris master data kategori — penanda visualnya dihitung di server. */
interface Cat { id: string; slug: string; label: string; status: string; origin: string; color: string; shape: string; notes: number }

/**
 * Saring graf ke kategori terpilih. Sisi ikut dibuang bila salah satu
 * ujungnya hilang — kalau tidak, canvas menggambar garis ke node yang tak ada.
 */
function filtered(g: Graph, only: Set<string>): Graph {
  if (only.size === 0) return g;
  const nodes = g.nodes.filter((n) => only.has(n.category ?? 'lain'));
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, edges: g.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
}

/** Swatch legenda — bentuknya SAMA dengan node di kanvas, bukan kotak semua. */
function Swatch({ color, shape }: { color: string; shape: string }) {
  const s = 11;
  return (
    <svg width={s} height={s} viewBox="0 0 12 12" aria-hidden style={{ flex: '0 0 auto' }}>
      {shape === 'square' ? <rect x="1.5" y="1.5" width="9" height="9" fill={color} />
        : shape === 'triangle' ? <polygon points="6,1 11,10.5 1,10.5" fill={color} />
        : shape === 'diamond' ? <polygon points="6,0.5 11.5,6 6,11.5 0.5,6" fill={color} />
        : <circle cx="6" cy="6" r="5" fill={color} />}
    </svg>
  );
}

/**
 * Legenda kategori — sekaligus penyaring.
 *
 * WAJIB ada, bukan hiasan: warna tak boleh jadi satu-satunya pembawa
 * identitas. Di atas 16 kategori penanda visual habis dan legendalah yang
 * jadi alat baca utamanya — penyaring di sini tetap bekerja untuk berapa pun
 * jumlah kategorinya.
 *
 * Kategori dengan nol note tetap ditampilkan (diredupkan) supaya posisi tiap
 * penanda tak bergeser antar chatbot: penanda melekat pada kategori, bukan
 * pada peringkat kemunculannya.
 */
function CategoryLegend({ graph, cats, only, onToggle }:
  { graph: Graph; cats: Cat[]; only: Set<string>; onToggle: (s: Set<string>) => void }) {
  const count = new Map<string, number>();
  for (const n of graph.nodes) {
    const c = n.category ?? 'lain';
    count.set(c, (count.get(c) ?? 0) + 1);
  }
  const toggle = (c: string) => {
    const next = new Set(only);
    if (next.has(c)) next.delete(c); else next.add(c);
    onToggle(next);
  };
  return (
    <div className="cluster gap-2" style={{ flexWrap: 'wrap', marginTop: 12 }}>
      {cats.filter((c) => c.status === 'active').map((c) => {
        const n = count.get(c.slug) ?? 0;
        const aktif = only.size === 0 || only.has(c.slug);
        return (
          <button
            key={c.slug}
            onClick={() => toggle(c.slug)}
            disabled={n === 0}
            aria-pressed={only.has(c.slug)}
            title={n === 0 ? `Belum ada dokumen ${c.label}` : `${n} note · klik untuk menyaring`}
            className="btn btn-sm"
            style={{ opacity: n === 0 ? 0.35 : aktif ? 1 : 0.4, gap: 6 }}
          >
            <Swatch color={c.color} shape={c.shape} />
            {c.label}
            <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{n}</span>
          </button>
        );
      })}
      {only.size > 0 && (
        <button className="btn btn-sm btn-ghost" onClick={() => onToggle(new Set())}>Tampilkan semua</button>
      )}
    </div>
  );
}

function MemoryPageInner() {
  const bots = useApi<Chatbot[]>('/api/chatbots');
  const [chatbotId, setChatbotId] = useState('');
  useEffect(() => { if (bots.data?.[0] && !chatbotId) setChatbotId(bots.data[0].id); }, [bots.data, chatbotId]);

  const graph = useApi<Graph>(chatbotId ? `/api/memory/graph?chatbotId=${chatbotId}` : null);
  /** Kategori yang sedang ditampilkan; kosong = semua. */
  const [only, setOnly] = useState<Set<string>>(new Set());
  const cats = useApi<Cat[]>('/api/categories');
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  async function run() {
    setBusy('run');
    try { await api('/api/memory/run', { method: 'POST', body: JSON.stringify({ chatbotId }) });
      toast('Memory Agent dijalankan (L1–L5). Refresh sebentar lagi.'); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  }
  async function syncVault() {
    setBusy('vault');
    try { const r = await api<{ uploaded: number }>('/api/memory/vault', { method: 'POST', body: JSON.stringify({ chatbotId }) });
      toast(`${r.uploaded} catatan tersimpan ke Google Drive (_nalar-memory/)`); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Memory</h1><p className="sub">Knowledge graph ala Obsidian dari dokumenmu — catatan ber-[[wikilink]], L1–L5.</p></div>
        <div className="cluster">
          <Select style={{ width: 190, minHeight: 40 }} value={chatbotId} onChange={(e) => setChatbotId(e.target.value)}>
            {bots.data?.length ? bots.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>) : <option>Belum ada chatbot</option>}
          </Select>
          <button className={`btn${busy === 'run' ? ' is-loading' : ''}`} disabled={!chatbotId || !!busy} onClick={run}><Icon name="sync" size={15} /> Jalankan Agent</button>
          <button className={`btn btn-primary${busy === 'vault' ? ' is-loading' : ''}`} disabled={!chatbotId || !!busy} onClick={syncVault}>Sync ke Drive</button>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="panel-head"><span className="t">knowledge graph</span>
            <span className="microlabel">{graph.data ? `${graph.data.nodes.length} NOTES · ${graph.data.edges.length} EDGES` : ''}</span></div>
          <div className="card-pad">
            {!chatbotId ? <EmptyState title="Pilih chatbot" />
              : graph.error ? <ErrorState message={graph.error} onRetry={graph.refetch} />
              : graph.loading || !graph.data ? <Skeleton rows={4} />
              : graph.data.nodes.length === 0
                ? <EmptyState title="Graph masih kosong" hint="Ingest dokumen lalu jalankan Memory Agent." />
                : <>
                    <GraphView graph={filtered(graph.data, only)} cats={cats.data ?? []} />
                    <CategoryLegend graph={graph.data} cats={cats.data ?? []} only={only} onToggle={setOnly} />
                  </>}
          </div>
        </div>

        <div className="card">
          <div className="panel-head"><span className="t">catatan</span><span className="badge">_nalar-memory/</span></div>
          <div className="card-pad">
            {graph.data?.nodes.length ? (
              <div className="stack">
                {graph.data.nodes.slice(0, 12).map((n) => (
                  <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ fontWeight: 650 }}>{n.title}</div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--signal)', marginTop: 3 }}>
                      {n.linksTo.slice(0, 4).map((l) => `[[${l}]]`).join(' ') || <span style={{ color: 'var(--faint)' }}>tanpa link</span>}
                    </div>
                  </div>
                ))}
                <p className="microlabel" style={{ marginTop: 12 }}>VAULT MARKDOWN · BISA DIBUKA DI OBSIDIAN</p>
              </div>
            ) : <p className="microlabel">BELUM ADA CATATAN.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Knowledge graph ala Obsidian Graph View ─────────────────────────
   Force-directed sungguhan (bukan lingkaran statis): repulsi antar-node +
   pegas di tiap edge + gravitasi pusat — hub yang banyak ter-link otomatis
   mengumpul di tengah, node sepi terdorong ke tepi, persis perilaku graph
   Obsidian. Interaksi: hover menyorot node + tetangganya (sisanya
   meredup), drag node (fisika ikut bereaksi), pan latar, scroll = zoom ke
   kursor, label muncul saat zoom dekat / node besar / disorot.
   Canvas tanpa dependensi — ratusan node tetap 60fps. */
/**
 * Gambar penanda kategori. Jalur di-BEGIN di sini supaya pemanggil cukup
 * `fill()`/`stroke()` — halo sorotan memakai jalur yang sama persis, jadi
 * cincinnya mengikuti bentuk node, bukan selalu lingkaran.
 */
function drawMarker(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, shape: string) {
  ctx.beginPath();
  if (shape === 'square') {
    // Sisi disetarakan LUASNYA dengan lingkaran ber-jari-jari r; kalau tidak,
    // kotak tampak jauh lebih besar dan ukuran node berhenti berarti "derajat".
    const s = r * 1.77;
    ctx.rect(x - s / 2, y - s / 2, s, s);
  } else if (shape === 'triangle') {
    const s = r * 1.35;
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.87, y + s * 0.5);
    ctx.lineTo(x - s * 0.87, y + s * 0.5);
    ctx.closePath();
  } else if (shape === 'diamond') {
    const s = r * 1.25;
    ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y);
    ctx.closePath();
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}

interface SimNode {
  id: string; title: string; slug: string;
  x: number; y: number; vx: number; vy: number; r: number; deg: number; seed: number;
  /** Slug kategori — menentukan warna & bentuk penanda. */
  category?: string;
}

function GraphView({ graph, cats }: { graph: Graph; cats: Cat[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* Penanda dihitung SERVER (slot tersimpan → warna × bentuk), bukan di sini:
       kalau frontend menurunkannya dari urutan daftar, menghapus satu kategori
       akan menggambar ulang semua kategori sesudahnya dengan penanda berbeda. */
    const markerBySlug = new Map(cats.map((c) => [c.slug, { color: c.color, shape: c.shape }]));
    const markerOf = (slug?: string) =>
      markerBySlug.get(slug ?? 'lain') ?? { color: OVERFLOW_COLOR, shape: 'circle' };

    /* — data — */
    const deg = new Map<string, number>();
    for (const e of graph.edges) {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    }
    const nodes: SimNode[] = graph.nodes.map((n, i) => {
      const d = deg.get(n.id) ?? 0;
      const a = (i / Math.max(1, graph.nodes.length)) * Math.PI * 2;
      const rr = 60 + (i % 5) * 28; // sebar awal spiral — hindari ledakan awal
      return {
        id: n.id, title: n.title, slug: n.slug, category: n.category,
        x: Math.cos(a) * rr, y: Math.sin(a) * rr, vx: 0, vy: 0,
        deg: d, r: Math.min(4 + Math.sqrt(d) * 2.4, 14),
        seed: (i * 2.399963) % (Math.PI * 2), // sudut emas → fase tersebar rata
      };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = graph.edges
      .map((e) => ({ a: byId.get(e.from), b: byId.get(e.to), wiki: e.kind === 'wikilink' }))
      .filter((l): l is { a: SimNode; b: SimNode; wiki: boolean } => !!l.a && !!l.b);
    const neighbors = new Map<string, Set<string>>();
    for (const l of links) {
      (neighbors.get(l.a.id) ?? neighbors.set(l.a.id, new Set()).get(l.a.id)!).add(l.b.id);
      (neighbors.get(l.b.id) ?? neighbors.set(l.b.id, new Set()).get(l.b.id)!).add(l.a.id);
    }

    /* — warna dari token (canvas tak paham var()) — segarkan saat ganti tema — */
    let C = readColors();
    function readColors() {
      const s = getComputedStyle(document.documentElement);
      const v = (n: string, fb: string) => (s.getPropertyValue(n).trim() || fb);
      return {
        node: v('--signal', '#2563EB'), hub: v('--source-mark', '#F59E0B'),
        edge: v('--line-strong', '#B6C2D2'), label: v('--muted', '#475569'),
        halo: v('--card', '#fff'),
      };
    }
    const themeObs = new MutationObserver(() => { C = readColors(); });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    /* — viewport & interaksi — */
    let W = 0, H = 0, dpr = 1;
    let scale = 1, tx = 0, ty = 0;         // zoom + pan (dunia → layar)
    let hover: SimNode | null = null;
    let drag: SimNode | null = null;
    let panning = false;
    let px = 0, py = 0;
    let alpha = 1;                          // "panas" simulasi

    function resize() {
      const rect = canvas!.parentElement!.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      W = rect.width; H = 460;
      canvas!.width = W * dpr; canvas!.height = H * dpr;
      canvas!.style.width = `${W}px`; canvas!.style.height = `${H}px`;
      tx = W / 2; ty = H / 2;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement!);

    const toWorld = (sx: number, sy: number) => ({ x: (sx - tx) / scale, y: (sy - ty) / scale });
    function pick(sx: number, sy: number): SimNode | null {
      const p = toWorld(sx, sy);
      let best: SimNode | null = null; let bd = 12 / scale;
      for (const n of nodes) {
        const d = Math.hypot(n.x - p.x, n.y - p.y) - n.r;
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    }

    canvas.addEventListener('pointerdown', (e) => {
      const n = pick(e.offsetX, e.offsetY);
      if (n) { drag = n; alpha = Math.max(alpha, 2.2); } // reheat: gugus ikut bergolak
      else { panning = true; }
      px = e.offsetX; py = e.offsetY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (drag) {
        const p = toWorld(e.offsetX, e.offsetY);
        drag.x = p.x; drag.y = p.y; drag.vx = 0; drag.vy = 0;
        alpha = Math.max(alpha, 1.8);
      } else if (panning) {
        tx += e.offsetX - px; ty += e.offsetY - py;
        px = e.offsetX; py = e.offsetY;
      } else {
        hover = pick(e.offsetX, e.offsetY);
        canvas.style.cursor = hover ? 'pointer' : 'grab';
      }
    });
    const release = () => { drag = null; panning = false; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointerleave', () => { release(); hover = null; });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const ns = Math.min(4, Math.max(0.25, scale * f));
      // zoom KE ARAH kursor, bukan ke pusat
      tx = e.offsetX - (e.offsetX - tx) * (ns / scale);
      ty = e.offsetY - (e.offsetY - ty) * (ns / scale);
      scale = ns;
    }, { passive: false });

    /* — fisika: semesta hidup, tak pernah membeku ─────────────────────
       Gaya SELALU penuh (tidak diperkecil "pendinginan"): itulah bedanya
       graph yang hidup dgn gambar diam. Akibatnya nyata:
        • yang ter-link saling MENARIK — menempel jadi gugus;
        • yang tak ter-link saling MENOLAK — gugus lain menyingkir;
        • menyeret satu node MENYERET tetangganya (pegas menular), yang
          tak terkait justru terdorong menjauh;
        • denyut halus per-node membuatnya mengambang seperti benda langit.
       `alpha` tinggal pengganda ENERGI TAMBAHAN sesudah interaksi (reheat),
       tak pernah nol — bukan lagi tombol mati. */
    function step(now: number) {
      const REPULSE = 2400, SPRING = 0.05, REST = 62, GRAVITY = 0.005;
      const DAMP = 0.90, MAX_V = 7, BREATH = 0.045;
      const t = now * 0.00035;

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
          // batasi gaya jarak-dekat: tanpa ini dua node berimpit saling
          // melontarkan diri dan seluruh graph meledak
          const f = Math.min(REPULSE / d2, 3.5) * alpha;
          const d = Math.sqrt(d2);
          a.vx += (dx / d) * f; a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
        }
        // gravitasi lemah ke pusat — supaya gugus tak melayang keluar layar
        a.vx -= a.x * GRAVITY; a.vy -= a.y * GRAVITY;
        // denyut: tiap node punya fase sendiri → mengambang, bukan bergetar
        a.vx += Math.cos(t + a.seed) * BREATH;
        a.vy += Math.sin(t * 1.13 + a.seed * 1.7) * BREATH;
      }

      for (const l of links) {
        const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        // pegas penuh: inilah yang membuat tetangga IKUT saat node diseret
        const f = SPRING * (d - REST);
        l.a.vx += (dx / d) * f; l.a.vy += (dy / d) * f;
        l.b.vx -= (dx / d) * f; l.b.vy -= (dy / d) * f;
      }

      for (const n of nodes) {
        if (n === drag) { n.vx = 0; n.vy = 0; continue; } // yang diseret ikut kursor
        n.vx *= DAMP; n.vy *= DAMP;
        const v = Math.hypot(n.vx, n.vy);
        if (v > MAX_V) { n.vx = (n.vx / v) * MAX_V; n.vy = (n.vy / v) * MAX_V; }
        n.x += n.vx; n.y += n.vy;
      }
      // energi tambahan mereda ke 1 (bukan ke nol) — gerak dasarnya abadi
      alpha = alpha > 1 ? Math.max(1, alpha * 0.985) : 1;
    }

    /* — gambar — */
    function draw() {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, W, H);
      ctx!.translate(tx, ty);
      ctx!.scale(scale, scale);

      const focus = hover ?? drag;
      const hood = focus ? (neighbors.get(focus.id) ?? new Set<string>()) : null;
      const dimmed = (id: string) =>
        !!focus && focus.id !== id && !hood!.has(id);

      for (const l of links) {
        const dim = focus ? dimmed(l.a.id) || dimmed(l.b.id) : false;
        ctx!.globalAlpha = dim ? 0.06 : l.wiki ? 0.55 : 0.3;
        ctx!.strokeStyle = l.wiki ? C.hub : C.edge;
        ctx!.lineWidth = (l.wiki ? 1.4 : 1) / scale;
        ctx!.beginPath(); ctx!.moveTo(l.a.x, l.a.y); ctx!.lineTo(l.b.x, l.b.y); ctx!.stroke();
      }
      for (const n of nodes) {
        const dim = dimmed(n.id);
        ctx!.globalAlpha = dim ? 0.12 : 1;
        // Warna DAN BENTUK = kategori; ukuran = derajat tautan. Dua sumbu
        // untuk kategori bukan hiasan: diuji dengan validator OKLab, warna
        // saja hanya sanggup membawa 4 kategori yang tiap pasangannya bisa
        // dibedakan mata buta warna. Bentuk kebal buta warna sepenuhnya,
        // jadi 4 warna x 4 bentuk memberi 16 kategori yang aman dibaca.
        const m = markerOf(n.category);
        drawMarker(ctx!, n.x, n.y, n.r, m.shape);
        ctx!.fillStyle = m.color;
        ctx!.fill();
        if (focus && (focus.id === n.id || hood!.has(n.id))) {
          ctx!.lineWidth = 2 / scale; ctx!.strokeStyle = C.halo; ctx!.stroke();
        }
        // label: saat disorot / tetangganya / hub besar / zoom dekat
        const showLabel = (focus && (focus.id === n.id || hood!.has(n.id)))
          || (!focus && (scale > 1.4 || n.deg >= 6));
        if (showLabel) {
          ctx!.globalAlpha = dim ? 0.15 : 0.95;
          ctx!.font = `${11 / scale}px ui-monospace, monospace`;
          ctx!.textAlign = 'center';
          ctx!.fillStyle = C.label;
          ctx!.fillText(n.title.slice(0, 28), n.x, n.y + n.r + 12 / scale);
        }
      }
      ctx!.globalAlpha = 1;
    }

    let raf = 0;
    // Selalu melangkah — graph ini memang hidup terus. Saat tab tersembunyi
    // browser menghentikan rAF sendiri, jadi tak ada CPU terbuang di latar.
    const loop = (now: number) => { step(now); draw(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); themeObs.disconnect(); };
  }, [graph, cats]);

  return (
    <div style={{ position: 'relative' }}>
      <canvas ref={canvasRef} role="img" aria-label="Knowledge graph"
        style={{ display: 'block', width: '100%', height: 460, borderRadius: 'var(--rad-md)', touchAction: 'none' }} />
      <span className="microlabel" style={{ position: 'absolute', right: 10, bottom: 8, pointerEvents: 'none' }}>
        SCROLL = ZOOM · SERET = GESER · SERET NODE = ATUR
      </span>
    </div>
  );
}

/** Gate plan (D14): halaman ini fitur berbayar — Free melihat ajakan upgrade
 *  yang menjelaskan apa yang dibuka, bukan sekadar penolakan. */
export default function MemoryPage() {
  return (
    <FeatureGate feature="memory" title="Memory agent & knowledge graph"
      benefit="Agen memory menyaring dokumenmu jadi catatan ber-[[wikilink]] dan memetakannya sebagai graph pengetahuan yang bisa dijelajahi — plus diekspor balik ke Google Drive-mu.">
      <MemoryPageInner />
    </FeatureGate>
  );
}
