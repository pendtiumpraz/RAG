'use client';

import { useEffect, useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Skeleton, ErrorState, EmptyState, useToast } from '../../_components/ui';

interface Chatbot { id: string; name: string }
/** Ringkasan run delta terakhir — ditulis sync.service ke config.lastSync. */
interface LastSync { ingested?: number; updated?: number; removed?: number; unchanged?: number;
  skipped?: number; failed?: number; pending?: number; message?: string }
interface Source { id: string; kind: string; status: string; config: Record<string, unknown>;
  lastSyncedAt: string | null; jobStatus: { state: string } | null }
interface Conn { id: string; provider: string; accountEmail: string; accountLabel: string | null }

export default function KnowledgePage() {
  const bots = useApi<Chatbot[]>('/api/chatbots');
  const [chatbotId, setChatbotId] = useState('');
  useEffect(() => { if (bots.data?.[0] && !chatbotId) setChatbotId(bots.data[0].id); }, [bots.data, chatbotId]);

  const sources = useApi<Source[]>(chatbotId ? `/api/sources?chatbotId=${chatbotId}` : null);
  const conns = useApi<Conn[]>('/api/connections');
  const oauthReady = useApi<{ google: boolean; microsoft: boolean }>('/api/connections/providers');
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('connect');
    if (!c) return;
    if (c === 'ok') { toast('Akun terhubung'); conns.refetch(); }
    else toast('Gagal menghubungkan akun', 'error');
    window.history.replaceState({}, '', '/knowledge'); // bersihkan query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Delta (default) hanya memproses file baru/berubah; penuh meng-ingest ulang semua. */
  async function resync(id: string, full = false) {
    try {
      await api(`/api/sources/${id}/sync${full ? '?full=1' : ''}`, { method: 'POST' });
      toast(full ? 'Sync penuh dijalankan' : 'Sync dijalankan (hanya perubahan)');
      sources.refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function disconnect(id: string) {
    try { await api(`/api/connections?id=${id}`, { method: 'DELETE' }); toast('Akun diputus'); conns.refetch(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Knowledge Base</h1><p className="sub">Hubungkan banyak akun Google/Microsoft, scan seluruh Drive atau folder tertentu. Beda chatbot = beda knowledge base.</p></div>
        <div className="cluster">
          <select className="select" style={{ width: 190, minHeight: 40 }} value={chatbotId} onChange={(e) => setChatbotId(e.target.value)}>
            {bots.data?.length ? bots.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>) : <option>Belum ada chatbot</option>}
          </select>
          <button className="btn btn-primary" disabled={!chatbotId} onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Tambah sumber</button>
        </div>
      </div>

      {/* Akun terhubung (multi-akun) */}
      <div className="card" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="panel-head"><span className="t">akun storage terhubung</span>
          <div className="cluster gap-2">
            {/* Tombol hanya muncul bila env OAuth-nya memang terpasang —
                kalau tidak, tautannya mendarat di JSON galat mentah. */}
            {oauthReady.data?.google && <a className="btn btn-sm" href="/api/connections/google/start"><Icon name="plug" size={14} /> Connect Google</a>}
            {oauthReady.data?.microsoft && <a className="btn btn-sm" href="/api/connections/microsoft/start"><Icon name="plug" size={14} /> Connect Microsoft</a>}
          </div>
        </div>

        {oauthReady.data && !oauthReady.data.google && !oauthReady.data.microsoft && (
          <div className="card-pad" style={{ borderLeft: '3px solid var(--source)' }}>
            <b>OAuth Google/Microsoft belum dikonfigurasi</b>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
              Sinkronisasi Drive/OneDrive/SharePoint butuh OAuth client yang
              didaftarkan lebih dulu, lalu <code>GOOGLE_CLIENT_ID</code>/
              <code>MS_CLIENT_ID</code> (beserta secret-nya) dipasang di environment.
              Selama belum ada, dokumen tetap bisa dimasukkan lewat{' '}
              <code>POST /api/ingest</code>.
            </p>
            <a className="btn btn-sm" href="/docs/oauth-setup.html" target="_blank" rel="noreferrer"
              style={{ marginTop: 10 }}>Buka panduan lengkap</a>
          </div>
        )}
        <div className="card-pad">
          {conns.loading ? <span className="microlabel">memuat…</span>
            : !conns.data?.length ? <p className="microlabel">BELUM ADA AKUN. HUBUNGKAN GOOGLE / MICROSOFT UNTUK MENSCAN DRIVE-MU.</p>
            : (
              <div className="stack" style={{ gap: 8 }}>
                {conns.data.map((c) => (
                  <div key={c.id} className="cluster" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                    <span className="badge badge-ok"><span className="led" />{c.provider === 'google' ? 'Google' : 'Microsoft'}</span>
                    <span style={{ flex: 1, color: 'var(--muted)', fontSize: 13 }}>{c.accountEmail}</span>
                    <button className="btn btn-sm btn-ghost" onClick={() => disconnect(c.id)}>Putus</button>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      <div className="card">
        <div className="panel-head"><span className="t">sumber data chatbot</span></div>
        {!chatbotId ? <EmptyState title="Buat chatbot dulu" hint="Knowledge base menempel pada chatbot." />
          : sources.error ? <ErrorState message={sources.error} onRetry={sources.refetch} />
          : sources.loading || !sources.data ? <Skeleton rows={3} />
          : sources.data.length === 0 ? <EmptyState title="Belum ada sumber"
              hint="Tambah sumber: seluruh Drive, folder tertentu, OneDrive, atau SharePoint."
              action={<button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>Tambah sumber</button>} />
          : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Jenis</th><th>Akun</th><th>Cakupan</th><th>Status</th><th>Hasil terakhir</th><th>Terakhir</th><th /></tr></thead>
              <tbody>
                {sources.data.map((s) => (
                  <tr key={s.id}>
                    <td><span className="badge">{s.kind}</span></td>
                    <td style={{ color: 'var(--muted)' }}>{String(s.config.accountEmail ?? '—')}</td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>{s.config.scope === 'all' ? 'seluruh drive' : String(s.config.folderId ?? s.config.folderPath ?? 'folder')}</td>
                    <td><StatusBadge s={s} /></td>
                    <td><DeltaSummary last={s.config.lastSync as LastSync | undefined} /></td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>{s.lastSyncedAt?.slice(0, 16).replace('T', ' ') ?? '—'}</td>
                    <td>
                      <div className="cluster gap-2">
                        <button className="btn btn-sm" onClick={() => resync(s.id)}><Icon name="sync" size={14} /> Sync</button>
                        <button className="btn btn-sm btn-ghost" title="Abaikan versi tersimpan, ingest ulang semua file"
                          onClick={() => resync(s.id, true)}>Penuh</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
      </div>

      {adding && <SourceDrawer chatbotId={chatbotId} accounts={conns.data ?? []} onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); sources.refetch(); }} />}
    </>
  );
}

/**
 * Hasil run delta terakhir — apa yang BERUBAH, bukan sekadar "selesai".
 * +baru ~diperbarui −dihapus · sisanya tak disentuh (tak ada biaya embedding).
 */
function DeltaSummary({ last }: { last?: LastSync }) {
  if (!last) return <span className="microlabel" style={{ color: 'var(--muted)' }}>—</span>;
  if (last.message) return <span style={{ color: 'var(--danger)', fontSize: 12 }}>{last.message}</span>;

  const parts: Array<[string, number, string]> = [
    ['+', last.ingested ?? 0, 'var(--good)'],
    ['~', last.updated ?? 0, 'var(--signal)'],
    ['−', last.removed ?? 0, 'var(--danger)'],
  ];
  const changed = parts.filter(([, n]) => n > 0);

  return (
    <span className="cluster gap-2 mono" style={{ fontSize: 12 }}>
      {changed.length === 0
        ? <span style={{ color: 'var(--muted)' }}>tak ada perubahan</span>
        : changed.map(([sym, n, color]) => <span key={sym} style={{ color }}>{sym}{n}</span>)}
      {!!last.unchanged && <span style={{ color: 'var(--muted)' }}>· {last.unchanged} tetap</span>}
      {!!last.skipped && <span style={{ color: 'var(--muted)' }}>· {last.skipped} dilewati</span>}
      {!!last.failed && <span style={{ color: 'var(--danger)' }}>· {last.failed} gagal</span>}
      {!!last.pending && <span style={{ color: 'var(--source)' }}>· {last.pending} antre</span>}
    </span>
  );
}

function StatusBadge({ s }: { s: Source }) {
  const st = s.jobStatus?.state ?? s.status;
  const cls = st === 'synced' || st === 'done' ? 'badge-ok' : st === 'error' || st === 'failed' ? 'badge-danger' : 'badge-signal';
  const live = st === 'syncing' || st === 'running';
  return <span className={`badge ${cls}`}><span className={`led ${live ? 'led-live' : st === 'error' ? 'led-err' : 'led-off'}`} />{st}</span>;
}

function SourceDrawer({ chatbotId, accounts, onClose, onSaved }:
  { chatbotId: string; accounts: Conn[]; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState('gdrive');
  const [scope, setScope] = useState<'all' | 'folder'>('all');
  const [loc, setLoc] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  const provider = kind === 'gdrive' ? 'google' : 'microsoft';
  const providerAccounts = accounts.filter((a) => a.provider === provider);
  useEffect(() => { setAccountEmail(providerAccounts[0]?.accountEmail ?? ''); }, [kind]); // eslint-disable-line

  async function save() {
    if (!accountEmail) { setErr(`Hubungkan akun ${provider} dulu (tombol Connect di atas).`); return; }
    setBusy(true); setErr(null);
    const config: Record<string, unknown> = { scope, accountEmail };
    if (scope === 'folder') { if (kind === 'gdrive') config.folderId = loc || 'root'; else config.folderPath = loc; }
    try {
      await api('/api/sources', { method: 'POST', body: JSON.stringify({ chatbotId, kind, config }) });
      toast('Sumber ditambah — sync berjalan'); onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="backdrop show" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-label="Tambah sumber">
        <div className="dh"><h3>Tambah sumber</h3><button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" size={16} /></button></div>
        <div className="db stack gap-4">
          <div className="field"><label>Jenis sumber</label>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="gdrive">Google Drive</option>
              <option value="onedrive">OneDrive</option>
              <option value="sharepoint">SharePoint</option>
            </select></div>

          <div className="field"><label>Akun {provider}</label>
            {providerAccounts.length ? (
              <select className="select" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)}>
                {providerAccounts.map((a) => <option key={a.id} value={a.accountEmail}>{a.accountEmail}</option>)}
              </select>
            ) : (
              <a className="btn btn-sm" href={`/api/connections/${provider}/start`}><Icon name="plug" size={14} /> Connect {provider}</a>
            )}
          </div>

          <div className="field"><label>Cakupan</label>
            <select className="select" value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'folder')}>
              <option value="all">Seluruh Drive (rekursif)</option>
              <option value="folder">Folder tertentu (rekursif)</option>
            </select></div>

          {scope === 'folder' && (
            <div className="field"><label>{kind === 'gdrive' ? 'Folder ID' : 'Folder path'}</label>
              <input className="input" value={loc} onChange={(e) => setLoc(e.target.value)}
                placeholder={kind === 'gdrive' ? '1A2b3C… (kosong = root)' : '/Knowledge/support'} /></div>
          )}

          <p className="microlabel">SYNC MENSCAN STORAGE (PDF/DOCX/TXT/…) → INGEST → MEMORY AGENT OTOMATIS. MAKS 300 FILE/RUN.</p>
          {err && <span className="error">{err}</span>}
        </div>
        <div className="df">
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} style={{ flex: 1 }} onClick={save} disabled={busy}>Tambah &amp; sync</button>
          <button className="btn" onClick={onClose}>Batal</button>
        </div>
      </aside>
    </>
  );
}
