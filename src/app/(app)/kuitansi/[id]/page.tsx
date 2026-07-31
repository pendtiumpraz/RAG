'use client';

import { use } from 'react';
import { useApi } from '../../../_lib/api';
import { Skeleton, ErrorState } from '../../../_components/ui';
import { rupiah, terbilangRupiah } from '@/modules/payments/kuitansi';
import './kuitansi.css';

/**
 * KUITANSI PEMBAYARAN — dirancang untuk DICETAK.
 *
 * PDF-nya dihasilkan mesin cetak peramban (Ctrl+P → simpan sebagai PDF),
 * bukan pustaka pembuat PDF di server. Itu keputusan sadar: pustaka PDF
 * menambah beban ke bundel lambda demi satu halaman yang dibuka beberapa kali
 * setahun, sementara hasil cetak peramban adalah PDF sungguhan yang bisa
 * dilampirkan ke pembukuan mana pun. Yang dikorbankan: berkasnya tak bisa
 * dikirim otomatis lewat email tanpa langkah manusia.
 *
 * INI KUITANSI, BUKAN FAKTUR PAJAK — dan halamannya mengatakan itu, karena
 * berkas yang mengaku faktur pajak justru merepotkan pelanggan saat diperiksa.
 */

interface Penerbit {
  legalName?: string; address?: string; npwp?: string; email?: string; phone?: string;
}
interface Kuitansi {
  nomor: string; uraian: string; amount: number; plan: string; months: number;
  provider: string; paidAt: string | null; penerbit: Penerbit | null;
}

const tanggal = (iso: string | null) => (iso
  ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  : '—');

export default function KuitansiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, loading, error, refetch } = useApi<Kuitansi>(`/api/payments/${id}/kuitansi`);

  if (error) return <div className="card"><ErrorState message={error} onRetry={refetch} /></div>;
  if (loading || !data) return <div className="card"><Skeleton rows={6} /></div>;

  const p = data.penerbit;
  const adaPenerbit = Boolean(p?.legalName);

  return (
    <>
      {/* Batang aksi ini TIDAK ikut tercetak (lihat kuitansi.css). */}
      <div className="page-head kw-aksi">
        <div>
          <h1>Kuitansi</h1>
          <p className="sub">Cetak atau simpan sebagai PDF lewat menu cetak peramban.</p>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}>Cetak / Simpan PDF</button>
      </div>

      {!adaPenerbit && (
        <div className="card kw-aksi" style={{ marginBottom: 'var(--sp-4)', borderColor: 'var(--warn)' }}>
          <div className="card-pad" style={{ fontSize: 14, lineHeight: 1.6 }}>
            <b>Identitas penerbit belum diisi.</b> Bagian keuangan biasanya menolak kuitansi tanpa
            nama badan hukum dan alamat penerbitnya. Superadmin bisa mengisinya di{' '}
            <a href="/settings">Settings</a> — kuitansi ini tetap bisa dicetak, tapi kolom
            penerbitnya akan kosong.
          </div>
        </div>
      )}

      <div className="kw">
        <header className="kw-head">
          <div>
            <div className="kw-judul">KUITANSI PEMBAYARAN</div>
            <div className="kw-nomor">{data.nomor}</div>
          </div>
          <div className="kw-penerbit">
            {adaPenerbit ? (
              <>
                <b>{p!.legalName}</b>
                {p!.address && <div>{p!.address}</div>}
                {p!.npwp && <div>NPWP {p!.npwp}</div>}
                {p!.email && <div>{p!.email}</div>}
                {p!.phone && <div>{p!.phone}</div>}
              </>
            ) : (
              <span className="kw-kosong">[ identitas penerbit belum diisi ]</span>
            )}
          </div>
        </header>

        <table className="kw-tabel">
          <tbody>
            <tr><th>Telah diterima dari</th><td>Pelanggan pemegang akun Nalar ini</td></tr>
            <tr><th>Uang sejumlah</th><td><b>{rupiah(data.amount)}</b></td></tr>
            <tr><th>Terbilang</th><td><i>{terbilangRupiah(data.amount)}</i></td></tr>
            <tr><th>Untuk pembayaran</th><td>{data.uraian}</td></tr>
            <tr><th>Metode</th><td>{data.provider.toUpperCase()} · QRIS</td></tr>
            <tr><th>Tanggal lunas</th><td>{tanggal(data.paidAt)}</td></tr>
          </tbody>
        </table>

        <footer className="kw-kaki">
          <p>
            Dokumen ini adalah <b>kuitansi</b> (bukti penerimaan uang), <b>bukan faktur pajak</b>.
            Faktur pajak diterbitkan terpisah oleh Wajib Pajak berstatus PKP melalui e-Faktur.
          </p>
          <p className="kw-sah">
            Diterbitkan otomatis oleh sistem dan sah tanpa tanda tangan basah.
          </p>
        </footer>
      </div>
    </>
  );
}
