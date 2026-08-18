'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEntitlements, SKIP_ONBOARD_KEY } from '../../_components/entitlements';
import { Skeleton } from '../../_components/ui';
import { PayChannelModal } from '../../_components/pay-channel-modal';
import { PLAN_LIMITS } from '@/modules/core/limits';

/**
 * ONBOARDING — pilih paket setelah akun disetujui (D14).
 *
 * SENGAJA BISA DILEWATI. Hard-wall di depan membunuh konversi: orang tak
 * membayar produk yang belum pernah dilihatnya bekerja. Free tetap
 * fungsional (chat + KB + 1 chatbot); yang dikunci hanya kemampuan yang
 * baru terasa perlu setelah produknya dipakai serius.
 */

/**
 * Isi kartu paket — ANGKANYA DIBACA DARI PLAN_LIMITS, bukan diketik.
 *
 * Sebelum ini ketiganya salah, dan salahnya ke arah yang paling merugikan:
 * halaman ini menjanjikan Free 1.000 pesan/bulan (sebenarnya 10), Pro 50.000
 * (sebenarnya 5.000), dan Enterprise "pesan tanpa batas" (sebenarnya 50.000).
 * Ini halaman tempat orang memutuskan membayar, jadi angka yang salah di sini
 * bukan cuma keliru — ia janji yang ditagih balik oleh produknya sendiri
 * beberapa hari kemudian.
 *
 * Angka yang diketik tangan selalu berakhir begini: batasnya disesuaikan di
 * limits.ts, dan tak ada apa pun yang memberi tahu halaman ini.
 */
const angka = (n: number) => (Number.isFinite(n) ? n.toLocaleString('id-ID') : 'tanpa batas');

function batasPaket(plan: 'free' | 'pro' | 'enterprise'): string[] {
  const l = PLAN_LIMITS[plan];
  return [
    `${angka(l.maxChatbots)} chatbot · ${angka(l.maxKnowledgeBases)} knowledge base`,
    `${angka(l.messagesPerMonth)} pesan/bulan`,
    `${angka(l.maxMembers)} anggota tim`,
  ];
}

/** Kemampuan (bukan angka) — ini memang keputusan produk, bukan turunan kode. */
const KEMAMPUAN: Record<string, string[]> = {
  free: [
    'Jawaban bersitasi + widget embed',
    'Riwayat percakapan',
  ],
  pro: [
    'Analitik per chatbot & Memory agent',
    'Branding/white-label widget',
    'Kelola tim & peran (RBAC)',
  ],
  enterprise: [
    'Monitoring pemakaian & biaya rinci',
    'Dukungan prioritas',
  ],
};

const rupiah = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

export default function WelcomePage() {
  const router = useRouter();
  const { data: ent, loading } = useEntitlements();
  // paket berbayar dipilih → buka modal "Metode pembayaran" (langkah 1)
  const [pay, setPay] = useState<{ plan: string; amount: number } | null>(null);

  if (loading || !ent) return <div className="card"><Skeleton rows={4} /></div>;

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
              <ul>
                {batasPaket(p).map((x) => <li key={x}>{x}</li>)}
                {KEMAMPUAN[p].map((x) => <li key={x}>{x}</li>)}
              </ul>
              {current ? (
                <button className="btn" disabled>Paket aktifmu</button>
              ) : p === 'free' ? (
                <button className="btn" onClick={() => { sessionStorage.setItem(SKIP_ONBOARD_KEY, '1'); router.push('/dashboard'); }}>Lanjut dengan Free</button>
              ) : ent.canUpgrade ? (
                <button className="btn btn-primary"
                  onClick={() => setPay({ plan: p, amount: price ?? 0 })}>Bayar QRIS</button>
              ) : (
                <button className="btn" disabled title="Pembayaran belum aktif">Hubungi pengelola</button>
              )}
            </div>
          );
        })}
      </div>

      <footer>
        <button className="btn btn-ghost" onClick={() => { sessionStorage.setItem(SKIP_ONBOARD_KEY, '1'); router.push('/dashboard'); }}>
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

      {pay && (
        <PayChannelModal plan={pay.plan} months={1} amount={pay.amount} onClose={() => setPay(null)} />
      )}
    </div>
  );
}
