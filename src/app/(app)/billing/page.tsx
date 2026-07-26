'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { api, useApi } from '../../_lib/api';
import { Skeleton, ErrorState, useToast } from '../../_components/ui';

interface PlanSpec { id: string; messagesPerMonth: number | null; maxChatbots: number | null; maxMembers: number | null }
interface Billing {
  plan: string; planOnPaper: string; planExpiresAt: string | null; expired: boolean;
  usage: { messages: number; tokensIn: number; tokensOut: number; members: number; chatbots: number };
  limits: { messagesPerMonth: number | null; maxChatbots: number | null; maxMembers: number | null };
  plans: PlanSpec[];
}
interface TenantRow {
  tenantId: string; tenantName: string; planOnPaper: string; plan: string;
  planExpiresAt: string | null; expired: boolean;
  members: number; chatbots: number; messages: number; tokensIn: number; tokensOut: number;
}

const fmt = (n: number) => n.toLocaleString('id-ID');

export default function BillingPage() {
  const { data: session } = useSession();
  const { data, loading, error, refetch } = useApi<Billing>('/api/billing');

  if (error) return <div className="card"><ErrorState message={error} onRetry={refetch} /></div>;
  if (loading || !data) return <div className="card"><Skeleton rows={4} /></div>;

  return (
    <>
      <div className="page-head">
        <div><h1>Billing</h1><p className="sub">Plan, kuota, dan pemakaian periode berjalan.</p></div>
      </div>

      {/* Plan kedaluwarsa BUKAN sekadar catatan — kuotanya sudah benar-benar
          turun ke free, jadi katakan apa adanya. */}
      {data.expired && (
        <div className="card" style={{ borderLeft: '3px solid var(--danger)', marginBottom: 'var(--sp-4)' }}>
          <div className="card-pad">
            <b>Plan {data.planOnPaper} sudah lewat masa berlaku</b>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>
              Sejak {data.planExpiresAt?.slice(0, 10)}, kuota yang berlaku adalah plan <b>free</b>.
              Hubungi admin untuk memperpanjang.
            </p>
          </div>
        </div>
      )}

      <div className="grid g2">
        <div className="card">
          <div className="panel-head"><span className="t">plan aktif</span>
            <span className="badge badge-source">{data.plan}</span></div>
          <div className="card-pad stack gap-4">
            <Meter label="Pesan bulan ini" used={data.usage.messages} limit={data.limits.messagesPerMonth} />
            <Meter label="Chatbot" used={data.usage.chatbots} limit={data.limits.maxChatbots} />
            <Meter label="Anggota tim" used={data.usage.members} limit={data.limits.maxMembers} />
            <div className="cluster" style={{ justifyContent: 'space-between', fontSize: 13, color: 'var(--muted)' }}>
              <span>Token masuk / keluar</span>
              <span className="mono">{fmt(data.usage.tokensIn)} / {fmt(data.usage.tokensOut)}</span>
            </div>
            {data.planExpiresAt && !data.expired && (
              <p className="microlabel">BERLAKU SAMPAI {data.planExpiresAt.slice(0, 10)}</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="panel-head"><span className="t">paket tersedia</span></div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Plan</th><th>Pesan/bulan</th><th>Chatbot</th><th>Anggota</th></tr></thead>
            <tbody>
              {data.plans.map((p) => (
                <tr key={p.id} style={p.id === data.plan ? { background: 'var(--card-2)' } : undefined}>
                  <td><b>{p.id}</b>{p.id === data.plan && <span className="microlabel" style={{ marginLeft: 8 }}>AKTIF</span>}</td>
                  <td className="mono">{p.messagesPerMonth === null ? '∞' : fmt(p.messagesPerMonth)}</td>
                  <td className="mono">{p.maxChatbots === null ? '∞' : p.maxChatbots}</td>
                  <td className="mono">{p.maxMembers === null ? '∞' : p.maxMembers}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div className="card-pad">
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Pembayaran belum otomatis. Untuk naik paket, hubungi admin —
              plan diaktifkan manual sampai tanggal yang disepakati.
            </p>
          </div>
        </div>
      </div>

      {session?.user?.role === 'superadmin' && <AllTenants />}
    </>
  );
}

/** Bar pemakaian. Limit null = tak terbatas, jadi jangan tampilkan bar palsu. */
function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const color = pct >= 100 ? 'var(--danger)' : pct >= 80 ? 'var(--source)' : 'var(--good)';
  return (
    <div>
      <div className="cluster" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13 }}>{label}</span>
        <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>
          {fmt(used)}{limit === null ? ' / ∞' : ` / ${fmt(limit)}`}
        </span>
      </div>
      {limit !== null && (
        <div style={{ height: 6, background: 'var(--card-3)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .3s' }} />
        </div>
      )}
    </div>
  );
}

/* ── pandangan platform (superadmin) ────────────────────────────────── */

function AllTenants() {
  const { data, loading, error, refetch } = useApi<{ tenants: TenantRow[]; plans: PlanSpec[] }>('/api/admin/billing');
  const [editing, setEditing] = useState<TenantRow | null>(null);

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head"><span className="t">semua tenant</span>
        <span className="microlabel">SUPERADMIN · {data?.tenants.length ?? 0} TENANT</span></div>

      {error ? <ErrorState message={error} onRetry={refetch} />
        : loading || !data ? <Skeleton rows={3} />
        : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Organisasi</th><th>Plan</th><th>Berlaku s/d</th><th>Anggota</th><th>Chatbot</th><th>Pesan bln ini</th><th /></tr></thead>
            <tbody>
              {data.tenants.map((t) => (
                <tr key={t.tenantId}>
                  <td><b>{t.tenantName}</b></td>
                  <td>
                    <span className={`badge ${t.expired ? 'badge-danger' : 'badge-source'}`}>{t.planOnPaper}</span>
                    {t.expired && <span className="microlabel" style={{ marginLeft: 6 }}>→ FREE</span>}
                  </td>
                  <td className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {t.planExpiresAt?.slice(0, 10) ?? '—'}</td>
                  <td className="mono">{t.members}</td>
                  <td className="mono">{t.chatbots}</td>
                  <td className="mono">{fmt(t.messages)}</td>
                  <td><button className="btn btn-sm" onClick={() => setEditing(t)}>Ubah plan</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}

      {editing && <PlanDrawer tenant={editing} plans={data?.plans ?? []}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refetch(); }} />}
    </div>
  );
}

function PlanDrawer({ tenant, plans, onClose, onSaved }: {
  tenant: TenantRow; plans: PlanSpec[]; onClose: () => void; onSaved: () => void;
}) {
  const [plan, setPlan] = useState(tenant.planOnPaper);
  const [expiresAt, setExpiresAt] = useState(tenant.planExpiresAt?.slice(0, 10) ?? '');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function save() {
    setBusy(true);
    try {
      await api('/api/admin/billing', {
        method: 'PATCH',
        body: JSON.stringify({
          tenantId: tenant.tenantId, plan,
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : null,
        }),
      });
      toast(`Plan ${tenant.tenantName} → ${plan}`);
      onSaved();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="backdrop show" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-label="Ubah plan">
        <div className="dh"><h3>Plan — {tenant.tenantName}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup">×</button></div>
        <div className="db stack gap-4">
          <div className="field"><label>Plan</label>
            <select className="select" value={plan} onChange={(e) => setPlan(e.target.value)}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
            </select></div>
          <div className="field"><label>Berlaku sampai</label>
            <input className="input mono" type="date" value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)} />
            <p className="microlabel" style={{ marginTop: 6 }}>
              KOSONGKAN = TANPA BATAS WAKTU. LEWAT TANGGAL INI KUOTA TURUN KE FREE.
            </p></div>
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Dipakai untuk penagihan manual: setelah pembayaran diterima, setel
            plan dan tanggal berakhirnya di sini.
          </p>
        </div>
        <div className="df">
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} disabled={busy} onClick={save}>Simpan</button>
          <button className="btn btn-ghost" onClick={onClose}>Batal</button>
        </div>
      </aside>
    </>
  );
}
