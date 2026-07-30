'use client';

import { useEffect, useRef, useState } from 'react';
import './chat.css';
import { useApi } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Select } from '../../_components/select';
import { EmptyState } from '../../_components/ui';
import { AnswerBlocks } from '../../_components/answer-blocks';
import { blocksToPlainText, type AnswerBlock } from '@/modules/chat/blocks';

interface Chatbot { id: string; name: string }
interface Source { documentId: string; title: string | null; score: number; content: string }
interface Msg { role: 'user' | 'assistant'; text?: string; blocks?: AnswerBlock[]; sources?: Source[]; streaming?: boolean }

/** Konsol Chat internal + panel Citations — replika PRODUCT UI resmi, data nyata. */
export default function ChatPage() {
  const bots = useApi<Chatbot[]>('/api/chatbots');
  const [chatbotId, setChatbotId] = useState('');
  useEffect(() => { if (bots.data?.[0] && !chatbotId) setChatbotId(bots.data[0].id); }, [bots.data, chatbotId]);

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  /** Sesi berjalan — dikirim balik tiap giliran supaya riwayat menyambung
   *  jadi SATU conversation; null = giliran berikutnya membuka sesi baru. */
  const [convId, setConvId] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  /** Pengendali giliran berjalan — dipakai tombol Hentikan. */
  const abortRef = useRef<AbortController | null>(null);
  /** Indeks pesan yang baru disalin, untuk umpan balik sesaat. */
  const [copied, setCopied] = useState<number | null>(null);

  /**
   * Menghentikan jawaban yang sedang mengalir.
   *
   * Yang sudah tiba TIDAK dibuang: pengguna menekan Hentikan justru karena
   * sudah mendapat yang dicarinya, dan mengosongkan bubble akan membuang hal
   * itu. Giliran ditandai selesai, sisanya tak pernah datang.
   */
  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  /** Blok terstruktur → teks datar yang bisa ditempel ke mana pun. */
  function plainTextOf(m: Msg): string {
    if (m.text) return m.text;
    return (m.blocks ?? []).map((b) => {
      if (b.type === 'text') return b.text;
      if (b.type === 'list') return b.items.map((it, i) => (b.ordered ? `${i + 1}. ${it}` : `- ${it}`)).join('\n');
      if (b.type === 'cards') return b.items.map((c) => `${c.title}: ${c.value}${c.desc ? ` (${c.desc})` : ''}`).join('\n');
      // Blok tabel & chart memakai padanan teks yang SAMA dengan yang dikirim
      // ke model sebagai riwayat — satu definisi, tak ada dua versi yang bisa
      // menyimpang (blocksToPlainText di modules/chat/blocks.ts).
      if (b.type === 'table' || b.type === 'chart') return blocksToPlainText([b]);
      return '';
    }).filter(Boolean).join('\n\n');
  }

  async function copyMsg(m: Msg, i: number) {
    const text = plainTextOf(m);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1600);
    } catch { /* clipboard ditolak browser — diam saja, bukan kegagalan yang perlu dilaporkan */ }
  }

  function newSession() {
    setConvId(null); setMsgs([]);
  }
  const lastSources = [...msgs].reverse().find((m) => m.role === 'assistant' && m.sources)?.sources ?? [];

  useEffect(() => { threadRef.current?.scrollTo(0, threadRef.current.scrollHeight); }, [msgs]);

  async function send() {
    const q = input.trim();
    if (!q || !chatbotId || busy) return;
    setInput(''); setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text: q }, { role: 'assistant', blocks: [], streaming: true }]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch('/api/chat/internal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatbotId, message: q, ...(convId ? { conversationId: convId } : {}) }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error('Gagal memulai chat');
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n'); buf = parts.pop() ?? '';
        for (const p of parts) {
          const ev = p.match(/event: (.*)/)?.[1];
          let data: unknown = {}; try { data = JSON.parse(p.match(/data: (.*)/)?.[1] ?? '{}'); } catch {}
          if (ev === 'meta') { setConvId((data as { conversationId: string }).conversationId); continue; }
          setMsgs((m) => {
            const copy = [...m]; const last = { ...copy[copy.length - 1] };
            if (ev === 'sources') last.sources = data as Source[];
            // jawaban tiba BLOK demi BLOK (text/list/cards/chart) — sudah
            // tervalidasi server; di sini murni render
            else if (ev === 'block') last.blocks = [...(last.blocks ?? []), data as AnswerBlock];
            else if (ev === 'done') last.streaming = false;
            else if (ev === 'error') {
              last.blocks = [...(last.blocks ?? []), { type: 'text', text: '⚠ ' + (data as { message: string }).message }];
              last.streaming = false;
            }
            copy[copy.length - 1] = last;
            return copy;
          });
        }
      }
    } catch (e) {
      // Dihentikan pengguna BUKAN galat: pertahankan yang sudah tiba dan
      // tandai giliran ini selesai. Menampilkan "⚠ aborted" di sini akan
      // terbaca seperti produk yang rusak padahal ia menuruti perintah.
      if ((e as Error).name === 'AbortError') {
        setMsgs((m) => {
          const c = [...m]; const last = { ...c[c.length - 1] };
          last.streaming = false;
          if (!last.blocks?.length && !last.text) last.text = '(dihentikan)';
          c[c.length - 1] = last; return c;
        });
      } else {
        setMsgs((m) => { const c = [...m]; c[c.length - 1] = { role: 'assistant', text: '⚠ ' + (e as Error).message }; return c; });
      }
    } finally { setBusy(false); abortRef.current = null; }
  }

  return (
    <div className="chat-shell">
      <div className="chat-main">
        <div className="chat-bar">
          <h1>Chat</h1>
          <div className="cluster gap-2">
            {convId && <span className="badge badge-signal" title={convId}><span className="led led-live" />sesi aktif</span>}
            <button className="btn btn-sm" onClick={newSession} disabled={busy || msgs.length === 0}
              title="Mulai percakapan baru — sesi berjalan tersimpan di Conversations">
              <Icon name="plus" size={14} /> Sesi baru
            </button>
            <Select style={{ width: 200, minHeight: 40 }} value={chatbotId}
              onChange={(e) => { setChatbotId(e.target.value); newSession(); /* beda bot = beda riwayat */ }}>
              {bots.data?.length ? bots.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>) : <option>Belum ada chatbot</option>}
            </Select>
          </div>
        </div>

        <div className="thread" ref={threadRef}>
          {msgs.length === 0 && (
            <EmptyState title="Tanyakan apa saja tentang dokumenmu"
              hint="Jawaban selalu disertai sitasi ke sumbernya. Pilih chatbot lalu ketik pertanyaan." />
          )}
          {msgs.map((m, i) => m.role === 'user'
            ? <div key={i} className="m-user">{m.text}</div>
            : (
              <div key={i} className="answer">
                <div className="ans-head">
                  <span className="mk"><Nmark /></span><b>Nalar</b>
                  {/* Hentikan hanya saat giliran ini yang mengalir; Salin baru
                      berguna setelah ada isinya. Keduanya di kepala jawaban,
                      bukan melayang, supaya tak menutupi teks saat dibaca. */}
                  {m.streaming ? (
                    <button className="btn btn-sm btn-ghost ans-act" onClick={stop}>Hentikan</button>
                  ) : (m.blocks?.length || m.text) ? (
                    <button className="btn btn-sm btn-ghost ans-act" onClick={() => void copyMsg(m, i)}>
                      {copied === i ? 'Tersalin' : 'Salin'}
                    </button>
                  ) : null}
                </div>
                <div className="card card-pad">
                  {m.blocks && m.blocks.length > 0
                    ? <AnswerBlocks blocks={m.blocks} />
                    : m.streaming
                      ? <span className="typing"><i></i><i></i><i></i></span>
                      : null}
                  {m.streaming && m.blocks && m.blocks.length > 0 &&
                    <span className="typing" style={{ marginTop: 10 }}><i></i><i></i><i></i></span>}
                  {m.sources && m.sources.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div className="microlabel" style={{ marginBottom: 8 }}>Sumber ({m.sources.length})</div>
                      {m.sources.map((s, j) => (
                        <div key={s.documentId} className="source-line">
                          <span className="n">[{j + 1}]</span> {s.title ?? 'dokumen'}
                          <span style={{ marginLeft: 'auto', color: 'var(--source)' }}>{s.score.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>

        <div className="composer">
          <div className="box">
            <input placeholder="Tanyakan sesuatu…" value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }} disabled={busy} />
            <button className="send" onClick={send} disabled={busy || !input.trim()} aria-label="Kirim">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4v6l12 2-12 2z" /></svg>
            </button>
          </div>
          <div className="hint">Jawaban berdasarkan dokumen perusahaan · selalu dengan sitasi</div>
        </div>
      </div>

      <aside className="cites-panel">
        <div className="cites-head"><b>Citations</b><span className="cnt">{lastSources.length}</span></div>
        {lastSources.length === 0
          ? <p className="microlabel">SUMBER JAWABAN AKAN MUNCUL DI SINI.</p>
          : lastSources.map((s) => (
            <div key={s.documentId} className="cite-card">
              <div className="fn"><span className="ic"><Icon name="book" size={13} /></span>{s.title ?? 'dokumen'}<span className="sc">{s.score.toFixed(2)}</span></div>
              <div className="ex">{s.content}…</div>
            </div>
          ))}
        <p className="microlabel" style={{ textAlign: 'center', marginTop: 16 }}>SETIAP KLAIM DAPAT DITELUSURI KE SUMBERNYA</p>
      </aside>
    </div>
  );
}

function Nmark() {
  return (
    <svg width="15" height="15" viewBox="0 0 48 48" fill="none">
      <path d="M15 16 L33 24 M15 24 L33 24 M15 32 L33 24" stroke="#60A5FA" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="15" cy="16" r="3" fill="#fff" /><circle cx="33" cy="24" r="4" fill="#F59E0B" />
    </svg>
  );
}
