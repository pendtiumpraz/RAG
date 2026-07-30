'use client';

import { useState } from 'react';
import { api, useApi, ApiError } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Skeleton, ErrorState, EmptyState, useToast } from '../../_components/ui';
import { Select } from '../../_components/select';

interface Chatbot {
  id: string; name: string; publicKey: string; enabled: boolean;
  allowedOrigins: string[]; greeting: string | null; context: string | null; deletedAt?: string | null;
  /* Kebijakan jawaban (D14) — arti tiap nilai: modules/chat/answer-policy.ts.
     Opsional karena baris pra-migrasi 0030 belum memilikinya. */
  temperature?: number; maxTokens?: number; languageMode?: string;
  tone?: string; grounding?: string; answerRules?: string | null;
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
                      <a className="icon-btn" href={`/demo/${b.publicKey}`} target="_blank" rel="noreferrer" aria-label="Demo" title="Buka halaman demo"><Icon name="chat" size={15} /></a>
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
  const [context, setContext] = useState(bot?.context ?? '');
  const [origins, setOrigins] = useState((bot?.allowedOrigins ?? []).join('\n'));
  const [enabled, setEnabled] = useState(bot?.enabled ?? true);
  /* Kebijakan jawaban (D14). Default di sini SENGAJA sama dengan default
     kolom di migrasi 0030 — kalau berbeda, chatbot baru akan lahir dengan
     perilaku yang tak sesuai apa yang tertulis di form. */
  const [temperature, setTemperature] = useState(bot?.temperature ?? 0.2);
  const [maxTokens, setMaxTokens] = useState(bot?.maxTokens ?? 2048);
  const [languageMode, setLanguageMode] = useState(bot?.languageMode ?? 'auto');
  const [tone, setTone] = useState(bot?.tone ?? 'netral');
  const [grounding, setGrounding] = useState(bot?.grounding ?? 'strict');
  const [answerRules, setAnswerRules] = useState(bot?.answerRules ?? '');
  const [snippet, setSnippet] = useState<string | null>(
    bot ? `<script src="${location.origin}/embed.js" data-chatbot="${bot.publicKey}"></script>` : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  async function save() {
    setBusy(true); setErr(null);
    const body = {
      name, greeting, enabled,
      // `context` sempat hanya hidup di state dan tak pernah terkirim —
      // form menyimpan tanpa galat, tapi persona chatbot tak pernah berubah.
      context: context.trim() || null,
      allowedOrigins: origins.split('\n').map((s) => s.trim()).filter(Boolean),
      temperature, maxTokens, languageMode, tone, grounding,
      answerRules: answerRules.trim() || null,
    };
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

          {/* D11: konteks kepemilikan divisi — masuk system prompt chatbot ini saja */}
          <div className="field"><label>Konteks divisi / persona</label>
            <textarea className="input" rows={3} value={context} onChange={(e) => setContext(e.target.value)}
              placeholder="Chatbot divisi HR. Menjawab kebijakan karyawan, cuti, dan benefit. Gaya formal dan ringkas." />
            <p className="microlabel" style={{ marginTop: 6 }}>MASUK KE SYSTEM PROMPT CHATBOT INI SAJA — MENENTUKAN WATAK &amp; LINGKUP JAWABAN</p></div>
          {/* ── D14: kebijakan jawaban ─────────────────────────────────
              Bahasa, kepatuhan pada sumber, dan nada — plus dua tuas model.
              Sebelum ini tak ada satu pun: semua penyedia dipanggil pada
              default masing-masing, dan default OpenAI/Anthropic adalah 1.0. */}
          <div className="field">
            <label>Bahasa jawaban</label>
            <Select value={languageMode} onChange={(e) => setLanguageMode(e.target.value)} items={[
              { value: 'auto', label: 'Ikuti bahasa penanya (otomatis)' },
              { value: 'id', label: 'Selalu Bahasa Indonesia' },
              { value: 'en', label: 'Selalu English' },
            ]} />
            <p className="microlabel" style={{ marginTop: 6 }}>
              OTOMATIS DINILAI PER PESAN — PENANYA BOLEH BERGANTI BAHASA DI TENGAH PERCAKAPAN
            </p>
          </div>

          <div className="field">
            <label>Kepatuhan pada dokumen</label>
            <Select value={grounding} onChange={(e) => setGrounding(e.target.value)} items={[
              { value: 'strict', label: 'Ketat — hanya dari dokumen' },
              { value: 'balanced', label: 'Seimbang — boleh melengkapi, wajib ditandai' },
              { value: 'open', label: 'Terbuka — boleh menjawab dari pengetahuan umum' },
            ]} />
            <p className="microlabel" style={{ marginTop: 6 }}>
              {grounding === 'strict'
                ? 'TAK ADA DI DOKUMEN = BOT MENJAWAB "TIDAK ADA". INI SETELAN PALING AMAN DARI KARANGAN.'
                : grounding === 'balanced'
                  ? 'BOT BOLEH MELENGKAPI DARI PENGETAHUAN UMUM, TAPI HARUS MENANDAI BAGIAN ITU.'
                  : 'RISIKO KARANGAN PALING TINGGI. PILIH INI HANYA UNTUK BOT UMUM, BUKAN BOT KEBIJAKAN/HUKUM.'}
            </p>
          </div>

          <div className="field">
            <label>Nada jawaban</label>
            <Select value={tone} onChange={(e) => setTone(e.target.value)} items={[
              { value: 'netral', label: 'Netral — profesional biasa' },
              { value: 'formal', label: 'Formal — resmi, tanpa singkatan' },
              { value: 'ramah', label: 'Ramah — hangat, mengobrol' },
              { value: 'ringkas', label: 'Ringkas — langsung ke jawaban' },
              { value: 'teknis', label: 'Teknis — istilah & angka persis' },
            ]} />
          </div>

          <div className="field">
            <label>Kreativitas model · {temperature.toFixed(2)}</label>
            <input type="range" min={0} max={1} step={0.05} value={temperature}
              style={{ width: '100%' }}
              onChange={(e) => setTemperature(Number(e.target.value))} />
            <p className="microlabel" style={{ marginTop: 6 }}>
              {temperature <= 0.3
                ? 'RENDAH — JAWABAN KONSISTEN & PATUH PADA DOKUMEN. DIANJURKAN.'
                : temperature <= 0.6
                  ? 'SEDANG — KALIMAT LEBIH LUWES, RISIKO KARANGAN MULAI NAIK.'
                  : 'TINGGI — MODEL MULAI MEMILIH KATA BERPELUANG RENDAH. TIDAK DIANJURKAN UNTUK BOT DOKUMEN.'}
            </p>
          </div>

          <div className="field">
            <label>Panjang jawaban maksimum (token)</label>
            <Select value={String(maxTokens)} onChange={(e) => setMaxTokens(Number(e.target.value))} items={[
              { value: '512', label: '512 — jawaban pendek' },
              { value: '1024', label: '1024 — sedang' },
              { value: '2048', label: '2048 — panjang (default)' },
              { value: '4096', label: '4096 — sangat panjang' },
              { value: '8192', label: '8192 — maksimum' },
            ]} />
          </div>

          <div className="field">
            <label>Aturan tambahan (opsional)</label>
            <textarea className="textarea" rows={3} value={answerRules}
              onChange={(e) => setAnswerRules(e.target.value)}
              placeholder={'Jangan menyebut harga; arahkan ke tim sales.\nSelalu tutup dengan nomor tiket bila ada.'} />
            <p className="microlabel" style={{ marginTop: 6 }}>
              DIPERLAKUKAN SEBAGAI PREFERENSI GAYA — TAK BISA MELONGGARKAN ATURAN BAHASA &amp; KEPATUHAN DI ATAS
            </p>
          </div>

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
