'use client';

import Link from 'next/link';
import { useApi } from '../_lib/api';
import type { Feature } from '@/modules/core/limits';

/**
 * ENTITLEMENTS di sisi klien (D14) — hook + komponen gembok.
 * Sumbernya /api/entitlements; ini murni tampilan, penegakan tetap di
 * server tiap service (UI tak boleh jadi satu-satunya pagar).
 */

export interface Entitlements {
  /** true = pendaftar benar-benar baru (Free & belum punya chatbot) */
  shouldOnboard: boolean;
  plan: string;
  planOnPaper: string;
  expired: boolean;
  planExpiresAt: string | null;
  features: Feature[];
  featureMinPlan: Record<Feature, string>;
  canUpgrade: boolean;
  mode: 'saas' | 'onprem';
  /** superadmin platform — semua fitur terbuka utk pemeriksaan & demo */
  platformOperator: boolean;
  planPrices: Record<string, number>;
  usage: { messages: number; messagesLimit: number | null };
}

/** Penanda sesi: pengguna memilih menjelajah dulu — jangan tawarkan
 *  layar paket lagi sampai tab ditutup. */
export const SKIP_ONBOARD_KEY = 'nalar.skipWelcome';

export function useEntitlements() {
  return useApi<Entitlements>('/api/entitlements');
}

export function hasFeature(ent: Entitlements | null | undefined, f: Feature): boolean {
  return !!ent?.features.includes(f);
}

/** Ikon gembok kecil untuk item menu terkunci. */
export function LockIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * Pembungkus halaman premium: konten asli hanya dirender bila plan
 * mengizinkan; kalau tidak, tampil ajakan upgrade yang menjelaskan APA
 * yang dibuka — bukan sekadar "akses ditolak".
 */
export function FeatureGate({ feature, title, benefit, children }: {
  feature: Feature; title: string; benefit: string; children: React.ReactNode;
}) {
  const { data: ent, loading } = useEntitlements();
  if (loading || !ent) return null;
  if (hasFeature(ent, feature)) return <>{children}</>;

  const need = ent.featureMinPlan[feature] ?? 'pro';
  const price = ent.planPrices?.[need];

  return (
    <div className="card gate">
      <div className="card-pad">
        <span className="gate-badge"><LockIcon size={14} /> FITUR PLAN {need.toUpperCase()}</span>
        <h2>{title}</h2>
        <p>{benefit}</p>
        <div className="cluster gap-2" style={{ marginTop: 18 }}>
          {ent.canUpgrade
            ? <Link className="btn btn-primary" href="/billing">
                Upgrade ke {need}{price ? ` — Rp ${price.toLocaleString('id-ID')}/bln` : ''}
              </Link>
            : <span className="microlabel">HUBUNGI PENGELOLA UNTUK MENAIKKAN PLAN</span>}
          <Link className="btn" href="/dashboard">Kembali ke dashboard</Link>
        </div>
        <p className="gate-note">
          Plan aktifmu: <b>{ent.plan}</b>. Fitur inti — chat, knowledge base,
          dan riwayat percakapan — tetap terbuka di semua plan.
        </p>
      </div>
      <style>{`
        .gate{ max-width:620px; margin:6vh auto 0; }
        .gate .card-pad{ padding:34px; }
        .gate-badge{ display:inline-flex; align-items:center; gap:7px; font-family:var(--font-mono);
          font-size:11px; letter-spacing:.12em; color:var(--source);
          background:var(--tint-source); border-radius:var(--rad-pill); padding:5px 12px; }
        .gate h2{ font-family:var(--font-display); font-size:24px; letter-spacing:-.02em; margin:16px 0 8px; }
        .gate p{ color:var(--muted); font-size:14.5px; line-height:1.7; margin:0; }
        .gate-note{ margin-top:20px !important; padding-top:14px; border-top:1px solid var(--line);
          font-size:12.5px !important; }
      `}</style>
    </div>
  );
}
