'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { api, useApi } from '../../_lib/api';
import { Skeleton, ErrorState, useToast } from '../../_components/ui';
import { Select } from '../../_components/select';

interface PlanSpec { id: string; messagesPerMonth: number | null; maxChatbots: number | null; maxMembers: number | null }
interface Billing {
  plan: string; planOnPaper: string; planExpiresAt: string | null; expired: boolean;
  usage: { messages: number; tokensIn: number; tokensOut: number; members: number; chatbots: number };
  limits: { messagesPerMonth: number | null; maxChatbots: number | null; maxMembers: number | null };
  plans: PlanSpec[];
  payment: { enabled: boolean; mode: 'saas' | 'onprem'; planPrices: Record<string, number> };
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
            {data.payment.mode === 'onprem' ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                Mode <b>on-premise</b>: pembayaran nonaktif dan semua kuota
                tanpa batas — tabel di atas tidak berlaku.
              </p>
            ) : data.payment.enabled ? (
              <UpgradeQris prices={data.payment.planPrices} currentPlan={data.plan} />
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>
                Pembayaran otomatis belum dikonfigurasi. Untuk naik paket,
                hubungi admin — plan diaktifkan manual.
              </p>
            )}
          </div>
        </div>
      </div>

      {session?.user?.role === 'superadmin' && <PaymentSettings />}
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

/* ── upgrade via QRIS (tenant, mode saas + gateway aktif) ───────────── */

function UpgradeQris({ prices, currentPlan }: { prices: Record<string, number>; currentPlan: string }) {
  const router = useRouter();
  const toast = useToast();
  const buyable = ['pro', 'enterprise'].filter((p) => prices[p]);
  const [plan, setPlan] = useState(buyable.find((p) => p !== currentPlan) ?? buyable[0] ?? 'pro');
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const total = (prices[plan] ?? 0) * months;

  async function pay() {
    setBusy(true);
    try {
      const r = await api<{ id: string }>('/api/payments', {
        method: 'POST', body: JSON.stringify({ plan, months }),
      });
      router.push(`/billing/pay/${r.id}`); // halaman QRIS milik sendiri
    } catch (e) { toast((e as Error).message, 'error'); setBusy(false); }
  }

  return (
    <div className="stack gap-3">
      <span className="microlabel">UPGRADE VIA QRIS — BAYAR DI HALAMAN INI JUGA, TANPA PINDAH SITUS</span>
      <div className="cluster gap-2">
        <Select style={{ width: 150 }} value={plan} onChange={(e) => setPlan(e.target.value)}>
          {buyable.map((p) => <option key={p} value={p}>{p} — Rp {fmt(prices[p])}/bln</option>)}
        </Select>
        <Select style={{ width: 130 }} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {[1, 3, 6, 12].map((m) => <option key={m} value={m}>{m} bulan</option>)}
        </Select>
        <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} disabled={busy} onClick={pay}>
          Bayar Rp {fmt(total)}
        </button>
      </div>
    </div>
  );
}

/* ── pengaturan pembayaran & mode deploy (superadmin, D12) ──────────── */

interface PaySettings {
  deploymentMode: 'saas' | 'onprem';
  planPrices: Record<string, number>;
  gateways: Array<{ provider: string; active: boolean; configured: boolean; publicConfig: Record<string, string | boolean> }>;
  callbackUrls: Record<string, string>;
}

/** Field kredensial per provider — nilainya TIDAK pernah dibaca balik. */
const GATEWAY_FIELDS: Record<string, Array<{ key: string; label: string; secret: boolean }>> = {
  midtrans: [{ key: 'serverKey', label: 'Server Key', secret: true }],
  tripay: [
    { key: 'apiKey', label: 'API Key', secret: true },
    { key: 'privateKey', label: 'Private Key', secret: true },
    { key: 'merchantCode', label: 'Kode Merchant', secret: false },
  ],
  xendit: [
    { key: 'secretKey', label: 'Secret Key', secret: true },
    { key: 'callbackToken', label: 'Callback Verification Token', secret: true },
  ],
};

function PaymentSettings() {
  const { data, error, refetch } = useApi<PaySettings>('/api/admin/payment-settings');
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<Record<string, Record<string, string>>>({});
  const [sandbox, setSandbox] = useState<Record<string, boolean>>({});
  const [prices, setPrices] = useState<Record<string, string>>({});

  async function put(body: Record<string, unknown>, okMsg: string) {
    setBusy(true);
    try {
      await api('/api/admin/payment-settings', { method: 'PUT', body: JSON.stringify(body) });
      toast(okMsg); refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  if (error) return <div className="card" style={{ marginTop: 'var(--sp-4)' }}><ErrorState message={error} onRetry={refetch} /></div>;
  if (!data) return <div className="card" style={{ marginTop: 'var(--sp-4)' }}><Skeleton rows={3} /></div>;

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head"><span className="t">pengaturan pembayaran &amp; mode deploy (superadmin)</span>
        <span className="microlabel">SEMUA DI DATABASE · TANPA ENV</span></div>
      <div className="card-pad stack gap-5">

        {/* mode deploy */}
        <div className="cluster gap-4" style={{ alignItems: 'flex-end' }}>
          <div className="field" style={{ width: 260 }}>
            <label>Mode deploy</label>
            <Select value={data.deploymentMode} disabled={busy}
              onChange={(e) => void put({ deploymentMode: e.target.value }, 'Mode deploy tersimpan')}>
              <option value="saas">SaaS — pembayaran & kuota aktif</option>
              <option value="onprem">On-premise — bayar mati, semua unlimited</option>
            </Select>
          </div>
          {/* harga plan */}
          {(['pro', 'enterprise'] as const).map((p) => (
            <div key={p} className="field" style={{ width: 180 }}>
              <label>Harga {p} (IDR/bln)</label>
              <input className="input" inputMode="numeric"
                value={prices[p] ?? String(data.planPrices[p] ?? '')}
                onChange={(e) => setPrices((s) => ({ ...s, [p]: e.target.value.replace(/\D/g, '') }))}
                onBlur={() => {
                  const v = Number(prices[p]);
                  if (v && v !== data.planPrices[p]) {
                    void put({ planPrices: { ...data.planPrices, [p]: v } }, `Harga ${p} tersimpan`);
                  }
                }} />
            </div>
          ))}
        </div>

        {/* gateway: pilih SATU aktif + kredensial per provider */}
        <div className="grid g3">
          {data.gateways.map((g) => (
            <div key={g.provider} className="card" style={{ boxShadow: 'none' }}>
              <div className="panel-head">
                <span className="t">{g.provider}</span>
                {g.active
                  ? <span className="badge badge-ok"><span className="led led-live" />aktif</span>
                  : g.configured
                    ? <button className="btn btn-sm" disabled={busy}
                        onClick={() => void put({ activate: g.provider }, `${g.provider} diaktifkan`)}>Aktifkan</button>
                    : <span className="badge"><span className="led led-off" />kosong</span>}
              </div>
              <div className="card-pad stack gap-3">
                {GATEWAY_FIELDS[g.provider].map((f) => (
                  <div key={f.key} className="field">
                    <label>{f.label}</label>
                    <input className="input mono" type={f.secret ? 'password' : 'text'}
                      placeholder={f.secret && g.configured ? 'kosongkan = tak diubah'
                        : !f.secret ? String(g.publicConfig[f.key] ?? '') || f.label : f.label}
                      value={fields[g.provider]?.[f.key] ?? ''}
                      onChange={(e) => setFields((s) => ({
                        ...s, [g.provider]: { ...s[g.provider], [f.key]: e.target.value },
                      }))} />
                  </div>
                ))}
                <label className="cluster gap-2" style={{ cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox"
                    checked={sandbox[g.provider] ?? g.publicConfig.sandbox === true}
                    onChange={(e) => setSandbox((s) => ({ ...s, [g.provider]: e.target.checked }))} />
                  Mode sandbox
                </label>
                <button className="btn btn-sm" disabled={busy} onClick={() => {
                  const f = fields[g.provider] ?? {};
                  const secretKeys = GATEWAY_FIELDS[g.provider].filter((x) => x.secret).map((x) => x.key);
                  const secrets = Object.fromEntries(secretKeys.map((k) => [k, f[k] ?? '']).filter(([, v]) => v));
                  const publicKeys = GATEWAY_FIELDS[g.provider].filter((x) => !x.secret).map((x) => x.key);
                  const publicConfig: Record<string, string | boolean> = {
                    ...Object.fromEntries(publicKeys.map((k) => [k, f[k] || String(g.publicConfig[k] ?? '')])),
                    sandbox: sandbox[g.provider] ?? g.publicConfig.sandbox === true,
                  };
                  void put({ gateway: { provider: g.provider, ...(Object.keys(secrets).length ? { secrets } : {}), publicConfig } },
                    `Kredensial ${g.provider} tersimpan`);
                }}>Simpan kredensial</button>
                <p className="microlabel" style={{ wordBreak: 'break-all' }}>
                  CALLBACK URL (daftarkan di dashboard {g.provider}):<br />{data.callbackUrls[g.provider]}
                </p>
              </div>
            </div>
          ))}
        </div>

        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Metode pembayaran: <b>QRIS saja</b>. QR digambar di halaman situs ini
          sendiri (<code>/billing/pay/…</code>) — pelanggan tidak pernah
          dialihkan ke halaman gateway. Hanya satu gateway aktif pada satu waktu.
        </p>
      </div>
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
            <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
            </Select></div>
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
