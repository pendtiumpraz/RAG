'use client';

import { useState } from 'react';
import { api, useApi, ApiError } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Skeleton, ErrorState, EmptyState, useToast } from '../../_components/ui';
import { VISUAL_SLOTS, FALLBACK_SLUG } from '@/modules/memory/categories';

interface Cat {
  id: string; slug: string; label: string; slot: number;
  status: 'active' | 'proposed'; origin: 'seed' | 'user' | 'agent';
  color: string; shape: string; notes: number;
}

/** Penanda kategori — bentuknya SAMA dengan node di graf Memory. */
function Swatch({ color, shape, size = 14 }: { color: string; shape: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden style={{ flex: '0 0 auto' }}>
      {shape === 'square' ? <rect x="1.5" y="1.5" width="9" height="9" fill={color} />
        : shape === 'triangle' ? <polygon points="6,1 11,10.5 1,10.5" fill={color} />
        : shape === 'diamond' ? <polygon points="6,0.5 11.5,6 6,11.5 0.5,6" fill={color} />
        : <circle cx="6" cy="6" r="5" fill={color} />}
    </svg>
  );
}

export default function CategoriesPage() {
  const cats = useApi<Cat[]>('/api/categories');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  const usulan = (cats.data ?? []).filter((c) => c.status === 'proposed');
  const aktif = (cats.data ?? []).filter((c) => c.status === 'active');

  async function tambah() {
    if (!label.trim()) return;
    setBusy('add'); setErr(null);
    try {
      await api('/api/categories', { method: 'POST', body: JSON.stringify({ label }) });
      setLabel(''); toast('Kategori ditambahkan'); cats.refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Gagal menambah kategori');
    } finally { setBusy(null); }
  }

  async function setujui(c: Cat) {
    setBusy(c.id);
    try {
      await api(`/api/categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ approve: true }) });
      toast(`"${c.label}" disetujui`); cats.refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  }

  async function ganti(c: Cat) {
    const baru = prompt('Nama baru kategori', c.label);
    if (!baru || baru === c.label) return;
    setBusy(c.id);
    try {
      await api(`/api/categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ label: baru }) });
      toast('Nama diperbarui'); cats.refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  }

  async function hapus(c: Cat) {
    if (!confirm(`Hapus "${c.label}"?${c.notes ? ` ${c.notes} catatan akan dipindah ke Belum dikategorikan.` : ''}`)) return;
    setBusy(c.id);
    try {
      await api(`/api/categories/${c.id}`, { method: 'DELETE' });
      toast('Kategori dihapus'); cats.refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Kategori Dokumen</h1>
          <p className="sub">
            Jenis dokumen yang dipakai untuk mewarnai graf Memory dan menyaring pengetahuan.
          </p>
        </div>
      </div>

      {/* Usulan agen didahulukan: ia butuh keputusan, sisanya cuma daftar. */}
      {usulan.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="panel-head">
            <span className="t">usulan agen</span>
            <span className="badge badge-source">{usulan.length} menunggu</span>
          </div>
          <div className="card-pad stack gap-3">
            <p className="sub" style={{ margin: 0 }}>
              Memory Agent menemukan dokumen yang tak masuk kategori mana pun dan mengusulkan
              nama baru. Usulan belum dipakai sampai disetujui — sementara ini dokumennya
              masuk <b>Belum dikategorikan</b>. Kalau usulan langsung aktif, satu jenis dokumen bisa
              pecah jadi beberapa kategori berbeda dan taksonominya tak bisa dirapikan lagi.
            </p>
            {usulan.map((c) => (
              <div key={c.id} className="cluster" style={{ justifyContent: 'space-between' }}>
                <div className="cluster gap-2">
                  <Swatch color={c.color} shape={c.shape} />
                  <b>{c.label}</b>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{c.slug}</span>
                </div>
                <div className="cluster gap-2">
                  <button className="btn btn-sm btn-primary" disabled={busy === c.id} onClick={() => setujui(c)}>Setujui</button>
                  <button className="btn btn-sm btn-ghost" disabled={busy === c.id} onClick={() => hapus(c)}>Tolak</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="panel-head">
          <span className="t">kategori aktif</span>
          <span className="microlabel">{aktif.length} KATEGORI</span>
        </div>
        <div className="card-pad stack gap-4">
          <div className="cluster gap-2">
            <input
              className="input" style={{ flex: 1 }} value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') tambah(); }}
              placeholder="Nama kategori baru — mis. Perizinan, Audit Internal, Notulen Rapat"
            />
            <button className={`btn btn-primary${busy === 'add' ? ' is-loading' : ''}`}
              disabled={!label.trim() || !!busy} onClick={tambah}>
              <Icon name="plus" size={15} /> Tambah
            </button>
          </div>
          {err && <span className="error">{err}</span>}

          {aktif.length > VISUAL_SLOTS && (
            <p className="microlabel" style={{ color: 'var(--source)' }}>
              DI ATAS {VISUAL_SLOTS} KATEGORI, PENANDA VISUAL BERULANG — GRAF DIBACA LEWAT PENYARING,
              BUKAN LEWAT WARNA. KATEGORINYA SENDIRI TETAP BERFUNGSI PENUH.
            </p>
          )}

          {cats.error ? <ErrorState message={cats.error} onRetry={cats.refetch} />
            : cats.loading ? <Skeleton rows={4} />
            : aktif.length === 0 ? <EmptyState title="Belum ada kategori" />
            : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Penanda</th><th>Kategori</th><th>Kunci</th><th>Asal</th><th>Catatan</th><th /></tr></thead>
                <tbody>
                  {aktif.map((c) => (
                    <tr key={c.id}>
                      <td><Swatch color={c.color} shape={c.shape} /></td>
                      <td><b>{c.label}</b></td>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{c.slug}</td>
                      <td>
                        <span className="badge">
                          {c.origin === 'seed' ? 'bawaan' : c.origin === 'agent' ? 'dari agen' : 'dibuat pengguna'}
                        </span>
                      </td>
                      <td className="mono">{c.notes}</td>
                      <td>
                        <div className="cluster gap-2">
                          {/* Penampung adalah KEADAAN sistem, bukan kategori: mengganti
                              namanya atau menghapusnya akan membuat dokumen yang
                              penilaiannya gagal tak punya tempat mendarat. */}
                          {c.slug !== FALLBACK_SLUG
                            ? <button className="btn btn-sm" disabled={busy === c.id} onClick={() => ganti(c)}>Ganti nama</button>
                            : <span className="microlabel">TEMPAT DOKUMEN YANG BELUM TERNILAI</span>}
                          {c.slug !== FALLBACK_SLUG && (
                            <button className="btn btn-sm btn-ghost" disabled={busy === c.id} onClick={() => hapus(c)}>Hapus</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}

          <p className="microlabel">
            GANTI NAMA TIDAK MENGUBAH KUNCI — RIBUAN CATATAN YANG SUDAH MEMAKAINYA TETAP UTUH.
            MENGHAPUS KATEGORI MEMINDAHKAN CATATANNYA KE LAIN-LAIN, BUKAN MENGHILANGKANNYA.
          </p>
        </div>
      </div>
    </>
  );
}
