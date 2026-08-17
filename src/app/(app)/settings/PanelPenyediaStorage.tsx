'use client';

/**
 * PANEL SAKLAR PENYEDIA PENYIMPANAN (SUPERADMIN).
 *
 * Memutuskan penyedia BYOB mana yang boleh dipakai di seluruh platform.
 * 'platform' (blob Vercel) SELALU tersedia dan TIDAK pernah tampil di sini —
 * ia bawaan aman yang tak bisa dimatikan. Penyedia yang dimatikan langsung
 * tak muncul di form "Hubungkan" di halaman Penyimpanan.
 *
 * DITAMPILKAN HANYA UNTUK SUPERADMIN (dijaga oleh pemanggilnya di page.tsx).
 * Menyimpan peta lengkap yang eksplisit (bukan sembarang beda) supaya
 * kunci yang hilang tak secara tak sengaja diterjemahkan 'mati' oleh layer
 * yang membacanya.
 */
import { useEffect, useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { Skeleton, useToast } from '../../_components/ui';

interface PenyediaBaris {
  provider: string; label: string; nyala: boolean;
}
interface Jawaban {
  enabled: Record<string, boolean>;
  penyedia: PenyediaBaris[];
}

export default function PanelPenyediaStorage() {
  const { data, loading, refetch } = useApi<Jawaban>('/api/admin/storage-providers');
  const [nyala, setNyala] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (data) setNyala(Object.fromEntries(
      data.penyedia.map((p) => [p.provider, p.nyala]),
    ));
  }, [data]);

  async function simpan() {
    setBusy(true);
    try {
      await api('/api/admin/storage-providers', {
        method: 'PUT',
        body: JSON.stringify({ enabled: nyala }),
      });
      toast('Saklar penyedia penyimpanan tersimpan'); await refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head"><span className="t">penyedia penyimpanan objek (superadmin)</span></div>
      <div className="card-pad stack gap-3">
        {loading ? <Skeleton rows={4} /> : (
          <>
            {(data?.penyedia ?? []).map((p) => (
              <label key={p.provider} className="cluster gap-3"
                style={{
                  padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8,
                  alignItems: 'flex-start', cursor: 'pointer',
                }}>
                <input type="checkbox" style={{ marginTop: 3 }}
                  checked={nyala[p.provider] !== false} disabled={busy}
                  onChange={(e) => setNyala({ ...nyala, [p.provider]: e.target.checked })} />
                <span style={{ flex: 1 }}>
                  <b>{p.label}</b>
                  {nyala[p.provider] === false
                    ? <span className="badge" style={{ marginLeft: 8 }}>DINONAKTIFKAN</span>
                    : <span className="badge badge-ok" style={{ marginLeft: 8 }}>AKTIF</span>}
                  <span className="microlabel" style={{ display: 'block', marginTop: 4 }}>
                    Mata ini dipakai anggota tenant untuk menghubungkan penyimpanan mereka sendiri.
                  </span>
                </span>
              </label>
            ))}

            <p className="microlabel">
              BLAWAN PLATFORM (Vercel Blob) SELALU TERSEDIA DAN TIDAK BISA DIMATIKAN — IA JALAN
              TERAMAN BAGI SIAPA PUN YANG BELUM MENGHUBUNGKAN PENYIMPANAN SENDIRI. PENYEDIA YANG
              DIMATIKAN TAK LAGI TAMPIL DI FORM PELANGGAN, TAPI KONEKSI YANG SUDAH ADA TETAP DIPAKAI.
            </p>

            <div>
              <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} disabled={busy}
                onClick={() => void simpan()}>Simpan saklar penyedia</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
