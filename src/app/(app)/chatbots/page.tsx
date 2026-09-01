'use client';

import { useState } from 'react';
import { api, useApi, ApiError } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Skeleton, ErrorState, EmptyState, useToast, Field, Drawer } from '../../_components/ui';
import { konfirmasi } from '../../_components/alert';
import { Select } from '../../_components/select';
import { BarisKosong, TabelAlat, TabelKaki, TdNo, Th, ThNo, useTabel } from '../../_components/tabel';
import type { OpsiTabel } from '../../_lib/tabel';

interface Chatbot {
  id: string; name: string; publicKey: string; enabled: boolean;
  allowedOrigins: string[]; greeting: string | null; context: string | null; deletedAt?: string | null;
  /* Kebijakan jawaban (D14) — arti tiap nilai: modules/chat/answer-policy.ts.
     Opsional karena baris pra-migrasi 0030 belum memilikinya. */
  temperature?: number; maxTokens?: number; languageMode?: string;
  tone?: string; grounding?: string; answerRules?: string | null;
  /** Rahasia identitas pengunjung sudah dinyalakan (migrasi 0042)? */
  visitorSecret?: string | null;
  /** Divisi pemilik (migrasi 0040). null = tak dibatasi. */
  divisionId?: string | null;
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
            <TabelAktif rows={rows} onEdit={setEditing} onRemove={remove} />
          )} />
      ) : (
        <ListCard state={trash}
          empty={<EmptyState title="Sampah kosong" hint="Chatbot yang dihapus muncul di sini dan bisa dipulihkan." />}
          render={(rows) => <TabelSampah rows={rows} onRestore={restore} />} />
      )}

      {editing && <ChatbotDrawer chatbot={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }} />}
    </>
  );
}

/* Tabelnya dipisah jadi komponen sendiri, bukan digambar di dalam `render`:
   useTabel adalah hook, dan hook tak boleh dipanggil di dalam callback. */

const OPSI_AKTIF: OpsiTabel<Chatbot> = {
  cari: (b) => [b.name, b.publicKey, b.greeting, b.context],
  saring: { status: (b) => (b.enabled ? 'enabled' : 'disabled') },
  urut: { name: (b) => b.name, publicKey: (b) => b.publicKey, status: (b) => (b.enabled ? 'a' : 'b') },
};

function TabelAktif({ rows, onEdit, onRemove }: {
  rows: Chatbot[]; onEdit: (b: Chatbot) => void; onRemove: (id: string) => void;
}) {
  const t = useTabel(rows, OPSI_AKTIF);
  return (
    <div className="card-pad stack gap-4">
      <TabelAlat
        t={t} rows={rows} cariLabel="Cari nama, public key, sapaan, atau konteks"
        saring={[{ kunci: 'status', label: 'Semua status', lebar: 150, pilihan: [
          { nilai: 'enabled', label: 'Aktif' }, { nilai: 'disabled', label: 'Nonaktif' },
        ] }]}
      />
      <div className="table-wrap"><table className="table">
        <thead><tr>
          <ThNo />
          <Th t={t} kunci="name">Nama</Th>
          <Th t={t} kunci="publicKey">Public Key</Th>
          <Th t={t} kunci="status">Status</Th>
          <th />
        </tr></thead>
        <tbody>
          <BarisKosong t={t} kolom={5} />
          {t.hasil.tampil.map((b, i) => (
            <tr key={b.id}>
              <TdNo n={t.nomor(i)} />
              <td><b>{b.name}</b></td>
              <td className="mono" style={{ color: 'var(--source)' }}>{b.publicKey.slice(0, 14)}…</td>
              <td><span className={`badge ${b.enabled ? 'badge-ok' : ''}`}><span className={`led ${b.enabled ? 'led-live' : 'led-off'}`} />{b.enabled ? 'enabled' : 'disabled'}</span></td>
              <td><div className="rowact">
                <a className="icon-btn" href={`/demo/${b.publicKey}`} target="_blank" rel="noreferrer" aria-label="Demo" title="Buka halaman demo"><Icon name="chat" size={15} /></a>
                <button className="icon-btn" aria-label="Edit" onClick={() => onEdit(b)}><Icon name="edit" size={15} /></button>
                <button className="icon-btn" aria-label="Hapus" onClick={() => onRemove(b.id)}><Icon name="trash" size={15} /></button>
              </div></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <TabelKaki t={t} satuan="chatbot" />
    </div>
  );
}

const OPSI_SAMPAH: OpsiTabel<Chatbot> = {
  cari: (b) => [b.name, b.publicKey],
  urut: { name: (b) => b.name, deletedAt: (b) => b.deletedAt },
};

function TabelSampah({ rows, onRestore }: { rows: Chatbot[]; onRestore: (id: string) => void }) {
  const t = useTabel(rows, OPSI_SAMPAH);
  return (
    <div className="card-pad stack gap-4">
      {/* Tanpa penyaring: seluruh isi tabel ini SUDAH satu keadaan (terhapus),
          jadi dropdown apa pun di sini cuma memberi kesan bisa menyaring
          sesuatu yang tak punya ragam. */}
      <TabelAlat t={t} rows={rows} cariLabel="Cari chatbot yang dihapus" />
      <div className="table-wrap"><table className="table">
        <thead><tr>
          <ThNo />
          <Th t={t} kunci="name">Nama</Th>
          <Th t={t} kunci="deletedAt">Dihapus</Th>
          <th />
        </tr></thead>
        <tbody>
          <BarisKosong t={t} kolom={4} />
          {t.hasil.tampil.map((b, i) => (
            <tr key={b.id}>
              <TdNo n={t.nomor(i)} />
              <td><b>{b.name}</b></td>
              <td className="mono" style={{ color: 'var(--muted)' }}>{b.deletedAt?.slice(0, 10)}</td>
              <td><button className="btn btn-sm" onClick={() => onRestore(b.id)}><Icon name="restore" size={14} /> Restore</button></td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <TabelKaki t={t} satuan="chatbot" />
    </div>
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
        /* Pembungkus `table-wrap` DILEPAS dari sini: yang dirender sekarang
           bukan lagi tabel telanjang melainkan bilah alat + tabel + kaki, dan
           membungkusnya dengan overflow-x akan memotong dropdown penyaringnya. */
        : render(state.data)}
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
  /* Divisi PEMILIK (migrasi 0040) — beda dari "Konteks divisi / persona" di
     bawah, yang cuma prosa untuk system prompt dan tak menjaga apa pun.
     '' berarti tak dibatasi; dikirim sebagai null. */
  const [divisionId, setDivisionId] = useState(bot?.divisionId ?? '');
  const divisi = useApi<Array<{ id: string; name: string }>>('/api/divisions');
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
      divisionId: divisionId || null,
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
      <Drawer onClose={onClose} label="Form chatbot">
        <div className="dh"><h3>{isNew ? 'Tambah Chatbot' : 'Edit Chatbot'}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" size={16} /></button></div>
        <div className="db stack gap-4">
          <Field label="Nama chatbot"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Greeting"><input className="input" value={greeting} onChange={(e) => setGreeting(e.target.value)} /></Field>

          {/* Divisi PEMILIK (migrasi 0040) — ini yang benar-benar membatasi
              siapa boleh membuka chatbot ini. Sengaja ditaruh TEPAT DI ATAS
              "Konteks divisi / persona": keduanya menyebut kata divisi, dan
              satu-satunya cara membedakannya adalah melihatnya berdampingan. */}
          <Field label="Divisi pemilik">
            <Select value={divisionId} onChange={(e) => setDivisionId(e.target.value)} items={[
              { value: '', label: 'Tanpa divisi — terlihat semua anggota' },
              ...(divisi.data ?? []).map((d) => ({ value: d.id, label: d.name })),
            ]} />
            <p className="microlabel" style={{ marginTop: 6 }}>
              {divisionId
                ? 'HANYA ANGGOTA DIVISI INI — DAN ADMIN ORGANISASI — YANG MELIHAT CHATBOT INI'
                : 'SELURUH ANGGOTA ORGANISASI MELIHAT CHATBOT INI'}
            </p>
          </Field>

          {!isNew && bot && <IdentitasPengunjung bot={bot} />}

          {/* D11: konteks kepemilikan divisi — masuk system prompt chatbot ini saja */}
          <Field label="Konteks divisi / persona"><textarea className="input" rows={3} value={context} onChange={(e) => setContext(e.target.value)}
              placeholder="Chatbot divisi HR. Menjawab kebijakan karyawan, cuti, dan benefit. Gaya formal dan ringkas." />
            <p className="microlabel" style={{ marginTop: 6 }}>MASUK KE SYSTEM PROMPT CHATBOT INI SAJA — MENENTUKAN WATAK &amp; LINGKUP JAWABAN</p></Field>
          {/* ── D14: kebijakan jawaban ─────────────────────────────────
              Bahasa, kepatuhan pada sumber, dan nada — plus dua tuas model.
              Sebelum ini tak ada satu pun: semua penyedia dipanggil pada
              default masing-masing, dan default OpenAI/Anthropic adalah 1.0. */}
          <Field label="Bahasa jawaban"><Select value={languageMode} onChange={(e) => setLanguageMode(e.target.value)} items={[
              { value: 'auto', label: 'Ikuti bahasa penanya (otomatis)' },
              { value: 'id', label: 'Selalu Bahasa Indonesia' },
              { value: 'en', label: 'Selalu English' },
            ]} />
            <p className="microlabel" style={{ marginTop: 6 }}>
              OTOMATIS DINILAI PER PESAN — PENANYA BOLEH BERGANTI BAHASA DI TENGAH PERCAKAPAN
            </p></Field>

          <Field label="Kepatuhan pada dokumen"><Select value={grounding} onChange={(e) => setGrounding(e.target.value)} items={[
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
            </p></Field>

          <Field label="Nada jawaban"><Select value={tone} onChange={(e) => setTone(e.target.value)} items={[
              { value: 'netral', label: 'Netral — profesional biasa' },
              { value: 'formal', label: 'Formal — resmi, tanpa singkatan' },
              { value: 'ramah', label: 'Ramah — hangat, mengobrol' },
              { value: 'ringkas', label: 'Ringkas — langsung ke jawaban' },
              { value: 'teknis', label: 'Teknis — istilah & angka persis' },
            ]} /></Field>

          <Field label={<>Kreativitas model · {temperature.toFixed(2)}</>}><input type="range" min={0} max={1} step={0.05} value={temperature}
              style={{ width: '100%' }}
              onChange={(e) => setTemperature(Number(e.target.value))} />
            <p className="microlabel" style={{ marginTop: 6 }}>
              {temperature <= 0.3
                ? 'RENDAH — JAWABAN KONSISTEN & PATUH PADA DOKUMEN. DIANJURKAN.'
                : temperature <= 0.6
                  ? 'SEDANG — KALIMAT LEBIH LUWES, RISIKO KARANGAN MULAI NAIK.'
                  : 'TINGGI — MODEL MULAI MEMILIH KATA BERPELUANG RENDAH. TIDAK DIANJURKAN UNTUK BOT DOKUMEN.'}
            </p></Field>

          <Field label="Panjang jawaban maksimum (token)"><Select value={String(maxTokens)} onChange={(e) => setMaxTokens(Number(e.target.value))} items={[
              { value: '512', label: '512 — jawaban pendek' },
              { value: '1024', label: '1024 — sedang' },
              { value: '2048', label: '2048 — panjang (default)' },
              { value: '4096', label: '4096 — sangat panjang' },
              { value: '8192', label: '8192 — maksimum' },
            ]} /></Field>

          <Field label="Aturan tambahan (opsional)"><textarea className="textarea" rows={3} value={answerRules}
              onChange={(e) => setAnswerRules(e.target.value)}
              placeholder={'Jangan menyebut harga; arahkan ke tim sales.\nSelalu tutup dengan nomor tiket bila ada.'} />
            <p className="microlabel" style={{ marginTop: 6 }}>
              DIPERLAKUKAN SEBAGAI PREFERENSI GAYA — TAK BISA MELONGGARKAN ATURAN BAHASA &amp; KEPATUHAN DI ATAS
            </p></Field>

          <Field label="Allowed origins (satu per baris — kosong = semua)"><textarea className="textarea" rows={2} value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder="https://situs-pelanggan.com" /></Field>
          <div className="cluster" style={{ justifyContent: 'space-between' }}>
            <span className="kicker">Enabled</span>
            <input type="checkbox" className="switch" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          </div>
          {snippet && (
            <Field label="Embed snippet"><div className="card card-pad mono" style={{ fontSize: 12, wordBreak: 'break-all', background: 'var(--card-2)' }}>
                {snippet}
                <div style={{ marginTop: 10 }}>
                  <button className="btn btn-sm" onClick={() => { navigator.clipboard?.writeText(snippet); toast('Snippet disalin'); }}>Salin</button>
                </div>
              </div></Field>
          )}
          {err && <div className="field"><span className="error">{err}</span></div>}
        </div>
        <div className="df">
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} style={{ flex: 1 }} onClick={save} disabled={busy}>Simpan</button>
          <button className="btn" onClick={onClose}>Tutup</button>
        </div>
      </Drawer>
    </>
  );
}

/* ── identitas pengunjung yang disuntik situs pelanggan ──────────────
   Penanda pengunjung lahir dari Math.random() di localStorage, jadi riwayat
   chat mati bersama perambannya: tanya di ponsel pagi hari, buka laptop siang
   hari, percakapannya hilang. Pelanggan yang situsnya sudah punya login bisa
   menyebutkan sendiri penanda penggunanya — di halaman DALAM aplikasi mereka,
   bukan di landing publik. */
function IdentitasPengunjung({ bot }: { bot: Chatbot }) {
  const [nyala, setNyala] = useState(!!bot.visitorSecret);
  const [rahasia, setRahasia] = useState<string | null>(null);
  const [contoh, setContoh] = useState<Array<{ id: string; label: string; berkas: string; kode: string }>>([]);
  const [bahasa, setBahasa] = useState('php');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function ubah(mau: boolean) {
    if (!mau && !await konfirmasi({
      judul: 'Matikan identitas pengunjung?',
      pesan: 'Widget yang memakai tanda tangan akan ditolak, dan riwayat lintas perangkat berhenti bekerja.',
      tegas: 'Matikan', merusak: true,
    })) return;
    if (mau && nyala && !await konfirmasi({
      judul: 'Putar rahasia sekarang?',
      pesan: '<b>SEMUA</b> tanda tangan lama langsung ditolak sampai server Anda memakai rahasia baru.',
      tegas: 'Putar rahasia', merusak: true,
    })) return;
    setBusy(true);
    try {
      const r = await api<{ rahasia: string | null; contoh: typeof contoh }>(
        `/api/chatbots/${bot.id}/visitor-secret`,
        { method: 'POST', body: JSON.stringify({ nyala: mau }) });
      setNyala(mau); setRahasia(r.rahasia); setContoh(r.contoh ?? []);
      toast(mau ? 'Rahasia dibuat — salin sekarang' : 'Identitas pengunjung dimatikan');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  const aktif = contoh.find((c) => c.id === bahasa) ?? contoh[0];

  return (
    <Field label="Identitas pengunjung dari situs Anda">
      <div className="cluster gap-2">
        <button className={`btn btn-sm${nyala ? '' : ' btn-primary'}`} disabled={busy}
          onClick={() => void ubah(!nyala)}>
          {nyala ? 'Matikan' : 'Nyalakan'}
        </button>
        {nyala && (
          <button className="btn btn-sm" disabled={busy} onClick={() => void ubah(true)}>
            Putar rahasia
          </button>
        )}
        <span className="badge">{nyala ? 'AKTIF' : 'MATI'}</span>
      </div>

      <p className="microlabel" style={{ marginTop: 6 }}>
        UNTUK HALAMAN DI DALAM APLIKASI ANDA YANG PENGGUNANYA SUDAH LOGIN — BUKAN LANDING PUBLIK.
        RIWAYAT CHAT LALU MENGIKUTI ORANGNYA KE PERANGKAT MANA PUN. TANPA INI, RIWAYAT TETAP
        HIDUP PER PERAMBAN SEPERTI SEBELUMNYA.
      </p>

      {rahasia && (
        <div className="stack gap-2" style={{ marginTop: 10 }}>
          <span className="microlabel" style={{ color: 'var(--source)' }}>
            SALIN SEKARANG — RAHASIA INI TIDAK BISA DILIHAT LAGI SETELAH LAYAR INI DITUTUP
          </span>
          <code className="mono" style={{
            display: 'block', padding: 10, background: 'var(--card-2)',
            border: '1px solid var(--line)', borderRadius: 7, wordBreak: 'break-all', fontSize: 12,
          }}>{rahasia}</code>
          <p className="microlabel">
            SIMPAN SEBAGAI ENV DI SERVER ANDA (NALAR_VISITOR_SECRET). JANGAN PERNAH MENARUHNYA
            DI KODE YANG DIKIRIM KE PERAMBAN — SIAPA PUN YANG MEMBACANYA BISA MENIRU IDENTITAS
            SETIAP PENGGUNA ANDA.
          </p>
        </div>
      )}

      {aktif && (
        <div className="stack gap-2" style={{ marginTop: 10 }}>
          <div className="cluster gap-2" style={{ flexWrap: 'wrap' }}>
            {contoh.map((c) => (
              <button key={c.id} className={`btn btn-sm${c.id === (aktif.id) ? ' btn-primary' : ''}`}
                onClick={() => setBahasa(c.id)}>{c.label}</button>
            ))}
          </div>
          <span className="microlabel">{aktif.berkas}</span>
          <pre className="mono" style={{
            margin: 0, padding: 12, background: 'var(--card-2)', border: '1px solid var(--line)',
            borderRadius: 7, overflowX: 'auto', fontSize: 12, lineHeight: 1.55,
          }}>{aktif.kode}</pre>
        </div>
      )}
    </Field>
  );
}
