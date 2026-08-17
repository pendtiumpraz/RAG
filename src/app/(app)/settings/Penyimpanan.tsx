'use client';

/**
 * PENYIMPANAN (BYOB) — kelola koneksi penyimpanan objek milik pengguna.
 *
 * "Bring your own blob": anggota tenant menghubungkan penyimpanan objeknya
 * sendiri (S3, R2, GCS, Azure, atau S3-compatible). Bawaan platform (blob
 * Vercel) selalu tersedia dan tak perlu dihubungkan — ia dipakai sampai ada
 * koneksi yang dipilih sebagai bawaan.
 *
 * RAHASIA di sini: kredensial DIISI sekali lewat form (dikirim satu arah
 * lewat HTTPS), lalu DIENKRIPSI di server. Yang TIDAK PERNAH kembali ke
 * layar ini hanya jumlah isian yang LENGKAP dan lingkup akunnya (bucket,
 * region, dst.) — nilainya tak pernah bocor. Form yang sama dipakai utk
 * mengisi ULANG penuh saat mengedit, karena server tak mengirim balik
 * rahasia yang sudah disimpan.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { Field, Skeleton, EmptyState, useToast } from '../../_components/ui';
import { Icon } from '../../_components/icons';

/** Isi satu form kredensial penyedia — DIKIRIM SEKALI, dienkripsi di server. */
interface Kred { [k: string]: string | boolean | undefined }

interface TampilanKoneksi {
  id: string; provider: string; label: string | null;
  scoping: Record<string, unknown>; hasCredentials: boolean;
  isDefault: boolean; lastCheckedAt: string | null; lastError: string | null; updatedAt: string;
}
interface Pilihan { provider: string; label: string; enabled: boolean }
interface JawabanDaftar {
  daftar: TampilanKoneksi[];
  pilihanPenyedia: Pilihan[];
}

type Penyedia = 's3' | 'r2' | 'gcs' | 'azure' | 's3-compat' | 'platform';

/** Medan isian per penyedia — label utk UI; `textarea` utk GCS JSON. */
const SKEMA: Record<Exclude<Penyedia, 'platform'>, Array<{ kunci: string; label: string; area?: boolean; bool?: boolean }>> = {
  s3: [
    { kunci: 'accessKeyId', label: 'Access key ID' },
    { kunci: 'secretAccessKey', label: 'Secret access key' },
    { kunci: 'region', label: 'Region' },
    { kunci: 'bucket', label: 'Bucket' },
  ],
  r2: [
    { kunci: 'accessKeyId', label: 'Access key ID' },
    { kunci: 'secretAccessKey', label: 'Secret access key' },
    { kunci: 'bucket', label: 'Bucket' },
    { kunci: 'endpoint', label: 'Endpoint (opsional)' },
  ],
  's3-compat': [
    { kunci: 'accessKeyId', label: 'Access key ID' },
    { kunci: 'secretAccessKey', label: 'Secret access key' },
    { kunci: 'bucket', label: 'Bucket' },
    { kunci: 'endpoint', label: 'Endpoint' },
    { kunci: 'region', label: 'Region (opsional)' },
  ],
  gcs: [{ kunci: 'serviceAccountJson', label: 'Service account JSON', area: true }],
  azure: [
    { kunci: 'azureAccountName', label: 'Nama akun penyimpanan' },
    { kunci: 'azureAccountKey', label: 'Kunci akun' },
    { kunci: 'azureContainer', label: 'Container' },
  ],
};

const LABEL_PENYEDIA: Record<string, string> = {
  platform: 'Blob platform (bawaan)', s3: 'AWS S3', r2: 'Cloudflare R2',
  gcs: 'Google Cloud Storage', azure: 'Azure Blob Storage', 's3-compat': 'S3-compatible',
};

export default function Penyimpanan() {
  const { data, loading, refetch } = useApi<JawabanDaftar>('/api/storage');
  const toast = useToast();

  const [penyedia, setPenyedia] = useState<Penyedia>('s3');
  const [label, setLabel] = useState('');
  const [kred, setKred] = useState<Kred>({});
  const [yangDiedit, setYangDiedit] = useState<TampilanKoneksi | null>(null);
  const [formBuka, setFormBuka] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ujianId, setUjianId] = useState<string | null>(null);
  const [hasilUji, setHasilUji] = useState<Record<string, { ok: boolean; pesan: string }>>({});

  // Reset isian saat berpindah penyedia — medan yang satu tak berlaku untuk yang lain.
  useEffect(() => { setKred({}); }, [penyedia]);

  /** Penyedia yang boleh dipilih: yang TERSEDIA (tak dimatikan superadmin) + platform. */
  const opsi = useMemo(() => {
    const semua = (data?.pilihanPenyedia ?? []).filter((p) => p.enabled || p.provider === 'platform')
      .map((p) => p.provider as Penyedia);
    return semua.length ? semua : ['platform' as Penyedia];
  }, [data]);

  function bukaTambah() { setYangDiedit(null); setPenyedia(opsi[0] ?? 's3'); setLabel(''); setKred({}); setErr(null); setFormBuka(true); }
  function tutup() { setFormBuka(false); setYangDiedit(null); setErr(null); }

  async function simpan() {
    if (penyedia === 'platform') return;
    setBusy(true); setErr(null);
    try {
      const body = {
        provider: penyedia,
        label: label.trim() || null,
        credentials: kred,
      };
      if (yangDiedit) {
        await api(`/api/storage/${yangDiedit.id}`, { method: 'PUT', body: JSON.stringify(body) });
        toast('Penyimpanan diperbarui');
      } else {
        await api('/api/storage', { method: 'POST', body: JSON.stringify(body) });
        toast('Penyimpanan dihubungkan');
      }
      setFormBuka(false); setYangDiedit(null);
      await refetch();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function uji(id: string) {
    setUjianId(id);
    try {
      const r = await api<{ ok: boolean; detail?: string; reason?: string }>(`/api/storage/${id}/test`, { method: 'POST' });
      setHasilUji((h) => ({ ...h, [id]: { ok: r.ok, pesan: r.ok ? (r.detail ?? 'Terhubung') : (r.reason ?? 'Gagal') } }));
    } catch (e) { setHasilUji((h) => ({ ...h, [id]: { ok: false, pesan: (e as Error).message } })); }
    finally { setUjianId(null); }
  }

  async function hapus(k: TampilanKoneksi) {
    if (!confirm(`Lepas koneksi "${k.label ?? LABEL_PENYEDIA[k.provider] ?? k.provider}"? Kredensialnya akan dihapus tak bisa dipulihkan.`)) return;
    try { await api(`/api/storage/${k.id}`, { method: 'DELETE' }); toast('Koneksi dilepas'); await refetch(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  function set (kunci: string, v: string | boolean) { setKred((k) => ({ ...k, [kunci]: v })); }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head"><span className="t">penyimpanan objek (BYOB)</span>
        <span className="microlabel">{data?.daftar.length ?? 0} TERHUBUNG</span></div>
      <div className="card-pad stack gap-4">
        {loading ? <Skeleton rows={4} /> : (
          <>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0, lineHeight: 1.7 }}>
              Hubungkan <b>penyimpanan objek milik Anda</b> (AWS S3, Cloudflare R2, GCS, Azure,
              atau S3-compatible) untuk menyimpan dokumen yang disinkronkan. Sebelum itu, bawaan
              platform dipakai untuk semua orang. Kredensial disimpan <b>terenkripsi</b> dan tak
              pernah ditampilkan kembali.
            </p>

            {(data?.daftar.length ?? 0) === 0 ? (
              <EmptyState
                title="Belum ada penyimpanan terhubung"
                hint="Hubungkan bucket Anda sendiri, atau lanjutkan memakai blob platform."
                action={<button className="btn btn-primary" onClick={bukaTambah}><Icon name="plus" size={14} /> Hubungkan penyimpanan</button>} />
            ) : (
              <div className="table-wrap"><table className="table">
                <thead><tr>
                  <th>Penyedia</th><th>Label</th><th>Lingkup</th><th>Kredensial</th><th>Uji</th><th />
                </tr></thead>
                <tbody>
                  {data!.daftar.map((k) => {
                    const sc = k.scoping ?? {};
                    const barisSc = Object.entries(sc).map(([k2, v2]) =>
                      `${k2}: ${typeof v2 === 'object' ? JSON.stringify(v2) : String(v2)}`).join(' · ');
                    const u = hasilUji[k.id];
                    return (
                      <tr key={k.id}>
                        <td><span className="badge">{LABEL_PENYEDIA[k.provider] ?? k.provider}</span></td>
                        <td>
                          <b>{k.label ?? '—'}</b>
                          {k.isDefault && <span className="badge badge-signal" style={{ marginLeft: 8 }}>BAWAAN</span>}
                        </td>
                        <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{barisSc || '—'}</td>
                        <td>
                          {k.hasCredentials
                            ? <span className="badge badge-ok"><span className="led led-live" />terisi</span>
                            : <span className="badge">kosong</span>}
                        </td>
                        <td>
                          <button className="btn btn-sm" disabled={ujianId === k.id}
                            onClick={() => void uji(k.id)}>
                            {ujianId === k.id ? 'Menguji…' : 'Uji koneksi'}
                          </button>
                          {u && <div className={`microlabel${u.ok ? ' badge-ok' : ''}`}
                            style={{ marginTop: 4, color: u.ok ? 'var(--ok, #16a34a)' : 'var(--danger, #dc2626)' }}>
                            {u.pesan}
                          </div>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn btn-sm btn-ghost" onClick={() => {
                            setYangDiedit(k); setPenyedia(k.provider as Penyedia); setLabel(k.label ?? ''); setKred({}); setErr(null); setFormBuka(true);
                          }}>Ubah</button>
                          <button className="btn btn-sm btn-ghost" onClick={() => void hapus(k)}
                            style={{ color: 'var(--danger, #dc2626)' }}>Lepas</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            )}

            {!formBuka && (data?.daftar.length ?? 0) > 0 && (
              <div><button className="btn" onClick={bukaTambah}><Icon name="plus" size={14} /> Hubungkan lagi</button></div>
            )}

            {formBuka && (
              <div className="card card-pad" style={{ background: 'var(--card-2)' }}>
                <div className="cluster" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                  <b>{yangDiedit ? 'Ubah penyimpanan' : 'Hubungkan penyimpanan baru'}</b>
                  <button className="btn btn-sm btn-ghost" onClick={tutup}>Batal</button>
                </div>

                {yangDiedit && (
                  <p className="microlabel" style={{ marginBottom: 12 }}>
                    KREDENSIAL TIDAK DISIMPAN KEMBALI OLEH SERVER — ISI ULANG PENUH UNTUK
                    MEMPERBARUI. LINGKUP (BUCKET, REGION, DST.) AKAN DITURUNKAN ULANG DARI ISIAN INI.
                  </p>
                )}

                <Field label="Penyedia">
                  <div className="cluster" style={{ flexWrap: 'wrap' }}>{
                    opsi.map((p) => (
                      <button key={p} type="button"
                        className={`btn btn-sm${penyedia === p ? ' btn-primary' : ''}`}
                        onClick={() => setPenyedia(p)}>
                        {LABEL_PENYEDIA[p] ?? p}
                      </button>
                    ))
                  }</div>
                </Field>

                {penyedia === 'platform' ? (
                  <p style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Blob platform dipakai otomatis dari lingkungan dan tak perlu dihubungkan di sini.
                  </p>
                ) : (
                  <>
                    <Field label="Label (opsional)">
                      <input className="input" value={label} placeholder="mis. Bucket produksi perusahaan"
                        onChange={(e) => setLabel(e.target.value)} />
                    </Field>
                    {SKEMA[penyedia].map((medan) => (
                      <Field key={medan.kunci} label={medan.label}>
                        {medan.area
                          ? <textarea className="input" rows={6} style={{ fontFamily: 'var(--mono)', fontSize: 12 }}
                              value={typeof kred[medan.kunci] === 'string' ? kred[medan.kunci] as string : ''}
                              onChange={(e) => set(medan.kunci, e.target.value)}
                              placeholder='{ "type": "service_account", "client_email": "…", "private_key": "…" }' />
                          : <input className="input" type={medan.kunci.toLowerCase().includes('secret') ? 'password' : 'text'}
                              autoComplete="off"
                              value={typeof kred[medan.kunci] === 'string' ? kred[medan.kunci] as string : ''}
                              onChange={(e) => set(medan.kunci, e.target.value)} />}
                      </Field>
                    ))}
                    {penyedia === 'gcs' && (
                      <p className="microlabel">ISI MENTAH JSON SERVICE ACCOUNT. AKAN DIENKRIPSI DAN TAK DIKEMBALIKAN.</p>
                    )}
                  </>
                )}

                {err && <p style={{ color: 'var(--danger, #dc2626)', fontSize: 13 }}>{err}</p>}

                <div>
                  <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} disabled={busy || penyedia === 'platform'}
                    onClick={() => void simpan()}>
                    {yangDiedit ? 'Simpan perubahan' : 'Hubungkan'}
                  </button>
                </div>
              </div>
            )}

            <p className="microlabel">
              BLAWAN PLATFORM SELALU TERSEDIA. KREDENSIAL DIENKRIPSI DI SERVER DAN TAK PERNAH
              DIKIRIM BALIK — YANG DITAMPILKAN HANYA LINGKUP AKUN (BUCKET, REGION, DST.) DAN ADA/TIDAKNYA RAHASIA.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
