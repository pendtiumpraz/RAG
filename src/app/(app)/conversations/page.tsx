'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useApi, api } from '../../_lib/api';
import { Skeleton, EmptyState, ErrorState, Pager, type PageMeta } from '../../_components/ui';
import { Select } from '../../_components/select';
import { AnswerBlocks, renderCited } from '../../_components/answer-blocks';
import { plainTextToBlocks, type AnswerBlock } from '@/modules/chat/blocks';

interface Chatbot { id: string; name: string }
interface Convo { id: string; visitorId: string | null; startedAt: string; preview: string | null; count: number; chatbotName?: string }
interface Message { id: string; role: string; content: string; blocks: AnswerBlock[] | null; citations: Array<{ documentId: string; score: number; title?: string | null }> | null; createdAt: string }
interface ConvoPage extends PageMeta { rows: Convo[] }
interface AdminBilling { tenants: Array<{ tenantId: string; tenantName: string }> }

export default function ConversationsPage() {
  const { data: session } = useSession();
  const isSuper = session?.user?.role === 'superadmin';

  /* Mode superadmin: pilih TENANT mana pun → chatbot divisinya → sesi →
     transkrip (endpoint /api/admin/*, lintas-tenant via GUC 0017).
     tenantId '' = tenant sendiri → endpoint biasa ber-RLS, persis yang
     dilihat tenant biasa (mereka tak pernah bisa keluar dari isolasinya). */
  const [tenantId, setTenantId] = useState('');
  const tenants = useApi<AdminBilling>(isSuper ? '/api/admin/billing' : null);
  const adminMode = isSuper && tenantId !== '';

  const [chatbotId, setChatbotId] = useState('');
  const [page, setPage] = useState(1);
  const ownBots = useApi<Chatbot[]>(!adminMode ? '/api/chatbots' : null);
  const tenantBots = useApi<Chatbot[]>(adminMode ? `/api/admin/conversations?tenantId=${tenantId}&chatbots=1` : null);
  const bots = adminMode ? tenantBots : ownBots;

  /* Filter. `q` ditunda (debounce) supaya mengetik tak menembak satu
     permintaan per huruf — pencarian ini menyentuh tabel messages. */
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);
  /* Filter berubah = halaman balik ke 1. Tanpa ini, menyaring saat berada di
     halaman 5 menampilkan daftar kosong padahal hasilnya ada di halaman 1. */
  useEffect(() => { setPage(1); setActive(null); }, [qDebounced, from, to, chatbotId, tenantId]);

  const filterQs = [
    qDebounced ? `q=${encodeURIComponent(qDebounced)}` : '',
    from ? `from=${from}` : '',
    to ? `to=${to}` : '',
  ].filter(Boolean).join('&');
  const hasFilter = !!filterQs;

  const listUrl = adminMode
    ? `/api/admin/conversations?tenantId=${tenantId}&page=${page}${chatbotId ? `&chatbotId=${chatbotId}` : ''}${filterQs ? `&${filterQs}` : ''}`
    : `/api/conversations?page=${page}${chatbotId ? `&chatbotId=${chatbotId}` : ''}${filterQs ? `&${filterQs}` : ''}`;
  const list = useApi<ConvoPage>(listUrl);

  /** Ekspor menuruti filter yang sedang aktif — bukan seluruh riwayat. */
  function exportCsv() {
    const base = adminMode
      ? `/api/admin/conversations?tenantId=${tenantId}&export=csv`
      : '/api/conversations?export=csv';
    const url = `${base}${chatbotId ? `&chatbotId=${chatbotId}` : ''}${filterQs ? `&${filterQs}` : ''}`;
    window.location.href = url;
  }
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  useEffect(() => {
    if (list.data?.rows.length && !active) setActive(list.data.rows[0].id);
  }, [list.data, active]);

  useEffect(() => {
    if (!active) { setMsgs(null); return; }
    setLoadingMsgs(true);
    const url = adminMode ? `/api/admin/conversations/${active}?tenantId=${tenantId}` : `/api/conversations/${active}`;
    api<Message[]>(url).then(setMsgs).catch(() => setMsgs([])).finally(() => setLoadingMsgs(false));
  }, [active, adminMode, tenantId]);

  function resetView() { setActive(null); setPage(1); setMsgs(null); }

  return (
    <>
      <div className="page-head">
        <div><h1>Conversations</h1><p className="sub">
          Riwayat percakapan lengkap dengan sitasi sumber di tiap jawaban.
          {isSuper ? ' Superadmin bisa meninjau tenant mana pun; tenant hanya melihat miliknya (RLS).' : ''}
        </p></div>
        <div className="cluster gap-2">
          {isSuper && (
            <Select style={{ width: 200, minHeight: 40 }} value={tenantId}
              onChange={(e) => { setTenantId(e.target.value); setChatbotId(''); resetView(); }}>
              <option value="">Tenant saya</option>
              {tenants.data?.tenants.map((t) => <option key={t.tenantId} value={t.tenantId}>{t.tenantName}</option>)}
            </Select>
          )}
          <Select style={{ width: 200, minHeight: 40 }} value={chatbotId}
            onChange={(e) => { setChatbotId(e.target.value); resetView(); }}>
            <option value="">Semua chatbot</option>
            {bots.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
      </div>

      {/* Baris filter — satu baris di atas daftar, sesuai pola halaman lain. */}
      <div className="card card-pad" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="cluster gap-2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '1 1 260px', minWidth: 220 }}>
            <label>Cari isi percakapan</label>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="kata yang diingat muncul di percakapan…" />
          </div>
          <div className="field" style={{ width: 160 }}>
            <label>Dari tanggal</label>
            <input className="input" type="date" value={from} max={to || undefined}
              onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ width: 160 }}>
            <label>Sampai tanggal</label>
            <input className="input" type="date" value={to} min={from || undefined}
              onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="cluster gap-2">
            {hasFilter && (
              <button className="btn" onClick={() => { setQ(''); setFrom(''); setTo(''); }}>Bersihkan</button>
            )}
            <button className="btn" onClick={exportCsv} disabled={!list.data?.total}>
              Ekspor CSV{hasFilter ? ' (tersaring)' : ''}
            </button>
          </div>
        </div>
        {/* Angka hasil disebut apa adanya: pencarian yang tak menemukan apa pun
            harus terlihat sebagai "0 hasil", bukan sebagai daftar yang rusak. */}
        {list.data && (
          <p className="microlabel" style={{ margin: '10px 0 0' }}>
            {list.data.total} PERCAKAPAN{hasFilter ? ' COCOK FILTER' : ''}
            {qDebounced ? ' · PENCARIAN MENYENTUH ISI SETIAP PESAN, BUKAN HANYA PREVIEW' : ''}
          </p>
        )}
      </div>

      <div className="card" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', minHeight: 480 }}>
        {/* list */}
        <div style={{ borderRight: '1px solid var(--line)', maxHeight: 600, overflowY: 'auto' }}>
          {list.error ? <ErrorState message={list.error} onRetry={list.refetch} />
            : list.loading || !list.data ? <Skeleton rows={4} />
            : list.data.rows.length === 0 ? <EmptyState title="Belum ada percakapan" hint="Percakapan terekam saat pengunjung memakai widget embed." />
            : list.data.rows.map((c) => (
              <button key={c.id} onClick={() => setActive(c.id)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '13px 16px', border: 'none',
                  borderBottom: '1px solid var(--line)', cursor: 'pointer', borderLeft: `2px solid ${active === c.id ? 'var(--signal)' : 'transparent'}`,
                  background: active === c.id ? 'var(--card-2)' : 'transparent' }}>
                {/* Nama chatbot yang utama. Id pengunjung (`v_m0mzrcwhewh`)
                    dibuat sendiri oleh widget dan tak mengatakan apa pun
                    tentang percakapannya — ia turun jadi keterangan kecil. */}
                <div style={{ fontSize: 13, fontWeight: 650, letterSpacing: '-.005em' }}>
                  {c.chatbotName ?? 'Chatbot'}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>
                  {c.preview ?? 'Belum ada pertanyaan'}
                </div>
                <div className="microlabel" style={{ marginTop: 5 }}>
                  {new Date(c.startedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                  {' · '}{c.count} pesan
                  {c.visitorId && <> · <span className="mono" style={{ textTransform: 'none' }}>
                    {c.visitorId.startsWith('user:') ? 'pengguna terdaftar' : c.visitorId}
                  </span></>}
                </div>
              </button>
            ))}
          {list.data && <Pager meta={list.data} onPage={(p) => { setPage(p); setActive(null); }} />}
        </div>

        {/* transcript */}
        <div style={{ padding: 'var(--sp-5)', maxHeight: 600, overflowY: 'auto' }}>
          {!active ? <EmptyState title="Pilih percakapan" />
            : loadingMsgs || !msgs ? <Skeleton rows={4} />
            : msgs.length === 0 ? <EmptyState title="Tidak ada pesan" />
            : msgs.map((m) => {
              const isUser = m.role === 'user';
              const time = new Date(m.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
              return (
                /* transkrip berbentuk bubble chat: pengunjung KANAN, Nalar KIRI —
                   sesuai arah baca percakapan, bukan daftar log rata kiri */
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start', marginBottom: 'var(--sp-4)' }}>
                  <div className="microlabel" style={{ marginBottom: 5 }}>
                    {isUser ? `Pengunjung · ${time}` : `Nalar · ${time}`}
                  </div>
                  <div style={{
                    maxWidth: '76%', padding: '10px 14px', fontSize: 14.5, lineHeight: 1.6,
                    background: isUser ? 'var(--tint-signal)' : 'var(--card-2)',
                    border: `1px solid ${isUser ? 'color-mix(in srgb, var(--signal) 35%, transparent)' : 'var(--line)'}`,
                    borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  }}>
                    {isUser
                      ? <div>{renderCited(m.content)}</div>
                      /* pesan lama pra-fitur tak punya blocks → derive dari teks polosnya */
                      : <AnswerBlocks blocks={m.blocks?.length ? m.blocks : plainTextToBlocks(m.content)} />}
                    {!isUser && m.citations && m.citations.length > 0 && (
                      <div className="source-block" style={{ marginTop: 10 }}>
                        {m.citations.map((c, i) => (
                          <div key={i} className="source-line"><span className="n">[{i + 1}]</span>{' '}
                            {/* pesan lama pra-fitur tak menyimpan title → fallback id */}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.title ?? <span className="mono">{c.documentId.slice(0, 8)}…</span>}
                            </span>
                            <span style={{ marginLeft: 'auto', color: 'var(--source)' }}>{c.score.toFixed(2)}</span></div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}

