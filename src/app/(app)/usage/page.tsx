'use client';

import { FeatureGate } from '../../_components/entitlements';
import { Select } from '../../_components/select';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useApi } from '../../_lib/api';
import { Skeleton, ErrorState, EmptyState } from '../../_components/ui';
import { BarisKosong, TabelAlat, TabelKaki, TdNo, Th, ThNo, useTabel } from '../../_components/tabel';
import type { OpsiTabel } from '../../_lib/tabel';

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
interface PerChatbot { chatbotId: string; name: string; messages: number; tokensIn: number; tokensOut: number }
interface Breakdown {
  days: number; model: string | null; price: { in: number; out: number } | null;
  perChatbot: PerChatbot[];
  daily: Array<{ day: string; messages: number }>;
}
interface TenantBaris {
  tenantId: string; tenantName: string; plan: string; members: number;
  chatbots: number; messages: number; tokensIn: number; tokensOut: number;
}
interface AdminBilling { tenants: TenantBaris[] }

const OPSI_CHATBOT: OpsiTabel<PerChatbot> = {
  cari: (c) => [c.name],
  /* Penyaring yang menjawab pertanyaan sebenarnya di halaman ini: chatbot mana
     yang MEMAKAI, dan mana yang menganggur. Chatbot nol pesan dalam periode
     berjalan adalah kandidat pertama untuk ditutup, dan pada daftar panjang ia
     tenggelam di antara yang aktif. */
  saring: { pakai: (c) => (c.messages > 0 ? 'aktif' : 'nol') },
  urut: {
    name: (c) => c.name, messages: (c) => c.messages,
    tokensIn: (c) => c.tokensIn, tokensOut: (c) => c.tokensOut,
    biaya: (c) => c.tokensIn + c.tokensOut,
  },
};

const OPSI_TENANT: OpsiTabel<TenantBaris> = {
  cari: (t) => [t.tenantName, t.plan],
  saring: { plan: (t) => t.plan },
  urut: {
    tenantName: (t) => t.tenantName, plan: (t) => t.plan, members: (t) => t.members,
    chatbots: (t) => t.chatbots, messages: (t) => t.messages,
    tokensIn: (t) => t.tokensIn, tokensOut: (t) => t.tokensOut,
  },
};

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

  const tCb = useTabel(br.data?.perChatbot ?? [], OPSI_CHATBOT);
  const tTn = useTabel(admin.data?.tenants ?? [], OPSI_TENANT);

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
            : br.data.daily.length === 0 ? <EmptyState title="Belum ada percakapan di rentang ini" action={<a className="btn" href="/chat">Uji di Chat</a>} />
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
            <div className="card-pad stack gap-4">
              <TabelAlat
                t={tCb} rows={br.data.perChatbot} cariLabel="Cari chatbot"
                saring={[{ kunci: 'pakai', label: 'Semua chatbot', lebar: 165, pilihan: [
                  { nilai: 'aktif', label: 'Ada pemakaian' },
                  { nilai: 'nol', label: 'Belum dipakai' },
                ] }]}
              />
              <div className="table-wrap"><table className="table">
                <thead><tr>
                  <ThNo />
                  <Th t={tCb} kunci="name">Chatbot</Th>
                  <Th t={tCb} kunci="messages" num>Pesan</Th>
                  <th style={{ width: '26%' }}>Porsi</th>
                  <Th t={tCb} kunci="tokensIn" num>Token masuk</Th>
                  <Th t={tCb} kunci="tokensOut" num>Token keluar</Th>
                  <Th t={tCb} kunci="biaya" num>Est. biaya</Th>
                </tr></thead>
                <tbody>
                  <BarisKosong t={tCb} kolom={7} />
                  {tCb.hasil.tampil.map((c, i) => (
                    <tr key={c.chatbotId}>
                      <TdNo n={tCb.nomor(i)} />
                      <td><b>{c.name}</b></td>
                      <td className="num">{n(c.messages)}</td>
                      <td>
                        <span className="meter"><span style={{ width: `${totalMsgs ? (c.messages / totalMsgs) * 100 : 0}%` }} /></span>
                      </td>
                      <td className="num">{n(c.tokensIn)}</td>
                      <td className="num">{n(c.tokensOut)}</td>
                      <td className="num">{cost(c.tokensIn, c.tokensOut, br.data!.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <TabelKaki t={tCb} satuan="chatbot" />
            </div>
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
              <div className="card-pad stack gap-4">
                <TabelAlat
                  t={tTn} rows={admin.data.tenants} cariLabel="Cari organisasi"
                  saring={[{ kunci: 'plan', label: 'Semua plan', lebar: 150, ambil: (t) => t.plan }]}
                />
                <div className="table-wrap"><table className="table">
                  <thead><tr>
                    <ThNo />
                    <Th t={tTn} kunci="tenantName">Tenant</Th>
                    <Th t={tTn} kunci="plan">Plan</Th>
                    <Th t={tTn} kunci="members" num>Anggota</Th>
                    <Th t={tTn} kunci="chatbots" num>Chatbot</Th>
                    <Th t={tTn} kunci="messages" num>Pesan</Th>
                    <Th t={tTn} kunci="tokensIn" num>Token masuk</Th>
                    <Th t={tTn} kunci="tokensOut" num>Token keluar</Th>
                  </tr></thead>
                  <tbody>
                    <BarisKosong t={tTn} kolom={8} />
                    {tTn.hasil.tampil.map((t, i) => (
                      <tr key={t.tenantId}>
                        <TdNo n={tTn.nomor(i)} />
                        <td><b>{t.tenantName}</b></td>
                        <td><span className="badge">{t.plan}</span></td>
                        <td className="num">{n(t.members)}</td>
                        <td className="num">{n(t.chatbots)}</td>
                        <td className="num">{n(t.messages)}</td>
                        <td className="num">{n(t.tokensIn)}</td>
                        <td className="num">{n(t.tokensOut)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <TabelKaki t={tTn} satuan="organisasi" />
              </div>
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
