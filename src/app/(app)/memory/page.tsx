'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Skeleton, ErrorState, EmptyState, useToast } from '../../_components/ui';

interface Chatbot { id: string; name: string }
interface Node { id: string; slug: string; title: string; linksTo: string[] }
interface Edge { from: string; to: string; kind: string; weight: number }
interface Graph { nodes: Node[]; edges: Edge[] }

export default function MemoryPage() {
  const bots = useApi<Chatbot[]>('/api/chatbots');
  const [chatbotId, setChatbotId] = useState('');
  useEffect(() => { if (bots.data?.[0] && !chatbotId) setChatbotId(bots.data[0].id); }, [bots.data, chatbotId]);

  const graph = useApi<Graph>(chatbotId ? `/api/memory/graph?chatbotId=${chatbotId}` : null);
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
          <select className="select" style={{ width: 190, minHeight: 40 }} value={chatbotId} onChange={(e) => setChatbotId(e.target.value)}>
            {bots.data?.length ? bots.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>) : <option>Belum ada chatbot</option>}
          </select>
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
                : <GraphView graph={graph.data} />}
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

function GraphView({ graph }: { graph: Graph }) {
  const layout = useMemo(() => {
    const n = graph.nodes.length;
    const cx = 280, cy = 165, r = Math.min(140, 40 + n * 6);
    const deg = new Map<string, number>();
    graph.edges.forEach((e) => { deg.set(e.from, (deg.get(e.from) ?? 0) + 1); deg.set(e.to, (deg.get(e.to) ?? 0) + 1); });
    const pos = new Map<string, { x: number; y: number; hub: boolean }>();
    graph.nodes.forEach((node, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
      pos.set(node.id, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, hub: (deg.get(node.id) ?? 0) >= 4 });
    });
    return pos;
  }, [graph]);

  return (
    <svg viewBox="0 0 560 330" style={{ width: '100%', height: 320 }} role="img" aria-label="Knowledge graph">
      {graph.edges.map((e, i) => {
        const a = layout.get(e.from), b = layout.get(e.to); if (!a || !b) return null;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke={e.kind === 'wikilink' ? 'var(--source-mark)' : 'var(--line-strong)'} strokeWidth={e.kind === 'wikilink' ? 1.4 : 1} />;
      })}
      {graph.nodes.map((node) => {
        const p = layout.get(node.id); if (!p) return null;
        return (
          <g key={node.id}>
            <circle cx={p.x} cy={p.y} r={p.hub ? 9 : 6}
              fill={p.hub ? 'var(--source-mark)' : 'var(--card)'} stroke={p.hub ? 'var(--source)' : 'var(--signal)'} strokeWidth={1.5}>
              <title>{node.title}</title>
            </circle>
            <text x={p.x} y={p.y - 12} textAnchor="middle" fontSize={9}
              fontFamily="var(--font-mono)" fill="var(--muted)">{node.slug.slice(0, 14)}</text>
          </g>
        );
      })}
    </svg>
  );
}
