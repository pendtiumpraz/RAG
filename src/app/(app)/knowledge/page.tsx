'use client';

import { useEffect, useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Skeleton, ErrorState, EmptyState, useToast } from '../../_components/ui';

interface Chatbot { id: string; name: string }
interface Source { id: string; kind: string; status: string; config: Record<string, unknown>;
  lastSyncedAt: string | null; jobStatus: { state: string } | null }
interface Conn { provider: string; scope: string | null; expiresAt: string | null }

export default function KnowledgePage() {
  const bots = useApi<Chatbot[]>('/api/chatbots');
  const [chatbotId, setChatbotId] = useState('');
  useEffect(() => { if (bots.data?.[0] && !chatbotId) setChatbotId(bots.data[0].id); }, [bots.data, chatbotId]);

  const sources = useApi<Source[]>(chatbotId ? `/api/sources?chatbotId=${chatbotId}` : null);
  const conns = useApi<Conn[]>('/api/connections');
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  async function resync(id: string) {
    try { await api(`/api/sources/${id}/sync`, { method: 'POST' }); toast('Sync dijalankan'); sources.refetch(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Knowledge Base</h1><p className="sub">Sumber &amp; dokumen per chatbot. Beda chatbot = beda knowledge base terisolasi.</p></div>
        <div className="cluster">
          <select className="select" style={{ width: 200, minHeight: 40 }} value={chatbotId} onChange={(e) => setChatbotId(e.target.value)}>
            {bots.data?.length ? bots.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>) : <option>Belum ada chatbot</option>}
          </select>
          <button className="btn btn-primary" disabled={!chatbotId} onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Hubungkan sumber</button>
        </div>
      </div>

      {/* Status koneksi storage user */}
      <div className="card" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="panel-head"><span className="t">koneksi storage kamu</span></div>
        <div className="card-pad cluster gap-4">
          {conns.loading ? <span className="microlabel">memuat…</span> :
            (['google', 'microsoft'] as const).map((p) => {
              const c = conns.data?.find((x) => x.provider === p);
              return (
                <span key={p} className={`badge ${c ? 'badge-ok' : ''}`}>
                  <Icon name="plug" size={13} /> {p === 'google' ? 'Google Drive' : 'OneDrive / SharePoint'} · {c ? 'terhubung' : 'belum'}
                </span>
              );
            })}
          <span className="microlabel">HUBUNGKAN LEWAT LOGIN GOOGLE/MICROSOFT (IZIN DRIVE).</span>
        </div>
      </div>

      <div className="card">
        <div className="panel-head"><span className="t">sumber data</span></div>
        {!chatbotId ? <EmptyState title="Buat chatbot dulu" hint="Knowledge base menempel pada chatbot." />
          : sources.error ? <ErrorState message={sources.error} onRetry={sources.refetch} />
          : sources.loading || !sources.data ? <Skeleton rows={3} />
          : sources.data.length === 0 ? <EmptyState title="Belum ada sumber"
              hint="Hubungkan Google Drive / OneDrive / SharePoint, atau unggah file."
              action={<button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>Hubungkan sumber</button>} />
          : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Jenis</th><th>Lokasi</th><th>Status</th><th>Terakhir sync</th><th /></tr></thead>
              <tbody>
                {sources.data.map((s) => (
                  <tr key={s.id}>
                    <td><span className="badge">{s.kind}</span></td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>{String(s.config.folderId ?? s.config.folderPath ?? '—')}</td>
                    <td><StatusBadge s={s} /></td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>{s.lastSyncedAt?.slice(0, 16).replace('T', ' ') ?? '—'}</td>
                    <td><button className="btn btn-sm" onClick={() => resync(s.id)}><Icon name="sync" size={14} /> Sync</button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
      </div>

      {adding && <SourceDrawer chatbotId={chatbotId} onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); sources.refetch(); }} />}
    </>
  );
}

function StatusBadge({ s }: { s: Source }) {
  const st = s.jobStatus?.state ?? s.status;
  const cls = st === 'synced' || st === 'done' ? 'badge-ok' : st === 'error' || st === 'failed' ? 'badge-danger' : 'badge-signal';
  const live = st === 'syncing' || st === 'running';
  return <span className={`badge ${cls}`}><span className={`led ${live ? 'led-live' : st === 'error' ? 'led-err' : 'led-off'}`} />{st}</span>;
}

function SourceDrawer({ chatbotId, onClose, onSaved }:
  { chatbotId: string; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState('gdrive');
  const [loc, setLoc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  async function save() {
    setBusy(true); setErr(null);
    const config = kind === 'gdrive' ? { folderId: loc || 'root' } : { folderPath: loc };
    try {
      await api('/api/sources', { method: 'POST', body: JSON.stringify({ chatbotId, kind, config }) });
      toast('Sumber terhubung — sync berjalan'); onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="backdrop show" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-label="Hubungkan sumber">
        <div className="dh"><h3>Hubungkan sumber</h3><button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" size={16} /></button></div>
        <div className="db stack gap-4">
          <div className="field"><label>Jenis sumber</label>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="gdrive">Google Drive</option>
              <option value="onedrive">OneDrive</option>
              <option value="sharepoint">SharePoint</option>
            </select></div>
          <div className="field"><label>{kind === 'gdrive' ? 'Folder ID (kosong = root)' : 'Folder path'}</label>
            <input className="input" value={loc} onChange={(e) => setLoc(e.target.value)}
              placeholder={kind === 'gdrive' ? '1A2b3C… atau kosong' : '/Knowledge/support'} /></div>
          <p className="microlabel">SYNC MEMBACA STORAGE-MU (PDF/DOCX/TXT/…) → INGEST → MEMORY AGENT OTOMATIS.</p>
          {err && <span className="error">{err}</span>}
        </div>
        <div className="df">
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} style={{ flex: 1 }} onClick={save} disabled={busy}>Hubungkan &amp; sync</button>
          <button className="btn" onClick={onClose}>Batal</button>
        </div>
      </aside>
    </>
  );
}
