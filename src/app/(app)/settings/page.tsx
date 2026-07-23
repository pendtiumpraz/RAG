'use client';

import { useEffect, useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { Skeleton, useToast } from '../../_components/ui';
import { toggleTheme } from '../../providers';

interface Settings { active: { themeConfig: { theme?: { signal?: string; source?: string } } | null } | null }

/** Settings tenant + white-label ringkas (simpan themeConfig via /api/settings). */
export default function SettingsPage() {
  const { data, loading, refetch } = useApi<Settings>('/api/settings');
  const [signal, setSignal] = useState('#2563EB');
  const [source, setSource] = useState('#F59E0B');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const t = data?.active?.themeConfig?.theme;
    if (t?.signal) setSignal(t.signal); if (t?.source) setSource(t.source);
  }, [data]);

  async function save() {
    setBusy(true);
    try {
      await api('/api/settings', { method: 'POST', body: JSON.stringify({ themeConfig: { theme: { signal, source } } }) });
      toast('Branding tersimpan'); refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Settings</h1><p className="sub">Tenant, tampilan, dan white-label workspace.</p></div>
        <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} onClick={save} disabled={busy}>Simpan</button>
      </div>

      {loading ? <div className="card"><Skeleton rows={3} /></div> : (
        <div className="grid g3">
          <div className="card"><div className="panel-head"><span className="t">tampilan</span></div>
            <div className="card-pad stack gap-3">
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Tema mengikuti brand resmi (light default). Bisa diubah per perangkat.</p>
              <button className="btn" onClick={toggleTheme}>Ganti tema (light / dark)</button>
            </div></div>

          <div className="card"><div className="panel-head"><span className="t">white-label</span></div>
            <div className="card-pad stack gap-4">
              <div className="cluster" style={{ justifyContent: 'space-between' }}>
                <label className="kicker">Signal (interaktif)</label>
                <input type="color" value={signal} onChange={(e) => setSignal(e.target.value)}
                  style={{ width: 40, height: 30, border: '1px solid var(--line-strong)', borderRadius: 6, background: 'none' }} />
              </div>
              <div className="cluster" style={{ justifyContent: 'space-between' }}>
                <label className="kicker">Source (sitasi)</label>
                <input type="color" value={source} onChange={(e) => setSource(e.target.value)}
                  style={{ width: 40, height: 30, border: '1px solid var(--line-strong)', borderRadius: 6, background: 'none' }} />
              </div>
              <p className="microlabel">DITERAPKAN KE DASHBOARD, WIDGET EMBED, &amp; HALAMAN CLIENT.</p>
            </div></div>

          <div className="card"><div className="panel-head"><span className="t">deployment</span></div>
            <div className="card-pad"><table className="table"><tbody>
              <tr><td>Mode</td><td className="num"><span className="badge badge-source">SaaS</span></td></tr>
              <tr><td>Isolasi RLS</td><td className="num"><span className="badge badge-ok"><span className="led led-live" />aktif</span></td></tr>
              <tr><td>API docs</td><td className="num"><a href="/api/openapi" target="_blank">OpenAPI ↗</a></td></tr>
            </tbody></table></div></div>
        </div>
      )}
    </>
  );
}
