'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import './chat-full.css';

/**
 * CHAT HALAMAN PENUH — PUBLIK, per chatbot: /c/{publicKey}
 *
 * Pelengkap widget gelembung, bukan penggantinya. Keduanya memakai endpoint
 * yang sama persis; yang berbeda hanya bentuknya, dan bentuk itu menentukan
 * kegunaannya:
 *
 *   GELEMBUNG (embed.js)  menempel di sudut situs pelanggan. Satu sesi
 *                         berjalan, dibuka sambil lalu, ditutup dan dilupakan.
 *   HALAMAN PENUH (ini)   tautan yang dibagikan sendiri. Percakapan berumur
 *                         panjang, dibuka berulang kali, dan justru karena
 *                         itulah ia butuh DAFTAR SESI di samping.
 *
 * Kenapa daftar sesinya diambil dari server, bukan localStorage: pengunjung
 * yang berganti perangkat, membersihkan penyimpanan peramban, atau membuka
 * tautan yang sama esok hari akan melihat riwayatnya kosong padahal server
 * menyimpan semuanya. localStorage tetap dipakai — tapi hanya untuk
 * `visitorId`, yaitu KUNCI riwayatnya, bukan riwayatnya sendiri.
 *
 * TIDAK ADA SESI LOGIN di halaman ini. Identitas pengunjung sepenuhnya
 * `visitorId` di localStorage, dan itu memang batasnya: siapa pun yang
 * memegang visitorId yang sama melihat riwayat yang sama. Untuk chatbot
 * publik di landing page — kegunaan yang dirancang — itu tepat. Untuk
 * percakapan yang benar-benar rahasia, jawabannya bukan menambal halaman ini
 * melainkan memakai chatbot di balik autentikasi.
 */

interface Cite { n: number; title: string | null; score: number }
interface Msg { role: 'user' | 'assistant'; text: string; cites?: Cite[]; streaming?: boolean }
interface Sesi { id: string; title: string; startedAt: string; lastAt: string | null; messages: number }

interface Tema {
  signal: string; source: string; radius: string; mode: 'light' | 'dark';
  name: string; logoUrl: string | null; logo: string; greeting: string | null;
}

const TEMA_AWAL: Tema = {
  signal: '#2563EB', source: '#F59E0B', radius: '12px', mode: 'light',
  name: 'Nalar', logoUrl: '/brand/favicon-48.png', logo: 'N', greeting: null,
};

/** Kunci pengunjung — sama dengan yang dipakai embed.js supaya riwayat
 *  gelembung dan halaman penuh adalah riwayat yang SAMA, bukan dua dunia. */
const VISITOR_KEY = 'nalar_visitor';

function visitorId(): string {
  try {
    const ada = localStorage.getItem(VISITOR_KEY);
    if (ada) return ada;
    const baru = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, baru);
    return baru;
  } catch {
    // Peramban dengan penyimpanan dimatikan tetap bisa memakai chatbotnya —
    // ia hanya kehilangan riwayat antar muat halaman. Melempar galat di sini
    // akan membuat halaman kosong total untuk sesuatu yang tak fatal.
    return crypto.randomUUID();
  }
}

const waktuSingkat = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const lewat = Date.now() - d.getTime();
  if (lewat < 60_000) return 'baru saja';
  if (lewat < 3_600_000) return `${Math.floor(lewat / 60_000)} mnt lalu`;
  if (lewat < 86_400_000) return `${Math.floor(lewat / 3_600_000)} jam lalu`;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

export default function ChatFullPage({ params }: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = use(params);

  const [tema, setTema] = useState<Tema>(TEMA_AWAL);
  const [siap, setSiap] = useState<'muat' | 'ok' | 'hilang'>('muat');
  const [sesi, setSesi] = useState<Sesi[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [laci, setLaci] = useState(false);

  const vid = useRef<string>('');
  const threadRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { vid.current = visitorId(); }, []);

  /* ── konfigurasi & branding chatbot ──────────────────────────────── */
  useEffect(() => {
    let batal = false;
    fetch(`/api/chat/${encodeURIComponent(publicKey)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('404'))))
      .then((cfg: { themeConfig?: Record<string, Record<string, string>>; greeting?: string }) => {
        if (batal) return;
        const t = cfg.themeConfig ?? {};
        const b = t.brand ?? {}, th = t.theme ?? {};
        setTema((p) => ({
          ...p,
          greeting: cfg.greeting ?? null,
          name: b.name ?? p.name,
          // Huruf kustom mengalahkan gambar bawaan; gambar kustom mengalahkan
          // keduanya. Urutan yang sama dengan embed.js — dua permukaan yang
          // menampilkan merek sama tak boleh menampilkannya berbeda.
          logo: b.logo ?? p.logo,
          logoUrl: b.logoUrl ?? (b.logo ? null : p.logoUrl),
          signal: th.signal ?? p.signal,
          source: th.source ?? p.source,
          radius: th.radius ?? p.radius,
          mode: th.mode === 'dark' ? 'dark' : 'light',
        }));
        setSiap('ok');
      })
      .catch(() => { if (!batal) setSiap('hilang'); });
    return () => { batal = true; };
  }, [publicKey]);

  /* ── daftar sesi ─────────────────────────────────────────────────── */
  const muatSesi = useCallback(async () => {
    if (!vid.current) return;
    try {
      const r = await fetch(
        `/api/chat/${encodeURIComponent(publicKey)}/sessions?visitorId=${encodeURIComponent(vid.current)}`);
      if (!r.ok) return;
      const j = await r.json() as { sessions: Sesi[] };
      setSesi(j.sessions ?? []);
    } catch { /* daftar sesi gagal dimuat tak boleh mematikan chatnya */ }
  }, [publicKey]);

  useEffect(() => { if (siap === 'ok') void muatSesi(); }, [siap, muatSesi]);

  /* ── buka satu sesi ──────────────────────────────────────────────── */
  async function bukaSesi(id: string) {
    setLaci(false);
    if (id === convId) return;
    setConvId(id);
    setMsgs([]);
    try {
      const r = await fetch(
        `/api/chat/${encodeURIComponent(publicKey)}/history`
        + `?conversationId=${encodeURIComponent(id)}&visitorId=${encodeURIComponent(vid.current)}`);
      const j = await r.json() as { messages: Array<{ role: string; content: string; citations?: Cite[] }> };
      setMsgs((j.messages ?? []).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        text: m.content,
        // Sitasi tersimpan tanpa nomor urut; nomornya adalah posisi tampil,
        // jadi diberikan di sini agar sama dengan yang dilihat pengunjung
        // saat jawabannya pertama kali mengalir.
        cites: m.citations?.map((c, i) => ({ n: i + 1, title: c.title ?? null, score: c.score })),
      })));
    } catch { /* riwayat gagal dimuat → sesi tampil kosong, bukan halaman rusak */ }
  }

  function sesiBaru() {
    setLaci(false);
    setConvId(null);
    setMsgs([]);
    taRef.current?.focus();
  }

  /* ── kirim ───────────────────────────────────────────────────────── */
  async function kirim() {
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text: q }, { role: 'assistant', text: '', streaming: true }]);

    try {
      const res = await fetch(`/api/chat/${encodeURIComponent(publicKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: q, visitorId: vid.current,
          ...(convId ? { conversationId: convId } : {}),
        }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text().catch(() => 'Gagal'));

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', convBaru: string | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const bagian = buf.split('\n\n');
        buf = bagian.pop() ?? '';
        for (const blok of bagian) {
          const ev = /^event: (.+)$/m.exec(blok)?.[1];
          const raw = /^data: (.+)$/m.exec(blok)?.[1];
          if (!ev || !raw) continue;
          const data = JSON.parse(raw);

          if (ev === 'meta') { convBaru = data.conversationId; setConvId(data.conversationId); }
          else if (ev === 'sources') {
            setMsgs((m) => m.map((x, i) => i === m.length - 1 ? { ...x, cites: data as Cite[] } : x));
          } else if (ev === 'block') {
            const potong = typeof data.text === 'string' ? data.text
              : Array.isArray(data.items) ? data.items.map(String).join('\n• ') : '';
            if (potong) {
              setMsgs((m) => m.map((x, i) => i === m.length - 1 ? { ...x, text: x.text + potong } : x));
            }
          } else if (ev === 'error') throw new Error(data.message);
        }
      }

      setMsgs((m) => m.map((x, i) => i === m.length - 1 ? { ...x, streaming: false } : x));
      /* Daftar sesi disegarkan HANYA saat sesi baru lahir. Menyegarkannya tiap
         giliran berarti satu kueri agregat per pesan, dan yang berubah cuma
         cap waktunya. */
      if (convBaru && !sesi.some((s) => s.id === convBaru)) void muatSesi();
    } catch (e) {
      setMsgs((m) => m.map((x, i) => i === m.length - 1
        ? { ...x, streaming: false, text: x.text || `⚠ ${(e as Error).message}` } : x));
    } finally {
      setBusy(false);
    }
  }

  /* Menggulir ke bawah mengikuti jawaban yang mengalir. */
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  if (siap === 'muat') {
    return <main className="cw"><div className="cw-empty" style={{ gridColumn: '1 / -1' }}>Memuat…</div></main>;
  }
  if (siap === 'hilang') {
    return (
      <main className="cw" style={{ gridTemplateColumns: '1fr' }}>
        <div className="cw-empty">
          <h2>Chatbot tidak ditemukan</h2>
          <p>Tautannya tidak valid, atau chatbot ini sedang dinonaktifkan.</p>
        </div>
      </main>
    );
  }

  const gaya = {
    ['--cw-signal' as string]: tema.signal,
    ['--cw-source' as string]: tema.source,
    ['--cw-radius' as string]: tema.radius,
  } as React.CSSProperties;

  return (
    <main className={`cw${tema.mode === 'dark' ? ' dark' : ''}${laci ? ' open' : ''}`} style={gaya}>
      <aside className="cw-side">
        <div className="cw-brand">
          {tema.logoUrl
            /* eslint-disable-next-line @next/next/no-img-element -- URL logo
               milik tenant, di luar daftar domain next/image; memaksanya lewat
               pengoptimal berarti tiap pelanggan baru harus mengubah konfigurasi. */
            ? <img src={tema.logoUrl} alt="" onError={() => setTema((p) => ({ ...p, logoUrl: null }))} />
            : <span className="n" aria-hidden style={{
                width: 28, height: 28, borderRadius: 7, background: tema.signal, color: '#fff',
                display: 'grid', placeItems: 'center', fontSize: 14,
              }}>{tema.logo}</span>}
          <span className="n">{tema.name}</span>
        </div>

        <button className="cw-new" onClick={sesiBaru}>+ Percakapan baru</button>

        <div className="cw-list">
          {sesi.length === 0
            ? <p style={{ fontSize: 12, color: 'var(--cw-mut)', padding: '4px 10px', margin: 0 }}>
                Belum ada percakapan.
              </p>
            : sesi.map((s) => (
              <button key={s.id} className={`cw-item${s.id === convId ? ' on' : ''}`}
                onClick={() => bukaSesi(s.id)}>
                <span className="t">{s.title}</span>
                <span className="m">{waktuSingkat(s.lastAt ?? s.startedAt)} · {s.messages} pesan</span>
              </button>
            ))}
        </div>

        {/* Batas riwayatnya disebut apa adanya. Pengunjung yang berganti
            perangkat lalu menemukan riwayatnya hilang akan menyangka datanya
            terhapus — dan itu kesimpulan yang wajar bila tak ada yang
            memberitahunya lebih dulu. */}
        <div className="cw-side-foot">
          Riwayat tersimpan di peramban ini. Membukanya dari perangkat lain akan memulai dari kosong.
        </div>
      </aside>

      <div className="cw-main">
        <header className="cw-head">
          <div className="cluster" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="cw-toggle" onClick={() => setLaci((v) => !v)} aria-label="Daftar percakapan">☰</button>
            <div>
              <div className="t">{tema.name}</div>
              <div className="s">Jawaban diambil dari dokumen — lengkap dengan sumbernya</div>
            </div>
          </div>
        </header>

        <div className="cw-thread" ref={threadRef}>
          <div className="cw-inner">
            {msgs.length === 0 && (
              <div className="cw-empty">
                <h2>{tema.greeting ?? 'Ada yang bisa dibantu?'}</h2>
                <p>Tanyakan apa saja — jawabannya bersumber dari dokumen, bukan karangan.</p>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`cw-msg ${m.role === 'user' ? 'u' : 'a'}`}>
                <div className="cw-bubble">
                  {m.text || (m.streaming
                    ? <span className="cw-dots"><span /><span /><span /></span>
                    : null)}
                  {m.cites && m.cites.length > 0 && (
                    <div className="cw-cite">
                      {m.cites.map((c) => (
                        <span key={c.n} className="c">[{c.n}] {c.title ?? 'Dokumen'}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <form className="cw-form" onSubmit={(e) => { e.preventDefault(); void kirim(); }}>
          <div className="wrap">
            <textarea ref={taRef} rows={1} value={input} placeholder="Tulis pertanyaan…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter mengirim, Shift+Enter baris baru — kebiasaan yang sama
                // dengan hampir semua antarmuka chat; melawannya hanya membuat
                // orang mengirim pesan setengah jadi.
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void kirim(); }
              }} />
            <button className="cw-send" type="submit" disabled={busy || !input.trim()}>
              {busy ? '…' : 'Kirim'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
