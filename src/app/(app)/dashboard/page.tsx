'use client';

import { useMemo } from 'react';
import { useApi } from '../../_lib/api';
import { Skeleton, ErrorState, EmptyState } from '../../_components/ui';
import { isiHariKosong, ringkasTren, tinggiBatang, MIN_HARI_TREN } from '@/modules/usage/tren';

interface Usage {
  plan: string; period: string;
  messages: { used: number; limit: number | null };
  tokens: { in: number; out: number };
  maxChatbots: number | null;
}
interface Chatbot { id: string; enabled: boolean }
interface Breakdown {
  days: number;
  perChatbot: Array<{ chatbotId: string; name: string; messages: number; tokensIn: number; tokensOut: number }>;
  daily: Array<{ day: string; messages: number }>;
}

const fmt = (n: number) => n.toLocaleString('id-ID');
const HARI_TREN = 30;

export default function DashboardPage() {
  const usage = useApi<Usage>('/api/usage');
  const bots = useApi<Chatbot[]>('/api/chatbots');
  const bd = useApi<Breakdown>(`/api/usage/breakdown?days=${HARI_TREN}`);

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

      <TrenPemakaian bd={bd} />

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

/**
 * TREN 30 HARI + rincian per chatbot — mengisi separuh bawah dashboard.
 *
 * Datanya sudah lama ada di `/api/usage/breakdown`; yang belum ada hanyalah
 * yang membacanya. Tidak ada pelacakan baru yang ditambahkan.
 */
function TrenPemakaian({ bd }: { bd: ReturnType<typeof useApi<Breakdown>> }) {
  const titik = useMemo(
    // Hari kosong DIISI nol di sini, bukan dibiarkan hilang: `group by day`
    // di server tak mengembalikan hari tanpa aktivitas, dan menggambarnya
    // apa adanya akan merapatkan hari-hari yang berjauhan.
    () => (bd.data ? isiHariKosong(bd.data.daily, bd.data.days, Date.now()) : []),
    [bd.data]);
  const ringkas = useMemo(() => ringkasTren(titik), [titik]);
  const maks = useMemo(() => titik.reduce((m, t) => Math.max(m, t.pesan), 0), [titik]);

  if (bd.error) {
    return <div className="card" style={{ marginBottom: 'var(--sp-4)' }}>
      <ErrorState message={bd.error} onRetry={bd.refetch} /></div>;
  }
  if (bd.loading || !bd.data) {
    return <div className="card" style={{ marginBottom: 'var(--sp-4)' }}><Skeleton rows={4} /></div>;
  }

  return (
    <div className="grid g2" style={{ marginBottom: 'var(--sp-4)' }}>
      <div className="card">
        <div className="panel-head">
          <span className="t">Pesan {HARI_TREN} hari terakhir</span>
          {/* Arah tren hanya ditampilkan bila memang bisa dikatakan. Tenant
              baru selalu punya paruh awal kosong, dan "naik ∞%" pada hari
              kedua adalah janji yang tak berdasar apa pun. */}
          {ringkas.arah && ringkas.persen !== null && (
            <span className={`badge${ringkas.arah === 'turun' ? ' badge-warn' : ringkas.arah === 'naik' ? ' badge-ok' : ''}`}>
              {ringkas.arah === 'naik' ? '▲' : ringkas.arah === 'turun' ? '▼' : '■'} {Math.abs(ringkas.persen)}%
            </span>
          )}
        </div>
        <div className="card-pad">
          {ringkas.total === 0 ? (
            <EmptyState title="Belum ada percakapan"
              hint={`Grafik terisi setelah chatbot menerima pertanyaan. Jendelanya ${HARI_TREN} hari terakhir.`} />
          ) : (
            <>
              <div className="cluster" style={{ alignItems: 'flex-end', gap: 2, height: 120 }}
                role="img"
                aria-label={`Pesan per hari selama ${HARI_TREN} hari terakhir, total ${fmt(ringkas.total)} pesan`}>
                {titik.map((t) => (
                  <div key={t.hari} title={`${t.hari}: ${fmt(t.pesan)} pesan`}
                    style={{
                      flex: 1, minWidth: 0, height: `${tinggiBatang(t.pesan, maks)}%`,
                      background: t.pesan > 0 ? 'var(--signal)' : 'transparent',
                      borderRadius: '2px 2px 0 0',
                    }} />
                ))}
              </div>
              <div className="cluster" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                <span className="microlabel">{titik[0]?.hari}</span>
                <span className="microlabel">{titik[titik.length - 1]?.hari}</span>
              </div>
              <div className="cluster gap-4" style={{ marginTop: 'var(--sp-3)' }}>
                <span><b>{fmt(ringkas.total)}</b> <span className="microlabel">TOTAL</span></span>
                <span><b>{ringkas.rerata.toFixed(1)}</b> <span className="microlabel">RATA-RATA/HARI</span></span>
                {ringkas.puncak && (
                  <span><b>{fmt(ringkas.puncak.pesan)}</b> <span className="microlabel">TERSIBUK ({ringkas.puncak.hari})</span></span>
                )}
              </div>
              {!ringkas.arah && (
                <p className="microlabel" style={{ marginTop: 'var(--sp-2)' }}>
                  ARAH TREN BELUM BISA DISEBUT — BUTUH MINIMAL {MIN_HARI_TREN} HARI DENGAN AKTIVITAS DI PARUH AWAL.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="panel-head"><span className="t">Per chatbot ({HARI_TREN} hari)</span></div>
        <div className="card-pad">
          {bd.data.perChatbot.length === 0 ? (
            <EmptyState title="Belum ada aktivitas"
              hint="Rincian muncul setelah salah satu chatbot dipakai." />
          ) : (
            <table className="table"><thead><tr>
              <th>Chatbot</th><th className="num">Pesan</th><th className="num">Token</th>
            </tr></thead><tbody>
              {bd.data.perChatbot.slice(0, 6).map((c) => (
                <tr key={c.chatbotId}>
                  <td>{c.name}</td>
                  <td className="num">{fmt(c.messages)}</td>
                  <td className="num">{fmt(c.tokensIn + c.tokensOut)}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>
    </div>
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
