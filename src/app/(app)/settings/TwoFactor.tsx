'use client';

import { useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { useToast, Field } from '../../_components/ui';

/**
 * DUA FAKTOR — pendaftaran, kode cadangan, dan mematikan.
 *
 * Tiga keadaan, bukan satu formulir:
 *   mati      → tombol "Nyalakan"
 *   mendaftar → QR + kolom kode; BELUM aktif sampai satu kode benar masuk
 *   aktif     → sisa kode cadangan + matikan (menuntut kata sandi)
 *
 * Kode cadangan ditampilkan SEKALI. Layarnya sengaja menahan pengguna dengan
 * satu centang "sudah saya simpan" — sesudah dialog ini tertutup, yang ada di
 * basis data hanya hash-nya, dan tak ada jalan menampilkannya lagi.
 */

interface Keadaan { aktif: boolean; sisaCadangan: number }
interface Daftar { rahasia: string; otpauth: string; qr: string | null }

export default function TwoFactor() {
  const { data, refetch } = useApi<Keadaan>('/api/auth/two-factor');
  const toast = useToast();
  const [daftar, setDaftar] = useState<Daftar | null>(null);
  const [kode, setKode] = useState('');
  const [cadangan, setCadangan] = useState<string[] | null>(null);
  const [tersimpan, setTersimpan] = useState(false);
  const [sandi, setSandi] = useState('');
  const [busy, setBusy] = useState(false);

  async function kirim<T>(body: object): Promise<T | null> {
    setBusy(true);
    try {
      return await api<T>('/api/auth/two-factor', { method: 'POST', body: JSON.stringify(body) });
    } catch (e) { toast((e as Error).message, 'error'); return null; }
    finally { setBusy(false); }
  }

  async function mulai() {
    const r = await kirim<Daftar>({ aksi: 'mulai' });
    if (r) { setDaftar(r); setKode(''); }
  }

  async function konfirmasi() {
    const r = await kirim<{ kodeCadangan: string[] }>({ aksi: 'konfirmasi', kode: kode.trim() });
    if (!r) return;
    setDaftar(null); setKode(''); setCadangan(r.kodeCadangan); setTersimpan(false);
    refetch();
  }

  async function matikan() {
    const r = await kirim<{ ok: boolean }>({ aksi: 'matikan', kataSandi: sandi });
    if (!r) return;
    setSandi(''); toast('Dua faktor dimatikan'); refetch();
  }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head"><span className="t">dua faktor (TOTP)</span>
        {data?.aktif
          ? <span className="badge badge-ok"><span className="led led-live" />aktif</span>
          : <span className="badge"><span className="led led-off" />mati</span>}</div>

      <div className="card-pad stack gap-4">
        {/* ── kode cadangan: ditampilkan SEKALI, sesudah konfirmasi ───── */}
        {cadangan && (
          <div className="stack gap-3" style={{
            border: '1px solid var(--warn, #F59E0B)', borderRadius: 8, padding: 'var(--sp-3)',
          }}>
            <b>Simpan kode cadangan ini sekarang.</b>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
              Masing-masing berlaku <b>sekali</b>, dan hanya inilah jalan masuk kalau
              ponselmu hilang. Setelah kotak ini tertutup, yang tersimpan hanya
              hash-nya — kami pun tak bisa menampilkannya lagi.
            </p>
            <div className="grid g2 mono" style={{ fontSize: 14, letterSpacing: '0.06em' }}>
              {cadangan.map((k) => <div key={k}>{k}</div>)}
            </div>
            <div className="cluster gap-2">
              <button className="btn" onClick={() => {
                navigator.clipboard?.writeText(cadangan.join('\n'));
                toast('Kode cadangan disalin');
              }}>Salin semua</button>
              <label className="cluster gap-2" style={{ cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={tersimpan} onChange={(e) => setTersimpan(e.target.checked)} />
                Sudah saya simpan di tempat aman
              </label>
              <button className="btn btn-primary" disabled={!tersimpan} onClick={() => setCadangan(null)}>
                Selesai
              </button>
            </div>
          </div>
        )}

        {/* ── pendaftaran ─────────────────────────────────────────────── */}
        {daftar && !cadangan && (
          <div className="cluster gap-4" style={{ alignItems: 'flex-start' }}>
            {daftar.qr && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={daftar.qr} alt="Kode QR pendaftaran dua faktor" width={220} height={220}
                style={{ border: '1px solid var(--line)', borderRadius: 8 }} />
            )}
            <div className="stack gap-3" style={{ flex: 1, minWidth: 260 }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                Pindai dengan Google Authenticator, 1Password, atau Authy. Tak bisa
                memindai? Ketik kunci ini secara manual:
              </p>
              <code className="mono" style={{
                display: 'block', wordBreak: 'break-all', fontSize: 13,
                background: 'var(--card-2)', padding: 8, borderRadius: 6,
              }}>{daftar.rahasia}</code>
              <Field label="Kode 6 digit dari aplikasi"><input className="input mono" inputMode="numeric" autoComplete="one-time-code"
                  placeholder="000000" value={kode} maxLength={8}
                  onChange={(e) => setKode(e.target.value.replace(/[^0-9]/g, ''))} /></Field>
              <div className="cluster gap-2">
                <button className={`btn btn-primary${busy ? ' is-loading' : ''}`}
                  disabled={busy || kode.length < 6} onClick={konfirmasi}>Aktifkan</button>
                <button className="btn" disabled={busy} onClick={() => setDaftar(null)}>Batal</button>
              </div>
              <p className="microlabel">
                BELUM AKTIF SAMPAI SATU KODE YANG BENAR MASUK — SALAH PINDAI TIDAK MENGUNCIMU.
              </p>
            </div>
          </div>
        )}

        {/* ── mati ────────────────────────────────────────────────────── */}
        {!data?.aktif && !daftar && !cadangan && (
          <div className="stack gap-3">
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
              Setelah aktif, login meminta satu kode 6 digit dari aplikasi
              authenticator selain kata sandi. Berlaku untuk <b>akun ini saja</b>.
            </p>
            <div><button className={`btn btn-primary${busy ? ' is-loading' : ''}`}
              disabled={busy} onClick={mulai}>Nyalakan dua faktor</button></div>
          </div>
        )}

        {/* ── aktif ───────────────────────────────────────────────────── */}
        {data?.aktif && !cadangan && (
          <div className="stack gap-3">
            <div className="table-wrap"><table className="table"><tbody>
              <tr><td>Kode cadangan tersisa</td><td className="num">
                {data.sisaCadangan === 0
                  ? <span className="badge badge-warn">habis</span>
                  : <b>{data.sisaCadangan}</b>}
              </td></tr>
            </tbody></table></div>
            <div className="cluster gap-2" style={{ alignItems: 'flex-end' }}>
              <Field label="Matikan — masukkan kata sandi" style={{ flex: 1, maxWidth: 280 }}><input className="input" type="password" autoComplete="current-password"
                  value={sandi} onChange={(e) => setSandi(e.target.value)} /></Field>
              <button className={`btn${busy ? ' is-loading' : ''}`} disabled={busy || !sandi}
                onClick={matikan}>Matikan</button>
            </div>
            <p className="microlabel">
              KATA SANDI DIMINTA KARENA SESI YANG HIDUP ADALAH PERSIS YANG DIMILIKI PENCURI COOKIE.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
