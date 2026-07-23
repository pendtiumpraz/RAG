'use client';

import { useApi } from '../../_lib/api';
import { Skeleton, ErrorState } from '../../_components/ui';

interface Usage {
  plan: string; period: string;
  messages: { used: number; limit: number | null };
  tokens: { in: number; out: number };
  maxChatbots: number | null;
}
interface Chatbot { id: string; enabled: boolean }

const fmt = (n: number) => n.toLocaleString('id-ID');

export default function DashboardPage() {
  const usage = useApi<Usage>('/api/usage');
  const bots = useApi<Chatbot[]>('/api/chatbots');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="sub">Ringkasan pemakaian &amp; aktivitas workspace — periode {usage.data?.period ?? '…'}.</p>
        </div>
        {usage.data && <span className="badge badge-signal">PLAN {usage.data.plan.toUpperCase()}</span>}
      </div>

      {usage.error ? <div className="card"><ErrorState message={usage.error} onRetry={usage.refetch} /></div>
        : usage.loading || !usage.data ? <div className="card"><Skeleton rows={2} /></div>
        : (
          <div className="grid g4" style={{ marginBottom: 'var(--sp-4)' }}>
            <Stat label="Chatbots" value={bots.data ? fmt(bots.data.length) : '…'}
              unit={usage.data.maxChatbots ? `/ ${usage.data.maxChatbots}` : 'tak terbatas'} />
            <Stat label="Pesan bulan ini" value={fmt(usage.data.messages.used)}
              unit={usage.data.messages.limit ? `/ ${fmt(usage.data.messages.limit)}` : 'tak terbatas'}
              meter={usage.data.messages.limit ? usage.data.messages.used / usage.data.messages.limit : null} />
            <Stat label="Token masuk" value={fmt(usage.data.tokens.in)} unit="≈ input" />
            <Stat label="Token keluar" value={fmt(usage.data.tokens.out)} unit="≈ output" />
          </div>
        )}

      <div className="grid g2">
        <div className="card">
          <div className="panel-head"><span className="t">Cara kerja</span><span className="badge badge-ok"><span className="led led-live" />pipeline</span></div>
          <div className="card-pad">
            <div className="cluster" style={{ justifyContent: 'space-between', gap: 'var(--sp-2)', flexWrap: 'nowrap' }}>
              <Step n="1" t="Retrieve" d="Cari chunk paling relevan (skor similarity)." />
              <span style={{ color: 'var(--faint)' }}>→</span>
              <Step n="2" t="Reason" d="Susun jawaban dari konteks + history." />
              <span style={{ color: 'var(--faint)' }}>→</span>
              <Step n="3" t="Answer" d="Jawaban + sitasi sumber yang bisa ditelusuri." />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="panel-head"><span className="t">Mulai cepat</span></div>
          <div className="card-pad stack gap-3">
            <a className="btn btn-primary" href="/chatbots">Buat chatbot</a>
            <a className="btn" href="/knowledge">Hubungkan Google Drive</a>
            <a className="btn" href="/models">Atur model &amp; API keys</a>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, unit, meter }:
  { label: string; value: string; unit?: string; meter?: number | null }) {
  return (
    <div className="card card-pad stat">
      <div className="k"><span className="kicker">{label}</span></div>
      <div><span className="num">{value}</span>{unit && <span className="unit">{unit}</span>}</div>
      {meter != null && (
        <div className="meter" style={{ width: '100%', marginTop: 'var(--sp-3)' }}>
          <i style={{ width: `${Math.min(100, meter * 100)}%`, background: meter > 0.9 ? 'var(--danger)' : 'var(--signal)' }} />
        </div>
      )}
    </div>
  );
}

function Step({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="mono" style={{ color: 'var(--source)', fontSize: 12 }}>0{n}</div>
      <div style={{ fontWeight: 700, margin: '4px 0 2px' }}>{t}</div>
      <p style={{ color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.5 }}>{d}</p>
    </div>
  );
}
