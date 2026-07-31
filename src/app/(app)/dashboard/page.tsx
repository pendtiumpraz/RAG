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
interface Kb { id: string; chunks: number; chatbots: Array<{ id: string }> }
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
  const kbs = useApi<Kb[]>('/api/knowledge-bases');

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

      <LangkahPertama bots={bots.data} kbs={kbs.data} bd={bd.data} />

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
 * LANGKAH PERTAMA — daftar yang MEMBACA KEADAAN, bukan mengingat klik.
 *
 * Daftar onboarding biasanya menyimpan kemajuannya di localStorage: dicentang
 * saat tombolnya diklik, lalu dianggap selesai selamanya. Daftar seperti itu
 * berbohong dalam dua arah — ia tetap tercentang setelah chatbotnya dihapus,
 * dan ia kosong lagi begitu orangnya berganti peramban. Yang lebih buruk, ia
 * mengaku tahu sesuatu yang tak pernah diperiksanya.
 *
 * Keempat langkah di sini diturunkan dari data yang memang sudah diambil
 * halaman ini. Konsekuensinya: daftar ini HILANG SENDIRI begitu semuanya
 * benar-benar selesai, dan MUNCUL LAGI kalau salah satunya rusak — yang justru
 * berguna, karena "KB tak lagi terhubung ke chatbot mana pun" adalah kerusakan
 * yang tak menimbulkan gejala lain.
 */
function LangkahPertama({ bots, kbs, bd }: {
  bots: Chatbot[] | null; kbs: Kb[] | null; bd: Breakdown | null;
}) {
  // Selama datanya belum lengkap, JANGAN menebak. Daftar yang berkedip dari
  // "belum" ke "sudah" saat data menyusul lebih membingungkan daripada diam.
  if (!bots || !kbs || !bd) return null;

  const adaChatbot = bots.length > 0;
  const adaIsi = kbs.some((k) => k.chunks > 0);
  /* Langkah yang paling sering terlewat, dan gejalanya menyesatkan: dokumen
     sudah masuk, tapi KB-nya belum dipasang ke chatbot mana pun — jadi
     chatbotnya menolak menjawab seolah dokumennya tak pernah ada. */
  const adaTersambung = kbs.some((k) => k.chunks > 0 && k.chatbots.length > 0);
  const sudahDiuji = bd.perChatbot.some((c) => c.messages > 0);

  const langkah = [
    { selesai: adaChatbot, teks: 'Buat chatbot pertama', href: '/chatbots', aksi: 'Buka Chatbots' },
    { selesai: adaIsi, teks: 'Isi knowledge base dengan dokumen', href: '/knowledge', aksi: 'Buka Knowledge Base' },
    { selesai: adaTersambung, teks: 'Hubungkan knowledge base itu ke chatbotnya', href: '/knowledge', aksi: 'Atur sambungan' },
    { selesai: sudahDiuji, teks: 'Uji jawabannya sebelum dipasang ke situs', href: '/chat', aksi: 'Buka Chat' },
  ];
  const sisa = langkah.filter((l) => !l.selesai);
  if (sisa.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 'var(--sp-4)' }}>
      <div className="panel-head">
        <span className="t">Langkah pertama</span>
        <span className="badge">{langkah.length - sisa.length}/{langkah.length} selesai</span>
      </div>
      <div className="card-pad stack gap-3">
        <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }} className="stack gap-2">
          {langkah.map((l) => (
            <li key={l.teks} className="cluster" style={{ justifyContent: 'space-between', gap: 'var(--sp-3)' }}>
              <span style={{ color: l.selesai ? 'var(--muted)' : 'var(--ink)' }}>
                <span aria-hidden style={{ color: l.selesai ? 'var(--good)' : 'var(--faint)', marginRight: 8 }}>
                  {l.selesai ? '✓' : '○'}
                </span>
                <span className="sr-only">{l.selesai ? 'Selesai: ' : 'Belum: '}</span>
                {l.teks}
              </span>
              {!l.selesai && <a className="btn btn-sm" href={l.href}>{l.aksi}</a>}
            </li>
          ))}
        </ol>
        <p className="microlabel" style={{ margin: 0 }}>
          DAFTAR INI MEMBACA KEADAAN WORKSPACE-MU, BUKAN MENGINGAT KLIK — IA HILANG SENDIRI SAAT SEMUANYA SELESAI.
          BUTUH PENJELASAN LEBIH PANJANG? LIHAT <a href="/bantuan">PANDUAN</a>.
        </p>
      </div>
    </div>
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
              hint={`Grafik terisi setelah chatbot menerima pertanyaan. Jendelanya ${HARI_TREN} hari terakhir.`} action={<a className="btn" href="/chat">Uji di Chat</a>} />
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
            <div className="table-wrap"><table className="table"><thead><tr>
              <th>Chatbot</th><th className="num">Pesan</th><th className="num">Token</th>
            </tr></thead><tbody>
              {bd.data.perChatbot.slice(0, 6).map((c) => (
                <tr key={c.chatbotId}>
                  <td>{c.name}</td>
                  <td className="num">{fmt(c.messages)}</td>
                  <td className="num">{fmt(c.tokensIn + c.tokensOut)}</td>
                </tr>
              ))}
            </tbody></table></div>
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
