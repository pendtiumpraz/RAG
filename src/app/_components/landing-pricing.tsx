'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PLAN_LIMITS } from '@/modules/core/limits';

/**
 * PRICING landing — 3 kartu (Free/Pro/Enterprise) dengan toggle Bulanan/Tahunan.
 *
 * Harga jual DIBACA dari server (planPrices di DB, plus turunan tahunannya),
 * bukan diketik di sini — biar tak pernah berbohong saat superadmin mengubahnya.
 * Kuota per kartu diturunkan dari PLAN_LIMITS (sumber tunggal, sama seperti
 * halaman /welcome). Tombol paket berbayar membawa pilihan ke /auth agar
 * register langsung tahu paket & interval yang diinginkan.
 */

const angka = (n: number) => (Number.isFinite(n) ? n.toLocaleString('id-ID') : 'tanpa batas');
const rupiah = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

function batas(plan: 'free' | 'pro' | 'enterprise'): string[] {
  const l = PLAN_LIMITS[plan];
  return [
    `${angka(l.maxChatbots)} chatbot · ${angka(l.maxKnowledgeBases)} knowledge base`,
    `${angka(l.messagesPerMonth)} pesan/bulan`,
    `${angka(l.maxMembers)} anggota tim`,
  ];
}

const KEMAMPUAN: Record<string, string[]> = {
  free: ['Jawaban bersitasi + widget embed', 'Riwayat percakapan'],
  pro: ['Analitik per chatbot & Memory agent', 'Branding/white-label widget', 'Kelola tim & peran (RBAC)'],
  enterprise: ['Monitoring pemakaian & biaya rinci', 'Dukungan prioritas'],
};

const PLANS = ['free', 'pro', 'enterprise'] as const;

export function LandingPricing({ monthly, yearly }: {
  monthly: Record<string, number>;
  yearly: Record<string, number>;
}) {
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const tahunan = interval === 'yearly';

  return (
    <section className="lp-wrap" id="harga">
      <div className="lp-sec">
        <span className="lp-eyebrow">HARGA</span>
        <h2 className="lp-h2">Pilih paket sesuai skala timmu</h2>
        <p className="lp-sub">
          Mulai gratis tanpa kartu kredit. Naikkan paket kapan pun — bayar
          bulanan, atau <b>tahunan dan hemat 20%</b>.
        </p>

        <div className="lpp-toggle" role="tablist" aria-label="Interval penagihan">
          <button type="button" role="tab" aria-selected={!tahunan}
            className={!tahunan ? 'on' : ''} onClick={() => setInterval('monthly')}>Bulanan</button>
          <button type="button" role="tab" aria-selected={tahunan}
            className={tahunan ? 'on' : ''} onClick={() => setInterval('yearly')}>Tahunan <span className="lpp-off">−20%</span></button>
        </div>

        <div className="lpp-grid">
          {PLANS.map((p) => {
            const price = tahunan ? yearly[p] : monthly[p];
            const hemat = tahunan && monthly[p] ? monthly[p] * 12 - yearly[p] : 0;
            const href = p === 'free' ? '/auth' : `/auth?plan=${p}&interval=${interval}`;
            return (
              <div key={p} className={`lpp-card${p === 'pro' ? ' hot' : ''}`}>
                {p === 'pro' && <span className="lpp-tag">PALING SESUAI UNTUK TIM</span>}
                <h3>{p}</h3>
                <div className="lpp-price">
                  {p === 'free' ? 'Gratis' : price ? rupiah(price) : '—'}
                  {p !== 'free' && price ? <small>{tahunan ? '/tahun' : '/bulan'}</small> : null}
                </div>
                <p className="lpp-hemat">
                  {p === 'free'
                    ? 'Selamanya — untuk mencoba'
                    : tahunan && hemat > 0
                      ? `Hemat ${rupiah(hemat)} setahun`
                      : 'Tagih tiap bulan, batalkan kapan saja'}
                </p>
                <ul>
                  {batas(p).map((x) => <li key={x}>{x}</li>)}
                  {KEMAMPUAN[p].map((x) => <li key={x}>{x}</li>)}
                </ul>
                <Link className={`btn btn-lg${p === 'pro' ? ' btn-primary' : ''}`} href={href} style={{ width: '100%', justifyContent: 'center' }}>
                  {p === 'free' ? 'Mulai gratis' : `Pilih ${p}`}
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .lpp-toggle{ display:inline-flex; gap:4px; margin:0 auto 26px; padding:4px;
          background:var(--card-2); border:1px solid var(--line); border-radius:999px; }
        .lpp-toggle button{ border:0; background:transparent; cursor:pointer; padding:8px 18px;
          border-radius:999px; font-size:13.5px; font-weight:600; color:var(--muted);
          display:inline-flex; align-items:center; gap:7px; }
        .lpp-toggle button.on{ background:var(--signal); color:#fff; }
        .lpp-off{ font-family:var(--font-mono); font-size:10px; letter-spacing:.06em;
          background:var(--source); color:#fff; border-radius:999px; padding:2px 7px; }
        .lpp-toggle button.on .lpp-off{ background:rgba(255,255,255,.25); }
        .lpp-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:var(--sp-4); text-align:left; }
        @media(max-width:900px){ .lpp-grid{ grid-template-columns:1fr; } }
        .lpp-card{ position:relative; background:var(--card); border:1px solid var(--line);
          border-radius:var(--rad-lg); padding:26px 22px; display:flex; flex-direction:column; gap:12px; }
        .lpp-card.hot{ border-color:var(--signal);
          box-shadow:0 10px 30px color-mix(in srgb,var(--signal) 14%,transparent); }
        .lpp-tag{ position:absolute; top:-10px; left:22px; background:var(--signal); color:#fff;
          font-family:var(--font-mono); font-size:9.5px; letter-spacing:.1em; padding:4px 10px; border-radius:999px; }
        .lpp-card h3{ font-family:var(--font-display); font-size:17px; text-transform:uppercase;
          letter-spacing:.06em; margin:0; color:var(--muted); }
        .lpp-price{ font-family:var(--font-display); font-size:30px; font-weight:800; letter-spacing:-.02em; }
        .lpp-price small{ font-size:13px; font-weight:600; color:var(--muted); margin-left:4px; }
        .lpp-hemat{ font-size:12.5px; color:var(--source); margin:-4px 0 4px; min-height:1.2em; }
        .lpp-card ul{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:9px;
          font-size:13.5px; line-height:1.5; color:var(--muted); flex:1; }
        .lpp-card li{ position:relative; padding-left:19px; }
        .lpp-card li::before{ content:''; position:absolute; left:0; top:.5em; width:8px; height:2px;
          border-radius:1px; background:var(--signal); }
      `}</style>
    </section>
  );
}
