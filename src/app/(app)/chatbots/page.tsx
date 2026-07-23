'use client';

import { useState } from 'react';
import { api, useApi, ApiError } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Skeleton, ErrorState, EmptyState, useToast } from '../../_components/ui';

interface Chatbot {
  id: string; name: string; publicKey: string; enabled: boolean;
  allowedOrigins: string[]; greeting: string | null; deletedAt?: string | null;
}

export default function ChatbotsPage() {
  const [tab, setTab] = useState<'active' | 'trash'>('active');
  const active = useApi<Chatbot[]>('/api/chatbots');
  const trash = useApi<Chatbot[]>('/api/chatbots/trashed');
  const [editing, setEditing] = useState<Chatbot | 'new' | null>(null);
  const toast = useToast();

  const refresh = () => { active.refetch(); trash.refetch(); };

  async function remove(id: string) {
    try { await api(`/api/chatbots/${id}`, { method: 'DELETE' }); toast('Chatbot dipindah ke Sampah'); refresh(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }
  async function restore(id: string) {
    try { await api(`/api/chatbots/${id}/restore`, { method: 'PATCH' }); toast('Chatbot dipulihkan'); refresh(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Chatbots</h1>
          <p className="sub">Tiap chatbot punya 1 public key &amp; knowledge base terisolasi. Sematkan di website mana pun.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> Tambah Chatbot
        </button>
      </div>

      <div className="toolbar">
        <div className="tabs" role="tablist">
          <button className="tab" role="tab" aria-selected={tab === 'active'} onClick={() => setTab('active')}>Aktif</button>
          <button className="tab" role="tab" aria-selected={tab === 'trash'} onClick={() => setTab('trash')}>Sampah</button>
        </div>
      </div>

      {tab === 'active' ? (
        <ListCard state={active}
          empty={<EmptyState title="Belum ada chatbot" hint="Buat chatbot pertamamu untuk mulai."
            action={<button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>Tambah Chatbot</button>} />}
          render={(rows) => (
            <table className="table">
              <thead><tr><th>Nama</th><th>Public Key</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td><b>{b.name}</b></td>
                    <td className="mono" style={{ color: 'var(--source)' }}>{b.publicKey.slice(0, 14)}…</td>
                    <td><span className={`badge ${b.enabled ? 'badge-ok' : ''}`}><span className={`led ${b.enabled ? 'led-live' : 'led-off'}`} />{b.enabled ? 'enabled' : 'disabled'}</span></td>
                    <td><div className="rowact">
                      <button className="icon-btn" aria-label="Edit" onClick={() => setEditing(b)}><Icon name="edit" size={15} /></button>
                      <button className="icon-btn" aria-label="Hapus" onClick={() => remove(b.id)}><Icon name="trash" size={15} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )} />
      ) : (
        <ListCard state={trash}
          empty={<EmptyState title="Sampah kosong" hint="Chatbot yang dihapus muncul di sini dan bisa dipulihkan." />}
          render={(rows) => (
            <table className="table">
              <thead><tr><th>Nama</th><th>Dihapus</th><th /></tr></thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td><b>{b.name}</b></td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>{b.deletedAt?.slice(0, 10)}</td>
                    <td><button className="btn btn-sm" onClick={() => restore(b.id)}><Icon name="restore" size={14} /> Restore</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )} />
      )}

      {editing && <ChatbotDrawer chatbot={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }} />}
    </>
  );
}

function ListCard<T>({ state, render, empty }: {
  state: ReturnType<typeof useApi<T[]>>; render: (rows: T[]) => React.ReactNode; empty: React.ReactNode;
}) {
  return (
    <div className="card">
      {state.error ? <ErrorState message={state.error} onRetry={state.refetch} />
        : state.loading || !state.data ? <Skeleton rows={3} />
        : state.data.length === 0 ? empty
        : <div className="table-wrap">{render(state.data)}</div>}
    </div>
  );
}

function ChatbotDrawer({ chatbot, onClose, onSaved }:
  { chatbot: Chatbot | 'new'; onClose: () => void; onSaved: () => void }) {
  const isNew = chatbot === 'new';
  const bot = isNew ? null : chatbot;
  const [name, setName] = useState(bot?.name ?? 'Chatbot Baru');
  const [greeting, setGreeting] = useState(bot?.greeting ?? 'Halo! Ada yang bisa dibantu?');
  const [origins, setOrigins] = useState((bot?.allowedOrigins ?? []).join('\n'));
  const [enabled, setEnabled] = useState(bot?.enabled ?? true);
  const [snippet, setSnippet] = useState<string | null>(
    bot ? `<script src="${location.origin}/embed.js" data-chatbot="${bot.publicKey}"></script>` : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  async function save() {
    setBusy(true); setErr(null);
    const body = { name, greeting, enabled, allowedOrigins: origins.split('\n').map((s) => s.trim()).filter(Boolean) };
    try {
      if (isNew) {
        const r = await api<{ snippet: string }>('/api/chatbots', { method: 'POST', body: JSON.stringify(body) });
        setSnippet(r.snippet); toast('Chatbot dibuat');
        // biarkan drawer terbuka agar snippet bisa disalin; refresh list
        onSaved();
      } else {
        await api(`/api/chatbots/${bot!.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast('Perubahan disimpan'); onSaved();
      }
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Gagal menyimpan');
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="backdrop show" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-label="Form chatbot">
        <div className="dh"><h3>{isNew ? 'Tambah Chatbot' : 'Edit Chatbot'}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" size={16} /></button></div>
        <div className="db stack gap-4">
          <div className="field"><label>Nama chatbot</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label>Greeting</label><input className="input" value={greeting} onChange={(e) => setGreeting(e.target.value)} /></div>
          <div className="field"><label>Allowed origins (satu per baris — kosong = semua)</label>
            <textarea className="textarea" rows={2} value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder="https://situs-pelanggan.com" /></div>
          <div className="cluster" style={{ justifyContent: 'space-between' }}>
            <span className="kicker">Enabled</span>
            <input type="checkbox" className="switch" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          </div>
          {snippet && (
            <div className="field"><label>Embed snippet</label>
              <div className="card card-pad mono" style={{ fontSize: 12, wordBreak: 'break-all', background: 'var(--card-2)' }}>
                {snippet}
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(snippet); toast('Snippet disalin'); }}>Salin</button>
                </div>
              </div>
            </div>
          )}
          {err && <div className="field"><span className="error">{err}</span></div>}
        </div>
        <div className="df">
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} style={{ flex: 1 }} onClick={save} disabled={busy}>Simpan</button>
          <button className="btn" onClick={onClose}>Tutup</button>
        </div>
      </aside>
    </>
  );
}
