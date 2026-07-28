'use client';

import { use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApi } from '../../../../_lib/api';
import { Skeleton, ErrorState } from '../../../../_components/ui';

/**
 * HALAMAN BAYAR QRIS — MILIK SENDIRI (D12): QR digambar di sini memakai
 * design system, TIDAK redirect ke halaman gateway. Status di-poll tiap
 * 3 dtk (webhook yang menandai paid; poll juga menarik status provider
 * sebagai pelindung). qr_string digambar lokal via `qrcode`; bila provider
 * hanya memberi URL gambar, itu fallback-nya.
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

  // gambar QR dari qr_string — halaman kita, gaya kita
  useEffect(() => {
    if (!data?.qrString || !canvasRef.current || data.status !== 'pending') return;
    void import('qrcode').then((QR) =>
      QR.toCanvas(canvasRef.current!, data.qrString!, {
        width: 280, margin: 2,
        color: { dark: '#0F172A', light: '#FFFFFF' },
      }));
  }, [data?.qrString, data?.status]);

  if (error) return <div className="card"><ErrorState message={error} onRetry={refetch} /></div>;
  if (!data) return <div className="card"><Skeleton rows={4} /></div>;

  return (
    <div className="pay-wrap">
      <div className="card pay-card">
        <div className="panel-head">
          <span className="t">pembayaran qris</span>
          <span className="badge">{data.provider}</span>
        </div>
        <div className="card-pad stack gap-4" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div>
            <span className="microlabel">PLAN {data.plan.toUpperCase()} · {data.months} BULAN</span>
            <div className="pay-amount">{rupiah(data.amount)}</div>
          </div>

          {data.status === 'pending' && (
            <>
              <div className="pay-qrbox">
                {data.qrString
                  ? <canvas ref={canvasRef} />
                  : data.qrImageUrl
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={data.qrImageUrl} alt="QRIS" width={280} height={280} />
                    : <span className="microlabel">QR TIDAK TERSEDIA — COBA BUAT ULANG</span>}
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 13.5, maxWidth: 380, lineHeight: 1.6 }}>
                Pindai dengan aplikasi pembayaran apa pun yang mendukung <b>QRIS</b>
                {' '}(GoPay, OVO, DANA, ShopeePay, mobile banking). Halaman ini
                memperbarui dirinya otomatis begitu pembayaran masuk.
              </p>
              <div className="cluster gap-2" style={{ justifyContent: 'center' }}>
                <span className="badge badge-signal"><span className="led led-live" />menunggu pembayaran</span>
                {left !== null && (
                  <span className="mono" style={{ fontSize: 13, color: left < 120 ? 'var(--danger)' : 'var(--muted)' }}>
                    {String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}
                  </span>
                )}
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
      `}</style>
    </div>
  );
}
