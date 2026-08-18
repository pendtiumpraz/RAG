'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../_lib/api';
import { useDialogFokus, useToast } from './ui';

/**
 * MODAL "METODE PEMBAYARAN" (langkah 1 alur bayar) — meniru alur stoodio:
 * setelah user pilih paket & tekan bayar, tampilkan ringkasan paket + Total
 * bayar + daftar channel AKTIF dari TriPay (/api/payments/channels). Pilih
 * satu → "Bayar sekarang" membuat transaksi (POST /api/payments dengan
 * method=kode channel) lalu pindah ke /billing/pay/{id} (langkah 2:
 * "Selesaikan pembayaran").
 *
 * Channel belum termuat → "Memuat metode pembayaran…". Bila gateway aktif
 * bukan TriPay (channel kosong), jatuh ke satu opsi QRIS default (kode
 * 'QRIS2', backward-compatible).
 */

interface Channel { code: string; name: string; group: string; icon_url: string | null; fee_customer: unknown }

const QRIS_FALLBACK: Channel = { code: 'QRIS2', name: 'QRIS', group: 'E-Wallet', icon_url: null, fee_customer: null };
const rupiah = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

export function PayChannelModal({ plan, months, interval, amount, onClose }: {
  plan: string;
  months: number;
  interval?: 'monthly' | 'yearly';
  amount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const ref = useDialogFokus(onClose);
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ success: boolean; error?: string; channels: Channel[] }>('/api/payments/channels')
      .then((r) => {
        if (!alive) return;
        const list = r.channels.length ? r.channels : [QRIS_FALLBACK];
        setChannels(list);
        if (list.length === 1) setSel(list[0].code); // satu-satunya → pilih otomatis
      })
      .catch((e) => {
        if (!alive) return;
        // gateway belum aktif (503) → tetap izinkan QRIS default, jangan buntu
        setChannels([QRIS_FALLBACK]); setSel(QRIS_FALLBACK.code);
        setErr((e as Error).message);
      });
    return () => { alive = false; };
  }, []);

  const durasi = interval === 'yearly' ? '1 tahun' : `${months} bulan`;

  async function bayar() {
    if (!sel) return;
    setBusy(true);
    try {
      const r = await api<{ id: string }>('/api/payments', {
        method: 'POST',
        body: JSON.stringify({ plan, months, ...(interval ? { interval } : {}), method: sel }),
      });
      router.push(`/billing/pay/${r.id}`);
    } catch (e) { toast((e as Error).message, 'error'); setBusy(false); }
  }

  return (
    <>
      <div className="backdrop show" onClick={onClose} aria-hidden />
      <aside ref={ref} className="paych" role="dialog" aria-modal="true" aria-label="Metode pembayaran">
        <div className="paych-h">
          <h3>Metode pembayaran</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup">×</button>
        </div>

        <div className="paych-b stack gap-4">
          <div className="paych-sum">
            <div className="cluster" style={{ justifyContent: 'space-between' }}>
              <span style={{ textTransform: 'capitalize' }}>Paket <b>{plan}</b></span>
              <span className="microlabel">{durasi.toUpperCase()}</span>
            </div>
            <div className="cluster" style={{ justifyContent: 'space-between', marginTop: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Total bayar</span>
              <b className="mono" style={{ fontSize: 20, letterSpacing: '-.01em' }}>{rupiah(amount)}</b>
            </div>
          </div>

          <div className="stack gap-2">
            <span className="microlabel">METODE PEMBAYARAN</span>
            {channels === null ? (
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>Memuat metode pembayaran…</p>
            ) : (
              <div className="stack gap-2">
                {err && <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>{err} — pakai QRIS default.</p>}
                {channels.map((c) => (
                  <button type="button" key={c.code}
                    className={`paych-ch${sel === c.code ? ' on' : ''}`}
                    aria-pressed={sel === c.code}
                    onClick={() => setSel(c.code)}>
                    {c.icon_url
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={c.icon_url} alt="" width={30} height={30} style={{ objectFit: 'contain' }} />
                      : <span className="paych-ic">QR</span>}
                    <span className="paych-nm">{c.name}</span>
                    <span className="paych-rd" aria-hidden />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="paych-f">
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`}
            disabled={busy || !sel} onClick={bayar}>Bayar sekarang</button>
          <button className="btn btn-ghost" onClick={onClose}>Batal</button>
        </div>

        <style>{`
          .paych{ position:fixed; z-index:50; top:50%; left:50%; transform:translate(-50%,-50%);
            width:min(440px,calc(100vw - 32px)); max-height:calc(100vh - 48px); overflow:auto;
            background:var(--card); border:1px solid var(--line); border-radius:var(--rad-lg);
            box-shadow:var(--pop); display:flex; flex-direction:column; }
          .paych-h{ display:flex; align-items:center; justify-content:space-between;
            padding:var(--sp-4) var(--sp-5); border-bottom:1px solid var(--line); }
          .paych-h h3{ margin:0; font-family:var(--font-display); font-size:17px; letter-spacing:-.01em; }
          .paych-b{ padding:var(--sp-5); }
          .paych-f{ padding:var(--sp-4) var(--sp-5); border-top:1px solid var(--line); display:flex; gap:var(--sp-3); }
          .paych-sum{ background:var(--card-2); border:1px solid var(--line); border-radius:var(--rad-md); padding:14px 16px; }
          .paych-ch{ display:flex; align-items:center; gap:12px; width:100%; text-align:left; cursor:pointer;
            padding:11px 13px; background:var(--card); border:1px solid var(--line); border-radius:var(--rad-md);
            color:var(--ink); transition:border-color .15s, background .15s; }
          .paych-ch:hover{ border-color:var(--faint); background:var(--card-2); }
          .paych-ch.on{ border-color:var(--signal); background:var(--tint-signal); }
          .paych-ic{ width:30px; height:30px; display:grid; place-items:center; border-radius:6px;
            background:var(--tint-signal); color:var(--signal); font-family:var(--font-mono); font-size:11px; font-weight:700; }
          .paych-nm{ flex:1; font-size:14px; font-weight:600; }
          .paych-rd{ width:18px; height:18px; border-radius:50%; border:2px solid var(--line); flex:none; }
          .paych-ch.on .paych-rd{ border-color:var(--signal); background:radial-gradient(circle at center, var(--signal) 0 5px, transparent 6px); }
        `}</style>
      </aside>
    </>
  );
}
