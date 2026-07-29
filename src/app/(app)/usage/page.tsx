'use client';

import { FeatureGate } from '../../_components/entitlements';
import { Select } from '../../_components/select';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useApi } from '../../_lib/api';
import { Skeleton, ErrorState, EmptyState } from '../../_components/ui';

/**
 * USAGE — dashboard monitoring pemakaian.
 *
 * Tenant: kuota vs pemakaian, tren harian, rincian PER CHATBOT (+ estimasi
 * biaya bila model aktif punya harga di registry — BYO key, jadi ini
 * estimasi tagihan provider si tenant, bukan tagihan Nalar).
 * Superadmin: tabel PER TENANT (data /api/admin/billing — kini benar setelah
 * policy 0017; sebelumnya diam-diam nol semua).
 */

interface Summary {
  plan: string; period: string;
  messages: { used: number; limit: number | null };
  tokens: { in: number; out: number };
}
interface Breakdown {
  days: number; model: string | null; price: { in: number; out: number } | null;
  perChatbot: Array<{ chatbotId: string; name: string; messages: number; tokensIn: number; tokensOut: number }>;
  daily: Array<{ day: string; messages: number }>;
}
interface AdminBilling {
  tenants: Array<{ tenantId: string; tenantName: string; plan: string; members: number; chatbots: number; messages: number; tokensIn: number; tokensOut: number }>;
}

const n = (v: number) => v.toLocaleString('id-ID');
const cost = (tin: number, tout: number, p: { in: number; out: number } | null) =>
  p ? `$${((tin * p.in + tout * p.out) / 1_000_000).toFixed(2)}` : '—';

function UsagePageInner() {
  const { data: session } = useSession();
  const isSuper = session?.user?.role === 'superadmin';
  const [days, setDays] = useState(30);
  const sum = useApi<Summary>('/api/usage');
  const br = useApi<Breakdown>(`/api/usage/breakdown?days=${days}`);
  const admin = useApi<AdminBilling>(isSuper ? '/api/admin/billing' : null);

  const totalMsgs = br.data?.perChatbot.reduce((a, c) => a + c.messages, 0) ?? 0;
  const maxDaily = Math.max(...(br.data?.daily.map((d) => d.messages) ?? [0]), 1);

  return (
    <>
      <div className="page-head">
        <div><h1>Usage</h1><p className="sub">Monitoring pemakaian — per chatbot{isSuper ? ' dan per tenant' : ''}. Sumber angka: metering & audit tiap giliran chat.</p></div>
        <Select style={{ width: 170, minHeight: 40 }} value={days}
          onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>7 hari terakhir</option>
          <option value={30}>30 hari terakhir</option>
          <option value={90}>90 hari terakhir</option>
        </Select>
      </div>

      {/* kartu ringkasan periode berjalan */}
      {sum.error ? <ErrorState message={sum.error} onRetry={sum.refetch} />
        : !sum.data ? <Skeleton rows={2} />
        : (
          <div className="us-cards">
            <div className="card card-pad">
              <span className="microlabel">PESAN · {sum.data.period}</span>
              <b className="v">{n(sum.data.messages.used)}<small>{sum.data.messages.limit ? ` / ${n(sum.data.messages.limit)}` : ' · tanpa batas'}</small></b>
              {sum.data.messages.limit && (
                <span className="meter"><span style={{
                  width: `${Math.min(100, (sum.data.messages.used / sum.data.messages.limit) * 100)}%`,
                  background: sum.data.messages.used / sum.data.messages.limit > 0.85 ? 'var(--danger)' : 'var(--signal)',
                }} /></span>
              )}
            </div>
            <div className="card card-pad"><span className="microlabel">TOKEN MASUK</span><b className="v">{n(sum.data.tokens.in)}</b></div>
            <div className="card card-pad"><span className="microlabel">TOKEN KELUAR</span><b className="v">{n(sum.data.tokens.out)}</b></div>
            <div className="card card-pad">
              <span className="microlabel">ESTIMASI BIAYA LLM{br.data?.model ? ` · ${br.data.model}` : ''}</span>
              <b className="v">{cost(sum.data.tokens.in, sum.data.tokens.out, br.data?.price ?? null)}</b>
              <span className="hint-sm">{br.data?.price ? 'harga registry, BYO key — tagihan provider-mu' : 'model aktif tak punya harga di registry'}</span>
            </div>
          </div>
        )}

      {/* tren harian */}
      <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
        <div className="panel-head"><span className="t">pesan per hari · {days} hari</span></div>
        <div className="card-pad">
          {br.error ? <ErrorState message={br.error} onRetry={br.refetch} />
            : !br.data ? <Skeleton rows={2} />
            : br.data.daily.length === 0 ? <EmptyState title="Belum ada percakapan di rentang ini" />
            : (
              <div className="us-trend" role="img" aria-label="Grafik pesan per hari">
                {br.data.daily.map((d) => (
                  <span key={d.day} className="col" title={`${d.day}: ${n(d.messages)} pesan`}>
                    <span className="bar" style={{ height: `${Math.max(4, (d.messages / maxDaily) * 100)}%` }} />
                  </span>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* rincian per chatbot */}
      <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
        <div className="panel-head"><span className="t">per chatbot · {days} hari</span></div>
        {!br.data ? <Skeleton rows={3} />
          : br.data.perChatbot.length === 0 ? <EmptyState title="Belum ada pemakaian" hint="Angka muncul begitu chatbot dipakai." />
          : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Chatbot</th><th>Pesan</th><th style={{ width: '26%' }}>Porsi</th><th>Token masuk</th><th>Token keluar</th><th>Est. biaya</th></tr></thead>
              <tbody>
                {br.data.perChatbot.map((c) => (
                  <tr key={c.chatbotId}>
                    <td><b>{c.name}</b></td>
                    <td className="mono">{n(c.messages)}</td>
                    <td>
                      <span className="meter"><span style={{ width: `${totalMsgs ? (c.messages / totalMsgs) * 100 : 0}%` }} /></span>
                    </td>
                    <td className="mono">{n(c.tokensIn)}</td>
                    <td className="mono">{n(c.tokensOut)}</td>
                    <td className="mono">{cost(c.tokensIn, c.tokensOut, br.data!.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
      </div>

      {/* superadmin: per tenant */}
      {isSuper && (
        <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
          <div className="panel-head"><span className="t">per tenant · periode berjalan</span>
            <span className="microlabel">SUPERADMIN · LINTAS TENANT (GUC 0017)</span></div>
          {admin.error ? <ErrorState message={admin.error} onRetry={admin.refetch} />
            : !admin.data ? <Skeleton rows={3} />
            : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Tenant</th><th>Plan</th><th>Anggota</th><th>Chatbot</th><th>Pesan</th><th>Token masuk</th><th>Token keluar</th></tr></thead>
                <tbody>
                  {admin.data.tenants.map((t) => (
                    <tr key={t.tenantId}>
                      <td><b>{t.tenantName}</b></td>
                      <td><span className="badge">{t.plan}</span></td>
                      <td className="mono">{n(t.members)}</td>
                      <td className="mono">{n(t.chatbots)}</td>
                      <td className="mono">{n(t.messages)}</td>
                      <td className="mono">{n(t.tokensIn)}</td>
                      <td className="mono">{n(t.tokensOut)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
        </div>
      )}

      <style>{`
        .us-cards{ display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:var(--sp-3); }
        .us-cards .v{ font-family:var(--font-display); font-size:26px; letter-spacing:-.02em; display:block; margin-top:6px; }
        .us-cards .v small{ font-size:13px; color:var(--muted); font-weight:600; }
        .us-cards .hint-sm{ font-size:11.5px; color:var(--faint); display:block; margin-top:4px; }
        .us-cards .meter{ margin-top:10px; }
        .meter{ display:block; height:6px; border-radius:3px; background:var(--card-3); overflow:hidden; }
        .meter > span{ display:block; height:100%; background:var(--signal); border-radius:3px; }
        .us-trend{ display:flex; align-items:flex-end; gap:3px; height:120px; }
        .us-trend .col{ flex:1; display:flex; align-items:flex-end; height:100%; min-width:4px; }
        .us-trend .bar{ display:block; width:100%; background:var(--signal); border-radius:3px 3px 0 0; opacity:.9; }
        .us-trend .col:hover .bar{ opacity:1; background:var(--signal-strong); }
      `}</style>
    </>
  );
}

/** Gate plan (D14): halaman ini fitur berbayar — Free melihat ajakan upgrade
 *  yang menjelaskan apa yang dibuka, bukan sekadar penolakan. */
export default function UsagePage() {
  return (
    <FeatureGate feature="usage" title="Monitoring pemakaian rinci"
      benefit="Rincian pemakaian per chatbot, tren harian, dan estimasi biaya LLM — untuk mengendalikan belanja AI lintas divisi.">
      <UsagePageInner />
    </FeatureGate>
  );
}
