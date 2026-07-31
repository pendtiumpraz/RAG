'use client';

import { FeatureGate } from '../../_components/entitlements';
import { Select } from '../../_components/select';
import { useEffect, useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { Skeleton, ErrorState, EmptyState, useToast, Field } from '../../_components/ui';

interface Chatbot {
  id: string; name: string; publicKey: string; greeting: string | null;
  themeConfig: ThemeCfg | null;
}
interface ThemeCfg {
  brand?: { name?: string; logo?: string };
  theme?: {
    signal?: string; source?: string; radius?: string;
    mode?: 'light' | 'dark'; position?: 'left' | 'right'; showTrace?: boolean;
  };
}

interface BrandForm {
  name: string; logo: string; signal: string; source: string; radius: string;
  mode: 'light' | 'dark'; position: 'left' | 'right'; showTrace: boolean; greeting: string;
}

/** Default HARUS sama dengan yang ada di public/embed.js — kalau meleset,
 *  pratinjau menjanjikan tampilan yang berbeda dari widget sungguhan. */
const D: BrandForm = {
  name: 'Nalar', logo: 'N', signal: '#2563EB', source: '#F59E0B',
  radius: '12px', mode: 'light', position: 'right', showTrace: true, greeting: '',
};

function BrandingPageInner() {
  const bots = useApi<Chatbot[]>('/api/chatbots');
  const [id, setId] = useState('');
  const [cfg, setCfg] = useState<BrandForm>({ ...D });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const active = bots.data?.find((b) => b.id === id) ?? null;

  useEffect(() => {
    if (!bots.data?.length) return;
    const bot = bots.data.find((b) => b.id === id) ?? bots.data[0];
    if (!id) setId(bot.id);
    const t = bot.themeConfig ?? {};
    setCfg({
      name: t.brand?.name ?? D.name,
      logo: t.brand?.logo ?? D.logo,
      signal: t.theme?.signal ?? D.signal,
      source: t.theme?.source ?? D.source,
      radius: t.theme?.radius ?? D.radius,
      mode: t.theme?.mode ?? D.mode,
      position: t.theme?.position ?? D.position,
      showTrace: t.theme?.showTrace !== false,
      greeting: bot.greeting ?? '',
    });
  }, [bots.data, id]);

  async function save() {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/api/chatbots/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          greeting: cfg.greeting,
          themeConfig: {
            brand: { name: cfg.name, logo: cfg.logo },
            theme: {
              signal: cfg.signal, source: cfg.source, radius: cfg.radius,
              mode: cfg.mode, position: cfg.position, showTrace: cfg.showTrace,
            },
          },
        }),
      });
      toast('Branding tersimpan — widget memuat ulang dalam ≤5 menit (cache)');
      bots.refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  const set = <K extends keyof BrandForm>(k: K) => (v: BrandForm[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  /* logo unggahan per chatbot — bust cache pratinjau tiap perubahan */
  const [logoVersion, setLogoVersion] = useState(0);
  async function uploadLogo(file: File) {
    if (file.size > 300 * 1024) { toast('Logo terlalu besar — maksimal 300KB', 'error'); return; }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('Gagal membaca berkas'));
      r.readAsDataURL(file);
    });
    try {
      await api(`/api/chatbots/${id}/logo`, { method: 'POST', body: JSON.stringify({ dataUrl }) });
      setLogoVersion((v) => v + 1);
      toast('Logo terpasang — widget memuat ulang dalam ≤1 jam (cache)');
    } catch (e) { toast((e as Error).message, 'error'); }
  }
  async function removeLogo() {
    try {
      await api(`/api/chatbots/${id}/logo`, { method: 'DELETE' });
      setLogoVersion((v) => v + 1);
      toast('Logo dihapus — widget kembali ke inisial');
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  if (bots.error) return <div className="card"><ErrorState message={bots.error} onRetry={bots.refetch} /></div>;
  if (bots.loading || !bots.data) return <div className="card"><Skeleton rows={4} /></div>;
  if (bots.data.length === 0) {
    return <div className="card"><EmptyState title="Belum ada chatbot"
      hint="Branding menempel pada chatbot — buat satu dulu di halaman Chatbots." /></div>;
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Branding</h1><p className="sub">Tampilan widget di situs pelanggan. Tiap chatbot punya tampilannya sendiri.</p></div>
        <div className="cluster gap-2">
          <Select style={{ width: 200 }} value={id} onChange={(e) => setId(e.target.value)}>
            {bots.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} disabled={busy} onClick={save}>Simpan</button>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <div className="panel-head"><span className="t">pengaturan</span></div>
          <div className="card-pad stack gap-4">
            <Field label="Nama merek"><input className="input" value={cfg.name} onChange={(e) => set('name')(e.target.value)} /></Field>

            <Field label="Logo"><div className="cluster gap-3" style={{ alignItems: 'center' }}>
                {/* pratinjau logo terunggah; onError = belum ada logo */}
                {active && logoVersion >= 0 && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img key={logoVersion} src={`/api/chat/${active.publicKey}/logo?v=${logoVersion}`}
                    alt="Logo yang sedang terpasang" style={{ height: 34, width: 'auto', borderRadius: 6, border: '1px solid var(--line)', background: '#fff', padding: 3 }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                )}
                <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
                  Unggah logo…
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); e.target.value = ''; }} />
                </label>
                <button className="btn btn-sm btn-ghost" onClick={() => void removeLogo()}>Hapus</button>
              </div>
              <p className="microlabel" style={{ marginTop: 6 }}>PNG/JPEG/WEBP ≤300KB — TAMPIL DI KEPALA WIDGET</p></Field>

            <Field label="Inisial logo (cadangan)"><input className="input" maxLength={2} style={{ width: 90 }} value={cfg.logo}
                onChange={(e) => set('logo')(e.target.value)} />
              <p className="microlabel" style={{ marginTop: 6 }}>DIPAKAI BILA TAK ADA LOGO UNGGAHAN</p></Field>

            <div className="cluster gap-4">
              <ColorField label="Warna utama" value={cfg.signal} onChange={set('signal')} />
              <ColorField label="Warna sitasi" value={cfg.source} onChange={set('source')} />
            </div>

            <Field label="Sudut membulat"><Select value={cfg.radius} onChange={(e) => set('radius')(e.target.value)}>
                <option value="4px">Tajam (4px)</option>
                <option value="12px">Sedang (12px)</option>
                <option value="20px">Bulat (20px)</option>
              </Select></Field>

            <div className="cluster gap-4">
              <Field label="Tema" style={{ flex: 1 }}><Select value={cfg.mode}
                  onChange={(e) => set('mode')(e.target.value as 'light' | 'dark')}>
                  <option value="light">Terang</option><option value="dark">Gelap</option>
                </Select></Field>
              <Field label="Posisi" style={{ flex: 1 }}><Select value={cfg.position}
                  onChange={(e) => set('position')(e.target.value as 'left' | 'right')}>
                  <option value="right">Kanan bawah</option><option value="left">Kiri bawah</option>
                </Select></Field>
            </div>

            <Field label="Sapaan pembuka"><input className="input" value={cfg.greeting} placeholder="Halo! Ada yang bisa dibantu?"
                onChange={(e) => set('greeting')(e.target.value)} /></Field>

            <label className="cluster gap-2" style={{ cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={cfg.showTrace}
                onChange={(e) => set('showTrace')(e.target.checked)} />
              Tampilkan jejak retrieval (skor & sumber) di widget
            </label>
          </div>
        </div>

        <div className="stack gap-4">
          <WidgetPreview cfg={cfg} />
          {active && <Snippet publicKey={active.publicKey} />}
        </div>
      </div>
    </>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={<>{label}</>} style={{ flex: 1 }}><div className="cluster gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: 44, height: 38, padding: 2, border: '1px solid var(--line)', borderRadius: 6, background: 'none' }} />
        <input className="input mono" value={value} onChange={(e) => onChange(e.target.value)} style={{ flex: 1 }} />
      </div></Field>
  );
}

/**
 * Pratinjau widget — meniru struktur & warna public/embed.js.
 *
 * Ini tiruan, bukan widget sungguhan yang di-iframe: menyuntikkan embed.js ke
 * dashboard berarti membuat percakapan nyata (dan memakan kuota) setiap kali
 * seseorang menggeser pemilih warna. Untuk mencoba yang asli ada halaman
 * /demo/<publicKey>.
 */
function WidgetPreview({ cfg }: { cfg: BrandForm }) {
  const dark = cfg.mode === 'dark';
  const bg = dark ? '#0F172A' : '#FFFFFF';
  const panel = dark ? '#1E293B' : '#F8FAFC';
  const ink = dark ? '#F1F5F9' : '#0F172A';
  const mut = dark ? '#94A3B8' : '#64748B';
  const line = dark ? '#334155' : '#E2E8F0';
  const rs = `calc(${cfg.radius} - 4px)`;

  return (
    <div className="card">
      <div className="panel-head"><span className="t">pratinjau</span>
        <span className="microlabel">{cfg.position === 'right' ? 'KANAN' : 'KIRI'} BAWAH</span></div>
      <div className="card-pad" style={{ background: 'var(--card-2)' }}>
        <div style={{
          display: 'flex', justifyContent: cfg.position === 'right' ? 'flex-end' : 'flex-start',
        }}>
          <div style={{
            width: 300, background: bg, color: ink, border: `1px solid ${line}`,
            borderRadius: cfg.radius, overflow: 'hidden',
            boxShadow: '0 18px 60px rgba(15,23,42,.20)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 11, background: panel, borderBottom: `1px solid ${line}` }}>
              <span style={{
                width: 30, height: 30, borderRadius: rs, background: cfg.signal,
                color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13,
              }}>{cfg.logo || 'N'}</span>
              <b style={{ fontSize: 14 }}>{cfg.name || 'Nalar'}</b>
              <span style={{ marginLeft: 'auto', color: mut, fontSize: 18, lineHeight: 1 }}>×</span>
            </div>

            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 9, minHeight: 150 }}>
              {cfg.greeting && (
                <div style={{ alignSelf: 'stretch', background: dark ? '#1E293B' : '#fff', border: `1px solid ${line}`, padding: '11px 13px', borderRadius: rs, fontSize: 13 }}>
                  {cfg.greeting}
                </div>
              )}
              <div style={{
                alignSelf: 'flex-end', maxWidth: '85%', background: cfg.signal, color: '#fff',
                padding: '9px 12px', borderRadius: rs, borderBottomRightRadius: 3, fontSize: 13,
              }}>Berapa lama garansi produk Pro?</div>
              <div style={{ alignSelf: 'stretch', background: dark ? '#1E293B' : '#fff', border: `1px solid ${line}`, padding: '11px 13px', borderRadius: rs, fontSize: 13, lineHeight: 1.55 }}>
                Garansi produk Pro adalah 24 bulan sejak pembelian
                <span style={{
                  fontFamily: 'ui-monospace,monospace', fontSize: '.7em', fontWeight: 700,
                  color: cfg.source, border: `1px solid ${cfg.source}55`, borderRadius: 3,
                  padding: '0 4px', margin: '0 2px',
                }}>1</span>.
                {cfg.showTrace && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${line}`, color: mut, fontSize: 11, fontFamily: 'ui-monospace,monospace' }}>
                    garansi.pdf · 0.87
                  </div>
                )}
              </div>
            </div>

            <div style={{ padding: 10, borderTop: `1px solid ${line}`, display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, border: `1px solid ${line}`, borderRadius: rs, padding: '8px 10px', color: mut, fontSize: 13 }}>Tulis pesan…</div>
              <span style={{ background: cfg.signal, color: '#fff', borderRadius: rs, padding: '8px 12px', fontSize: 13, fontWeight: 600 }}>Kirim</span>
            </div>
          </div>
        </div>

        <p className="microlabel" style={{ marginTop: 14, textAlign: 'center' }}>
          TIRUAN TAMPILAN · COBA YANG ASLI DI HALAMAN DEMO
        </p>
      </div>
    </div>
  );
}

function Snippet({ publicKey }: { publicKey: string }) {
  const toast = useToast();
  const code = `<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/embed.js"\n        data-chatbot="${publicKey}"></script>`;
  return (
    <div className="card">
      <div className="panel-head"><span className="t">pasang di situs</span>
        <a className="btn btn-sm btn-ghost" href={`/demo/${publicKey}`} target="_blank" rel="noreferrer">Coba widget asli</a></div>
      <div className="card-pad stack gap-2">
        <textarea className="textarea mono" readOnly rows={3} value={code}
          onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 12 }} />
        <button className="btn btn-sm" onClick={() => {
          navigator.clipboard?.writeText(code).then(() => toast('Snippet disalin'));
        }}>Salin snippet</button>
        <p className="microlabel">TEMA DI-CACHE 5 MENIT DI SISI PENGUNJUNG</p>
      </div>
    </div>
  );
}

/** Gate plan (D14): halaman ini fitur berbayar — Free melihat ajakan upgrade
 *  yang menjelaskan apa yang dibuka, bukan sekadar penolakan. */
export default function BrandingPage() {
  return (
    <FeatureGate feature="branding" title="Branding & white-label widget"
      benefit="Pasang logo, warna, sapaan, dan gaya widget chat sesuai identitas tiap divisi — tampil di situs pelangganmu tanpa jejak merek kami.">
      <BrandingPageInner />
    </FeatureGate>
  );
}
