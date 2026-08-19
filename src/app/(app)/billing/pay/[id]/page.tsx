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
 * Sumber QR UTAMA adalah `qrImageUrl` — GAMBAR QR resmi dari provider
 * (TriPay `qr_url`). Kita pakai langsung via <img>, tidak generate/render
 * sendiri. `qr_string` cuma fallback untuk provider yang tak memberi URL
 * gambar (mis. Xendit): di situ kita render QR polos via `qrcode`.
 *
 * CATATAN sandbox TriPay: di mode uji, TriPay mengembalikan `qr_string` =
 * "SANDBOX MODE" dan `qr_url` berisi QR placeholder yang BUKAN payload QRIS
 * nyata — e-wallet (GoPay/OVO/DANA) akan menolak dengan "Pastikan QR berlogo
 * QRIS". Karena itu: (1) fallback canvas TIDAK boleh menggambar payload non-QRIS,
 * (2) tampilkan peringatan jelas agar tak dikira bug render.
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

  // TriPay sandbox mengirim qr_string = "SANDBOX MODE" (bukan payload QRIS).
  // qrPayable = qr_string beneran bisa digambar & dibayar. isSandboxQr =
  // tanda gateway masih mode uji → QR tak akan diterima e-wallet nyata.
  const qrString = data?.qrString ?? null;
  const isSandboxQr = (qrString ?? '').trim().toUpperCase() === 'SANDBOX MODE';
  const qrPayable = !!qrString && qrString.trim() !== '' && !isSandboxQr;

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

  // fallback: render QR polos dari qr_string HANYA bila provider tak memberi
  // gambar resmi (qrImageUrl). TriPay selalu memberi qr_url → cabang ini idle.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data?.qrImageUrl || !qrPayable || data?.status !== 'pending') return;
    let cancelled = false;
    void import('qrcode').then((QR) => {
      if (cancelled) return;
      void QR.toCanvas(canvas, qrString!, {
        width: 320, margin: 2, color: { dark: '#0F172A', light: '#FFFFFF' },
      });
    });
    return () => { cancelled = true; };
  }, [data?.qrImageUrl, qrString, qrPayable, data?.status]);

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
                {data.qrImageUrl
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={data.qrImageUrl} alt="QRIS" width={320} height={320} style={{ objectFit: 'contain' }} />
                  : qrPayable
                    ? <canvas ref={canvasRef} style={{ width: 320, height: 320 }} />
                    : <span className="microlabel">QR TIDAK TERSEDIA — COBA BUAT ULANG</span>}
              </div>

              {isSandboxQr && (
                <div className="pay-sandbox">
                  <b>MODE UJI (SANDBOX)</b>
                  <p>QR ini dari TriPay <b>sandbox</b> — bukan QRIS nyata, jadi
                    {' '}GoPay/OVO/DANA menolaknya (&ldquo;Pastikan QR berlogo QRIS&rdquo;).
                    {' '}Aktifkan <b>TriPay Production</b> di Pengaturan Pembayaran agar QR bisa dibayar.</p>
                </div>
              )}
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
        .pay-sandbox{ width:100%; max-width:400px; background:var(--tint-danger);
          border:1px solid var(--danger); border-radius:var(--rad-md); padding:12px 14px;
          text-align:left; }
        .pay-sandbox b{ color:var(--danger); }
        .pay-sandbox p{ margin:6px 0 0; color:var(--ink); font-size:12.5px; line-height:1.6; }
      `}</style>
    </div>
  );
}
