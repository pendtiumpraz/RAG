'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../_lib/api';
import { useEntitlements } from '../../_components/entitlements';
import { Skeleton, useToast } from '../../_components/ui';

/**
 * ONBOARDING — pilih paket setelah akun disetujui (D14).
 *
 * SENGAJA BISA DILEWATI. Hard-wall di depan membunuh konversi: orang tak
 * membayar produk yang belum pernah dilihatnya bekerja. Free tetap
 * fungsional (chat + KB + 1 chatbot); yang dikunci hanya kemampuan yang
 * baru terasa perlu setelah produknya dipakai serius.
 */

const PERKS: Record<string, string[]> = {
  free: [
    '1 chatbot + 1 knowledge base',
    '1.000 pesan/bulan',
    'Jawaban bersitasi + widget embed',
    'Riwayat percakapan',
  ],
  pro: [
    'Semua di Free, plus:',
    '10 chatbot · 50.000 pesan/bulan · 15 anggota',
    'Analitik per chatbot & Memory agent',
    'Branding/white-label widget',
    'Kelola tim & peran (RBAC)',
  ],
  enterprise: [
    'Semua di Pro, plus:',
    'Chatbot, pesan, dan anggota tanpa batas',
    'Monitoring pemakaian & biaya rinci',
    'Dukungan prioritas',
  ],
};

const rupiah = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

export default function WelcomePage() {
  const router = useRouter();
  const toast = useToast();
  const { data: ent, loading } = useEntitlements();
  const [busy, setBusy] = useState<string | null>(null);

  if (loading || !ent) return <div className="card"><Skeleton rows={4} /></div>;

  async function buy(plan: string) {
    setBusy(plan);
    try {
      const r = await api<{ id: string }>('/api/payments', {
        method: 'POST', body: JSON.stringify({ plan, months: 1 }),
      });
      router.push(`/billing/pay/${r.id}`);
    } catch (e) { toast((e as Error).message, 'error'); setBusy(null); }
  }

  return (
    <div className="wlc">
      <header>
        <span className="microlabel">SELAMAT DATANG DI NALAR</span>
        <h1>Pilih paket untuk memulai</h1>
        <p>Mulai gratis sekarang juga — semua fitur inti sudah bisa dipakai.
          Naikkan paket kapan pun saat tim atau volumemu bertambah.</p>
      </header>

      <div className="wlc-plans">
        {(['free', 'pro', 'enterprise'] as const).map((p) => {
          const price = ent.planPrices?.[p];
          const current = ent.plan === p;
          return (
            <div key={p} className={`wlc-plan${p === 'pro' ? ' hot' : ''}`}>
              {p === 'pro' && <span className="tag">PALING SESUAI UNTUK TIM</span>}
              <h2>{p}</h2>
              <div className="price">
                {p === 'free' ? 'Gratis' : price ? rupiah(price) : '—'}
                {p !== 'free' && price ? <small>/bulan</small> : null}
              </div>
              <ul>{PERKS[p].map((x, i) => <li key={i}>{x}</li>)}</ul>
              {current ? (
                <button className="btn" disabled>Paket aktifmu</button>
              ) : p === 'free' ? (
                <button className="btn" onClick={() => router.push('/dashboard')}>Lanjut dengan Free</button>
              ) : ent.canUpgrade ? (
                <button className={`btn btn-primary${busy === p ? ' is-loading' : ''}`}
                  disabled={!!busy} onClick={() => buy(p)}>Bayar QRIS</button>
              ) : (
                <button className="btn" disabled title="Pembayaran belum aktif">Hubungi pengelola</button>
              )}
            </div>
          );
        })}
      </div>

      <footer>
        <button className="btn btn-ghost" onClick={() => router.push('/dashboard')}>
          Lewati — jelajahi dulu dengan paket Free →
        </button>
      </footer>

      <style>{`
        .wlc{ max-width:1000px; margin:0 auto; }
        .wlc header{ text-align:center; margin-bottom:var(--sp-6); }
        .wlc h1{ font-family:var(--font-display); font-size:clamp(26px,3.4vw,34px);
          letter-spacing:-.025em; margin:10px 0 8px; }
        .wlc header p{ color:var(--muted); font-size:15px; line-height:1.7; max-width:52ch; margin:0 auto; }
        .wlc-plans{ display:grid; grid-template-columns:repeat(3,1fr); gap:var(--sp-4); }
        @media(max-width:900px){ .wlc-plans{ grid-template-columns:1fr; } }
        .wlc-plan{ position:relative; background:var(--card); border:1px solid var(--line);
          border-radius:var(--rad-lg); padding:26px 22px; display:flex; flex-direction:column; gap:14px; }
        .wlc-plan.hot{ border-color:var(--signal); box-shadow:0 10px 30px color-mix(in srgb,var(--signal) 14%,transparent); }
        .wlc-plan .tag{ position:absolute; top:-10px; left:22px; background:var(--signal); color:#fff;
          font-family:var(--font-mono); font-size:9.5px; letter-spacing:.1em; padding:4px 10px; border-radius:999px; }
        .wlc-plan h2{ font-family:var(--font-display); font-size:17px; text-transform:uppercase;
          letter-spacing:.06em; margin:0; color:var(--muted); }
        .wlc-plan .price{ font-family:var(--font-display); font-size:30px; font-weight:800; letter-spacing:-.02em; }
        .wlc-plan .price small{ font-size:13px; font-weight:600; color:var(--muted); margin-left:4px; }
        .wlc-plan ul{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:9px;
          font-size:13.5px; line-height:1.5; color:var(--muted); flex:1; }
        .wlc-plan li{ position:relative; padding-left:19px; }
        .wlc-plan li::before{ content:''; position:absolute; left:0; top:.5em; width:8px; height:2px;
          border-radius:1px; background:var(--signal); }
        .wlc footer{ text-align:center; margin-top:var(--sp-5); }
      `}</style>
    </div>
  );
}
