'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApi } from '../../../../_lib/api';
import { Skeleton, ErrorState } from '../../../../_components/ui';

/**
 * HALAMAN BAYAR QRIS — MILIK SENDIRI (D12): QR ditampilkan di sini memakai
 * design system, TIDAK redirect ke halaman gateway. Status di-poll tiap
 * 3 dtk (webhook yang menandai paid; poll juga menarik status provider
 * sebagai pelindung).
 *
 * Sumber QR UTAMA adalah `qr_string` (payload QRIS resmi dari TriPay). Kita
 * gambar sendiri via `qrcode` pada error-correction level H (recovery ~30%),
 * lalu menumpuk LOGO QRIS resmi di tengah — inilah "QRIS berlogo" yang benar.
 * `qr_url` TriPay hanyalah QR polos hitam-putih tanpa logo, jadi kini cuma
 * dipakai sebagai fallback bila `qr_string` tak tersedia. QR tetap valid
 * dipindai: EC level H menoleransi logo kecil di tengah.
 */

interface Payment {
  id: string; plan: string; months: number; amount: number; provider: string;
  status: 'pending' | 'paid' | 'expired' | 'failed';
  qrString: string | null; qrImageUrl: string | null;
  expiresAt: string | null; paidAt: string | null;
}

const rupiah = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

export default function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, refetch } = useApi<Payment>(`/api/payments/${id}`);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [left, setLeft] = useState<number | null>(null);

  // poll status — berhenti begitu final
  useEffect(() => {
    if (!data || data.status !== 'pending') return;
    const t = setInterval(refetch, 3000);
    return () => clearInterval(t);
  }, [data, refetch]);

  // hitung mundur kedaluwarsa
  useEffect(() => {
    if (!data?.expiresAt || data.status !== 'pending') { setLeft(null); return; }
    const tick = () => setLeft(Math.max(0, Math.floor((new Date(data.expiresAt!).getTime() - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data?.expiresAt, data?.status]);

  // gambar QRIS berlogo dari qr_string: QR (EC level H) + logo QRIS di tengah
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data?.qrString || data.status !== 'pending') return;
    let cancelled = false;
    void import('qrcode').then(async (QR) => {
      if (cancelled) return;
      // EC level H → recovery ~30%, cukup untuk menutup logo kecil di tengah
      await QR.toCanvas(canvas, data.qrString!, {
        errorCorrectionLevel: 'H', width: 320, margin: 2,
        color: { dark: '#0F172A', light: '#FFFFFF' },
      });
      if (cancelled) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const logo = new Image();
      logo.onload = () => {
        if (cancelled) return;
        const W = canvas.width;               // kanvas persegi (W === H)
        const lw = W * 0.28;                  // lebar logo 28% dari QR
        const lh = lw / (logo.width / logo.height);
        const pad = W * 0.035;                // bantalan putih sekeliling logo
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect((W - lw) / 2 - pad, (W - lh) / 2 - pad, lw + pad * 2, lh + pad * 2);
        ctx.drawImage(logo, (W - lw) / 2, (W - lh) / 2, lw, lh);
      };
      logo.src = '/qris-logo.svg';
    });
    return () => { cancelled = true; };
  }, [data?.qrString, data?.status]);

  if (error) return <div className="card"><ErrorState message={error} onRetry={refetch} /></div>;
  if (!data) return <div className="card"><Skeleton rows={4} /></div>;

  return (
    <div className="pay-wrap">
      <div className="card pay-card">
        <div className="panel-head">
          <span className="t">selesaikan pembayaran</span>
          {/* ponytail: metode selalu QRIS (sistem ini QRIS-only). Bila kelak
              channel non-QRIS (VA/e-wallet) ditambah, simpan `method` di row
              payments dan tampilkan namanya di sini. */}
          <span className="badge badge-signal">QRIS</span>
        </div>
        <div className="card-pad stack gap-4" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div>
            <span className="microlabel">PLAN {data.plan.toUpperCase()} · {data.months} BULAN · METODE QRIS</span>
            <div className="pay-amount">{rupiah(data.amount)}</div>
          </div>

          {data.status === 'pending' && (
            <>
              <div className="pay-qrbox">
                {data.qrString
                  ? <canvas ref={canvasRef} style={{ width: 280, height: 280 }} />
                  : data.qrImageUrl
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={data.qrImageUrl} alt="QRIS" width={280} height={280} style={{ objectFit: 'contain' }} />
                    : <span className="microlabel">QR TIDAK TERSEDIA — COBA BUAT ULANG</span>}
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 13.5, maxWidth: 380, lineHeight: 1.6 }}>
                Pindai dengan aplikasi e-wallet atau mobile banking mana pun
                {' '}yang mendukung <b>QRIS</b> (GoPay, OVO, DANA, ShopeePay,
                {' '}mobile banking).
              </p>
              {left !== null && (
                <div className="pay-timer mono" style={{ color: left < 120 ? 'var(--danger)' : 'var(--ink)' }}>
                  {String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}
                </div>
              )}
              {/* blok status/log — kepastian bahwa kuota masuk sendiri */}
              <div className="pay-log">
                <span className="badge badge-signal"><span className="led led-live" />menunggu pembayaran</span>
                <p>Menunggu pembayaran — kuota masuk otomatis begitu dana diterima.
                  Halaman ini memperbarui dirinya sendiri, tak perlu di-refresh.</p>
              </div>
            </>
          )}

          {data.status === 'paid' && (
            <>
              <div className="pay-done ok">✓</div>
              <b style={{ fontSize: 18 }}>Pembayaran diterima</b>
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>
                Plan <b>{data.plan}</b> aktif {data.months} bulan sejak sekarang.
                Kuota barumu langsung berlaku.
              </p>
              <Link className="btn btn-primary" href="/billing">Kembali ke Billing</Link>
            </>
          )}

          {(data.status === 'expired' || data.status === 'failed') && (
            <>
              <div className="pay-done bad">×</div>
              <b style={{ fontSize: 18 }}>{data.status === 'expired' ? 'QR kedaluwarsa' : 'Pembayaran gagal'}</b>
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>
                Tidak ada dana yang tertagih. Buat tagihan baru dari halaman Billing.
              </p>
              <Link className="btn btn-primary" href="/billing">Kembali ke Billing</Link>
            </>
          )}
        </div>
      </div>

      <style>{`
        .pay-wrap{ display:flex; justify-content:center; padding-top:2vh; }
        .pay-card{ width:100%; max-width:480px; }
        .pay-amount{ font-family:var(--font-display); font-size:34px; font-weight:800;
          letter-spacing:-.02em; margin-top:6px; }
        .pay-qrbox{ background:#fff; border:1px solid var(--line); border-radius:var(--rad-lg);
          padding:14px; box-shadow:var(--pop); }
        .pay-qrbox canvas, .pay-qrbox img{ display:block; }
        .pay-done{ width:64px; height:64px; border-radius:50%; display:grid; place-items:center;
          font-size:34px; font-weight:800; }
        .pay-done.ok{ background:var(--tint-good); color:var(--good); }
        .pay-done.bad{ background:var(--tint-danger); color:var(--danger); }
        .pay-timer{ font-family:var(--font-display); font-size:26px; font-weight:800; letter-spacing:.02em; }
        .pay-log{ width:100%; max-width:400px; background:var(--card-2); border:1px solid var(--line);
          border-radius:var(--rad-md); padding:12px 14px; display:flex; flex-direction:column;
          align-items:center; gap:8px; }
        .pay-log p{ margin:0; color:var(--muted); font-size:12.5px; line-height:1.6; }
      `}</style>
    </div>
  );
}
