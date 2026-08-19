'use client';

import { useEffect, useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Select } from '../../_components/select';
import { Skeleton, ErrorState, EmptyState, useToast, Field, Drawer } from '../../_components/ui';
import { BarisKosong, TabelAlat, TabelKaki, TdNo, Th, ThNo, useTabel } from '../../_components/tabel';
import type { OpsiTabel } from '../../_lib/tabel';
import { PageTabs, type TabDef } from '../../_components/page-tabs';
import { useHashTab } from '../../_lib/useTab';

type ModelTab = 'model' | 'server';
const MODEL_KEYS: readonly ModelTab[] = ['model', 'server'];

/** Keadaan server, dipakai bersama penyaring & kolom Status — satu sumber
 *  supaya yang disaring persis yang terbaca di layar. */
function keadaanServer(s: { lastError: string | null; enabled: boolean; models: unknown[] }): string {
  if (s.lastError) return 'gagal';
  if (!s.models.length) return 'belum diuji';
  return s.enabled ? 'aktif' : 'nonaktif';
}

interface LlmModel { id: string; label: string; provider: string }
interface EmbModel { id: string; label: string; bucket: string; kind: string }
interface RerankModel { id: string; label: string; penyedia: string; catatan: string }
interface Catalog {
  llmModels: LlmModel[]; embeddingModels: EmbModel[]; providers: string[];
  rerankModels: RerankModel[];
  active: {
    activeLlmModel: string; activeEmbeddingModel: string; systemPrompt: string | null;
    activeRerankModel: string | null;
  } | null;
  savedKeys: string[];
  role: string;
}
/** Server embedding VPS — bentuk publik: token TAK PERNAH dikirim ke browser. */
interface EmbServer {
  id: string; name: string; baseUrl: string; enabled: boolean; hasToken: boolean;
  models: Array<{ id: string; dimensions: number; dtype?: string; loaded?: boolean }>;
  lastCheckedAt: string | null; lastError: string | null;
}

export default function ModelsPage() {
  const { data, loading, error, refetch } = useApi<Catalog>('/api/settings');
  const [llm, setLlm] = useState(''); const [emb, setEmb] = useState('');
  /* '' = MATI. Dipetakan ke null saat dikirim — lihat save(). */
  const [rerank, setRerank] = useState('');
  const [prompt, setPrompt] = useState(''); const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [tested, setTested] = useState<Record<string, { ok: boolean; message: string }>>({});
  const toast = useToast();

  /** Menguji kunci yang TERSIMPAN, bukan yang sedang diketik — itu yang dipakai menjawab. */
  async function testKey(provider: string) {
    setTesting(provider);
    try {
      const r = await api<{ ok: boolean; message: string }>('/api/settings/test-key', {
        method: 'POST', body: JSON.stringify({ provider }),
      });
      setTested((t) => ({ ...t, [provider]: r }));
    } catch (e) {
      setTested((t) => ({ ...t, [provider]: { ok: false, message: (e as Error).message } }));
    } finally { setTesting(null); }
  }

  useEffect(() => {
    if (!data) return;
    setLlm(data.active?.activeLlmModel ?? data.llmModels[0]?.id ?? '');
    setEmb(data.active?.activeEmbeddingModel ?? data.embeddingModels[0]?.id ?? '');
    setPrompt(data.active?.systemPrompt ?? '');
    setRerank(data.active?.activeRerankModel ?? '');
  }, [data]);

  async function save() {
    setBusy(true);
    try {
      await api('/api/settings', { method: 'POST', body: JSON.stringify({
        activeLlmModel: llm, activeEmbeddingModel: emb, systemPrompt: prompt,
        /* '' → null, bukan '' — kolomnya memakai NULL untuk "mati", dan dua
           nilai yang sama-sama berarti mati selalu berakhir dengan satu
           cabang kode yang lupa salah satunya. */
        activeRerankModel: rerank || null,
        apiKeys: Object.fromEntries(Object.entries(keys).filter(([, v]) => v)),
      }) });
      toast('Pengaturan tersimpan'); setKeys({}); setTested({}); refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  const isSuper = data?.role === 'superadmin';
  const tabs = ([
    { key: 'model', label: 'Model & Keys' },
    { key: 'server', label: 'Server & OAuth', super: true },
  ] as readonly TabDef<ModelTab>[]).filter((t) => !t.super || isSuper);
  const [tab, setTab] = useHashTab(MODEL_KEYS, 'model');
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  if (error) return <div className="card"><ErrorState message={error} onRetry={refetch} /></div>;
  if (loading || !data) return <div className="card"><Skeleton rows={4} /></div>;

  // Dikelompokkan menurut DI MANA model dijalankan (`kind`), bukan sekadar
  // ukurannya — itu yang menentukan konsekuensinya bagi pengguna.
  const g = {
    localSmall: [] as EmbModel[], localLarge: [] as EmbModel[],
    selfhosted: [] as EmbModel[], api: [] as EmbModel[],
  };
  data.embeddingModels.forEach((m) => {
    if (m.kind === 'selfhosted') g.selfhosted.push(m);
    else if (m.kind === 'api') g.api.push(m);
    else (m.bucket === 'large' ? g.localLarge : g.localSmall).push(m);
  });

  return (
    <>
      <div className="page-head">
        <div><h1>Models &amp; Keys</h1><p className="sub">Satu model chat &amp; satu embedding aktif per tenant. API key disimpan terenkripsi, dipakai server-to-server.</p></div>
        {active === 'model' && <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} onClick={save} disabled={busy}>Simpan</button>}
      </div>

      <PageTabs tabs={tabs} active={active} onPick={setTab} label="Bagian model" />

      {active === 'model' &&
      <div className="grid g2">
        <div className="stack gap-4">
          <div className="card"><div className="panel-head"><span className="t">model chat aktif</span><span className="badge badge-signal">1 aktif</span></div>
            <div className="card-pad"><Field label="Model"><Select value={llm} onChange={(e) => setLlm(e.target.value)}>
                {data.llmModels.map((m) => <option key={m.id} value={m.id}>{m.label} — {m.provider}</option>)}
              </Select></Field></div></div>

          <div className="card"><div className="panel-head"><span className="t">model embedding aktif</span><span className="badge badge-source">1 aktif</span></div>
            <div className="card-pad"><Field label="Model"><Select value={emb} onChange={(e) => setEmb(e.target.value)}>
                {/* Ukuran nyata ada di label tiap model (dari registry) — jangan
                    menuliskannya lagi di sini supaya tak pernah bertentangan. */}
                <optgroup label="Lokal — ringan">{g.localSmall.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
                <optgroup label="Lokal — akurasi tinggi">{g.localLarge.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
                {!!g.selfhosted.length && <optgroup label="Server sendiri (VPS)">{g.selfhosted.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>}
                <optgroup label="API">{g.api.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
              </Select></Field></div></div>

          <div className="card"><div className="panel-head"><span className="t">reranker</span>
            <span className="badge">{rerank ? 'nyala' : 'mati'}</span></div>
            <div className="card-pad stack gap-3">
              <Field label="Model penilai ulang">
                <Select value={rerank} onChange={(e) => setRerank(e.target.value)}>
                  <option value="">Mati — pakai peringkat gabungan apa adanya</option>
                  {(data.rerankModels ?? []).map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </Select>
              </Field>
              <p className="microlabel" style={{ lineHeight: 1.6 }}>
                {rerank
                  ? (data.rerankModels ?? []).find((m) => m.id === rerank)?.catatan
                  : 'MEMBACA PERTANYAAN & POTONGAN BERSAMAAN, JADI LEBIH TEPAT MENILAI '
                    + 'MANA YANG BENAR-BENAR MENJAWAB. HARGANYA SATU PANGGILAN TAMBAHAN '
                    + 'DI TIAP PERTANYAAN — NYALAKAN KALAU JAWABAN SERING MELESET '
                    + 'PADAHAL DOKUMENNYA ADA.'}
              </p>
            </div></div>

          <div className="card"><div className="panel-head"><span className="t">system prompt</span></div>
            <div className="card-pad"><Field label="Instruksi"><textarea className="textarea" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} /></Field></div></div>
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="panel-head"><span className="t">provider api keys</span><span className="microlabel">AES-256 · SERVER-ONLY</span></div>
          <div className="card-pad stack gap-4">
            {data.providers.map((p) => {
              const saved = data.savedKeys?.includes(p);
              return (
                <div className="field" key={p}>
                  <label className="cluster" style={{ justifyContent: 'space-between' }}>
                    <span>{p}</span>
                    {/* Penanda ini yang selama ini hilang: input dikosongkan
                        setelah simpan, jadi tanpa ini orang wajar mengira
                        simpanannya gagal. */}
                    {saved
                      ? <span className="badge badge-ok"><span className="led led-live" />tersimpan</span>
                      : <span className="badge"><span className="led led-off" />belum ada</span>}
                  </label>
                  <div className="cluster gap-2">
                    <input className="input mono" type="password" style={{ flex: 1 }}
                      placeholder={saved ? 'kosongkan = tidak diubah' : 'tempel API key…'}
                      value={keys[p] ?? ''} onChange={(e) => setKeys({ ...keys, [p]: e.target.value })} />
                    {saved && (
                      <button className={`btn btn-sm${testing === p ? ' is-loading' : ''}`}
                        disabled={testing === p} onClick={() => testKey(p)}>Test</button>
                    )}
                  </div>
                  {tested[p] && (
                    <p style={{ marginTop: 6, fontSize: 12.5, color: tested[p].ok ? 'var(--good)' : 'var(--danger)' }}>
                      {tested[p].ok ? '✓ ' : '✗ '}{tested[p].message}
                    </p>
                  )}
                </div>
              );
            })}
            <p className="microlabel">
              KEY DISIMPAN TERENKRIPSI &amp; TAK PERNAH DIKIRIM BALIK KE BROWSER —
              KARENA ITU KOLOMNYA SELALU KOSONG SETELAH DISIMPAN.
            </p>
          </div>
        </div>
      </div>}

      {/* Infrastruktur platform — hanya superadmin. Server ini dipakai BERSAMA
          semua tenant, dan menerima alamat dari pihak tak tepercaya akan
          membuka SSRF; karena itu panel & API-nya dikunci peran. */}
      {active === 'server' && isSuper && <>
        <LlmServers onChanged={refetch} />
        <EmbeddingServers onChanged={refetch} />
        <OAuthApps />
      </>}
    </>
  );
}

/* ── server LLM sendiri / on-premise (superadmin) ───────────────────── */

interface LlmServer {
  id: string; name: string; baseUrl: string; enabled: boolean; hasToken: boolean;
  models: Array<{ id: string }>; lastCheckedAt: string | null; lastError: string | null;
}

const OPSI_LLM: OpsiTabel<LlmServer> = {
  cari: (s) => [s.name, s.baseUrl, ...s.models.map((m) => m.id)],
  saring: { keadaan: keadaanServer },
  urut: { name: (s) => s.name, baseUrl: (s) => s.baseUrl, keadaan: keadaanServer },
};

function LlmServers({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, refetch } = useApi<LlmServer[]>('/api/admin/llm-servers');
  const t = useTabel(data ?? [], OPSI_LLM);
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const toast = useToast();

  async function test(s: LlmServer) {
    setTesting(s.id);
    try {
      const r = await api<LlmServer>(`/api/admin/llm-servers/${s.id}/test`, { method: 'POST' });
      toast(`${r.models.length} model terdeteksi: ${r.models.map((m) => m.id).slice(0, 3).join(', ')}${r.models.length > 3 ? '…' : ''}`);
      refetch(); onChanged();          // model baru harus muncul di dropdown chat
    } catch (e) { toast((e as Error).message, 'error'); refetch(); }
    finally { setTesting(null); }
  }

  async function remove(s: LlmServer) {
    try {
      await api(`/api/admin/llm-servers/${s.id}`, { method: 'DELETE' });
      toast('Server dipindah ke Sampah'); refetch(); onChanged();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head">
        <span className="t">server LLM sendiri (on-premise)</span>
        <button className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} /> Tambah server
        </button>
      </div>

      {error ? <ErrorState message={error} onRetry={refetch} />
        : loading || !data ? <Skeleton rows={2} />
        : data.length === 0 ? <EmptyState title="Belum ada server LLM sendiri"
            hint="Daftarkan Ollama, vLLM, LM Studio, atau LocalAI agar jawaban tak perlu menempuh API cloud sama sekali." />
        : (
          <div className="card-pad stack gap-4">
          <TabelAlat
            t={t} rows={data} cariLabel="Cari nama, alamat, atau model"
            saring={[{ kunci: 'keadaan', label: 'Semua keadaan', lebar: 165, pilihan: [
              { nilai: 'aktif', label: 'Aktif' }, { nilai: 'nonaktif', label: 'Nonaktif' },
              { nilai: 'gagal', label: 'Gagal' }, { nilai: 'belum diuji', label: 'Belum diuji' },
            ] }]}
          />
          <div className="table-wrap"><table className="table">
            <thead><tr>
              <ThNo />
              <Th t={t} kunci="name">Nama</Th>
              <Th t={t} kunci="baseUrl">Alamat</Th>
              <th>Model terdeteksi</th>
              <Th t={t} kunci="keadaan">Status</Th>
              <th />
            </tr></thead>
            <tbody>
              <BarisKosong t={t} kolom={6} />
              {t.hasil.tampil.map((s, i) => (
                <tr key={s.id}>
                  <TdNo n={t.nomor(i)} />
                  <td><b>{s.name}</b></td>
                  <td className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{s.baseUrl}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {s.models.length
                      ? s.models.map((m) => m.id).slice(0, 3).join(', ') + (s.models.length > 3 ? ` +${s.models.length - 3}` : '')
                      : <span style={{ color: 'var(--muted)' }}>belum dideteksi</span>}
                  </td>
                  <td>
                    {s.lastError
                      ? <span className="badge badge-danger" title={s.lastError}><span className="led led-err" />gagal</span>
                      : s.models.length
                        ? <span className={`badge ${s.enabled ? 'badge-ok' : ''}`}><span className={`led ${s.enabled ? '' : 'led-off'}`} />{s.enabled ? 'aktif' : 'nonaktif'}</span>
                        : <span className="badge badge-signal"><span className="led led-off" />belum diuji</span>}
                  </td>
                  <td>
                    <div className="cluster gap-2">
                      <button className={`btn btn-sm${testing === s.id ? ' is-loading' : ''}`}
                        disabled={testing === s.id} onClick={() => test(s)}>Test koneksi</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => remove(s)}>Hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <TabelKaki t={t} satuan="server" />
          </div>
        )}

      {data?.some((s) => s.lastError) && (
        <div className="card-pad">
          {data.filter((s) => s.lastError).map((s) => (
            <p key={s.id} style={{ color: 'var(--danger)', fontSize: 13 }}><strong>{s.name}</strong>: {s.lastError}</p>
          ))}
        </div>
      )}

      <div className="card-pad">
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Ollama, vLLM, LM Studio, LocalAI, dan llama.cpp semuanya berbicara protokol
          OpenAI, jadi satu alamat <code>…/v1</code> cukup untuk semuanya. Dengan ini
          jawaban tak perlu menempuh API cloud sama sekali — syarat pemasangan yang
          benar-benar tertutup.
        </p>
      </div>

      {adding && <LlmServerDrawer onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); refetch(); onChanged(); }} />}
    </div>
  );
}

function LlmServerDrawer({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function save() {
    setBusy(true);
    try {
      await api('/api/admin/llm-servers', {
        method: 'POST', body: JSON.stringify({ name, baseUrl, ...(token ? { token } : {}) }),
      });
      toast('Server ditambahkan — jalankan Test koneksi');
      onSaved();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Drawer onClose={onClose} label="Tambah server LLM">
        <div className="dh"><h3>Tambah server LLM</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" size={16} /></button></div>
        <div className="db stack gap-4">
          <Field label="Nama"><input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="mis. Ollama kantor" /></Field>

          <Field label="Alamat (sampai /v1)"><input className="input mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://llm.kantormu.com/v1" />
            <p className="microlabel" style={{ marginTop: 6 }}>
              OLLAMA :11434/v1 · VLLM :8000/v1 · LM STUDIO :1234/v1
            </p></Field>

          <Field label="Token (opsional)"><input className="input mono" type="password" value={token}
              onChange={(e) => setToken(e.target.value)} placeholder="kosongkan bila server tanpa auth" />
            <p className="microlabel" style={{ marginTop: 6 }}>DISIMPAN TERENKRIPSI · TAK PERNAH KE BROWSER</p></Field>

          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Alamat non-<code>https</code> hanya diizinkan ke loopback. Untuk server di
            jaringan lain, pasang TLS di depannya — yang melintas adalah pertanyaan
            pengguna beserta potongan dokumen.
          </p>
        </div>
        <div className="df">
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} disabled={busy || !name || !baseUrl} onClick={save}>Simpan</button>
          <button className="btn btn-ghost" onClick={onClose}>Batal</button>
        </div>
      </Drawer>
    </>
  );
}

/* ── kredensial aplikasi OAuth (superadmin) ─────────────────────────── */

interface OAuthApp {
  provider: 'google' | 'microsoft';
  clientId: string; msTenantId: string | null;
  /** D10 — Google: 'full' (drive.readonly) | 'picker' (drive.file + Google Picker). */
  driveAccessMode: 'full' | 'picker';
  hasPickerApiKey: boolean;
  hasDriveApiKey: boolean;
  enabled: boolean; hasSecret: boolean;
  source: 'database' | 'env' | 'none';
  updatedAt: string | null;
}

function OAuthApps() {
  const { data, loading, error, refetch } = useApi<OAuthApp[]>('/api/admin/oauth-apps');
  const [editing, setEditing] = useState<OAuthApp | null>(null);
  const toast = useToast();

  async function remove(app: OAuthApp) {
    try {
      await api(`/api/admin/oauth-apps?provider=${app.provider}`, { method: 'DELETE' });
      toast(`Kredensial ${app.provider} dihapus dari database`);
      refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head">
        <span className="t">kredensial OAuth (Google / Microsoft)</span>
        <span className="microlabel">SECRET AES-256 · SERVER-ONLY</span>
      </div>

      {error ? <ErrorState message={error} onRetry={refetch} />
        : loading || !data ? <Skeleton rows={2} />
        : (
          /* SENGAJA tanpa cari/saring/penggalan: tabel ini punya persis DUA
             baris tetap (Google, Microsoft) yang lahir dari kode, bukan dari
             data. Memberinya kotak cari dan tombol halaman menyiratkan daftar
             yang bisa tumbuh, dan menyuruh orang mencari di antara dua baris
             yang keduanya sudah terlihat. */
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Provider</th><th>Client ID</th><th>Sumber</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.provider}>
                  <td><b>{a.provider === 'google' ? 'Google' : 'Microsoft'}</b>
                    {a.provider === 'microsoft' && a.msTenantId &&
                      <span className="microlabel" style={{ marginLeft: 8 }}>{a.msTenantId}</span>}
                    {a.provider === 'google' &&
                      <span className="microlabel" style={{ marginLeft: 8 }}>
                        {a.driveAccessMode === 'picker' ? 'MODE PICKER' : 'MODE FULL'}
                      </span>}</td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {a.clientId ? `${a.clientId.slice(0, 24)}…` : '—'}</td>
                  <td>
                    {a.source === 'database' ? <span className="badge badge-ok">database</span>
                      : a.source === 'env' ? <span className="badge badge-signal">env</span>
                      : <span className="badge">belum ada</span>}
                  </td>
                  <td>
                    {a.hasSecret && a.enabled
                      ? <span className="badge badge-ok"><span className="led led-live" />aktif</span>
                      : a.hasSecret ? <span className="badge"><span className="led led-off" />nonaktif</span>
                      : <span className="badge"><span className="led led-off" />kosong</span>}
                  </td>
                  <td>
                    <div className="cluster gap-2">
                      <button className="btn btn-sm" onClick={() => setEditing(a)}>
                        {a.source === 'database' ? 'Ubah' : 'Isi'}
                      </button>
                      {a.source === 'database' && (
                        <button className="btn btn-sm btn-ghost" onClick={() => remove(a)}>Hapus</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}

      <div className="card-pad">
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Disimpan di database agar bisa diubah tanpa <b>redeploy</b> — penting saat
          client secret Microsoft kedaluwarsa (maks. 24 bulan). Nilai dari environment
          tetap dipakai sebagai cadangan bila belum ada di sini. Perubahan berlaku
          dalam ±30 detik.{' '}
          <a href="/docs/oauth-setup.html" target="_blank" rel="noreferrer">Panduan pendaftaran OAuth</a>
        </p>
      </div>

      {editing && <OAuthDrawer app={editing} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refetch(); }} />}
    </div>
  );
}

function OAuthDrawer({ app, onClose, onSaved }: { app: OAuthApp; onClose: () => void; onSaved: () => void }) {
  const [clientId, setClientId] = useState(app.clientId);
  const [clientSecret, setClientSecret] = useState('');
  const [msTenantId, setMsTenantId] = useState(app.msTenantId ?? 'common');
  const [driveMode, setDriveMode] = useState<'full' | 'picker'>(app.driveAccessMode ?? 'full');
  const [pickerApiKey, setPickerApiKey] = useState('');
  const [driveApiKey, setDriveApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const label = app.provider === 'google' ? 'Google' : 'Microsoft';

  async function save() {
    setBusy(true);
    try {
      await api('/api/admin/oauth-apps', {
        method: 'PUT',
        body: JSON.stringify({
          provider: app.provider, clientId,
          ...(clientSecret ? { clientSecret } : {}),
          ...(app.provider === 'microsoft' ? { msTenantId } : {}),
          ...(app.provider === 'google' ? {
            driveAccessMode: driveMode,
            // kosong = pertahankan yang tersimpan; strip '-' utk menghapus
            ...(pickerApiKey === '-' ? { pickerApiKey: null }
              : pickerApiKey ? { pickerApiKey } : {}),
            ...(driveApiKey === '-' ? { driveApiKey: null }
              : driveApiKey ? { driveApiKey } : {}),
          } : {}),
        }),
      });
      toast(`Kredensial ${label} tersimpan — berlaku dalam ±30 detik`);
      onSaved();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Drawer onClose={onClose} label={`Kredensial ${label}`}>
        <div className="dh"><h3>Kredensial {label}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" size={16} /></button></div>
        <div className="db stack gap-4">
          <Field label="Client ID"><input className="input mono" value={clientId} onChange={(e) => setClientId(e.target.value)}
              placeholder={app.provider === 'google' ? '….apps.googleusercontent.com' : 'Application (client) ID'} /></Field>

          <Field label="Client secret"><input className="input mono" type="password" value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={app.hasSecret ? 'kosongkan untuk tidak mengubah' : 'wajib diisi'} />
            <p className="microlabel" style={{ marginTop: 6 }}>
              DISIMPAN TERENKRIPSI · TAK PERNAH DIKIRIM KE BROWSER
            </p></Field>

          {app.provider === 'microsoft' && (
            <Field label="Directory (tenant) ID"><input className="input mono" value={msTenantId} onChange={(e) => setMsTenantId(e.target.value)}
                placeholder="common" />
              <p className="microlabel" style={{ marginTop: 6 }}>
                COMMON = AKUN KERJA &amp; PRIBADI · ATAU GUID DIREKTORI
              </p></Field>
          )}

          {app.provider === 'google' && (<>
            <Field label="Mode akses Drive"><Select value={driveMode}
                onChange={(e) => setDriveMode(e.target.value as 'full' | 'picker')}>
                <option value="full">Full — scan folder rekursif (drive.readonly, scope RESTRICTED)</option>
                <option value="picker">Picker — user pilih berkas (drive.file, verifikasi ringan)</option>
              </Select>
              <p className="microlabel" style={{ marginTop: 6 }}>
                PICKER = BEBAS VERIFIKASI BERAT GOOGLE (VIDEO DEMO + CASA) ·
                HAPUS JUGA drive.readonly DARI CONSENT SCREEN
              </p></Field>

            {driveMode === 'picker' && (
              <Field label="Google Picker API key (opsional)"><input className="input mono" value={pickerApiKey}
                  onChange={(e) => setPickerApiKey(e.target.value)}
                  placeholder={app.hasPickerApiKey ? 'kosongkan = tak diubah · "-" = hapus' : 'AIza… (Credentials → API key)'} />
                <p className="microlabel" style={{ marginTop: 6 }}>
                  KEY BROWSER (BUKAN RAHASIA) — BATASI PER-REFERRER DI CONSOLE
                </p></Field>
            )}

            {/* Kunci SERVER-SIDE — beda peran dari Picker key di atas, dan
                perbedaan itu gampang tertukar, jadi disebut eksplisit. */}
            <Field label="Drive API key — folder publik (opsional)"><input className="input mono" type="password" value={driveApiKey}
                onChange={(e) => setDriveApiKey(e.target.value)}
                placeholder={app.hasDriveApiKey ? 'kosongkan = tak diubah · "-" = hapus' : 'AIza… (Credentials → API key)'} />
              <p className="microlabel" style={{ marginTop: 6 }}>
                MEMBUKA SUMBER &ldquo;URL FOLDER DRIVE PUBLIK&rdquo; — SATU-SATUNYA JALUR YANG
                MENARIK SEISI FOLDER REKURSIF TANPA VERIFIKASI GOOGLE. DIPAKAI SERVER,
                DISIMPAN TERENKRIPSI, TAK PERNAH KE BROWSER. BATASI KE DRIVE API SAJA
                (JANGAN PASANG PEMBATASAN REFERRER).{' '}
                <a href="/docs/sumber-pengetahuan.html" target="_blank" rel="noreferrer">Panduan</a>
              </p></Field>
          </>)}

          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Jangan lupa mendaftarkan <b>dua</b> redirect URI di konsol penyedia —
            satu untuk login, satu untuk menghubungkan penyimpanan. Rinciannya ada di{' '}
            <a href="/docs/oauth-setup.html" target="_blank" rel="noreferrer">panduan</a>.
          </p>
        </div>
        <div className="df">
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} disabled={busy || !clientId} onClick={save}>Simpan</button>
          <button className="btn btn-ghost" onClick={onClose}>Batal</button>
        </div>
      </Drawer>
    </>
  );
}

/* ── server embedding sendiri (VPS) ─────────────────────────────────── */

const OPSI_EMB: OpsiTabel<EmbServer> = {
  cari: (s) => [s.name, s.baseUrl, ...s.models.map((m) => m.id)],
  saring: { keadaan: keadaanServer },
  urut: { name: (s) => s.name, baseUrl: (s) => s.baseUrl, keadaan: keadaanServer },
};

function EmbeddingServers({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, refetch } = useApi<EmbServer[]>('/api/admin/embedding-servers');
  const t = useTabel(data ?? [], OPSI_EMB);
  const [editing, setEditing] = useState<EmbServer | 'new' | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const toast = useToast();

  async function test(s: EmbServer) {
    setTesting(s.id);
    try {
      const r = await api<EmbServer>(`/api/admin/embedding-servers/${s.id}/test`, { method: 'POST' });
      toast(`${r.models.length} model terdeteksi: ${r.models.map((m) => m.id).join(', ')}`);
      refetch(); onChanged();          // model baru harus muncul di dropdown
    } catch (e) { toast((e as Error).message, 'error'); refetch(); }
    finally { setTesting(null); }
  }

  async function remove(s: EmbServer) {
    try {
      await api(`/api/admin/embedding-servers/${s.id}`, { method: 'DELETE' });
      toast('Server dipindah ke Sampah'); refetch(); onChanged();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function toggle(s: EmbServer) {
    try {
      await api(`/api/admin/embedding-servers/${s.id}`, {
        method: 'PATCH', body: JSON.stringify({ enabled: !s.enabled }),
      });
      refetch(); onChanged();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head">
        <span className="t">server embedding (VPS)</span>
        <div className="cluster gap-2">
          <span className="microlabel">TOKEN AES-256 · SERVER-ONLY</span>
          <button className="btn btn-sm btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={14} /> Tambah server
          </button>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={refetch} />
        : loading || !data ? <Skeleton rows={2} />
        : data.length === 0 ? <EmptyState title="Belum ada server embedding"
            hint="Daftarkan VPS yang menjalankan services/embedding-server agar model besar bisa dipilih tenant."
            action={<button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>Tambah server</button>} />
        : (
          <div className="card-pad stack gap-4">
          <TabelAlat
            t={t} rows={data} cariLabel="Cari nama, alamat, atau model"
            saring={[{ kunci: 'keadaan', label: 'Semua keadaan', lebar: 165, pilihan: [
              { nilai: 'aktif', label: 'Aktif' }, { nilai: 'nonaktif', label: 'Nonaktif' },
              { nilai: 'gagal', label: 'Gagal' }, { nilai: 'belum diuji', label: 'Belum diuji' },
            ] }]}
          />
          <div className="table-wrap"><table className="table">
            <thead><tr>
              <ThNo />
              <Th t={t} kunci="name">Nama</Th>
              <Th t={t} kunci="baseUrl">Alamat</Th>
              <th>Model terdeteksi</th>
              <Th t={t} kunci="keadaan">Status</Th>
              <th />
            </tr></thead>
            <tbody>
              <BarisKosong t={t} kolom={6} />
              {t.hasil.tampil.map((s, i) => (
                <tr key={s.id}>
                  <TdNo n={t.nomor(i)} />
                  <td>{s.name}</td>
                  <td className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{s.baseUrl}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {s.models.length
                      ? s.models.map((m) => `${m.id} (${m.dimensions}d)`).join(', ')
                      : <span style={{ color: 'var(--muted)' }}>belum dideteksi</span>}
                  </td>
                  <td>
                    {s.lastError
                      ? <span className="badge badge-danger" title={s.lastError}><span className="led led-err" />gagal</span>
                      : s.models.length
                        ? <span className={`badge ${s.enabled ? 'badge-ok' : ''}`}><span className={`led ${s.enabled ? '' : 'led-off'}`} />{s.enabled ? 'aktif' : 'nonaktif'}</span>
                        : <span className="badge badge-signal"><span className="led led-off" />belum diuji</span>}
                  </td>
                  <td>
                    <div className="cluster gap-2">
                      <button className={`btn btn-sm${testing === s.id ? ' is-loading' : ''}`}
                        disabled={testing === s.id} onClick={() => test(s)}>Test koneksi</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditing(s)}>Ubah</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => toggle(s)}>
                        {s.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => remove(s)}>Hapus</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <TabelKaki t={t} satuan="server" />
          </div>
        )}

      {data && data.some((s) => s.lastError) && (
        <div className="card-pad">
          {data.filter((s) => s.lastError).map((s) => (
            <p key={s.id} style={{ color: 'var(--danger)', fontSize: 13 }}>
              <strong>{s.name}</strong>: {s.lastError}
            </p>
          ))}
        </div>
      )}

      {editing && <ServerDrawer server={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refetch(); onChanged(); }} />}
    </div>
  );
}

function ServerDrawer({ server, onClose, onSaved }:
  { server: EmbServer | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(server?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(server?.baseUrl ?? '');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function save() {
    setBusy(true);
    try {
      if (server) {
        await api(`/api/admin/embedding-servers/${server.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name, baseUrl, ...(token ? { token } : {}) }),
        });
      } else {
        await api('/api/admin/embedding-servers', {
          method: 'POST', body: JSON.stringify({ name, baseUrl, token }),
        });
      }
      toast(server ? 'Server diperbarui' : 'Server ditambahkan — jalankan Test koneksi');
      onSaved();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Drawer onClose={onClose} label={server ? 'Ubah server embedding' : 'Tambah server embedding'}>
        <div className="dh">
          <h3>{server ? 'Ubah server' : 'Tambah server embedding'}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" size={16} /></button>
        </div>
        <div className="db stack gap-4">
          <Field label="Nama"><input className="input" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="mis. VPS Singapura" /></Field>

          <Field label="Alamat"><input className="input mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://embed.domainmu.com" />
            <p className="microlabel" style={{ marginTop: 6 }}>
              WAJIB HTTPS — ISI DOKUMEN TENANT MELINTAS DI SINI.
            </p></Field>

          <Field label="Token"><input className="input mono" type="password" value={token} onChange={(e) => setToken(e.target.value)}
              placeholder={server?.hasToken ? 'kosongkan untuk tidak mengubah' : 'EMBEDDING_TOKEN di server'} />
            <p className="microlabel" style={{ marginTop: 6 }}>
              SAMA PERSIS DENGAN EMBEDDING_TOKEN DI VPS. DISIMPAN TERENKRIPSI.
            </p></Field>

          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            Setelah disimpan, tekan <strong>Test koneksi</strong>. Aplikasi memanggil
            <code> /v1/models</code> di server itu — sekali jalan menguji jaringan dan
            token, lalu mendaftarkan model yang ditemukan ke dropdown.
          </p>
        </div>
        <div className="df">
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} disabled={busy} onClick={save}>Simpan</button>
          <button className="btn btn-ghost" onClick={onClose}>Batal</button>
        </div>
      </Drawer>
    </>
  );
}
