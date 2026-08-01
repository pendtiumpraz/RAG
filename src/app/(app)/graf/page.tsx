'use client';

import { useMemo, useState } from 'react';
import { useApi } from '../../_lib/api';
import { Skeleton, ErrorState, EmptyState } from '../../_components/ui';
import { perChatbot, susunGraf, type Sisi, type SimpulChatbot, type SimpulKb } from '@/modules/knowledge/graf';

/**
 * GRAF PENGETAHUAN — chatbot mana memakai knowledge base mana.
 *
 * Chatbot di tepi lingkaran, knowledge di tengah, garis HANYA pada yang
 * benar-benar terhubung. Yang digambar adalah baris assignment apa adanya;
 * tak ada hubungan yang disimpulkan — graf yang menyimpulkan akan memajang
 * garis yang tak pernah ada, dan orang mempercayainya karena ia digambar.
 *
 * Dua pertanyaan yang paling sering dijawab peta ini, dan keduanya sulit
 * dilihat dari daftar:
 *   • KB mana yang dipakai LEBIH DARI SATU chatbot — mengubahnya menyentuh
 *     lebih banyak orang daripada yang diduga penyuntingnya;
 *   • chatbot yang TAK punya KB sama sekali — ia sudah terpasang di situs
 *     pelanggan dan menjawab "tidak ada di dokumen" untuk segalanya.
 */

const LEBAR = 900;
const TINGGI = 620;

interface DataGraf { chatbot: SimpulChatbot[]; kb: SimpulKb[]; sisi: Sisi[] }

export default function GrafPage() {
  const { data, loading, error, refetch } = useApi<DataGraf>('/api/graf');
  const [mode, setMode] = useState<'lingkaran' | 'per-chatbot'>('lingkaran');
  const [sorot, setSorot] = useState<string | null>(null);

  const g = useMemo(() => susunGraf({
    chatbot: data?.chatbot ?? [], kb: data?.kb ?? [], sisi: data?.sisi ?? [],
    lebar: LEBAR, tinggi: TINGGI,
  }), [data]);

  const kelompok = useMemo(() => perChatbot({
    chatbot: data?.chatbot ?? [], kb: data?.kb ?? [], sisi: data?.sisi ?? [],
  }), [data]);

  const kosong = !loading && !error && (data?.chatbot.length ?? 0) === 0 && (data?.kb.length ?? 0) === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Graf Pengetahuan</h1>
          <p className="sub">Chatbot mana memakai knowledge base mana — dan mana yang dipakai bersama.</p>
        </div>
        <div className="tabs" role="tablist">
          <button className="tab" role="tab" aria-selected={mode === 'lingkaran'}
            onClick={() => setMode('lingkaran')}>Lingkaran</button>
          <button className="tab" role="tab" aria-selected={mode === 'per-chatbot'}
            onClick={() => setMode('per-chatbot')}>Per chatbot</button>
        </div>
      </div>

      {error ? <div className="card"><ErrorState message={error} onRetry={refetch} /></div>
        : loading ? <div className="card"><Skeleton rows={6} /></div>
        : kosong ? (
          <div className="card"><EmptyState title="Belum ada yang bisa dipetakan"
            hint="Buat chatbot dan knowledge base dulu, lalu hubungkan keduanya lewat tombol Assign di halaman Knowledge." /></div>
        ) : mode === 'lingkaran' ? (
          <div className="card">
            <div className="panel-head">
              <span className="t">peta hubungan</span>
              <span className="microlabel">
                {g.sisi.length} HUBUNGAN · {g.berbagi.size} KB DIPAKAI BERSAMA
              </span>
            </div>
            <div className="card-pad" style={{ overflowX: 'auto' }}>
              <svg viewBox={`0 0 ${LEBAR} ${TINGGI}`} width="100%"
                style={{ maxWidth: LEBAR, display: 'block', margin: '0 auto' }}
                role="img" aria-label="Peta hubungan chatbot dan knowledge base">
                {/* GARIS DULU, simpul belakangan: garis yang digambar di atas
                    lingkaran akan memotong labelnya dan membuat peta terbaca
                    lebih ruwet daripada kenyataannya. */}
                {g.sisi.map((s, i) => {
                  const c = g.chatbot.find((x) => x.data.id === s.chatbotId);
                  const k = g.kb.find((x) => x.data.id === s.kbId);
                  if (!c || !k) return null;
                  const aktif = !sorot || sorot === s.chatbotId || sorot === s.kbId;
                  return (
                    <line key={i} x1={c.titik.x} y1={c.titik.y} x2={k.titik.x} y2={k.titik.y}
                      stroke={g.berbagi.has(s.kbId) ? 'var(--source)' : 'var(--line-strong)'}
                      strokeWidth={g.berbagi.has(s.kbId) ? 2 : 1.25}
                      opacity={aktif ? 0.85 : 0.12} />
                  );
                })}

                {g.kb.map((k) => {
                  const bersama = g.berbagi.has(k.data.id);
                  const yatim = g.kbYatim.has(k.data.id);
                  const aktif = !sorot || sorot === k.data.id
                    || g.sisi.some((s) => s.kbId === k.data.id && s.chatbotId === sorot);
                  return (
                    <g key={k.data.id} opacity={aktif ? 1 : 0.2}
                      onMouseEnter={() => setSorot(k.data.id)} onMouseLeave={() => setSorot(null)}
                      style={{ cursor: 'pointer' }}>
                      <rect x={k.titik.x - 58} y={k.titik.y - 15} width={116} height={30} rx={7}
                        fill="var(--panel)"
                        stroke={yatim ? 'var(--danger, #DC2626)' : bersama ? 'var(--source)' : 'var(--line-strong)'}
                        strokeWidth={bersama || yatim ? 2 : 1}
                        strokeDasharray={yatim ? '4 3' : undefined} />
                      <text x={k.titik.x} y={k.titik.y - 1} textAnchor="middle"
                        fontSize={11.5} fontWeight={600} fill="var(--ink)">
                        {potong(k.data.nama, 15)}
                      </text>
                      <text x={k.titik.x} y={k.titik.y + 10} textAnchor="middle"
                        fontSize={9} fill="var(--muted)">
                        {k.data.potongan} potongan
                      </text>
                    </g>
                  );
                })}

                {g.chatbot.map((c) => {
                  const yatim = g.chatbotYatim.has(c.data.id);
                  const aktif = !sorot || sorot === c.data.id
                    || g.sisi.some((s) => s.chatbotId === c.data.id && s.kbId === sorot);
                  return (
                    <g key={c.data.id} opacity={aktif ? 1 : 0.2}
                      onMouseEnter={() => setSorot(c.data.id)} onMouseLeave={() => setSorot(null)}
                      style={{ cursor: 'pointer' }}>
                      <circle cx={c.titik.x} cy={c.titik.y} r={9}
                        fill={yatim ? 'transparent' : 'var(--signal)'}
                        stroke={yatim ? 'var(--danger, #DC2626)' : 'var(--signal)'}
                        strokeWidth={2} strokeDasharray={yatim ? '3 2' : undefined} />
                      <text x={c.titik.x} y={c.titik.y - 15} textAnchor="middle"
                        fontSize={11} fontWeight={600} fill="var(--ink)">
                        {potong(c.data.nama, 18)}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <div className="cluster gap-4" style={{ flexWrap: 'wrap', marginTop: 12 }}>
                <Legenda warna="var(--signal)" teks="CHATBOT" />
                <Legenda warna="var(--source)" teks="KB DIPAKAI BERSAMA (>1 CHATBOT)" />
                <Legenda warna="var(--danger, #DC2626)" teks="YATIM — TAK TERHUBUNG APA PUN" putus />
              </div>
              <p className="microlabel" style={{ marginTop: 10 }}>
                GARIS HANYA DIGAMBAR PADA HUBUNGAN YANG BENAR-BENAR TERCATAT. YANG PUTUS-PUTUS
                MERAH BIASANYA KESALAHAN PEMASANGAN: CHATBOT TANPA PENGETAHUAN AKAN MENJAWAB
                &quot;TIDAK ADA DI DOKUMEN&quot; UNTUK SEGALANYA, DAN KB TANPA CHATBOT TAK PERNAH DIBACA
                SIAPA PUN.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid g2">
            {kelompok.map(({ chatbot, kb }) => (
              <div className="card" key={chatbot.id}>
                <div className="panel-head">
                  <span className="t">{chatbot.nama}</span>
                  <span className="microlabel">{kb.length} KB</span>
                </div>
                <div className="card-pad stack gap-2">
                  {kb.length === 0 ? (
                    <p className="microlabel" style={{ color: 'var(--danger, #DC2626)' }}>
                      TAK PUNYA KNOWLEDGE BASE — CHATBOT INI AKAN MENJAWAB &quot;TIDAK ADA DI
                      DOKUMEN&quot; UNTUK SEMUA PERTANYAAN.
                    </p>
                  ) : kb.map((k) => (
                    <div key={k.id} className="cluster" style={{ justifyContent: 'space-between' }}>
                      <span className="cluster gap-2">
                        <b>{k.nama}</b>
                        {g.berbagi.has(k.id) && <span className="badge badge-source">dipakai bersama</span>}
                      </span>
                      <span className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {k.potongan} potongan
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
    </>
  );
}

function Legenda({ warna, teks, putus }: { warna: string; teks: string; putus?: boolean }) {
  return (
    <span className="cluster gap-2">
      <svg width="18" height="10" aria-hidden>
        <line x1="0" y1="5" x2="18" y2="5" stroke={warna} strokeWidth="2.5"
          strokeDasharray={putus ? '4 3' : undefined} />
      </svg>
      <span className="microlabel">{teks}</span>
    </span>
  );
}

/** Nama panjang dipotong — label yang melebihi kotaknya membuat peta tak terbaca. */
function potong(s: string, n: number) {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
