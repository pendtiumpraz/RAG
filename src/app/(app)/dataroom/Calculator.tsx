'use client';

import { useState } from 'react';
import {
  PLAN_LIMITS, BYTES_PER_CHUNK, INDEX_BYTES_PER_CHUNK, CHUNKS_PER_DOC,
} from '@/modules/core/limits';

/** Potongan maju ±680 karakter (800 dikurangi tumpang tindih 120) — angka yang
 *  sama dengan slide penyimpanan di dek HLA. */
const CHAR_PER_CHUNK = 680;

/**
 * KALKULATOR KAPASITAS — simulasi "berapa penyewa yang muat".
 *
 * Semua rumusnya bertumpu pada DUA angka terukur, bukan perkiraan:
 *   • 2.852 byte per potongan di tabel (pg_column_size, SETELAH halfvec 0035)
 *   • ±804 byte per potongan untuk indeks vektor berdimensi asli + halfvec
 * dan pada kuota yang benar-benar ditegakkan di `core/limits.ts`. Kalau
 * kuotanya diubah, kalkulator ini ikut berubah — tak ada dua kebenaran.
 *
 * Yang membuat alat ini berguna bukan hasilnya, melainkan ASUMSINYA yang
 * bisa disentuh: "rata-rata terpakai" ada karena tak ada penyewa yang
 * memakai 100% jatahnya, dan menghitung seolah semuanya penuh akan
 * melahirkan spesifikasi server yang jauh lebih mahal dari yang dibutuhkan.
 */

/** Atap tiap pilihan infrastruktur — RAM menentukan mode langsung, disk mode bertingkat. */
const ATAP = [
  { id: 'neon', t: 'Vercel Pro + Neon', ram: 64, disk: 2_000, n: 'atap tertinggi Neon: 16 CU' },
  { id: 'onprem-64', t: 'On-premise 64 GB', ram: 64, disk: 2_000, n: 'server milik pelanggan — spesifikasi minimum proposal' },
  { id: 'onprem-128', t: 'On-premise 128 GB', ram: 128, disk: 4_000, n: 'server milik pelanggan — spesifikasi yang direkomendasikan proposal' },
  { id: 'onprem-256', t: 'On-premise 256 GB', ram: 256, disk: 8_000, n: 'server milik pelanggan — di atas rekomendasi' },
  { id: 'aws', t: 'AWS memori besar', ram: 768, disk: 16_000, n: 'instans terbesar, biaya tertinggi' },
] as const;

const PLANS = ['free', 'pro', 'enterprise'] as const;
const LABEL: Record<string, string> = { free: 'Free', pro: 'Pro', enterprise: 'Enterprise' };

const fmt = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1).replace('.', ',')} M`
    : n >= 1e6 ? `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0).replace('.', ',')} jt`
    : n >= 1e3 ? `${Math.round(n / 1e3).toLocaleString('id-ID')} rb`
    : Math.round(n).toLocaleString('id-ID');

const gb = (bytes: number) =>
  bytes >= 1e12 ? `${(bytes / 1e12).toFixed(1).replace('.', ',')} TB`
    : `${(bytes / 1e9).toFixed(bytes < 1e10 ? 1 : 0).replace('.', ',')} GB`;

export default function Calculator() {
  const [n, setN] = useState<Record<string, number>>({ free: 80, pro: 18, enterprise: 2 });
  /** Berapa persen jatah yang benar-benar dipakai penyewa rata-rata. */
  const [isi, setIsi] = useState(35);
  const [target, setTarget] = useState<string>('neon');
  /** Bagian berkas sumber yang benar-benar jadi teks — sangat bergantung jenis
   *  berkas, jadi ia asumsi yang HARUS bisa disentuh, bukan angka tetap. */
  const [rasio, setRasio] = useState(2);

  const atap = ATAP.find((a) => a.id === target)!;

  /* ── hitungan ─────────────────────────────────────────────────────
     Potongan = jumlah penyewa × kuota paketnya × persentase terpakai.
     Enterprise dihitung dari kuotanya yang BERHINGGA (2 juta potongan);
     kalau ia dianggap tanpa batas, seluruh simulasi jadi tak berarti. */
  const perPlan = PLANS.map((p) => {
    const kuota = PLAN_LIMITS[p].maxChunks;
    const potongan = (n[p] ?? 0) * kuota * (isi / 100);
    return { p, tenants: n[p] ?? 0, kuota, potongan };
  });
  const totalTenant = perPlan.reduce((s, r) => s + r.tenants, 0);
  const totalPotongan = perPlan.reduce((s, r) => s + r.potongan, 0);

  const ramDatar = totalPotongan * INDEX_BYTES_PER_CHUNK;
  const ramTingkat = (totalPotongan / CHUNKS_PER_DOC) * INDEX_BYTES_PER_CHUNK;
  const disk = totalPotongan * (BYTES_PER_CHUNK + INDEX_BYTES_PER_CHUNK);

  const ramAtap = atap.ram * 1e9;
  const diskAtap = atap.disk * 1e9;
  const muatDatar = ramDatar <= ramAtap;
  const muatTingkat = ramTingkat <= ramAtap && disk <= diskAtap;

  /** Berapa penyewa lagi yang muat pada komposisi yang sama. */
  const sisaFaktor = totalPotongan > 0
    ? Math.min(ramAtap / ramDatar, diskAtap / disk)
    : Infinity;

  return (
    <div className="dr-assess up">
      <section className="as-sec">
        <header>
          <h2>Kalkulator kapasitas</h2>
          <span className="microlabel">SEMUA ANGKA DARI KUOTA YANG DITEGAKKAN KODE</span>
        </header>
        <p className="desc">
          Geser jumlah penyewa tiap paket untuk melihat berapa yang muat sebelum
          infrastrukturnya harus naik. Dua angka dasarnya terukur di produksi:
          <b> 2.852 byte per potongan</b> di tabel dan <b>±804 byte</b> untuk
          indeks vektornya. Kuota paket diambil langsung dari <code>core/limits.ts</code>.
        </p>

        {/* penggaris penyewa */}
        <div className="calc-grid">
          {PLANS.map((p) => (
            <label key={p} className="calc-row">
              <span className="calc-lab">
                <b>{LABEL[p]}</b>
                <span className="microlabel">{fmt(PLAN_LIMITS[p].maxChunks)} POTONGAN · ±{fmt(PLAN_LIMITS[p].maxChunks / CHUNKS_PER_DOC)} DOKUMEN</span>
              </span>
              <input
                type="range" min={0} max={p === 'enterprise' ? 50 : 500} step={p === 'enterprise' ? 1 : 5}
                value={n[p] ?? 0}
                onChange={(e) => setN((s) => ({ ...s, [p]: Number(e.target.value) }))}
              />
              <input
                type="number" className="input calc-num" min={0} value={n[p] ?? 0}
                onChange={(e) => setN((s) => ({ ...s, [p]: Math.max(0, Number(e.target.value) || 0) }))}
              />
            </label>
          ))}

          <label className="calc-row">
            <span className="calc-lab">
              <b>Rata-rata jatah terpakai</b>
              <span className="microlabel">TAK ADA PENYEWA YANG MEMAKAI 100% KUOTANYA</span>
            </span>
            <input type="range" min={5} max={100} step={5} value={isi}
              onChange={(e) => setIsi(Number(e.target.value))} />
            <span className="calc-num mono" style={{ textAlign: 'center', lineHeight: '38px' }}>{isi}%</span>
          </label>

          <label className="calc-row">
            <span className="calc-lab"><b>Infrastruktur</b><span className="microlabel">{atap.n.toUpperCase()}</span></span>
            <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}
              style={{ gridColumn: '2 / span 2' }}>
              {ATAP.map((a) => <option key={a.id} value={a.id}>{a.t} — {a.ram} GB RAM · {a.disk / 1000} TB disk</option>)}
            </select>
          </label>
        </div>
      </section>

      {/* hasil */}
      <div className="as-summary" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="as-overall">
          <span className="microlabel">TOTAL PENYEWA</span>
          <b>{totalTenant}<small> tenant</small></b>
          <span className="delta">{fmt(totalPotongan)} potongan · ±{fmt(totalPotongan / CHUNKS_PER_DOC)} dokumen</span>
        </div>
        <div className="as-overall">
          <span className="microlabel">RAM — MODE LANGSUNG</span>
          <b style={{ color: muatDatar ? undefined : 'var(--source)' }}>{gb(ramDatar)}</b>
          <span className="delta">{muatDatar ? `muat di ${atap.ram} GB` : `melebihi ${atap.ram} GB`}</span>
        </div>
        <div className="as-overall">
          <span className="microlabel">RAM — MODE BERTINGKAT</span>
          <b style={{ color: muatTingkat ? undefined : 'var(--source)' }}>{gb(ramTingkat)}</b>
          <span className="delta">{muatTingkat ? `muat di ${atap.ram} GB` : 'melebihi atap'}</span>
        </div>
        <div className="as-overall">
          <span className="microlabel">DISK</span>
          <b style={{ color: disk <= diskAtap ? undefined : 'var(--source)' }}>{gb(disk)}</b>
          <span className="delta">dari {atap.disk / 1000} TB tersedia</span>
        </div>
      </div>

      {/* penggaris visual */}
      <section className="as-sec">
        <header><h2>Di mana posisinya</h2><span className="microlabel">TERHADAP ATAP {atap.t.toUpperCase()}</span></header>
        <div className="calc-bars">
          {[
            { t: 'Mode langsung — indeks harus residen di RAM', v: ramDatar, max: ramAtap, unit: gb },
            { t: 'Mode bertingkat — hanya vektor dokumen di RAM', v: ramTingkat, max: ramAtap, unit: gb },
            { t: 'Disk — baris + indeks', v: disk, max: diskAtap, unit: gb },
          ].map((b) => {
            const pct = Math.min(100, (b.v / b.max) * 100);
            const lewat = b.v > b.max;
            return (
              <div key={b.t} className="calc-bar">
                <div className="cb-head">
                  <span>{b.t}</span>
                  <span className="mono">{b.unit(b.v)} / {b.unit(b.max)}</span>
                </div>
                <div className="cb-track">
                  <div className="cb-fill" style={{
                    width: `${pct}%`,
                    background: lewat ? 'var(--source-mark)' : pct > 75 ? 'var(--source-mark)' : 'var(--signal)',
                  }} />
                </div>
                {lewat && <span className="microlabel" style={{ color: 'var(--source)' }}>MELEBIHI ATAP — PERLU INFRASTRUKTUR LEBIH BESAR</span>}
              </div>
            );
          })}
        </div>

        <p className="desc" style={{ marginTop: 14 }}>
          {totalPotongan === 0 ? 'Geser salah satu penggaris untuk memulai.'
            : sisaFaktor >= 1
              ? <>Pada komposisi ini masih ada ruang <b>{sisaFaktor.toFixed(1).replace('.', ',')}×</b> lipat
                  sebelum atapnya tersentuh — setara <b>±{Math.round(totalTenant * sisaFaktor)} penyewa</b> dengan
                  bauran yang sama.</>
              : <>Komposisi ini <b>melebihi</b> atap {atap.t}. Turunkan jumlah penyewa, aktifkan
                  mode bertingkat, atau pilih infrastruktur yang lebih besar.</>}
        </p>
      </section>

      {/* penerjemah GB sumber → kuota potongan */}
      <section className="as-sec">
        <header>
          <h2>Dari GB berkas ke kuota potongan</h2>
          <span className="microlabel">UNTUK MENENTUKAN KUOTA TIAP PAKET</span>
        </header>
        <p className="desc">
          Kuota dibatasi per POTONGAN karena itulah satuan biaya yang nyata. Tabel ini
          menerjemahkannya ke satuan yang dimengerti calon pelanggan — &ldquo;berapa GB
          berkas Drive yang muat&rdquo;. Rasio teks bisa disetel: <b>2%</b> nilai tengah
          korpus perkantoran, <b>3%</b> untuk merencanakan, mendekati <b>100%</b> bila
          isinya CSV atau teks polos.
        </p>
        <div className="calc-row" style={{ maxWidth: 620, marginBottom: 12 }}>
          <span className="calc-lab">
            <b>Rasio teks</b>
            <span className="microlabel">BAGIAN BERKAS YANG BENAR-BENAR JADI TEKS</span>
          </span>
          <input type="range" min={1} max={20} step={1} value={rasio}
            onChange={(e) => setRasio(Number(e.target.value))} />
          <span className="calc-num mono" style={{ textAlign: 'center', lineHeight: '38px' }}>{rasio}%</span>
        </div>
        <div className="table-wrap"><table className="table">
          <thead><tr>
            <th>Paket</th><th>Kuota potongan</th><th>±Dokumen</th>
            <th>±Teks</th><th>±Berkas sumber</th><th>±Basis data</th>
          </tr></thead>
          <tbody>
            {PLANS.map((p) => {
              const kuota = PLAN_LIMITS[p].maxChunks;
              const teks = kuota * CHAR_PER_CHUNK;
              return (
                <tr key={p}>
                  <td><b>{LABEL[p]}</b></td>
                  <td className="mono">{fmt(kuota)}</td>
                  <td className="mono">±{fmt(kuota / CHUNKS_PER_DOC)}</td>
                  <td className="mono">{gb(teks)}</td>
                  <td className="mono"><b>{gb(teks / (rasio / 100))}</b></td>
                  <td className="mono">{gb(kuota * (BYTES_PER_CHUNK + INDEX_BYTES_PER_CHUNK))}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <p className="desc">
          Kolom <b>±Berkas sumber</b> adalah yang paling berguna saat menyusun paket: itulah
          yang calon pelanggan tanyakan. Perhatikan betapa besar pengaruh rasio teks —
          menggeser slider dari 2% ke 10% mengubah &ldquo;berapa GB Drive yang muat&rdquo;
          lima kali lipat, tanpa mengubah kuotanya sama sekali. Itu sebabnya kuota
          <b> tidak</b> dinyatakan dalam GB berkas: dua pelanggan dengan 10 GB Drive bisa
          menghabiskan jatah yang berbeda jauh, tergantung isinya PDF pindaian atau CSV.
        </p>
      </section>

      {/* rincian per paket */}
      <section className="as-sec">
        <header><h2>Rincian per paket</h2><span className="microlabel">PADA {isi}% JATAH TERPAKAI</span></header>
        <div className="table-wrap"><table className="table">
          <thead><tr>
            <th>Paket</th><th>Penyewa</th><th>Kuota/penyewa</th>
            <th>Potongan</th><th>Dokumen</th><th>Disk</th>
          </tr></thead>
          <tbody>
            {perPlan.map((r) => (
              <tr key={r.p}>
                <td><b>{LABEL[r.p]}</b></td>
                <td className="mono">{r.tenants}</td>
                <td className="mono">{fmt(r.kuota)}</td>
                <td className="mono">{fmt(r.potongan)}</td>
                <td className="mono">±{fmt(r.potongan / CHUNKS_PER_DOC)}</td>
                <td className="mono">{gb(r.potongan * (BYTES_PER_CHUNK + INDEX_BYTES_PER_CHUNK))}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="desc">
          Enterprise sengaja dihitung dari kuotanya yang <b>berhingga</b> ({fmt(PLAN_LIMITS.enterprise.maxChunks)} potongan).
          Pada SaaS, penyimpanan tanpa batas berarti platform menanggung biaya yang tak bisa diperkirakan —
          angkanya boleh dinaikkan per pelanggan lewat negosiasi, yang tak boleh adalah tak ada angkanya.
          Paket <b>On-Premise</b> tak muncul di sini karena batasnya server pelanggan sendiri, bukan atap kita.
        </p>
      </section>
    </div>
  );
}
