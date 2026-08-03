'use client';

import { useMemo, useState } from 'react';
import { Icon } from './icons';
import { Select } from './select';
import {
  adaPenyaring, keadaanAwal, klikUrut, nilaiUnik, olahTabel,
  PILIHAN_UKURAN, ubahCari, ubahSaring, ubahUkuran,
  type HasilTabel, type KeadaanTabel, type OpsiTabel,
} from '../_lib/tabel';

/**
 * TABEL — bungkus React tipis di atas `_lib/tabel.ts`.
 *
 * Seluruh aturannya (cari, saring, urut, penggal, penomoran) ada di berkas
 * murni itu dan diuji tanpa merender apa pun. Di sini hanya bentuk visualnya,
 * supaya tak ada satu pun keputusan perilaku yang hidup di dua tempat.
 *
 * KENAPA DI SISI PERAMBAN. Halaman Dokumen menyaring di server karena
 * korpusnya bisa jutaan baris. Sisa modul tidak: chatbot, divisi, anggota,
 * kategori, sumber, transaksi — semuanya sudah terikat kuota paket dan
 * hitungannya puluhan, paling banyak ribuan. Memindahkan semuanya ke server
 * berarti belasan endpoint baru berikut penggalan, urutan, dan penyaringnya
 * masing-masing; tiap satu adalah tempat baru untuk salah, dan tak ada satu
 * pun yang menyelesaikan masalah yang benar-benar dialami. Kalau suatu hari
 * sebuah daftar tumbuh melewati beberapa ribu baris, yang berubah cuma
 * sumber datanya — bentuk komponen ini tetap.
 */

export type { KeadaanTabel } from '../_lib/tabel';

export interface SaringDef<T> {
  /** Kunci penyaring; juga kunci di `opsi.saring`. */
  kunci: string;
  label: string;
  /** Pilihan tetap. Kalau tak diisi, diambil dari nilai unik pada data. */
  pilihan?: Array<{ nilai: string; label: string }>;
  ambil?: (r: T) => string | null | undefined;
  lebar?: number;
}

export interface TabelKendali<T> {
  keadaan: KeadaanTabel;
  hasil: HasilTabel<T>;
  set: (k: KeadaanTabel) => void;
  /** Nomor baris yang BENAR (global, 1-based) untuk baris ke-i di halaman ini. */
  nomor: (i: number) => number;
  urutkan: (kunci: string) => void;
}

/**
 * Satu hook untuk satu tabel.
 *
 * `opsi` harus stabil antar render (bungkus useMemo di pemanggil, atau
 * definisikan di luar komponen) — kalau tidak, tabelnya tetap benar, hanya
 * menghitung ulang lebih sering dari perlunya.
 */
export function useTabel<T>(rows: readonly T[] | null | undefined, opsi: OpsiTabel<T>, ukuran?: number): TabelKendali<T> {
  const [keadaan, set] = useState<KeadaanTabel>(() => keadaanAwal(ukuran));
  const hasil = useMemo(() => olahTabel(rows, opsi, keadaan), [rows, opsi, keadaan]);
  return {
    keadaan, hasil, set,
    nomor: (i: number) => hasil.mulai + i + 1,
    urutkan: (kunci: string) => set(klikUrut(keadaan, kunci)),
  };
}

/* ── bilah alat: cari + penyaring + besar halaman ─────────────────────── */

export function TabelAlat<T>({ t, rows, cariLabel, saring, kanan }: {
  t: TabelKendali<T>;
  /** Data MENTAH — pilihan penyaring diambil dari sini, bukan dari hasil yang
   *  sudah tersaring; kalau tidak, memilih satu nilai akan melenyapkan semua
   *  pilihan lain dan mengunci orang pada pilihannya sendiri. */
  rows: readonly T[] | null | undefined;
  cariLabel?: string;
  saring?: Array<SaringDef<T>>;
  kanan?: React.ReactNode;
}) {
  return (
    <div className="cluster gap-2 tabel-alat">
      <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
        <input
          className="input" type="search" value={t.keadaan.q}
          onChange={(e) => t.set(ubahCari(t.keadaan, e.target.value))}
          placeholder={cariLabel ?? 'Cari…'} aria-label={cariLabel ?? 'Cari'}
          style={{ paddingLeft: 34 }}
        />
        <span aria-hidden style={{
          position: 'absolute', left: 10, top: '50%',
          transform: 'translateY(-50%)', color: 'var(--muted)',
        }}><Icon name="search" size={15} /></span>
      </div>

      {(saring ?? []).map((s) => (
        <SaringPilih key={s.kunci} t={t} rows={rows} def={s} />
      ))}

      {adaPenyaring(t.keadaan) && (
        <button
          className="btn btn-sm"
          onClick={() => t.set({ ...t.keadaan, q: '', saring: {}, halaman: 1 })}
        >Bersihkan</button>
      )}

      {kanan}
    </div>
  );
}

function SaringPilih<T>({ t, rows, def }: {
  t: TabelKendali<T>; rows: readonly T[] | null | undefined; def: SaringDef<T>;
}) {
  const pilihan = useMemo(() => (
    def.pilihan ?? nilaiUnik(rows, def.ambil ?? (() => null)).map((v) => ({ nilai: v, label: v }))
  ), [def, rows]);
  return (
    <Select
      style={{ width: def.lebar ?? 170 }}
      aria-label={def.label}
      value={t.keadaan.saring[def.kunci] ?? ''}
      onChange={(e) => t.set(ubahSaring(t.keadaan, def.kunci, e.target.value))}
    >
      <option value="">{def.label}</option>
      {pilihan.map((p) => <option key={p.nilai} value={p.nilai}>{p.label}</option>)}
    </Select>
  );
}

/* ── kepala kolom yang bisa diurutkan ─────────────────────────────────── */

/**
 * Kepala kolom terurut. Dirender sebagai `<button>` di dalam `<th>`, bukan
 * `onClick` pada `<th>`: sel tabel tak bisa difokus papan ketik dan tak
 * mengumumkan dirinya bisa ditekan, jadi tabel yang "bisa diurutkan" itu
 * sebenarnya hanya bisa diurutkan oleh pengguna tetikus.
 */
export function Th<T>({ t, kunci, children, num }: {
  t: TabelKendali<T>; kunci?: string; children?: React.ReactNode; num?: boolean;
}) {
  if (!kunci) return <th className={num ? 'num' : undefined}>{children}</th>;
  const aktif = t.keadaan.urut === kunci;
  const arah = aktif ? (t.keadaan.arah === 'naik' ? 'ascending' : 'descending') : 'none';
  return (
    <th className={num ? 'num' : undefined} aria-sort={arah}>
      <button
        type="button" className={`th-urut${aktif ? ' on' : ''}`}
        onClick={() => t.urutkan(kunci)}
        title={aktif && t.keadaan.arah === 'turun' ? 'Klik untuk melepas urutan' : 'Urutkan'}
      >
        <span>{children}</span>
        <i aria-hidden className="th-arah">{aktif ? (t.keadaan.arah === 'naik' ? '▲' : '▼') : '↕'}</i>
      </button>
    </th>
  );
}

/** Kolom nomor. Lebar tetap supaya angka tak menggeser kolom saat halaman
 *  berganti dari 9 ke 10. */
export function ThNo() {
  return <th className="col-no" scope="col" title="Nomor urut">#</th>;
}
export function TdNo({ n }: { n: number }) {
  return <td className="col-no">{n.toLocaleString('id-ID')}</td>;
}

/* ── kaki: jumlah + penggalan ─────────────────────────────────────────── */

export function TabelKaki<T>({ t, satuan = 'baris' }: { t: TabelKendali<T>; satuan?: string }) {
  const { hasil, keadaan } = t;
  if (hasil.totalMentah === 0) return null;
  const dari = hasil.total === 0 ? 0 : hasil.mulai + 1;
  const sampai = hasil.mulai + hasil.tampil.length;
  return (
    <div className="tabel-kaki">
      <span className="sub">
        {/* Menyebut TOTAL, bukan sekadar maju-mundur: tanpa angka itu orang tak
            tahu ada berapa banyak dan berhenti menggali terlalu cepat. */}
        {dari.toLocaleString('id-ID')}–{sampai.toLocaleString('id-ID')} dari{' '}
        <b>{hasil.total.toLocaleString('id-ID')}</b> {satuan}
        {hasil.total !== hasil.totalMentah
          && <span className="microlabel" style={{ marginLeft: 8 }}>
            DISARING DARI {hasil.totalMentah.toLocaleString('id-ID')}
          </span>}
      </span>

      <div className="cluster gap-2">
        <Select
          style={{ width: 96 }} aria-label="Baris per halaman"
          value={String(keadaan.ukuran)}
          onChange={(e) => t.set(ubahUkuran(keadaan, Number(e.target.value)))}
        >
          {PILIHAN_UKURAN.map((n) => <option key={n} value={String(n)}>{n} / hlm</option>)}
        </Select>
        <button
          className="btn btn-sm" disabled={hasil.halaman <= 1}
          onClick={() => t.set({ ...keadaan, halaman: hasil.halaman - 1 })}
        >Sebelumnya</button>
        <span className="mono sub" style={{ minWidth: 54, textAlign: 'center' }}>
          {hasil.halaman}/{hasil.halamanTotal}
        </span>
        <button
          className="btn btn-sm" disabled={hasil.halaman >= hasil.halamanTotal}
          onClick={() => t.set({ ...keadaan, halaman: hasil.halaman + 1 })}
        >Berikutnya</button>
      </div>
    </div>
  );
}

/**
 * Baris "tak ada yang cocok" DI DALAM tabel.
 *
 * Sengaja bukan <EmptyState> yang menggantikan seluruh tabel: kalau kepala
 * kolom dan bilah carinya ikut hilang, orang kehilangan tempat untuk
 * membatalkan pencarian yang baru saja ia ketik — dan satu-satunya jalan
 * keluar jadi memuat ulang halaman.
 */
export function BarisKosong<T>({ t, kolom }: { t: TabelKendali<T>; kolom: number }) {
  if (t.hasil.tampil.length > 0) return null;
  return (
    <tr>
      <td colSpan={kolom} style={{ textAlign: 'center', padding: 'var(--sp-6)', color: 'var(--muted)' }}>
        Tak ada yang cocok dengan pencarian atau penyaring ini.{' '}
        <button className="btn btn-sm" style={{ marginLeft: 6 }}
          onClick={() => t.set({ ...t.keadaan, q: '', saring: {}, halaman: 1 })}>Bersihkan</button>
      </td>
    </tr>
  );
}
