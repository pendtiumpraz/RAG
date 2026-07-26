'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useApi } from '../../_lib/api';
import { Skeleton, ErrorState, EmptyState } from '../../_components/ui';

interface Ops {
  window: string;
  actions: Array<{ action: string; count: number }>;
  errors: Array<{ at: string; tenantId: string; message: string }>;
  guardrail: { flagged: number };
  usage: { tenants: number; messages: number; tokensIn: number; tokensOut: number; period: string };
  topTenants: Array<{ tenantId: string; name: string; messages: number }>;
}

const fmt = (n: number) => n.toLocaleString('id-ID');

export default function ObservabilityPage() {
  const { data: session } = useSession();
  const [hours, setHours] = useState(24);
  const { data, loading, error, refetch } = useApi<Ops>(`/api/admin/ops?hours=${hours}`);
  const health = useApi<{ ok: boolean; db: { ok: boolean; latencyMs: number | null }; mode: string }>('/api/health');

  if (session?.user?.role !== 'superadmin') {
    return <div className="card"><EmptyState title="Khusus superadmin"
      hint="Ringkasan operasional mencakup seluruh tenant, jadi hanya peran platform yang bisa membukanya." /></div>;
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Observability</h1><p className="sub">Kesehatan sistem &amp; aktivitas nyata lintas tenant.</p></div>
        <select className="select" style={{ width: 160 }} value={hours}
          onChange={(e) => setHours(Number(e.target.value))}>
          <option value={1}>1 jam terakhir</option>
          <option value={24}>24 jam terakhir</option>
          <option value={168}>7 hari terakhir</option>
        </select>
      </div>

      <div className="grid g2" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="card">
          <div className="panel-head"><span className="t">kesehatan</span></div>
          <div className="card-pad stack gap-2">
            <Row label="Status" value={
              health.loading ? '…' : health.data?.ok
                ? <span className="badge badge-ok"><span className="led led-live" />sehat</span>
                : <span className="badge badge-danger"><span className="led led-err" />bermasalah</span>} />
            <Row label="Database" value={<span className="mono">
              {health.data?.db.latencyMs != null ? `${health.data.db.latencyMs} ms` : '—'}</span>} />
            <Row label="Mode" value={<span className="mono">{health.data?.mode ?? '—'}</span>} />
          </div>
        </div>

        <div className="card">
          <div className="panel-head"><span className="t">pemakaian bulan {data?.usage.period ?? ''}</span></div>
          <div className="card-pad stack gap-2">
            <Row label="Tenant aktif" value={<span className="mono">{fmt(data?.usage.tenants ?? 0)}</span>} />
            <Row label="Pesan" value={<span className="mono">{fmt(data?.usage.messages ?? 0)}</span>} />
            <Row label="Token in / out" value={<span className="mono">
              {fmt(data?.usage.tokensIn ?? 0)} / {fmt(data?.usage.tokensOut ?? 0)}</span>} />
            <Row label="Guardrail ditandai" value={
              <span className="mono" style={{ color: (data?.guardrail.flagged ?? 0) > 0 ? 'var(--source)' : undefined }}>
                {fmt(data?.guardrail.flagged ?? 0)}</span>} />
          </div>
        </div>
      </div>

      {error ? <div className="card"><ErrorState message={error} onRetry={refetch} /></div>
        : loading || !data ? <div className="card"><Skeleton rows={4} /></div>
        : (
          <div className="grid g2">
            <div className="card">
              <div className="panel-head"><span className="t">aktivitas ({data.window})</span></div>
              {data.actions.length === 0
                ? <EmptyState title="Belum ada aktivitas" hint="Aksi tercatat begitu ada chat, ingest, atau perubahan admin." />
                : (
                  <div className="table-wrap"><table className="table">
                    <thead><tr><th>Aksi</th><th style={{ textAlign: 'right' }}>Jumlah</th></tr></thead>
                    <tbody>{data.actions.map((a) => (
                      <tr key={a.action}>
                        <td className="mono" style={{ fontSize: 13 }}>{a.action}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{fmt(a.count)}</td>
                      </tr>))}
                    </tbody>
                  </table></div>
                )}
            </div>

            <div className="card">
              <div className="panel-head"><span className="t">galat terakhir</span>
                <span className="microlabel">{data.errors.length} TERCATAT</span></div>
              {data.errors.length === 0
                ? <EmptyState title="Tak ada galat" hint={`Tidak ada galat tercatat dalam ${data.window} terakhir.`} />
                : (
                  <div className="table-wrap"><table className="table">
                    <thead><tr><th>Waktu</th><th>Pesan</th></tr></thead>
                    <tbody>{data.errors.map((e, i) => (
                      <tr key={i}>
                        <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {e.at.slice(5, 16).replace('T', ' ')}</td>
                        <td style={{ fontSize: 13, color: 'var(--danger)' }}>{e.message}</td>
                      </tr>))}
                    </tbody>
                  </table></div>
                )}
            </div>

            <div className="card">
              <div className="panel-head"><span className="t">tenant tersibuk</span></div>
              {data.topTenants.length === 0
                ? <EmptyState title="Belum ada pemakaian" hint="Peringkat muncul setelah ada percakapan bulan ini." />
                : (
                  <div className="table-wrap"><table className="table">
                    <thead><tr><th>Organisasi</th><th style={{ textAlign: 'right' }}>Pesan</th></tr></thead>
                    <tbody>{data.topTenants.map((t) => (
                      <tr key={t.tenantId}>
                        <td>{t.name}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{fmt(t.messages)}</td>
                      </tr>))}
                    </tbody>
                  </table></div>
                )}
            </div>
          </div>
        )}
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="cluster" style={{ justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>{value}
    </div>
  );
}
