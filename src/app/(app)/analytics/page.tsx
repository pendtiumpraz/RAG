'use client';

import { FeatureGate } from '../../_components/entitlements';
import { Select } from '../../_components/select';
import { useEffect, useState } from 'react';
import { useApi } from '../../_lib/api';
import { Skeleton, ErrorState, EmptyState } from '../../_components/ui';

interface Chatbot { id: string; name: string }
interface Analytics {
  days: number;
  range: { from: string; to: string };
  totals: { conversations: number; questions: number; withCitation: number };
  unanswered: number;
  topQuestions: Array<{ question: string; count: number }>;
  topKeywords: Array<{ word: string; count: number }>;
  topDocuments: Array<{ documentId: string; title: string | null; hits: number; avgScore: number }>;
  daily: Array<{ day: string; questions: number }>;
}

const fmt = (n: number) => n.toLocaleString('id-ID');

function AnalyticsPageInner() {
  const bots = useApi<Chatbot[]>('/api/chatbots');
  const [id, setId] = useState('');
  const [days, setDays] = useState(30);
  /* Rentang kustom KOSONG secara bawaan, dan selama kosong preset hari yang
     dipakai. Menyalakan keduanya sekaligus akan membuat dua kontrol
     memperebutkan jendela yang sama, dan pengguna tak bisa tahu mana yang
     menang. */
  const [dari, setDari] = useState('');
  const [sampai, setSampai] = useState('');
  const kustom = Boolean(dari && sampai);
  const kueri = id
    ? `chatbotId=${id}&${kustom ? `dari=${dari}&sampai=${sampai}` : `days=${days}`}`
    : '';

  useEffect(() => { if (bots.data?.[0] && !id) setId(bots.data[0].id); }, [bots.data, id]);
  const a = useApi<Analytics>(kueri ? `/api/analytics?${kueri}` : null);

  if (bots.error) return <div className="card"><ErrorState message={bots.error} onRetry={bots.refetch} /></div>;
  if (bots.loading || !bots.data) return <div className="card"><Skeleton rows={4} /></div>;
  if (bots.data.length === 0) {
    return <div className="card"><EmptyState title="Belum ada chatbot"
      hint="Analitik dihitung per chatbot — buat satu dulu di halaman Chatbots." action={<a className="btn btn-primary" href="/chatbots">Buat chatbot</a>} /></div>;
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Analitik</h1><p className="sub">Apa yang ditanyakan orang, dan bagian knowledge base mana yang benar-benar terpakai.</p></div>
        <div className="cluster gap-2">
          <Select style={{ width: 190 }} value={id} onChange={(e) => setId(e.target.value)}>
            {bots.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select style={{ width: 150 }} value={days} disabled={kustom}
            onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>7 hari</option>
            <option value={30}>30 hari</option>
            <option value={90}>90 hari</option>
          </Select>
          <input className="input mono" type="date" style={{ width: 148 }} value={dari}
            aria-label="Tanggal awal" max={sampai || undefined}
            onChange={(e) => setDari(e.target.value)} />
          <span style={{ color: 'var(--muted)' }}>s/d</span>
          <input className="input mono" type="date" style={{ width: 148 }} value={sampai}
            aria-label="Tanggal akhir" min={dari || undefined}
            onChange={(e) => setSampai(e.target.value)} />
          {kustom && <button className="btn" onClick={() => { setDari(''); setSampai(''); }}>Reset</button>}
          {/* Unduhan lewat tautan biasa, bukan fetch+blob: berkasnya datang
              dari endpoint yang sama dengan angka di layar, dan peramban
              sudah tahu cara menyimpannya. */}
          <a className="btn" href={kueri ? `/api/analytics?${kueri}&format=csv` : undefined}
            aria-disabled={!kueri} download>Unduh CSV</a>
        </div>
      </div>

      {a.error ? <div className="card"><ErrorState message={a.error} onRetry={a.refetch} /></div>
        : a.loading || !a.data ? <div className="card"><Skeleton rows={5} /></div>
        : a.data.totals.questions === 0 ? (
          <div className="card"><EmptyState title="Belum ada percakapan"
            hint={`Chatbot ini belum menerima pertanyaan dalam ${days} hari terakhir. Angka muncul setelah ada yang bertanya lewat widget.`} action={<a className="btn" href="/chat">Uji di Chat</a>} /></div>
        ) : (
          <>
            <div className="grid g4" style={{ marginBottom: 'var(--sp-4)' }}>
              <Stat label="Percakapan" value={fmt(a.data.totals.conversations)} />
              <Stat label="Pertanyaan" value={fmt(a.data.totals.questions)} />
              <Stat label="Terjawab dari KB" value={fmt(a.data.totals.withCitation)}
                hint={`${Math.round((a.data.totals.withCitation / Math.max(a.data.totals.withCitation + a.data.unanswered, 1)) * 100)}% jawaban punya sitasi`} />
              <Stat label="Tanpa sumber" value={fmt(a.data.unanswered)} tone={a.data.unanswered > 0 ? 'warn' : undefined}
                hint="jawaban tanpa sitasi — celah isi knowledge base" />
            </div>

            <div className="grid g2">
              <div className="card">
                <div className="panel-head"><span className="t">pertanyaan terbanyak</span></div>
                {a.data.topQuestions.length === 0
                  ? <EmptyState title="Belum ada yang berulang"
                      hint="Muncul setelah ada pertanyaan yang ditanyakan lebih dari sekali." />
                  : (
                    <div className="table-wrap"><table className="table">
                      <thead><tr><th>Pertanyaan</th><th style={{ textAlign: 'right' }}>Kali</th></tr></thead>
                      <tbody>{a.data.topQuestions.map((q, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 13 }}>{q.question}</td>
                          <td className="mono" style={{ textAlign: 'right' }}>{q.count}</td>
                        </tr>))}
                      </tbody>
                    </table></div>
                  )}
              </div>

              <div className="card">
                <div className="panel-head"><span className="t">topik yang sering muncul</span></div>
                <div className="card-pad">
                  {a.data.topKeywords.length === 0
                    ? <p className="microlabel">BELUM CUKUP DATA.</p>
                    : (
                      <div className="cluster" style={{ flexWrap: 'wrap', gap: 8 }}>
                        {a.data.topKeywords.map((k) => (
                          <span key={k.word} className="badge" style={{ fontSize: 13 }}>
                            {k.word} <b style={{ marginLeft: 4, color: 'var(--signal)' }}>{k.count}</b>
                          </span>
                        ))}
                      </div>
                    )}
                  <p className="microlabel" style={{ marginTop: 12 }}>
                    KATA UMUM (ID/EN) DISARING · SAMPEL 2.000 PESAN TERBARU
                  </p>
                </div>
              </div>

              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <div className="panel-head"><span className="t">dokumen paling sering jadi sumber jawaban</span></div>
                {a.data.topDocuments.length === 0
                  ? <EmptyState title="Belum ada sitasi"
                      hint="Muncul setelah chatbot menjawab dengan merujuk dokumen dari knowledge base." />
                  : (
                    <>
                      <div className="table-wrap"><table className="table">
                        <thead><tr><th>Dokumen</th><th style={{ textAlign: 'right' }}>Dipakai</th><th style={{ textAlign: 'right' }}>Skor rata-rata</th></tr></thead>
                        <tbody>{a.data.topDocuments.map((d) => (
                          <tr key={d.documentId}>
                            <td>{d.title ?? <span style={{ color: 'var(--muted)' }}>(dokumen dihapus)</span>}</td>
                            <td className="mono" style={{ textAlign: 'right' }}>{fmt(d.hits)}</td>
                            <td className="mono" style={{ textAlign: 'right', color: 'var(--source)' }}>{d.avgScore.toFixed(3)}</td>
                          </tr>))}
                        </tbody>
                      </table></div>
                      <div className="card-pad">
                        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
                          Ini <b>bukan</b> hitungan berapa kali berkas dibuka — sistem tak
                          melacak itu. Yang dihitung adalah berapa kali dokumen benar-benar
                          dipakai menjawab, yang justru menunjukkan bagian knowledge base
                          mana yang bekerja dan mana yang menganggur.
                        </p>
                      </div>
                    </>
                  )}
              </div>

              {a.data.daily.length > 1 && (
                <div className="card" style={{ gridColumn: '1 / -1' }}>
                  <div className="panel-head"><span className="t">pertanyaan per hari</span></div>
                  <div className="card-pad"><Spark data={a.data.daily} /></div>
                </div>
              )}
            </div>
          </>
        )}
    </>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warn' }) {
  return (
    <div className="card"><div className="card-pad">
      <div className="microlabel">{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: tone === 'warn' ? 'var(--source)' : undefined }}>{value}</div>
      {hint && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>{hint}</div>}
    </div></div>
  );
}

/** Bar sederhana — cukup untuk melihat pola, tanpa pustaka chart. */
function Spark({ data }: { data: Array<{ day: string; questions: number }> }) {
  const max = Math.max(...data.map((d) => d.questions), 1);
  return (
    <div>
      <div className="cluster" style={{ alignItems: 'flex-end', gap: 3, height: 90 }}>
        {data.map((d) => (
          <div key={d.day} title={`${d.day}: ${d.questions} pertanyaan`}
            style={{
              flex: 1, minWidth: 3, height: `${Math.max(3, (d.questions / max) * 100)}%`,
              background: 'var(--signal)', borderRadius: '2px 2px 0 0', opacity: .85,
            }} />
        ))}
      </div>
      <div className="cluster" style={{ justifyContent: 'space-between', marginTop: 6 }}>
        <span className="microlabel">{data[0]?.day}</span>
        <span className="microlabel">puncak {max}/hari</span>
        <span className="microlabel">{data[data.length - 1]?.day}</span>
      </div>
    </div>
  );
}

/** Gate plan (D14): halaman ini fitur berbayar — Free melihat ajakan upgrade
 *  yang menjelaskan apa yang dibuka, bukan sekadar penolakan. */
export default function AnalyticsPage() {
  return (
    <FeatureGate feature="analytics" title="Analitik per chatbot"
      benefit="Lihat pertanyaan yang paling sering diajukan, kata kunci yang muncul, dokumen mana yang paling sering jadi sumber jawaban, dan jawaban yang belum bersitasi — penunjuk langsung celah knowledge base-mu.">
      <AnalyticsPageInner />
    </FeatureGate>
  );
}
