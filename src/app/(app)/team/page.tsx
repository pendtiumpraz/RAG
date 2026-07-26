'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { api, useApi } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Skeleton, ErrorState, EmptyState, useToast } from '../../_components/ui';

interface PendingUser {
  id: string; email: string; name: string | null; role: string; status: string;
  tenantId: string; tenantName: string | null; createdAt: string; approvedAt: string | null;
}

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

      {/* Antrean verifikasi menembus batas tenant (tiap signup = tenant sendiri),
          jadi hanya peran platform yang boleh melihatnya. */}
      {u?.role === 'superadmin' && <SignupApprovals />}
    </>
  );
}

/* ── verifikasi pendaftaran (superadmin) ────────────────────────────── */

function SignupApprovals() {
  const [scope, setScope] = useState<'pending' | 'all'>('pending');
  const { data, loading, error, refetch } = useApi<PendingUser[]>(`/api/admin/users?status=${scope}`);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();

  async function setStatus(user: PendingUser, status: 'active' | 'rejected' | 'pending') {
    setBusyId(user.id);
    try {
      await api(`/api/admin/users/${user.id}/status`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      toast(status === 'active' ? `${user.email} diverifikasi — sekarang bisa masuk`
        : status === 'rejected' ? `${user.email} ditolak`
        : `${user.email} dikembalikan ke antrean`);
      refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusyId(null); }
  }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head">
        <span className="t">verifikasi pendaftaran</span>
        <div className="cluster gap-2">
          <span className="microlabel">SUPERADMIN · LINTAS TENANT</span>
          <select className="select" style={{ width: 150, minHeight: 34 }}
            value={scope} onChange={(e) => setScope(e.target.value as 'pending' | 'all')}>
            <option value="pending">Menunggu</option>
            <option value="all">Semua akun</option>
          </select>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={refetch} />
        : loading || !data ? <Skeleton rows={3} />
        : data.length === 0 ? <EmptyState
            title={scope === 'pending' ? 'Tak ada yang menunggu' : 'Belum ada akun'}
            hint={scope === 'pending'
              ? 'Pendaftar baru muncul di sini sebelum bisa masuk.'
              : 'Akun akan muncul setelah ada yang mendaftar.'} />
        : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Nama</th><th>Email</th><th>Organisasi</th><th>Daftar</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name ?? '—'}</b></td>
                  <td style={{ color: 'var(--muted)' }}>{p.email}</td>
                  <td style={{ color: 'var(--muted)' }}>{p.tenantName ?? '—'}</td>
                  <td className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{p.createdAt?.slice(0, 10)}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>
                    <div className="cluster gap-2">
                      {p.status !== 'active' && (
                        <button className={`btn btn-sm btn-primary${busyId === p.id ? ' is-loading' : ''}`}
                          disabled={busyId === p.id} onClick={() => setStatus(p, 'active')}>Verifikasi</button>
                      )}
                      {p.status !== 'rejected' && (
                        <button className="btn btn-sm btn-ghost" disabled={busyId === p.id}
                          onClick={() => setStatus(p, 'rejected')}>Tolak</button>
                      )}
                      {p.status !== 'pending' && (
                        <button className="btn btn-sm btn-ghost" disabled={busyId === p.id}
                          onClick={() => setStatus(p, 'pending')}>Kembalikan</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'active' ? 'badge-ok' : status === 'rejected' ? 'badge-danger' : 'badge-signal';
  const led = status === 'active' ? 'led-live' : status === 'rejected' ? 'led-err' : 'led-off';
  const label = status === 'active' ? 'aktif' : status === 'rejected' ? 'ditolak' : 'menunggu';
  return <span className={`badge ${cls}`}><span className={`led ${led}`} />{label}</span>;
}
