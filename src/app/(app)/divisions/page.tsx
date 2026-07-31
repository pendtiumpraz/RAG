'use client';

import { useState } from 'react';
import { api, useApi, ApiError } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Drawer, Field, Skeleton, ErrorState, EmptyState, useToast } from '../../_components/ui';

/**
 * DIVISI — siapa boleh membuka chatbot yang mana, di dalam satu tenant.
 *
 * Sebelum ini "divisi" hanya prosa di kolom Konteks chatbot: tulisan yang
 * membentuk watak jawaban tapi tidak menjaga apa pun. Setiap anggota tenant
 * bisa membuka setiap chatbot, termasuk chatbot HR yang menjawab pertanyaan
 * gaji. Halaman ini yang membuatnya benar-benar membatasi.
 */

interface Divisi {
  id: string; name: string; description: string | null;
  anggota: number; chatbot: number;
}

interface Buang { id: string; name: string }

export default function DivisionsPage() {
  const div = useApi<Divisi[]>('/api/divisions');
  const [form, setForm] = useState<Divisi | 'baru' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lihatSampah, setLihatSampah] = useState(false);
  const sampah = useApi<Buang[]>(lihatSampah ? '/api/divisions/trashed' : null);
  const toast = useToast();

  async function hapus(d: Divisi) {
    if (!confirm(`Hapus divisi "${d.name}"? ${d.anggota} anggota dan ${d.chatbot} chatbot akan dilepas jadi tanpa divisi.`)) return;
    setBusy(d.id);
    try {
      await api(`/api/divisions/${d.id}`, { method: 'DELETE' });
      toast(`Divisi "${d.name}" dipindahkan ke Sampah`); div.refetch();
      if (lihatSampah) sampah.refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  }

  async function pulihkan(d: Buang) {
    setBusy(d.id);
    try {
      await api(`/api/divisions/${d.id}/restore`, { method: 'PATCH' });
      toast(`Divisi "${d.name}" dipulihkan`); div.refetch(); sampah.refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(null); }
  }

  const rows = div.data ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Divisi</h1>
          <p className="sub">Membatasi chatbot mana yang terlihat oleh siapa di dalam organisasi ini.</p>
        </div>
        <div className="cluster gap-2">
          <button className="btn" onClick={() => setLihatSampah((v) => !v)}>
            <Icon name="trash" size={15} /> {lihatSampah ? 'Sembunyikan Sampah' : 'Sampah'}
          </button>
          <button className="btn btn-primary" onClick={() => setForm('baru')}>
            <Icon name="plus" size={15} /> Divisi baru
          </button>
        </div>
      </div>

      <div className="card">
        <div className="panel-head">
          <span className="t">divisi aktif</span>
          <span className="microlabel">{rows.length} DIVISI</span>
        </div>
        <div className="card-pad stack gap-4">
          {div.error ? <ErrorState message={div.error} onRetry={div.refetch} />
            : div.loading ? <Skeleton rows={4} />
            : rows.length === 0 ? (
              <EmptyState
                title="Belum ada divisi"
                hint="Selama belum ada divisi, semua chatbot terlihat oleh seluruh anggota — persis seperti sebelumnya. Divisi membatasi hanya yang sengaja ditempatkan di dalamnya."
                action={<button className="btn btn-primary" onClick={() => setForm('baru')}>Buat divisi pertama</button>}
              />
            ) : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Divisi</th><th>Keterangan</th><th>Anggota</th><th>Chatbot</th><th /></tr></thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id}>
                      <td><b>{d.name}</b></td>
                      <td style={{ color: 'var(--muted)' }}>{d.description ?? '—'}</td>
                      <td className="mono">{d.anggota}</td>
                      <td className="mono">{d.chatbot}</td>
                      <td>
                        <div className="cluster gap-2">
                          <button className="btn btn-sm" disabled={busy === d.id} onClick={() => setForm(d)}>Ubah</button>
                          <button className="btn btn-sm btn-ghost" disabled={busy === d.id} onClick={() => hapus(d)}>Hapus</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}

          <p className="microlabel">
            CHATBOT TANPA DIVISI TERLIHAT OLEH SEMUA ANGGOTA — ITULAH KEADAAN SEBELUM DIVISI ADA,
            DAN MENAMBAH DIVISI TIDAK MENCABUT AKSES SIAPA PUN SAMPAI CHATBOTNYA DITEMPATKAN.
            ADMIN ORGANISASI SELALU MELIHAT SELURUH DIVISI.
          </p>
        </div>
      </div>

      {lihatSampah && (
        <div className="card">
          <div className="panel-head"><span className="t">sampah</span></div>
          <div className="card-pad stack gap-3">
            {sampah.loading ? <Skeleton rows={2} />
              : (sampah.data ?? []).length === 0 ? <EmptyState title="Sampah kosong" />
              : (sampah.data ?? []).map((d) => (
                <div key={d.id} className="cluster" style={{ justifyContent: 'space-between' }}>
                  <b>{d.name}</b>
                  <button className="btn btn-sm" disabled={busy === d.id} onClick={() => pulihkan(d)}>Pulihkan</button>
                </div>
              ))}
            <p className="microlabel">
              MEMULIHKAN DIVISI TIDAK MENGEMBALIKAN KEANGGOTAANNYA — ORANG DAN CHATBOT YANG DULU
              DI DALAMNYA BISA SAJA SUDAH DIPINDAHKAN, DAN MENGEMBALIKAN KEADAAN LAMA AKAN
              MENCABUT PENEMPATAN YANG DIBUAT SESUDAHNYA.
            </p>
          </div>
        </div>
      )}

      {form && (
        <FormDivisi
          divisi={form === 'baru' ? null : form}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); div.refetch(); }}
        />
      )}
    </>
  );
}

function FormDivisi({ divisi, onClose, onSaved }: {
  divisi: Divisi | null; onClose: () => void; onSaved: () => void;
}) {
  const baru = divisi === null;
  const [name, setName] = useState(divisi?.name ?? '');
  const [description, setDescription] = useState(divisi?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  async function simpan() {
    setBusy(true); setErr(null);
    const body = { name: name.trim(), description: description.trim() || null };
    try {
      if (baru) await api('/api/divisions', { method: 'POST', body: JSON.stringify(body) });
      else await api(`/api/divisions/${divisi!.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      toast(baru ? 'Divisi dibuat' : 'Perubahan disimpan'); onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Gagal menyimpan');
    } finally { setBusy(false); }
  }

  return (
    <Drawer onClose={onClose} label="Form divisi">
      <div className="dh"><h3>{baru ? 'Divisi Baru' : 'Ubah Divisi'}</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" size={16} /></button></div>
      <div className="db stack gap-4">
        <Field label="Nama divisi">
          <input className="input" value={name} autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="mis. Sumber Daya Manusia, Keuangan, Legal" />
          <p className="microlabel" style={{ marginTop: 6 }}>
            NAMA HARUS UNIK DI ORGANISASI INI, TANPA MEMANDANG BESAR-KECIL HURUF
          </p>
        </Field>
        <Field label="Keterangan (opsional)">
          <textarea className="input" rows={3} value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Untuk dibaca orang, bukan dipakai mesin — tak memengaruhi jawaban chatbot." />
        </Field>
        {err && <span className="error">{err}</span>}
      </div>
      <div className="df">
        <button className="btn" onClick={onClose}>Batal</button>
        <button className={`btn btn-primary${busy ? ' is-loading' : ''}`}
          disabled={!name.trim() || busy} onClick={simpan}>Simpan</button>
      </div>
    </Drawer>
  );
}
