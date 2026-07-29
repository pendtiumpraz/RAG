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

  const listUrl = adminMode
    ? `/api/admin/conversations?tenantId=${tenantId}&page=${page}${chatbotId ? `&chatbotId=${chatbotId}` : ''}`
    : `/api/conversations?page=${page}${chatbotId ? `&chatbotId=${chatbotId}` : ''}`;
  const list = useApi<ConvoPage>(listUrl);
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
                <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
                  {c.chatbotName ? `${c.chatbotName} · ` : ''}{c.visitorId ?? 'visitor'}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 3 }}>{c.preview ?? '(kosong)'}</div>
                <div className="microlabel" style={{ marginTop: 4 }}>{new Date(c.startedAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })} · {c.count} pesan</div>
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

