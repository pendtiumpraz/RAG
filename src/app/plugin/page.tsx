'use client';

/**
 * Panel Plugin Admin (embed-plugin-panel).
 *
 * Satu halaman white-label untuk pemilik situs yang MENYEMATKAN chatbot Nalar:
 * kelola knowledgebase, domain embed, kuota & pembayaran — TANPA membuka dasbor
 * Nalar utama. Dipakai standalone (URL langsung `/plugin`) atau di-iframe di
 * situs pihak ketiga. Auth & billing MEMAKAI ULANG mesin yang ada
 * (NextAuth + /api/payments TriPay) — tidak ada mesin baru di sini.
 *
 * Semua data lewat endpoint yang sudah ada; tak ada endpoint baru:
 *   /api/chatbots (GET/PATCH), /api/billing, /api/payments(/[id]),
 *   /api/knowledge-bases(/[id]/assignments,/upload), /api/categories,
 *   /api/auth/signup, /api/auth/login-status, NextAuth signIn/out.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';

type Chatbot = { id: string; name: string; publicKey: string; allowedOrigins: string[] | null };
type KB = { id: string; name: string; description: string | null; sources: number; chunks: number; chatbots: { id: string; name: string }[] };
type Category = { id: string; label: string; count?: number };
type Billing = {
  plan: string; planExpiresAt: string | null; expired: boolean; isPlatform: boolean;
  usage: { messages: number; chatbots: number; members: number };
  limits: { messagesPerMonth: number | null; maxChatbots: number | null; maxMembers: number | null };
  plans: { id: string; name: string }[];
  payment: { enabled: boolean; mode: string; planPrices: Record<string, number> };
};

async function jget<T>(url: string): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Gagal memuat (${r.status})`);
  return r.json();
}
async function jsend(url: string, method: string, body?: unknown) {
  const r = await fetch(url, {
    method, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `Gagal (${r.status})`);
  return j;
}

export default function PluginPanel() {
  const { status } = useSession();
  if (status === 'loading') return <div className="np-wrap"><p className="np-muted">Memuat…</p></div>;
  if (status !== 'authenticated') return <AuthView />;
  return <Panel />;
}

/* ─────────────────────────── Auth ─────────────────────────── */

const PENDING = 'Akunmu terdaftar dan menunggu verifikasi admin. Kamu bisa masuk setelah disetujui.';

function AuthView() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [f, setF] = useState({ orgName: '', name: '', email: '', password: '' });
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); setNotice(null);
    const res = await signIn('credentials', { email: f.email, password: f.password, totp: totp.trim(), redirect: false });
    if (!res?.error) { window.location.reload(); return; }
    // NextAuth menolak pending/2FA sama seperti password salah (anti-enumerasi);
    // tanyakan alasan sebenarnya ke endpoint yang hanya menjawab bila password benar.
    const why = await fetch('/api/auth/login-status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: f.email, password: f.password }),
    }).then((r) => r.json()).catch(() => ({ outcome: 'invalid' }));
    setBusy(false);
    if (why.outcome === 'pending') setNotice(PENDING);
    else if (why.outcome === 'rejected') setErr('Pendaftaran akun ini ditolak.');
    else if (why.outcome === 'unverified') setNotice('Email belum diverifikasi. Cek kotak masukmu.');
    else if (why.outcome === 'active') {
      setNeedTotp(true);
      setErr(totp.trim() ? 'Kode 2FA tidak cocok.' : null);
      if (!totp.trim()) setNotice('Akun ini memakai 2FA. Masukkan kode 6 digit.');
    } else setErr('Email atau password salah.');
  }

  async function register(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null); setNotice(null);
    try {
      await jsend('/api/auth/signup', 'POST', f);
      setTab('login'); setNotice(PENDING);
      setF((s) => ({ ...s, orgName: '', name: '', password: '' }));
    } catch (e2) { setErr((e2 as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="np-wrap">
      <BrandBar />
      <div className="np-card" style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="np-tabs" role="tablist">
          <button className="np-tab" role="tab" aria-selected={tab === 'login'} onClick={() => { setTab('login'); setErr(null); setNotice(null); }}>Masuk</button>
          <button className="np-tab" role="tab" aria-selected={tab === 'register'} onClick={() => { setTab('register'); setErr(null); setNotice(null); }}>Daftar</button>
        </div>
        {err && <p className="np-err">{err}</p>}
        {notice && <p className="np-notice">{notice}</p>}
        {tab === 'login' ? (
          <form onSubmit={login}>
            <label>Email</label>
            <input type="email" value={f.email} onChange={set('email')} required autoComplete="username" />
            <label>Password</label>
            <input type="password" value={f.password} onChange={set('password')} required autoComplete="current-password" />
            {needTotp && (<><label>Kode 2FA</label><input value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" /></>)}
            <button type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Memproses…' : 'Masuk'}</button>
          </form>
        ) : (
          <form onSubmit={register}>
            <label>Nama organisasi</label>
            <input value={f.orgName} onChange={set('orgName')} required />
            <label>Nama lengkap</label>
            <input value={f.name} onChange={set('name')} required />
            <label>Email</label>
            <input type="email" value={f.email} onChange={set('email')} required autoComplete="username" />
            <label>Password</label>
            <input type="password" value={f.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />
            <button type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Memproses…' : 'Daftar'}</button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Panel ─────────────────────────── */

function BrandBar({ onLogout }: { onLogout?: () => void }) {
  return (
    <div className="np-brandbar">
      <span className="np-logo">Nalar <b>Plugin</b></span>
      {onLogout
        ? <button className="np-ghost np-sm" onClick={onLogout}>Keluar</button>
        : <span className="np-muted" style={{ fontSize: 11 }}>PANEL EMBED</span>}
    </div>
  );
}

function Panel() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? 'member';
  const [bots, setBots] = useState<Chatbot[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<'embed' | 'kb' | 'billing'>('embed');
  const [err, setErr] = useState<string | null>(null);
  /** Plan kedaluwarsa → banner mengarah ke tab Kuota & Bayar (di dalam panel). */
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    jget<Chatbot[]>('/api/chatbots')
      .then((r) => { setBots(r); if (r.length === 1) setSel(r[0].id); })
      .catch((e) => setErr((e as Error).message));
    jget<Billing>('/api/billing').then((b) => setExpired(b.expired)).catch(() => { /* biarkan senyap */ });
  }, []);

  if (err) return <div className="np-wrap"><BrandBar onLogout={() => signOut({ callbackUrl: '/plugin' })} /><p className="np-err">{err}</p></div>;
  if (!bots) return <div className="np-wrap"><BrandBar onLogout={() => signOut({ callbackUrl: '/plugin' })} /><p className="np-muted">Memuat chatbot…</p></div>;

  const chatbot = bots.find((b) => b.id === sel) ?? null;

  return (
    <div className="np-wrap">
      <BrandBar onLogout={() => signOut({ callbackUrl: '/plugin' })} />

      {expired && (
        <div className="np-card" style={{ borderLeft: '3px solid #dc2626' }}>
          <p style={{ margin: 0 }}><strong>Paket kedaluwarsa</strong> — chatbot berhenti menjawab. Perpanjang di Kuota &amp; Bayar.</p>
          <button className="np-sm" style={{ marginTop: 8 }}
            onClick={() => { setTab('billing'); if (!sel && bots.length) setSel(bots[0].id); }}>
            Buka Kuota &amp; Bayar
          </button>
        </div>
      )}

      {bots.length === 0 && (
        <div className="np-card"><p>Belum ada chatbot di akun ini. Buat chatbot dulu di dasbor Nalar utama, lalu kembali ke panel ini.</p></div>
      )}

      {bots.length > 0 && !chatbot && (
        <div className="np-card">
          <h2>Pilih chatbot yang dikelola</h2>
          <ul className="np-list">
            {bots.map((b) => (
              <li key={b.id}>
                <span>{b.name} <code className="np-muted" style={{ fontSize: 11 }}>{b.publicKey}</code></span>
                <button className="np-sm" onClick={() => setSel(b.id)}>Kelola</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {chatbot && (
        <>
          <div className="np-card" style={{ paddingBottom: 12 }}>
            <div className="np-row" style={{ justifyContent: 'space-between' }}>
              <div><h1>{chatbot.name}</h1><span className="np-muted">Chatbot yang sedang dikelola</span></div>
              {bots.length > 1 && <button className="np-ghost np-sm" onClick={() => setSel(null)}>Ganti chatbot</button>}
            </div>
            <div className="np-tabbtns" style={{ marginTop: 14 }}>
              <button className="np-tab" aria-selected={tab === 'embed'} onClick={() => setTab('embed')}>Embed</button>
              <button className="np-tab" aria-selected={tab === 'kb'} onClick={() => setTab('kb')}>Knowledgebase</button>
              <button className="np-tab" aria-selected={tab === 'billing'} onClick={() => setTab('billing')}>Kuota & Bayar</button>
            </div>
          </div>

          {tab === 'embed' && <EmbedTab chatbot={chatbot} canEdit={role !== 'member'} onSaved={(o) => setBots((bs) => bs?.map((b) => b.id === chatbot.id ? { ...b, allowedOrigins: o } : b) ?? bs)} />}
          {tab === 'kb' && <KbTab chatbotId={chatbot.id} canEdit={role !== 'member'} />}
          {tab === 'billing' && <BillingTab canPay={role !== 'member'} />}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────── Embed wizard ─────────────────────────── */

function EmbedTab({ chatbot, canEdit, onSaved }: { chatbot: Chatbot; canEdit: boolean; onSaved: (origins: string[]) => void }) {
  const [origins, setOrigins] = useState((chatbot.allowedOrigins ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const snippet = `<script src="${origin}/embed.js" data-chatbot="${chatbot.publicKey}"></script>`;
  const allowed = chatbot.allowedOrigins ?? [];

  async function save() {
    setBusy(true); setErr(null); setMsg(null);
    // CORS di /api/chat mencocokkan header Origin persis: skema+host(+port),
    // tanpa path & tanpa slash akhir. Bersihkan input pengguna ke bentuk itu.
    const list = origins.split(/[\n,]/).map((s) => s.trim()).filter(Boolean).map((s) => {
      try { return new URL(s.includes('://') ? s : `https://${s}`).origin; } catch { return s; }
    });
    try {
      await jsend(`/api/chatbots/${chatbot.id}`, 'PATCH', { allowedOrigins: [...new Set(list)] });
      onSaved([...new Set(list)]); setOrigins([...new Set(list)].join('\n')); setMsg('Domain tersimpan.');
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="np-card">
        <h2>Public key</h2>
        <div className="np-snippet">{chatbot.publicKey}</div>
        <span className="np-muted">Kunci publik chatbot (aman ditampilkan). Tak perlu diubah — cukup atur domain & knowledgebase di sini, snippet tetap sama.</span>
      </div>

      <div className="np-card">
        <h2>Domain yang diizinkan (allowed origins)</h2>
        <p className="np-muted">Satu domain per baris, mis. <code>https://tokosaya.com</code>. Widget HANYA memuat di domain ini (proteksi CORS). Kosong = izinkan semua.</p>
        <textarea value={origins} onChange={(e) => setOrigins(e.target.value)} disabled={!canEdit} placeholder="https://tokosaya.com" />
        {err && <p className="np-err">{err}</p>}
        {msg && <p className="np-notice">{msg}</p>}
        {canEdit
          ? <button onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan domain'}</button>
          : <p className="np-muted">Hanya admin tenant yang bisa mengubah domain. Domain aktif: {allowed.length ? allowed.join(', ') : 'semua'}.</p>}
      </div>

      <div className="np-card">
        <h2>Snippet embed</h2>
        <p className="np-muted">Tempel sebelum <code>&lt;/body&gt;</code> di situsmu:</p>
        <div className="np-snippet">{snippet}</div>
        <button className="np-ghost np-sm" onClick={() => { navigator.clipboard?.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? 'Tersalin ✓' : 'Salin snippet'}
        </button>
      </div>
    </>
  );
}

/* ─────────────────────────── Knowledgebase ─────────────────────────── */

function KbTab({ chatbotId, canEdit }: { chatbotId: string; canEdit: boolean }) {
  const [kbs, setKbs] = useState<KB[] | null>(null);
  const [cats, setCats] = useState<Category[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [newKb, setNewKb] = useState('');
  const [newCat, setNewCat] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    Promise.all([jget<KB[]>('/api/knowledge-bases'), jget<Category[]>('/api/categories')])
      .then(([k, c]) => { setKbs(k); setCats(c); })
      .catch((e) => setErr((e as Error).message));
  }, []);
  useEffect(reload, [reload]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const assignedTo = (kb: KB) => kb.chatbots.some((c) => c.id === chatbotId);
  const toggleAssign = (kb: KB) => act(async () => {
    const ids = assignedTo(kb) ? kb.chatbots.filter((c) => c.id !== chatbotId).map((c) => c.id) : [...kb.chatbots.map((c) => c.id), chatbotId];
    await jsend(`/api/knowledge-bases/${kb.id}/assignments`, 'PUT', { chatbotIds: ids });
  });

  async function upload(kbId: string, file: File) {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData(); fd.append('files', file);
      const r = await fetch(`/api/knowledge-bases/${kbId}/upload`, { method: 'POST', body: fd, credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Unggah gagal (${r.status})`);
      reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  if (err) return <div className="np-card"><p className="np-err">{err}</p><button className="np-ghost np-sm" onClick={reload}>Coba lagi</button></div>;
  if (!kbs || !cats) return <div className="np-card"><p className="np-muted">Memuat knowledgebase…</p></div>;

  return (
    <>
      <div className="np-card">
        <h2>Knowledgebase</h2>
        <p className="np-muted">Aktifkan KB agar dipakai chatbot ini, lalu unggah dokumen. Badge <span className="np-badge ok">terpasang</span> = sudah dipakai chatbot ini.</p>
        {kbs.length === 0 && <p className="np-muted">Belum ada knowledgebase.</p>}
        <ul className="np-list">
          {kbs.map((kb) => (
            <li key={kb.id} style={{ flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px' }}>
                <strong>{kb.name}</strong>{' '}
                {assignedTo(kb) ? <span className="np-badge ok">terpasang</span> : <span className="np-badge warn">belum</span>}
                <div className="np-muted" style={{ fontSize: 12 }}>{kb.sources} sumber · {kb.chunks} chunk</div>
              </div>
              {canEdit && (
                <div className="np-row">
                  <button className="np-sm np-ghost" onClick={() => toggleAssign(kb)} disabled={busy}>{assignedTo(kb) ? 'Lepas' : 'Pasang'}</button>
                  <label className="np-sm np-ghost" style={{ display: 'inline-block', padding: '6px 12px', border: '1px solid var(--np-border)', borderRadius: 8, cursor: 'pointer', margin: 0, color: 'var(--np-blue)', fontWeight: 600 }}>
                    Unggah
                    <input type="file" style={{ display: 'none' }} disabled={busy}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(kb.id, f); e.target.value = ''; }} />
                  </label>
                  <button className="np-danger" onClick={() => confirm(`Hapus KB "${kb.name}"?`) && act(() => jsend(`/api/knowledge-bases/${kb.id}`, 'DELETE'))} disabled={busy}>Hapus</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="np-row" style={{ marginTop: 12 }}>
            <input value={newKb} onChange={(e) => setNewKb(e.target.value)} placeholder="Nama knowledgebase baru" style={{ flex: 1, margin: 0 }} />
            <button className="np-sm" disabled={busy || !newKb.trim()} onClick={() => act(async () => { await jsend('/api/knowledge-bases', 'POST', { name: newKb.trim() }); setNewKb(''); })}>Tambah KB</button>
          </div>
        )}
      </div>

      <div className="np-card">
        <h2>Kategori dokumen</h2>
        <ul className="np-list">
          {cats.map((c) => <li key={c.id}><span>{c.label}</span>{typeof c.count === 'number' && <span className="np-muted">{c.count} dok.</span>}</li>)}
          {cats.length === 0 && <li className="np-muted">Belum ada kategori.</li>}
        </ul>
        {canEdit && (
          <div className="np-row" style={{ marginTop: 12 }}>
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Kategori baru" style={{ flex: 1, margin: 0 }} />
            <button className="np-sm" disabled={busy || !newCat.trim()} onClick={() => act(async () => { await jsend('/api/categories', 'POST', { label: newCat.trim() }); setNewCat(''); })}>Tambah</button>
          </div>
        )}
      </div>
    </>
  );
}

/* ─────────────────────────── Billing / TriPay ─────────────────────────── */

function BillingTab({ canPay }: { canPay: boolean }) {
  const [b, setB] = useState<Billing | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [payId, setPayId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(() => { jget<Billing>('/api/billing').then(setB).catch((e) => setErr((e as Error).message)); }, []);
  useEffect(reload, [reload]);

  async function buy(plan: string) {
    setBusy(true); setErr(null);
    try { const r = await jsend('/api/payments', 'POST', { plan, months: 1 }); setPayId(r.id); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  if (err) return <div className="np-card"><p className="np-err">{err}</p></div>;
  if (!b) return <div className="np-card"><p className="np-muted">Memuat billing…</p></div>;

  const pct = (used: number, limit: number | null) => limit == null ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const msgPct = pct(b.usage.messages, b.limits.messagesPerMonth);
  const quotaHabis = b.expired || (b.limits.messagesPerMonth != null && b.usage.messages >= b.limits.messagesPerMonth);

  return (
    <>
      <div className="np-card">
        <h2>Paket & pemakaian</h2>
        <p>Paket aktif: <strong style={{ textTransform: 'capitalize' }}>{b.plan}</strong>{' '}
          {b.expired && <span className="np-badge warn">kedaluwarsa</span>}
          {b.planExpiresAt && <span className="np-muted"> · s/d {new Date(b.planExpiresAt).toLocaleDateString('id-ID')}</span>}
        </p>
        <div>
          <span className="np-muted">Pesan bulan ini: {b.usage.messages}{b.limits.messagesPerMonth != null ? ` / ${b.limits.messagesPerMonth}` : ' (tanpa batas)'}</span>
          {b.limits.messagesPerMonth != null && <div className={`np-bar${msgPct >= 100 ? ' full' : ''}`}><span style={{ width: `${msgPct}%` }} /></div>}
        </div>
        <p className="np-muted" style={{ marginTop: 8 }}>Chatbot: {b.usage.chatbots}{b.limits.maxChatbots != null ? ` / ${b.limits.maxChatbots}` : ''} · Anggota: {b.usage.members}{b.limits.maxMembers != null ? ` / ${b.limits.maxMembers}` : ''}</p>
      </div>

      {payId ? (
        <PayBox id={payId} onDone={() => { setPayId(null); reload(); }} onCancel={() => setPayId(null)} />
      ) : !b.payment.enabled ? (
        <div className="np-card"><p className="np-muted">Pembayaran online tidak tersedia pada instalasi ini{b.payment.mode !== 'saas' ? ' (mode on-premise)' : ''}. Hubungi pengelola untuk perpanjangan paket.</p></div>
      ) : !canPay ? (
        <div className="np-card"><p className="np-muted">{quotaHabis ? 'Kuota habis/kedaluwarsa. ' : ''}Hanya admin tenant yang bisa melakukan pembayaran — hubungi admin akunmu.</p></div>
      ) : (
        <div className="np-card">
          <h2>{quotaHabis ? 'Kuota habis — perpanjang sekarang' : 'Upgrade paket'}</h2>
          <p className="np-muted">Bayar via TriPay (QRIS). Setelah lunas, kuota otomatis diperbarui.</p>
          <div className="np-row">
            {Object.keys(b.payment.planPrices).filter((plan) => plan === 'pro' || plan === 'enterprise').map((plan) => (
              <button key={plan} className="np-sm" disabled={busy} onClick={() => buy(plan)} style={{ textTransform: 'capitalize' }}>
                {plan}{' — Rp'}{b.payment.planPrices[plan].toLocaleString('id-ID')}/bln
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function PayBox({ id, onDone, onCancel }: { id: string; onDone: () => void; onCancel: () => void }) {
  const [p, setP] = useState<{ status: string; amount: number; qrImageUrl: string | null; qrString: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const r = await jget<{ status: string; amount: number; qrImageUrl: string | null; qrString: string | null }>(`/api/payments/${id}`);
        if (!live) return;
        setP(r);
        if (r.status === 'paid') { onDone(); return; }
        if (r.status === 'expired' || r.status === 'failed') { setErr('Pembayaran gagal/kedaluwarsa.'); return; }
        setTimeout(tick, 3000);
      } catch (e) { if (live) setErr((e as Error).message); }
    };
    tick();
    return () => { live = false; };
  }, [id, onDone]);

  return (
    <div className="np-card">
      <h2>Selesaikan pembayaran</h2>
      {err && <p className="np-err">{err}</p>}
      {!p && !err && <p className="np-muted">Menyiapkan QRIS…</p>}
      {p && (
        <>
          <p>Total: <strong>Rp{p.amount.toLocaleString('id-ID')}</strong> · status: <span className="np-badge warn">{p.status}</span></p>
          {p.qrImageUrl
            ? <img src={p.qrImageUrl} alt="QRIS" style={{ width: 220, height: 220, display: 'block', margin: '8px 0', background: '#fff', padding: 8, borderRadius: 8 }} />
            : p.qrString ? <div className="np-snippet">{p.qrString}</div> : null}
          <p className="np-muted">Scan dengan aplikasi e-wallet/mobile banking. Halaman ini memantau status otomatis.</p>
        </>
      )}
      <button className="np-ghost np-sm" onClick={onCancel}>Kembali</button>
    </div>
  );
}
