'use client';

import { useSession } from 'next-auth/react';
import { Icon } from '../../_components/icons';
import { useToast } from '../../_components/ui';

/** Anggota tenant. Saat ini menampilkan user aktif (nyata dari sesi);
 *  undang anggota + daftar penuh menyusul (endpoint team belum dibuat). */
export default function TeamPage() {
  const { data: session } = useSession();
  const u = session?.user;
  const toast = useToast();

  return (
    <>
      <div className="page-head">
        <div><h1>Team</h1><p className="sub">Anggota &amp; peran tenant. Data terisolasi oleh Row-Level Security.</p></div>
        <button className="btn btn-primary" onClick={() => toast('Undang anggota — segera hadir')}><Icon name="plus" size={16} /> Undang anggota</button>
      </div>
      <div className="card"><div className="table-wrap"><table className="table">
        <thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Status</th></tr></thead>
        <tbody>
          <tr>
            <td><b>{u?.name ?? 'Kamu'}</b></td>
            <td style={{ color: 'var(--muted)' }}>{u?.email ?? '—'}</td>
            <td><span className="badge badge-source">{(u?.role ?? 'admin')}</span></td>
            <td><span className="badge badge-ok"><span className="led led-live" />aktif</span></td>
          </tr>
        </tbody>
      </table></div></div>
    </>
  );
}
