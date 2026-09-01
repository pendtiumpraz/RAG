'use client';

import { useState } from 'react';
import { api, useApi } from '../../_lib/api';
import { Skeleton, useToast, Field } from '../../_components/ui';
import { konfirmasi } from '../../_components/alert';
import { Select } from '../../_components/select';
import { BarisKosong, TabelAlat, TabelKaki, TdNo, Th, ThNo, useTabel } from '../../_components/tabel';
import type { OpsiTabel } from '../../_lib/tabel';

/**
 * PERINGATAN — ke mana ia dikirim, dan apa saja yang pernah berbunyi.
 *
 * Dua bagian yang sengaja SATU layar. Pertanyaan "sejak kapan ini rusak?"
 * hampir selalu datang bersama "kenapa aku tak diberi tahu?", dan memisahkan
 * riwayat dari salurannya memaksa orang membuka dua halaman untuk menjawab
 * satu kejadian.
 *
 * URL SLACK TAK PERNAH DIKIRIM KE PERAMBAN — server hanya mengabarkan apakah
 * ia terpasang. Ia kredensial penuh: yang memegangnya bisa menulis ke kanal
 * itu selamanya, dan halaman pengaturan adalah tempat paling mudah untuk
 * bocor (tangkapan layar, sesi yang tertinggal terbuka, ekstensi peramban).
 */

interface Saluran { email: string | null; slackTerpasang: boolean; minLevel: string }
interface Riwayat { action: string; meta: Record<string, unknown>; createdAt: string }
interface Data { saluran: Saluran; riwayat: Riwayat[] }

const TINGKAT: Record<string, { label: string; cls: string }> = {
  gawat: { label: 'gawat', cls: 'badge-danger' },
  perhatian: { label: 'perhatian', cls: 'badge-source' },
};

/** `alert.sync.gagal` → `sync.gagal`. Awalannya sama untuk semua baris. */
const jenis = (action: string) => action.replace(/^alert\./, '');
const tingkatDari = (r: Riwayat) => String(r.meta?.tingkat ?? '—');
const pesanDari = (r: Riwayat) => String(r.meta?.pesan ?? '');

const OPSI: OpsiTabel<Riwayat> = {
  cari: (r) => [jenis(r.action), pesanDari(r), tingkatDari(r)],
  saring: { jenis: (r) => jenis(r.action), tingkat: tingkatDari },
  urut: { createdAt: (r) => r.createdAt, jenis: (r) => jenis(r.action), tingkat: tingkatDari },
};

export default function Peringatan() {
  const { data, loading, refetch } = useApi<Data>('/api/alerts');
  const t = useTabel(data?.riwayat ?? [], OPSI);
  const toast = useToast();

  const [email, setEmail] = useState<string | null>(null);
  const [slack, setSlack] = useState('');
  const [minLevel, setMinLevel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* Nilai form baru "hidup" setelah disentuh; sebelum itu ia mengikuti server.
     Menyalin data ke state lewat useEffect akan menimpa ketikan orang tiap
     kali polling datang — bug yang terasa seperti papan ketik rusak. */
  const emailNyata = email ?? data?.saluran.email ?? '';
  const minNyata = minLevel ?? data?.saluran.minLevel ?? 'gawat';

  async function simpan() {
    setBusy(true);
    try {
      await api('/api/alerts', {
        method: 'PATCH',
        body: JSON.stringify({
          email: emailNyata,
          /* Kosong = jangan sentuh. Mengirim '' akan MENCABUT Slack tiap kali
             orang menyimpan perubahan email tanpa mengetik ulang URL-nya. */
          ...(slack.trim() ? { slackUrl: slack.trim() } : {}),
          minLevel: minNyata,
        }),
      });
      setSlack('');
      toast('Saluran peringatan disimpan'); refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function cabutSlack() {
    if (!await konfirmasi({
      judul: 'Cabut URL Slack?',
      pesan: 'Peringatan berhenti dikirim ke kanal itu sampai URL baru dipasang.',
      tegas: 'Cabut URL', merusak: true,
    })) return;
    setBusy(true);
    try {
      await api('/api/alerts', { method: 'PATCH', body: JSON.stringify({ slackUrl: '' }) });
      toast('URL Slack dicabut'); refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function uji() {
    setBusy(true);
    try {
      const r = await api<{ email: boolean; slack: boolean; dilewati: boolean }>(
        '/api/alerts', { method: 'POST' });
      /* Melaporkan APA yang sampai, bukan "terkirim". Uji yang bilang berhasil
         padahal tak ada saluran terpasang adalah cara paling rapi membuat
         orang mengira pemantauannya hidup. */
      const sampai = [r.email && 'email', r.slack && 'Slack'].filter(Boolean).join(' & ');
      toast(sampai ? `Uji terkirim lewat ${sampai}` : 'Tak ada saluran yang menerima — periksa isian di atas', sampai ? 'ok' : 'error');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
        <div className="panel-head"><span className="t">saluran peringatan</span>
          <span className="microlabel">SYNC GAGAL · KUOTA HABIS · GALAT MELONJAK</span></div>
        {loading && !data ? <Skeleton rows={3} /> : (
          <div className="card-pad stack gap-4">
            <p className="sub" style={{ margin: 0 }}>
              Tanpa saluran di sini, peringatan hanya sampai ke webhook keluar — dan sync
              yang gagal jam dua pagi tak memberi tahu siapa pun sampai ada yang kebetulan
              membuka halaman Knowledge.
            </p>

            <Field label="Email penerima" hint="KOSONGKAN UNTUK MEMATIKAN. ALAMAT MILIS/GRUP BOLEH — SATU ALAMAT SAJA.">
              <input className="input" type="email" value={emailNyata}
                placeholder="ops@perusahaan.co.id"
                onChange={(e) => setEmail(e.target.value)} />
            </Field>

            <Field label="URL incoming-webhook Slack"
              hint={data?.saluran.slackTerpasang
                ? 'SUDAH TERPASANG — ISI HANYA BILA INGIN MENGGANTINYA. URL-NYA TAK PERNAH DIKIRIM KEMBALI KE PERAMBAN.'
                : 'SLACK → APPS → INCOMING WEBHOOKS → ADD NEW WEBHOOK, LALU TEMPEL DI SINI.'}>
              <input className="input mono" value={slack}
                placeholder={data?.saluran.slackTerpasang ? '•••••••• tersimpan' : 'https://hooks.slack.com/services/…'}
                onChange={(e) => setSlack(e.target.value)} />
            </Field>

            <Field label="Kirim mulai tingkat"
              hint="BAWAANNYA GAWAT — SENGAJA YANG PALING SUNYI. PERINGATAN YANG BERISIK MELATIH ORANG MENGABAIKANNYA, DAN PADA HARI IA BERBUNYI UNTUK HAL YANG BENAR-BENAR BARU TAK ADA LAGI YANG MEMBACANYA.">
              <Select value={minNyata} onChange={(e) => setMinLevel(e.target.value)}>
                <option value="gawat">Gawat saja</option>
                <option value="perhatian">Perhatian & gawat</option>
              </Select>
            </Field>

            <div className="cluster gap-2">
              <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} disabled={busy} onClick={simpan}>
                Simpan
              </button>
              <button className="btn" disabled={busy} onClick={uji}>Kirim uji</button>
              {data?.saluran.slackTerpasang && (
                <button className="btn btn-ghost" disabled={busy} onClick={cabutSlack}>Cabut Slack</button>
              )}
            </div>

            <p className="microlabel">
              PERINGATAN SEJENIS DIREDAM BEBERAPA JAM SETELAH BERBUNYI — SATU FOLDER YANG IZINNYA
              DICABUT TIDAK AKAN MENGIRIM BELASAN PESAN IDENTIK PER HARI.
            </p>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
        <div className="panel-head"><span className="t">riwayat peringatan</span>
          <span className="microlabel">{data?.riwayat.length ?? 0} TERCATAT · 200 TERAKHIR</span></div>
        {loading && !data ? <Skeleton rows={3} />
          : (data?.riwayat.length ?? 0) === 0 ? (
            <div className="card-pad">
              <p className="sub" style={{ margin: 0 }}>
                Belum ada peringatan yang pernah berbunyi. Itu kabar baik — dan halaman ini
                yang akan membuktikannya kalau suatu hari ada yang bertanya sejak kapan
                sesuatu rusak.
              </p>
            </div>
          ) : (
            <div className="card-pad stack gap-4">
              <TabelAlat
                t={t} rows={data!.riwayat} cariLabel="Cari jenis atau isi peringatan"
                saring={[
                  { kunci: 'jenis', label: 'Semua jenis', lebar: 175, ambil: (r) => jenis(r.action) },
                  { kunci: 'tingkat', label: 'Semua tingkat', lebar: 160, pilihan: [
                    { nilai: 'gawat', label: 'Gawat' }, { nilai: 'perhatian', label: 'Perhatian' },
                  ] },
                ]}
              />
              <div className="table-wrap"><table className="table">
                <thead><tr>
                  <ThNo />
                  <Th t={t} kunci="createdAt">Waktu</Th>
                  <Th t={t} kunci="tingkat">Tingkat</Th>
                  <Th t={t} kunci="jenis">Jenis</Th>
                  <th>Pesan</th>
                </tr></thead>
                <tbody>
                  <BarisKosong t={t} kolom={5} />
                  {t.hasil.tampil.map((r, i) => {
                    const tk = TINGKAT[tingkatDari(r)];
                    return (
                      <tr key={`${r.createdAt}:${i}`}>
                        <TdNo n={t.nomor(i)} />
                        <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                          {new Date(r.createdAt).toLocaleString('id-ID')}
                        </td>
                        <td>
                          <span className={`badge ${tk?.cls ?? ''}`}>{tk?.label ?? tingkatDari(r)}</span>
                        </td>
                        <td className="mono" style={{ fontSize: 12 }}>{jenis(r.action)}</td>
                        <td style={{ fontSize: 13 }}>{pesanDari(r)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
              <TabelKaki t={t} satuan="peringatan" />
            </div>
          )}
      </div>
    </>
  );
}
