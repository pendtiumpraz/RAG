'use client';

import { useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Skeleton, useToast, Field } from '../../_components/ui';
import { BarisKosong, TabelAlat, TabelKaki, TdNo, Th, ThNo, useTabel } from '../../_components/tabel';
import type { OpsiTabel } from '../../_lib/tabel';

/**
 * API KEY & WEBHOOK — akses programatik tenant.
 *
 * Dua panel, dua arah: kunci untuk sistem pelanggan MEMANGGIL Nalar, webhook
 * untuk Nalar MEMBERI TAHU sistem pelanggan.
 *
 * Satu aturan yang menentukan bentuk UI-nya: nilai rahasia (kunci API dan
 * secret webhook) hanya ada SEKALI, saat dibuat. Server hanya menyimpan
 * hash/ciphernya. Karena itu keduanya ditampilkan di panel yang menonjol dan
 * tak bisa ditutup tanpa disengaja — kalau terlewat, satu-satunya jalan adalah
 * membuat yang baru.
 */

interface KeyRow {
  id: string; name: string; prefix: string; scopes: string[];
  lastUsedAt: string | null; expiresAt: string | null; revokedAt: string | null; createdAt: string;
}
interface WebhookRow {
  id: string; url: string; events: string[]; enabled: boolean;
  lastStatus: number | null; lastAttemptAt: string | null; lastError: string | null;
  failCount: number;
}

const SCOPE_HINT: Record<string, string> = {
  read: 'Baca chatbot, KB, dokumen',
  write: 'Ingest & hapus dokumen',
  chat: 'Pencarian semantik',
};

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('id-ID') : '—');

export default function Integrations() {
  return (
    <>
      <ApiKeys />
      <Webhooks />
    </>
  );
}

/* ── kunci API ───────────────────────────────────────────────────────── */
const OPSI_KEY: OpsiTabel<KeyRow> = {
  cari: (k) => [k.name, k.prefix, ...k.scopes],
  /* Kunci yang sudah DICABUT tetap ditampilkan (jejak audit), jadi pada daftar
     panjang penyaring ini yang membedakan "kunci yang benar-benar hidup" dari
     riwayat. */
  saring: { hidup: (k) => (k.revokedAt ? 'dicabut' : 'aktif') },
  urut: {
    name: (k) => k.name, prefix: (k) => k.prefix,
    lastUsedAt: (k) => k.lastUsedAt, createdAt: (k) => k.createdAt,
  },
};

function ApiKeys() {
  const { data, loading, refetch } = useApi<{ keys: KeyRow[] }>('/api/keys');
  const t = useTabel(data?.keys ?? [], OPSI_KEY);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read', 'chat']);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function create() {
    if (name.trim().length < 1) { toast('Beri nama kuncinya dulu', 'error'); return; }
    setBusy(true);
    try {
      const r = await api<{ key: string }>('/api/keys', {
        method: 'POST', body: JSON.stringify({ name, scopes }),
      });
      setFresh(r.key); setName(''); refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function revoke(k: KeyRow) {
    if (!confirm(`Cabut kunci "${k.name}"? Sistem yang memakainya akan langsung ditolak.`)) return;
    try {
      await api(`/api/keys?id=${k.id}`, { method: 'DELETE' });
      toast('Kunci dicabut'); refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head">
        <span className="t">API key</span>
        <span className="microlabel">HANYA HASH YANG DISIMPAN · SERVER-ONLY</span>
      </div>

      {/* Kunci baru: satu-satunya kesempatan melihatnya. */}
      {fresh && (
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="card card-pad" style={{ borderLeft: '3px solid var(--source)', background: 'var(--card-2)' }}>
            <b style={{ display: 'block', fontSize: 14 }}>Salin sekarang — kunci ini tak akan ditampilkan lagi</b>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '6px 0 10px' }}>
              Yang tersimpan di server hanya sidik jarinya. Kalau hilang, buat kunci baru.
            </p>
            <div className="mono" style={{ fontSize: 12.5, wordBreak: 'break-all', background: 'var(--card)',
              border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px' }}>
              {fresh}
            </div>
            <div className="cluster gap-2" style={{ marginTop: 10 }}>
              <button className="btn btn-sm btn-primary"
                onClick={() => { navigator.clipboard?.writeText(fresh); toast('Kunci disalin'); }}>Salin</button>
              <button className="btn btn-sm" onClick={() => setFresh(null)}>Sudah kusimpan</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <Skeleton rows={2} /> : (
        <div className="card-pad stack gap-3">
        <TabelAlat
          t={t} rows={data?.keys ?? []} cariLabel="Cari nama kunci atau izin"
          saring={[{ kunci: 'hidup', label: 'Semua kunci', lebar: 155, pilihan: [
            { nilai: 'aktif', label: 'Masih aktif' }, { nilai: 'dicabut', label: 'Sudah dicabut' },
          ] }]}
        />
        <div className="table-wrap"><table className="table">
          <thead><tr>
            <ThNo />
            <Th t={t} kunci="name">Nama</Th>
            <Th t={t} kunci="prefix">Kunci</Th>
            <th>Izin</th>
            <Th t={t} kunci="lastUsedAt">Terakhir dipakai</Th>
            <th />
          </tr></thead>
          <tbody>
            {(data?.keys?.length ?? 0) > 0 && <BarisKosong t={t} kolom={6} />}
            {t.hasil.tampil.map((k, i) => (
              <tr key={k.id} style={k.revokedAt ? { opacity: .5 } : undefined}>
                <TdNo n={t.nomor(i)} />
                <td><b>{k.name}</b>
                  {k.revokedAt && <span className="badge" style={{ marginLeft: 8 }}>dicabut</span>}</td>
                <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{k.prefix}…</td>
                <td>
                  <div className="cluster gap-2" style={{ flexWrap: 'wrap' }}>
                    {k.scopes.map((s) => (
                      <span key={s} className="badge badge-signal" title={SCOPE_HINT[s]}>{s}</span>
                    ))}
                  </div>
                </td>
                <td className="mono" style={{ fontSize: 12 }}>{fmtDate(k.lastUsedAt)}</td>
                <td>
                  {!k.revokedAt && (
                    <button className="btn btn-sm btn-ghost" onClick={() => revoke(k)}>Cabut</button>
                  )}
                </td>
              </tr>
            ))}
            {!data?.keys?.length && (
              <tr><td colSpan={6} style={{ color: 'var(--muted)', fontSize: 13 }}>
                Belum ada kunci. Buat satu untuk menyambungkan sistemmu ke Nalar.
              </td></tr>
            )}
          </tbody>
        </table></div>
        <TabelKaki t={t} satuan="kunci" />
        </div>
      )}

      <div className="card-pad stack gap-3">
        <Field label="Nama kunci baru"><input className="input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="mis. Integrasi ERP, Agen internal" /></Field>
        <Field label="Izin"><div className="cluster gap-2" style={{ flexWrap: 'wrap' }}>
            {(['read', 'write', 'chat'] as const).map((s) => (
              <button key={s} type="button"
                className={`btn btn-sm${scopes.includes(s) ? ' btn-primary' : ''}`}
                onClick={() => setScopes((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))}>
                {s}
              </button>
            ))}
          </div>
          <p className="microlabel" style={{ marginTop: 6 }}>
            READ = BACA · WRITE = INGEST &amp; HAPUS (SUDAH MENCAKUP BACA) · CHAT = PENCARIAN SEMANTIK
          </p></Field>
        <div>
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`}
            disabled={busy || !scopes.length} onClick={create}>
            <Icon name="plus" size={14} /> Terbitkan kunci
          </button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Pemakaian: <code className="mono">Authorization: Bearer nk_live_…</code> ke{' '}
          <code className="mono">/api/v1/*</code>. Daftar endpoint ada di{' '}
          <a href="/api/openapi" target="_blank" rel="noreferrer">spesifikasi OpenAPI</a>.
        </p>
      </div>
    </div>
  );
}

/* ── webhook ─────────────────────────────────────────────────────────── */

/** Keadaan kiriman terakhir — dipakai penyaring DAN kolomnya, satu sumber. */
const keadaanWebhook = (w: WebhookRow) =>
  (!w.enabled ? 'nonaktif' : w.lastError ? 'gagal' : w.lastAttemptAt ? 'ok' : 'belum pernah');

const OPSI_WEBHOOK: OpsiTabel<WebhookRow> = {
  cari: (w) => [w.url, ...w.events],
  saring: { keadaan: keadaanWebhook },
  urut: { url: (w) => w.url, keadaan: keadaanWebhook, lastAttemptAt: (w) => w.lastAttemptAt },
};

function Webhooks() {
  const { data, loading, refetch } = useApi<{
    webhooks: WebhookRow[]; events: Array<{ id: string; label: string }>;
  }>('/api/webhooks');
  const t = useTabel(data?.webhooks ?? [], OPSI_WEBHOOK);
  const [url, setUrl] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function create() {
    setBusy(true);
    try {
      const r = await api<{ secret: string }>('/api/webhooks', {
        method: 'POST', body: JSON.stringify({ url, events: picked }),
      });
      setSecret(r.secret); setUrl(''); setPicked([]); refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function test(w: WebhookRow) {
    try {
      const r = await api<{ ok: boolean; status: number | null; error: string | null }>('/api/webhooks', {
        method: 'PATCH', body: JSON.stringify({ id: w.id, test: true }),
      });
      toast(r.ok ? `Terkirim (HTTP ${r.status})` : `Gagal: ${r.error}`, r.ok ? 'ok' : 'error');
      refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function toggle(w: WebhookRow) {
    try {
      await api('/api/webhooks', { method: 'PATCH', body: JSON.stringify({ id: w.id, enabled: !w.enabled }) });
      refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function remove(w: WebhookRow) {
    if (!confirm('Hapus webhook ini?')) return;
    try { await api(`/api/webhooks?id=${w.id}`, { method: 'DELETE' }); toast('Webhook dihapus'); refetch(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head">
        <span className="t">webhook keluar</span>
        <span className="microlabel">DITANDATANGANI HMAC-SHA256</span>
      </div>

      {secret && (
        <div className="card-pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="card card-pad" style={{ borderLeft: '3px solid var(--source)', background: 'var(--card-2)' }}>
            <b style={{ display: 'block', fontSize: 14 }}>Secret webhook — tampil sekali</b>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '6px 0 10px' }}>
              Pasang di penerima untuk memverifikasi header <code className="mono">X-Nalar-Signature</code>.
              Tanpa verifikasi itu, siapa pun yang tahu URL-mu bisa mengirim kejadian palsu.
            </p>
            <div className="mono" style={{ fontSize: 12.5, wordBreak: 'break-all', background: 'var(--card)',
              border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px' }}>{secret}</div>
            <div className="cluster gap-2" style={{ marginTop: 10 }}>
              <button className="btn btn-sm btn-primary"
                onClick={() => { navigator.clipboard?.writeText(secret); toast('Secret disalin'); }}>Salin</button>
              <button className="btn btn-sm" onClick={() => setSecret(null)}>Sudah kusimpan</button>
            </div>
          </div>
        </div>
      )}

      {loading ? <Skeleton rows={2} /> : (
        <div className="card-pad stack gap-3">
        <TabelAlat
          t={t} rows={data?.webhooks ?? []} cariLabel="Cari URL atau kejadian"
          saring={[{ kunci: 'keadaan', label: 'Semua keadaan', lebar: 165, pilihan: [
            { nilai: 'ok', label: 'Kiriman terakhir OK' },
            { nilai: 'gagal', label: 'Kiriman terakhir gagal' },
            { nilai: 'belum pernah', label: 'Belum pernah dikirim' },
            { nilai: 'nonaktif', label: 'Nonaktif' },
          ] }]}
        />
        <div className="table-wrap"><table className="table">
          <thead><tr>
            <ThNo />
            <Th t={t} kunci="url">URL</Th>
            <th>Kejadian</th>
            <Th t={t} kunci="lastAttemptAt">Kiriman terakhir</Th>
            <th />
          </tr></thead>
          <tbody>
            {(data?.webhooks?.length ?? 0) > 0 && <BarisKosong t={t} kolom={5} />}
            {t.hasil.tampil.map((w, i) => (
              <tr key={w.id} style={w.enabled ? undefined : { opacity: .55 }}>
                <TdNo n={t.nomor(i)} />
                <td className="mono" style={{ fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {w.url}
                  {!w.enabled && <span className="badge" style={{ marginLeft: 8 }}>nonaktif</span>}
                </td>
                <td>
                  <div className="cluster gap-2" style={{ flexWrap: 'wrap' }}>
                    {w.events.map((e) => <span key={e} className="badge">{e}</span>)}
                  </div>
                </td>
                <td style={{ fontSize: 12 }}>
                  {w.lastAttemptAt ? (
                    <>
                      <span className={`badge ${w.lastError ? 'badge-source' : 'badge-ok'}`}>
                        {w.lastError ? `gagal ${w.lastStatus ?? ''}` : `ok ${w.lastStatus}`}
                      </span>
                      <div style={{ color: 'var(--muted)', marginTop: 4 }}>
                        {new Date(w.lastAttemptAt).toLocaleString('id-ID')}
                      </div>
                      {w.lastError && <div style={{ color: 'var(--danger)', marginTop: 2 }}>{w.lastError}</div>}
                    </>
                  ) : <span style={{ color: 'var(--muted)' }}>belum pernah</span>}
                </td>
                <td>
                  <div className="cluster gap-2">
                    <button className="btn btn-sm" onClick={() => test(w)}>Uji</button>
                    <button className="btn btn-sm" onClick={() => toggle(w)}>{w.enabled ? 'Matikan' : 'Nyalakan'}</button>
                    <button className="btn btn-sm btn-ghost" onClick={() => remove(w)}>Hapus</button>
                  </div>
                </td>
              </tr>
            ))}
            {!data?.webhooks?.length && (
              <tr><td colSpan={5} style={{ color: 'var(--muted)', fontSize: 13 }}>
                Belum ada webhook. Tambahkan agar sistemmu tahu saat dokumen masuk atau percakapan terjadi.
              </td></tr>
            )}
          </tbody>
        </table></div>
        <TabelKaki t={t} satuan="webhook" />
        </div>
      )}

      <div className="card-pad stack gap-3">
        <Field label="URL penerima"><input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://sistemmu.com/hooks/nalar" />
          <p className="microlabel" style={{ marginTop: 6 }}>
            WAJIB HTTPS · ALAMAT JARINGAN INTERNAL DITOLAK
          </p></Field>
        <Field label="Kejadian yang dilanggan"><div className="cluster gap-2" style={{ flexWrap: 'wrap' }}>
            {(data?.events ?? []).map((e) => (
              <button key={e.id} type="button" title={e.label}
                className={`btn btn-sm${picked.includes(e.id) ? ' btn-primary' : ''}`}
                onClick={() => setPicked((v) => (v.includes(e.id) ? v.filter((x) => x !== e.id) : [...v, e.id]))}>
                {e.id}
              </button>
            ))}
          </div></Field>
        <div>
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`}
            disabled={busy || !url || !picked.length} onClick={create}>
            <Icon name="plus" size={14} /> Tambah webhook
          </button>
        </div>
      </div>
    </div>
  );
}
