'use client';

import { useEffect, useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Select } from '../../_components/select';
import { Skeleton, ErrorState, EmptyState, useToast } from '../../_components/ui';

interface Chatbot { id: string; name: string }
/** Ringkasan run delta terakhir — ditulis sync.service ke config.lastSync. */
interface LastSync { ingested?: number; updated?: number; removed?: number; unchanged?: number;
  skipped?: number; failed?: number; pending?: number; message?: string }
interface Source { id: string; kind: string; status: string; config: Record<string, unknown>;
  lastSyncedAt: string | null; jobStatus: { state: string } | null }
/** Koneksi akun + APA YANG BENAR-BENAR DIIZINKAN token-nya (bukan mode aktif). */
interface Conn {
  id: string; provider: string; accountEmail: string; accountLabel: string | null;
  canPickFiles?: boolean; canScanFolder?: boolean;
}
interface TestResult {
  ok: boolean; reason?: string;
  account?: string; name?: string | null; quota?: string | null;
  canPickFiles?: boolean; canScanFolder?: boolean;
}

/** Jawaban /api/connections/providers — driveMode & picker mengikuti D10. */
interface Providers {
  google: boolean; microsoft: boolean;
  driveMode?: 'full' | 'picker';
  picker?: { appId: string; apiKey: string | null } | null;
}

/** D11: KB entitas mandiri — sumber & dokumen milik KB; chatbot memakai KB
 *  lewat assignment N:M (drawer "Assign"). */
/**
 * Sel "Mode pencarian" + penjelasannya.
 *
 * Ditulis untuk pemilik data, bukan untuk insinyur: yang perlu mereka tahu
 * cuma apakah seluruh isi masih ditelusuri (ya, selalu) dan kenapa modenya
 * bisa berubah sendiri. Tak ada tombol di sini DENGAN SENGAJA — memilih mode
 * retrieval menuntut penilaian yang tak punya dasar untuk mereka buat, dan
 * salah pilih berarti jawaban yang diam-diam kehilangan dokumen.
 */
function RetrievalModeCell({ tier1, chunks }: { tier1: number; chunks: number }) {
  const bertingkat = tier1 > 0;
  return (
    <td>
      <div className="cluster gap-2" style={{ flexWrap: 'wrap' }}>
        <span className={`badge ${bertingkat ? 'badge-signal' : ''}`}>
          {bertingkat ? 'Bertingkat' : 'Langsung'}
        </span>
        <span
          title={bertingkat
            ? `Korpus ini sudah besar (${chunks.toLocaleString('id-ID')} potongan), jadi pencarian `
              + `berjalan dua tahap: memilih ${tier1.toLocaleString('id-ID')} dokumen yang relevan dulu, `
              + 'baru membaca isinya. Hasilnya sama; yang berubah cuma jumlah memori server yang '
              + 'dibutuhkan — dan angka itu berhenti tumbuh walau dokumen terus bertambah. '
              + 'Pencarian kata/nomor persis tetap menyapu SELURUH isi, apa pun modenya.'
            : `Korpus ini masih kecil (${chunks.toLocaleString('id-ID')} potongan), jadi seluruh isi `
              + 'ditelusuri langsung dalam satu tahap — cara paling teliti. Mode bertingkat menyala '
              + 'sendiri kalau isinya sudah cukup besar; tak ada yang perlu Anda atur.'}
          className="microlabel"
          style={{ cursor: 'help', borderBottom: '1px dotted var(--border)' }}
        >
          APA INI?
        </span>
      </div>
    </td>
  );
}

interface Kb {
  id: string; name: string; description: string | null; updatedAt: string;
  sources: number; chunks: number; chatbots: Array<{ id: string; name: string }>;
  /** Jumlah dokumen dengan vektor lapisan pertama; > 0 = mode bertingkat. */
  tier1?: number;
}

export default function KnowledgePage() {
  const bots = useApi<Chatbot[]>('/api/chatbots');
  const kbs = useApi<Kb[]>('/api/knowledge-bases');
  const [kbId, setKbId] = useState('');
  useEffect(() => { if (kbs.data?.[0] && !kbId) setKbId(kbs.data[0].id); }, [kbs.data, kbId]);
  const activeKb = kbs.data?.find((k) => k.id === kbId) ?? null;

  const sources = useApi<Source[]>(kbId ? `/api/sources?knowledgeBaseId=${kbId}` : null);
  const conns = useApi<Conn[]>('/api/connections');
  const oauthReady = useApi<Providers>('/api/connections/providers');
  const [adding, setAdding] = useState(false);
  const [creatingKb, setCreatingKb] = useState(false);
  const [assigning, setAssigning] = useState<Kb | null>(null);
  const toast = useToast();

  async function createKb(name: string, description: string) {
    const kb = await api<Kb>('/api/knowledge-bases', {
      method: 'POST', body: JSON.stringify({ name, ...(description ? { description } : {}) }),
    });
    toast('Knowledge base dibuat'); setCreatingKb(false); setKbId(kb.id); kbs.refetch();
  }
  async function removeKb(kb: Kb) {
    if (!confirm(`Hapus KB "${kb.name}"? Sumber & dokumennya ikut ke Sampah; chatbot yang memakainya kehilangan konteks ini.`)) return;
    try {
      await api(`/api/knowledge-bases/${kb.id}`, { method: 'DELETE' });
      toast('KB dipindah ke Sampah'); if (kbId === kb.id) setKbId(''); kbs.refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('connect');
    if (!c) return;
    if (c === 'ok') { toast('Akun terhubung'); conns.refetch(); }
    else toast('Gagal menghubungkan akun', 'error');
    window.history.replaceState({}, '', '/knowledge'); // bersihkan query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Delta (default) hanya memproses file baru/berubah; penuh meng-ingest ulang semua. */
  async function resync(id: string, full = false) {
    try {
      await api(`/api/sources/${id}/sync${full ? '?full=1' : ''}`, { method: 'POST' });
      toast(full ? 'Sync penuh dijalankan' : 'Sync dijalankan (hanya perubahan)');
      sources.refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function disconnect(id: string) {
    try { await api(`/api/connections?id=${id}`, { method: 'DELETE' }); toast('Akun diputus'); conns.refetch(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  /**
   * Uji koneksi — mengetuk penyedia sungguhan.
   *
   * Baris "tersambung" hanya membuktikan ada barisnya di database; ia tak
   * membuktikan tokennya masih hidup, refresh-nya berhasil, atau izinnya
   * cukup. Ketiganya bisa gagal diam-diam dan baru terasa saat sync gagal
   * berjam-jam kemudian.
   */
  const [testing, setTesting] = useState<string | null>(null);
  const [tested, setTested] = useState<Record<string, TestResult>>({});
  async function testConn(id: string) {
    setTesting(id);
    try {
      const r = await api<TestResult>('/api/connections/test', {
        method: 'POST', body: JSON.stringify({ id }),
      });
      setTested((t) => ({ ...t, [id]: r }));
      // Izin bisa berubah sejak halaman dimuat (mis. baru menambah izin) —
      // segarkan daftarnya supaya penanda "bisa folder" ikut benar.
      if (r.ok) conns.refetch();
    } catch (e) {
      setTested((t) => ({ ...t, [id]: { ok: false, reason: (e as Error).message } }));
    } finally { setTesting(null); }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Knowledge Base</h1><p className="sub">KB berdiri sendiri — satu KB (mis. satu folder Drive) bisa dipakai banyak chatbot lewat Assign. Di-ingest sekali, dipakai semua.</p></div>
        <button className="btn btn-primary" onClick={() => setCreatingKb(true)}><Icon name="plus" size={16} /> Buat KB</button>
      </div>

      {/* daftar KB + assignment */}
      <div className="card" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="panel-head"><span className="t">knowledge bases</span></div>
        {kbs.error ? <ErrorState message={kbs.error} onRetry={kbs.refetch} />
          : kbs.loading || !kbs.data ? <Skeleton rows={3} />
          : kbs.data.length === 0 ? <EmptyState title="Belum ada knowledge base"
              hint="Buat KB, isi sumbernya, lalu assign ke chatbot divisi yang membutuhkannya."
              action={<button className="btn btn-primary btn-sm" onClick={() => setCreatingKb(true)}>Buat KB</button>} />
          : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Nama</th><th>Sumber</th><th>Chunk</th><th>Mode pencarian</th><th>Dipakai chatbot</th><th /></tr></thead>
              <tbody>
                {kbs.data.map((k) => (
                  <tr key={k.id} style={{ background: k.id === kbId ? 'var(--card-2)' : undefined }}>
                    <td>
                      <button onClick={() => setKbId(k.id)} style={{ all: 'unset', cursor: 'pointer' }}>
                        <b style={{ borderLeft: `2px solid ${k.id === kbId ? 'var(--signal)' : 'transparent'}`, paddingLeft: 8 }}>{k.name}</b>
                      </button>
                      {k.description && <div style={{ fontSize: 12, color: 'var(--muted)', paddingLeft: 10, marginTop: 2 }}>{k.description}</div>}
                    </td>
                    <td className="mono">{k.sources}</td>
                    <td className="mono">{k.chunks}</td>
                    <RetrievalModeCell tier1={k.tier1 ?? 0} chunks={k.chunks} />
                    <td>
                      {k.chatbots.length === 0
                        ? <span className="microlabel" style={{ color: 'var(--source)' }}>BELUM DI-ASSIGN — TAK DIPAKAI SIAPA PUN</span>
                        : <div className="cluster gap-2" style={{ flexWrap: 'wrap' }}>
                            {k.chatbots.map((c) => <span key={c.id} className="badge badge-signal">{c.name}</span>)}
                          </div>}
                    </td>
                    <td>
                      <div className="cluster gap-2">
                        <button className="btn btn-sm" onClick={() => setAssigning(k)}><Icon name="plug" size={14} /> Assign</button>
                        <button className="btn btn-sm" onClick={() => { setKbId(k.id); setAdding(true); }}>Tambah sumber</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => removeKb(k)}>Hapus</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
      </div>

      {/* Akun terhubung (multi-akun) */}
      <div className="card" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="panel-head"><span className="t">akun storage terhubung</span>
          <div className="cluster gap-2">
            {/* Tombol hanya muncul bila env OAuth-nya memang terpasang —
                kalau tidak, tautannya mendarat di JSON galat mentah. */}
            {oauthReady.data?.google && <a className="btn btn-sm" href="/api/connections/google/start"><Icon name="plug" size={14} /> Connect Google</a>}
            {oauthReady.data?.microsoft && <a className="btn btn-sm" href="/api/connections/microsoft/start"><Icon name="plug" size={14} /> Connect Microsoft</a>}
          </div>
        </div>

        {oauthReady.data && !oauthReady.data.google && !oauthReady.data.microsoft && (
          <div className="card-pad" style={{ borderLeft: '3px solid var(--source)' }}>
            <b>OAuth Google/Microsoft belum dikonfigurasi</b>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
              Sinkronisasi Drive/OneDrive/SharePoint butuh OAuth client yang
              didaftarkan lebih dulu, lalu <code>GOOGLE_CLIENT_ID</code>/
              <code>MS_CLIENT_ID</code> (beserta secret-nya) dipasang di environment.
              Selama belum ada, dokumen tetap bisa dimasukkan lewat{' '}
              <code>POST /api/ingest</code>.
            </p>
            <a className="btn btn-sm" href="/docs/oauth-setup.html" target="_blank" rel="noreferrer"
              style={{ marginTop: 10 }}>Buka panduan lengkap</a>
          </div>
        )}
        <div className="card-pad">
          {conns.loading ? <span className="microlabel">memuat…</span>
            : !conns.data?.length ? <p className="microlabel">BELUM ADA AKUN. HUBUNGKAN GOOGLE / MICROSOFT UNTUK MENSCAN DRIVE-MU.</p>
            : (
              <div className="stack" style={{ gap: 8 }}>
                {conns.data.map((c) => (
                  <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <div className="cluster" style={{ justifyContent: 'space-between' }}>
                      <span className="badge badge-ok"><span className="led" />{c.provider === 'google' ? 'Google' : 'Microsoft'}</span>
                      <span style={{ flex: 1, color: 'var(--muted)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.accountEmail}</span>
                      {/* Izin yang BENAR-BENAR dipunyai — bukan mode yang
                          sedang aktif di pengaturan. Ini yang menentukan
                          metode mana yang bisa dipakai. */}
                      {c.provider === 'google' && (
                        <span className="microlabel" style={{ color: c.canScanFolder ? 'var(--good)' : 'var(--source)' }}>
                          {c.canScanFolder ? 'BISA FOLDER + PICKER' : 'PICKER SAJA'}
                        </span>
                      )}
                      <button className={`btn btn-sm${testing === c.id ? ' is-loading' : ''}`}
                        disabled={testing === c.id} onClick={() => testConn(c.id)}>Uji</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => disconnect(c.id)}>Putus</button>
                    </div>
                    {tested[c.id] && (
                      <p style={{
                        margin: '6px 0 0', fontSize: 12.5,
                        color: tested[c.id].ok ? 'var(--good)' : 'var(--danger)',
                      }}>
                        {tested[c.id].ok
                          ? `✓ Terhubung sebagai ${tested[c.id].account}${tested[c.id].name ? ` (${tested[c.id].name})` : ''}${tested[c.id].quota ? ` · ${tested[c.id].quota}` : ''}`
                          : `✗ ${tested[c.id].reason}`}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      <div className="card">
        <div className="panel-head">
          <span className="t">sumber data {activeKb ? `· ${activeKb.name}` : ''}</span>
          {kbId && <button className="btn btn-sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Tambah sumber</button>}
        </div>
        {!kbId ? <EmptyState title="Pilih atau buat KB dulu" hint="Sumber data menempel pada knowledge base." />
          : sources.error ? <ErrorState message={sources.error} onRetry={sources.refetch} />
          : sources.loading || !sources.data ? <Skeleton rows={3} />
          : sources.data.length === 0 ? <EmptyState title="Belum ada sumber"
              hint="Tambah sumber: seluruh Drive, folder tertentu, OneDrive, atau SharePoint."
              action={<button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>Tambah sumber</button>} />
          : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Jenis</th><th>Akun</th><th>Cakupan</th><th>Status</th><th>Hasil terakhir</th><th>Terakhir</th><th /></tr></thead>
              <tbody>
                {sources.data.map((s) => (
                  <tr key={s.id}>
                    <td><span className="badge">{s.kind}</span></td>
                    <td style={{ color: 'var(--muted)' }}>{String(s.config.accountEmail ?? '—')}</td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>{
                      Array.isArray(s.config.fileIds)
                        ? `${(s.config.fileIds as unknown[]).length} berkas terpilih`
                        : s.config.scope === 'all' ? 'seluruh drive'
                        : String(s.config.folderId ?? s.config.folderPath ?? 'folder')
                    }</td>
                    <td><StatusBadge s={s} /></td>
                    <td><DeltaSummary last={s.config.lastSync as LastSync | undefined} /></td>
                    <td className="mono" style={{ color: 'var(--muted)' }}>{s.lastSyncedAt?.slice(0, 16).replace('T', ' ') ?? '—'}</td>
                    <td>
                      <div className="cluster gap-2">
                        <button className="btn btn-sm" onClick={() => resync(s.id)}><Icon name="sync" size={14} /> Sync</button>
                        <button className="btn btn-sm btn-ghost" title="Abaikan versi tersimpan, ingest ulang semua file"
                          onClick={() => resync(s.id, true)}>Penuh</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
      </div>

      {adding && kbId && <SourceDrawer knowledgeBaseId={kbId} accounts={conns.data ?? []}
        providers={oauthReady.data ?? null} onClose={() => setAdding(false)}
        onSaved={() => { setAdding(false); sources.refetch(); kbs.refetch(); }} />}
      {creatingKb && <KbDrawer onClose={() => setCreatingKb(false)} onSave={createKb} />}
      {assigning && <AssignDrawer kb={assigning} bots={bots.data ?? []}
        onClose={() => setAssigning(null)}
        onSaved={() => { setAssigning(null); kbs.refetch(); }} />}
    </>
  );
}

/* ── drawer: buat KB ────────────────────────────────────────────────── */
function KbDrawer({ onClose, onSave }: { onClose: () => void; onSave: (name: string, desc: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <div className="backdrop show" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-label="Buat knowledge base">
        <div className="dh"><h3>Buat knowledge base</h3><button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" size={16} /></button></div>
        <div className="db stack gap-4">
          <div className="field"><label>Nama</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dokumen HR / SOP Finance / …" autoFocus /></div>
          <div className="field"><label>Deskripsi (opsional)</label>
            <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Isi & pemilik KB ini" /></div>
          <p className="microlabel">SATU KB BISA DIPAKAI BANYAK CHATBOT — DI-INGEST SEKALI, TANPA DUPLIKASI EMBEDDING.</p>
          {err && <span className="error">{err}</span>}
        </div>
        <div className="df">
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} style={{ flex: 1 }} disabled={busy || !name.trim()}
            onClick={async () => { setBusy(true); setErr(null); try { await onSave(name.trim(), desc.trim()); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }}>
            Buat
          </button>
          <button className="btn" onClick={onClose}>Batal</button>
        </div>
      </aside>
    </>
  );
}

/* ── drawer: assign KB ke chatbot (inti D11 — 1 KB ↔ N chatbot) ────── */
function AssignDrawer({ kb, bots, onClose, onSaved }:
  { kb: Kb; bots: Chatbot[]; onClose: () => void; onSaved: () => void }) {
  const [checked, setChecked] = useState<Set<string>>(new Set(kb.chatbots.map((c) => c.id)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  async function save() {
    setBusy(true); setErr(null);
    try {
      await api(`/api/knowledge-bases/${kb.id}/assignments`, {
        method: 'PUT', body: JSON.stringify({ chatbotIds: [...checked] }),
      });
      toast('Assignment tersimpan'); onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="backdrop show" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-label={`Assign ${kb.name}`}>
        <div className="dh"><h3>Assign — {kb.name}</h3><button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" size={16} /></button></div>
        <div className="db stack gap-3">
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
            Chatbot mana saja yang boleh menjawab dari KB ini? Retrieval tiap chatbot
            = gabungan semua KB yang di-assign padanya.
          </p>
          {bots.length === 0 && <span className="microlabel">BELUM ADA CHATBOT.</span>}
          {bots.map((b) => (
            <label key={b.id} className="cluster gap-2" style={{ cursor: 'pointer', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}>
              <input type="checkbox" checked={checked.has(b.id)}
                onChange={(e) => setChecked((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(b.id); else next.delete(b.id);
                  return next;
                })} />
              <span>{b.name}</span>
            </label>
          ))}
          {err && <span className="error">{err}</span>}
        </div>
        <div className="df">
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} style={{ flex: 1 }} disabled={busy} onClick={save}>Simpan</button>
          <button className="btn" onClick={onClose}>Batal</button>
        </div>
      </aside>
    </>
  );
}

/**
 * Hasil run delta terakhir — apa yang BERUBAH, bukan sekadar "selesai".
 * +baru ~diperbarui −dihapus · sisanya tak disentuh (tak ada biaya embedding).
 */
function DeltaSummary({ last }: { last?: LastSync }) {
  if (!last) return <span className="microlabel" style={{ color: 'var(--muted)' }}>—</span>;
  if (last.message) return <span style={{ color: 'var(--danger)', fontSize: 12 }}>{last.message}</span>;

  const parts: Array<[string, number, string]> = [
    ['+', last.ingested ?? 0, 'var(--good)'],
    ['~', last.updated ?? 0, 'var(--signal)'],
    ['−', last.removed ?? 0, 'var(--danger)'],
  ];
  const changed = parts.filter(([, n]) => n > 0);

  return (
    <span className="cluster gap-2 mono" style={{ fontSize: 12 }}>
      {changed.length === 0
        ? <span style={{ color: 'var(--muted)' }}>tak ada perubahan</span>
        : changed.map(([sym, n, color]) => <span key={sym} style={{ color }}>{sym}{n}</span>)}
      {!!last.unchanged && <span style={{ color: 'var(--muted)' }}>· {last.unchanged} tetap</span>}
      {!!last.skipped && <span style={{ color: 'var(--muted)' }}>· {last.skipped} dilewati</span>}
      {!!last.failed && <span style={{ color: 'var(--danger)' }}>· {last.failed} gagal</span>}
      {!!last.pending && <span style={{ color: 'var(--source)' }}>· {last.pending} antre</span>}
    </span>
  );
}

function StatusBadge({ s }: { s: Source }) {
  const st = s.jobStatus?.state ?? s.status;
  const cls = st === 'synced' || st === 'done' ? 'badge-ok' : st === 'error' || st === 'failed' ? 'badge-danger' : 'badge-signal';
  const live = st === 'syncing' || st === 'running';
  return <span className={`badge ${cls}`}><span className={`led ${live ? 'led-live' : st === 'error' ? 'led-err' : 'led-off'}`} />{st}</span>;
}

/* ── Google Picker (mode 'picker', D10) ─────────────────────────────
   Dimuat malas dari apis.google.com hanya saat tombolnya ditekan — jangan
   membebani halaman untuk deployment yang memakai mode 'full'. */
let pickerScriptPromise: Promise<void> | null = null;
function loadPickerScript(): Promise<void> {
  if (pickerScriptPromise) return pickerScriptPromise;
  pickerScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = () => (window as unknown as { gapi: { load: (n: string, cb: () => void) => void } })
      .gapi.load('picker', () => resolve());
    s.onerror = () => { pickerScriptPromise = null; reject(new Error('Gagal memuat Google Picker')); };
    document.head.appendChild(s);
  });
  return pickerScriptPromise;
}

interface PickedFile { id: string; name: string }

/* ── tambah sumber ──────────────────────────────────────────────────
   Empat jalur, dan yang membedakan bukan sekadar penyedia melainkan APA
   yang bisa dijangkau masing-masing:

     gdrive         folder rekursif (butuh izin drive.readonly) ATAU berkas
                    terpilih via Picker (drive.file). Yang tersedia ditentukan
                    izin token yang TERSIMPAN, bukan mode yang sedang aktif.
     gdrive_public  URL folder yang dibagikan publik — TANPA login sama sekali.
                    Satu-satunya jalur yang menarik seisi folder rekursif tanpa
                    scope restricted, jadi bebas verifikasi Google.
     onedrive       /me/drive milik pengguna.
     sharepoint     URL situs / document library / tautan berbagi (rekursif).  */
function SourceDrawer({ knowledgeBaseId, accounts, providers, onClose, onSaved }:
  { knowledgeBaseId: string; accounts: Conn[]; providers: Providers | null; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState('gdrive');
  const [scope, setScope] = useState<'all' | 'folder'>('all');
  const [loc, setLoc] = useState('');
  /** URL folder Drive publik / URL situs SharePoint / tautan berbagi */
  const [url, setUrl] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [picked, setPicked] = useState<PickedFile[]>([]);
  /** berkas dari komputer pengguna (jenis sumber `upload`) */
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  // Tiga jenis sumber tak butuh akun sama sekali.
  const noAuth = kind === 'gdrive_public' || kind === 'url' || kind === 'upload';
  const provider = kind === 'gdrive' ? 'google' : 'microsoft';
  const providerAccounts = noAuth ? [] : accounts.filter((a) => a.provider === provider);
  useEffect(() => { setAccountEmail(providerAccounts[0]?.accountEmail ?? ''); setPicked([]); setUrl(''); setFiles([]); setDriveMethod('picker'); }, [kind]); // eslint-disable-line

  const conn = providerAccounts.find((a) => a.accountEmail === accountEmail) ?? null;
  /**
   * Yang menentukan pilihan bukan mode di pengaturan, melainkan izin yang
   * BENAR-BENAR dimiliki token ini. Dulu keduanya dicampur: begitu mode diubah
   * ke Picker, akun lama tetap tampak "tersambung" padahal tokennya tak punya
   * izin yang dituntut Picker — dan satu-satunya jalan keluar adalah memutus
   * lalu menyambung ulang tanpa penjelasan apa pun.
   */
  const canScan = kind === 'gdrive' ? conn?.canScanFolder === true : true;

  /**
   * METODE untuk Google Drive — dipilih pengguna, bukan disimpulkan.
   *
   * Dua jalur ini melayani kebutuhan berbeda dan KEDUANYA sah:
   *   picker — pilih berkas satu per satu lewat Google Picker (izin drive.file)
   *   folder — seluruh Drive atau satu folder, rekursif (izin drive.readonly)
   *
   * Versi sebelumnya menyimpulkannya dari mode + izin, dan itu keliru: selama
   * akun belum termuat, izinnya belum diketahui, sehingga Picker tersembunyi
   * dan yang tampil justru isian Folder ID — yang mustahil jalan dengan
   * drive.file. Sekarang pengguna melihat kedua pilihan, dan yang tak
   * tersedia menjelaskan sebabnya alih-alih menghilang diam-diam.
   */
  const [driveMethod, setDriveMethod] = useState<'picker' | 'folder'>('picker');
  const pickerMode = kind === 'gdrive' && driveMethod === 'picker';
  /** SharePoint memakai URL; OneDrive tetap path /me/drive. */
  const useUrl = kind === 'gdrive_public' || kind === 'sharepoint' || kind === 'url';
  const isUpload = kind === 'upload';

  async function openPicker() {
    if (!accountEmail) { setErr('Hubungkan akun google dulu (tombol Connect di atas).'); return; }
    setErr(null);
    try {
      const { accessToken } = await api<{ accessToken: string }>(
        `/api/connections/google/picker-token?accountEmail=${encodeURIComponent(accountEmail)}`);
      await loadPickerScript();
      // Picker tak punya typing resmi — pakai bentuk longgar seperlunya.
      const g = (window as unknown as { google: any }).google; // eslint-disable-line @typescript-eslint/no-explicit-any
      const view = new g.picker.DocsView(g.picker.ViewId.DOCS)
        .setIncludeFolders(true)      // folder tampil utk navigasi …
        .setSelectFolderEnabled(false); // … tapi tak bisa DIPILIH — drive.file tak menjangkau isinya
      let builder = new g.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .enableFeature(g.picker.Feature.MULTISELECT_ENABLED)
        .setCallback((data: { action: string; docs?: { id: string; name: string }[] }) => {
          if (data.action === g.picker.Action.PICKED && data.docs?.length) {
            // Gabungkan dgn pilihan sebelumnya — user boleh membuka Picker
            // beberapa kali (mis. beda folder) sebelum menyimpan.
            setPicked((prev) => {
              const seen = new Set(prev.map((p) => p.id));
              return [...prev, ...data.docs!.filter((d) => !seen.has(d.id))
                .map((d) => ({ id: d.id, name: d.name }))];
            });
          }
        });
      // appId (nomor project) WAJIB agar berkas terpilih ter-grant ke app —
      // aturan drive.file. apiKey opsional (bisa diisi superadmin di Models).
      if (providers?.picker?.appId) builder = builder.setAppId(providers.picker.appId);
      if (providers?.picker?.apiKey) builder = builder.setDeveloperKey(providers.picker.apiKey);
      builder.build().setVisible(true);
    } catch (e) { setErr((e as Error).message); }
  }

  /**
   * Unggahan TIDAK lewat /api/sources: berkasnya harus ikut dalam badan
   * permintaan, dan tak ada yang bisa disinkronkan ulang setelahnya —
   * ekstraksi + ingest tuntas dalam satu permintaan itu juga.
   */
  async function uploadFiles() {
    if (!files.length) { setErr('Pilih berkasnya dulu.'); return; }
    const total = files.reduce((n, f) => n + f.size, 0);
    if (total > 4 * 1024 * 1024) {
      setErr(`Total ${(total / 1048576).toFixed(1)} MB melebihi batas 4 MB per unggahan (batas Vercel). Bagi jadi beberapa kali.`);
      return;
    }
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);
      const r = await fetch(`/api/knowledge-bases/${knowledgeBaseId}/upload`, { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Gagal mengunggah');
      const n = j.ingested?.length ?? 0;
      const s = j.skipped?.length ?? 0;
      // Berkas yang dilewati disebut satu per satu beserta sebabnya — "3 dari
      // 5 berhasil" tanpa keterangan memaksa orang menebak yang mana.
      toast(s
        ? `${n} berkas masuk (${j.chunks} potongan) · ${s} dilewati: ${(j.skipped as Array<{ name: string; reason: string }>).map((x) => `${x.name} — ${x.reason}`).join('; ')}`
        : `${n} berkas masuk (${j.chunks} potongan)`);
      onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function save() {
    if (isUpload) { await uploadFiles(); return; }
    if (!noAuth && !accountEmail) { setErr(`Hubungkan akun ${provider} dulu (tombol Connect di atas).`); return; }
    if (pickerMode && !picked.length) { setErr('Pilih dulu berkas dari Drive.'); return; }
    if (useUrl && !url.trim()) {
      setErr(kind === 'gdrive_public' ? 'Tempel URL folder Drive yang sudah dibagikan.' : 'Tempel URL situs SharePoint atau tautan berbagi folder.');
      return;
    }
    setBusy(true); setErr(null);

    let config: Record<string, unknown>;
    if (kind === 'gdrive_public') {
      config = { folderUrl: url.trim() };
    } else if (kind === 'url') {
      config = { url: url.trim() };
    } else if (kind === 'sharepoint' && url.trim()) {
      config = { accountEmail, siteUrl: url.trim() };
    } else if (pickerMode) {
      config = { accountEmail, mode: 'picker', fileIds: picked.map((p) => p.id), fileNames: picked.map((p) => p.name) };
    } else {
      config = { scope, accountEmail };
      if (scope === 'folder') {
        if (kind === 'gdrive') config.folderId = loc || 'root'; else config.folderPath = loc;
      }
    }

    try {
      await api('/api/sources', { method: 'POST', body: JSON.stringify({ knowledgeBaseId, kind, config }) });
      toast('Sumber ditambah — sync berjalan'); onSaved();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="backdrop show" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-label="Tambah sumber">
        <div className="dh"><h3>Tambah sumber</h3><button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" size={16} /></button></div>
        <div className="db stack gap-4">
          <div className="field"><label>Jenis sumber</label>
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="gdrive">Google Drive (akun tersambung)</option>
              <option value="gdrive_public">Google Drive — URL folder publik (tanpa login)</option>
              <option value="onedrive">OneDrive</option>
              <option value="sharepoint">SharePoint (situs / tautan berbagi)</option>
              <option value="upload">Unggah berkas dari komputer</option>
              <option value="url">Halaman web (URL)</option>
            </Select></div>

          {/* Folder publik tak butuh akun sama sekali — jangan tampilkan
              tombol Connect yang justru membingungkan. */}
          {!noAuth && (
            <div className="field"><label>Akun {provider}</label>
              {providerAccounts.length ? (
                <Select value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)}>
                  {providerAccounts.map((a) => <option key={a.id} value={a.accountEmail}>{a.accountEmail}</option>)}
                </Select>
              ) : providers && !providers[provider] ? (
                <p className="microlabel" style={{ margin: 0 }}>
                  OAUTH {provider.toUpperCase()} BELUM DIKONFIGURASI — SUPERADMIN MENGISINYA DI MODELS &amp; KEYS
                </p>
              ) : (
                <a className="btn btn-sm" href={`/api/connections/${provider}/start`}><Icon name="plug" size={14} /> Connect {provider}</a>
              )}
            </div>
          )}

          {isUpload && (
            <div className="field"><label>Berkas dari komputer</label>
              <input className="input" type="file" multiple
                accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,.log,.yaml,.yml,.html,.htm"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
              {files.length > 0 && (
                <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto' }} className="stack gap-1">
                  {files.map((f) => (
                    <div key={f.name} className="cluster gap-2" style={{ fontSize: 13 }}>
                      <span className="mono" style={{ color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                      <span className="mono" style={{ color: 'var(--faint)', fontSize: 11 }}>{(f.size / 1024).toFixed(0)} KB</span>
                    </div>
                  ))}
                  <p className="microlabel" style={{ marginTop: 4 }}>
                    TOTAL {(files.reduce((n, f) => n + f.size, 0) / 1048576).toFixed(2)} MB DARI BATAS 4 MB
                  </p>
                </div>
              )}
              <p className="microlabel" style={{ marginTop: 8 }}>
                PDF · DOCX · TXT · MD · CSV · JSON · HTML. MAKS 4 MB PER UNGGAHAN —
                BATAS BADAN PERMINTAAN VERCEL, BUKAN PILIHAN KAMI; BAGI JADI BEBERAPA KALI
                BILA LEBIH. UNGGAHAN TAK BISA DISINKRONKAN ULANG: BERKAS ASLINYA TAK
                TERSIMPAN DI MANA PUN. NAMA BERKAS YANG SAMA AKAN MENGGANTI ISI LAMANYA.
              </p></div>
          )}

          {kind === 'url' && (
            <div className="field"><label>URL halaman</label>
              <input className="input" value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://situsmu.com/kebijakan-garansi" />
              <p className="microlabel" style={{ marginTop: 6 }}>
                SATU HALAMAN, BUKAN SELURUH SITUS. BISA DI-SYNC ULANG — PERUBAHAN
                HALAMAN TERTANGKAP LEWAT ETAG/LAST-MODIFIED. WAJIB HTTPS PUBLIK;
                ALAMAT JARINGAN INTERNAL DITOLAK.
              </p></div>
          )}

          {kind === 'gdrive_public' && (
            <div className="field"><label>URL folder Google Drive</label>
              <input className="input" value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/1A2b3C…" />
              <p className="microlabel" style={{ marginTop: 6 }}>
                SELURUH ISI FOLDER IKUT, TERMASUK SUB-SUB-FOLDER. SYARATNYA SATU:
                BAGIKAN FOLDER SEBAGAI &ldquo;SIAPA SAJA YANG MEMILIKI LINK&rdquo; (PELIHAT).
                TAUTAN TERBATAS ORGANISASI TIDAK BISA DIBACA.{' '}
                <a href="/docs/sumber-pengetahuan.html" target="_blank" rel="noreferrer">Panduan</a>
              </p></div>
          )}

          {kind === 'sharepoint' && (
            <div className="field"><label>URL situs atau tautan berbagi folder</label>
              <input className="input" value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://perusahaan.sharepoint.com/sites/Marketing/Shared Documents/Kebijakan" />
              <p className="microlabel" style={{ marginTop: 6 }}>
                URL SITUS, DOCUMENT LIBRARY, ATAU TAUTAN BERBAGI FOLDER — SEMUA
                ISINYA DITELUSURI REKURSIF. KOSONGKAN UNTUK MEMAKAI ONEDRIVE
                PRIBADI AKUN INI.{' '}
                <a href="/docs/sumber-pengetahuan.html" target="_blank" rel="noreferrer">Panduan</a>
              </p></div>
          )}

          {/* Pilihan METODE Drive — dua jalur, keduanya tetap terlihat. */}
          {kind === 'gdrive' && (
            <div className="field"><label>Cara memilih dokumen</label>
              <div className="cluster gap-2">
                <button type="button" className={`btn btn-sm${driveMethod === 'picker' ? ' btn-primary' : ''}`}
                  onClick={() => setDriveMethod('picker')}>
                  Pilih berkas (Picker)
                </button>
                <button type="button" className={`btn btn-sm${driveMethod === 'folder' ? ' btn-primary' : ''}`}
                  onClick={() => setDriveMethod('folder')}>
                  Folder / seluruh Drive
                </button>
              </div>
              <p className="microlabel" style={{ marginTop: 6 }}>
                PICKER: PILIH BERKAS SATU PER SATU — BEKERJA TANPA IZIN TAMBAHAN.
                FOLDER: SELURUH ISI FOLDER REKURSIF — BUTUH IZIN BACA FOLDER.
              </p></div>
          )}

          {/* Izin kurang untuk metode yang dipilih: tawarkan MENAMBAH izin,
              bukan memutus koneksi — dan hanya saat metodenya memang folder. */}
          {kind === 'gdrive' && conn && driveMethod === 'folder' && !canScan && (
            <div className="field">
              <p className="microlabel" style={{ margin: '0 0 8px', color: 'var(--source)' }}>
                AKUN INI HANYA BERIZIN MEMBACA BERKAS YANG DIPILIH, JADI MODE FOLDER
                BELUM BISA DIPAKAI. TAMBAHKAN IZIN BACA FOLDER — KONEKSI YANG ADA
                TIDAK PERLU DIPUTUS. ALTERNATIFNYA: PAKAI PICKER, ATAU JENIS SUMBER
                &ldquo;URL FOLDER PUBLIK&rdquo; YANG TAK BUTUH IZIN APA PUN.
              </p>
              <a className="btn btn-sm"
                href={`/api/connections/google/start?grant=folder&account=${encodeURIComponent(accountEmail)}`}>
                <Icon name="plug" size={14} /> Tambah izin baca folder
              </a>
            </div>
          )}

          {pickerMode ? (
            <div className="field"><label>Berkas Drive</label>
              <button type="button" className="btn" onClick={openPicker}>
                <Icon name="plus" size={14} /> Pilih berkas dari Google Drive
              </button>
              {picked.length > 0 && (
                <div style={{ marginTop: 8, maxHeight: 160, overflowY: 'auto' }} className="stack gap-1">
                  {picked.map((p) => (
                    <div key={p.id} className="cluster gap-2" style={{ fontSize: 13 }}>
                      <span className="mono" style={{ color: 'var(--muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <button className="icon-btn" aria-label={`Hapus ${p.name}`}
                        onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))}>
                        <Icon name="close" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="microlabel" style={{ marginTop: 8 }}>
                MODE PICKER: HANYA BERKAS YANG DIPILIH YANG BISA DIBACA (SCOPE drive.file).
                MEMILIH FOLDER TIDAK MEMBERI AKSES KE ISINYA — ITU BATAS GOOGLE, BUKAN
                PENGATURAN. UNTUK SELURUH ISI FOLDER, PAKAI URL FOLDER PUBLIK ATAU
                TAMBAH IZIN BACA FOLDER.
              </p>
            </div>
          ) : !useUrl ? (<>
          <div className="field"><label>Cakupan</label>
            <Select value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'folder')}>
              <option value="all">Seluruh Drive (rekursif)</option>
              <option value="folder">Folder tertentu (rekursif)</option>
            </Select></div>

          {scope === 'folder' && (
            <div className="field"><label>{kind === 'gdrive' ? 'Folder ID' : 'Folder path'}</label>
              <input className="input" value={loc} onChange={(e) => setLoc(e.target.value)}
                placeholder={kind === 'gdrive' ? '1A2b3C… (kosong = root)' : '/Knowledge/support'} /></div>
          )}
          </>) : null}

          <p className="microlabel">SYNC MENSCAN STORAGE (PDF/DOCX/TXT/…) → INGEST → MEMORY AGENT OTOMATIS. MAKS 300 FILE/RUN.</p>
          {err && <span className="error">{err}</span>}
        </div>
        <div className="df">
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} style={{ flex: 1 }} onClick={save} disabled={busy}>Tambah &amp; sync</button>
          <button className="btn" onClick={onClose}>Batal</button>
        </div>
      </aside>
    </>
  );
}
