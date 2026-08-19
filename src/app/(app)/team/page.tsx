'use client';

import { FeatureGate } from '../../_components/entitlements';
import { Select } from '../../_components/select';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { api, useApi } from '../../_lib/api';
import { Icon } from '../../_components/icons';
import { Skeleton, ErrorState, EmptyState, useToast, Pager, type PageMeta, Field, Drawer } from '../../_components/ui';
import { BarisKosong, TabelAlat, TabelKaki, TdNo, Th, ThNo, useTabel } from '../../_components/tabel';
import type { OpsiTabel } from '../../_lib/tabel';
import { PageTabs, type TabDef } from '../../_components/page-tabs';
import { useHashTab } from '../../_lib/useTab';

type TeamTab = 'anggota' | 'undangan' | 'verifikasi';
const TEAM_KEYS: readonly TeamTab[] = ['anggota', 'undangan', 'verifikasi'];

interface PendingUser {
  id: string; email: string; name: string | null; role: string; status: string;
  tenantId: string; tenantName: string | null; createdAt: string; approvedAt: string | null;
}
interface ApprovalPage extends PageMeta { rows: PendingUser[] }
interface Member {
  id: string; email: string; name: string | null; role: string; status: string; createdAt: string;
  /** Divisi (migrasi 0040). null = belum ditempatkan. */
  divisionId: string | null;
}
interface Divisi { id: string; name: string }
interface Invitation { id: string; email: string; role: string; expiresAt: string; acceptedAt: string | null; createdAt: string; expired: boolean }

const OPSI_ANGGOTA: OpsiTabel<Member> = {
  cari: (m) => [m.name, m.email, m.role, m.status],
  saring: {
    role: (m) => m.role,
    status: (m) => m.status,
    /* '-' mewakili "tanpa divisi". Memakai '' akan bertabrakan dengan makna
       "semua", dan anggota yang belum ditempatkan justru yang paling sering
       dicari setelah divisi baru dibuat. */
    divisi: (m) => m.divisionId ?? '-',
  },
  urut: {
    name: (m) => m.name, email: (m) => m.email, role: (m) => m.role,
    status: (m) => m.status, createdAt: (m) => m.createdAt,
  },
};

/** Anggota tenant. Saat ini menampilkan user aktif (nyata dari sesi);
 *  undang anggota + daftar penuh menyusul (endpoint team belum dibuat). */
function TeamPageInner() {
  const { data: session } = useSession();
  const u = session?.user;
  const canInvite = u?.role === 'superadmin' || u?.role === 'admin';

  const members = useApi<Member[]>('/api/team/members');
  const invites = useApi<Invitation[]>(canInvite ? '/api/team/invitations' : null);
  const divisi = useApi<Divisi[]>('/api/divisions');
  const [inviting, setInviting] = useState(false);
  const [pulih, setPulih] = useState<Member | null>(null);
  const toast = useToast();
  const t = useTabel(members.data ?? [], OPSI_ANGGOTA);

  const canSee: Record<TeamTab, boolean> = {
    anggota: true, undangan: canInvite, verifikasi: u?.role === 'superadmin',
  };
  const tabs = ([
    { key: 'anggota', label: 'Anggota' },
    { key: 'undangan', label: 'Undangan' },
    { key: 'verifikasi', label: 'Verifikasi' },
  ] as const satisfies readonly TabDef<TeamTab>[]).filter((tb) => canSee[tb.key]);
  const [tab, setTab] = useHashTab(TEAM_KEYS, 'anggota');
  const active = tabs.some((tb) => tb.key === tab) ? tab : tabs[0].key;

  /* RBAC tenant: admin bisa mengubah peran & mengeluarkan anggota.
     Superadmin & diri sendiri tak bisa disentuh dari sini; pengaman admin
     terakhir ditegakkan server (jangan percaya UI saja). */
  async function changeRole(m: Member, role: string) {
    try {
      await api(`/api/team/members/${m.id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
      toast(`${m.email} sekarang ${role}`); members.refetch();
    } catch (e) { toast((e as Error).message, 'error'); members.refetch(); }
  }
  /* Divisi ditempatkan DI SINI, bukan di halaman Divisi. Menempatkan orang
     dari sisi divisi berarti mencari nama di daftar seluruh organisasi;
     dari sisi orang, jawabannya sudah ada di depan mata bersama perannya —
     dan keduanya menjawab pertanyaan yang sama: ia boleh melihat apa. */
  async function changeDivision(m: Member, divisionId: string) {
    try {
      await api(`/api/team/members/${m.id}`, {
        method: 'PATCH', body: JSON.stringify({ divisionId: divisionId || null }),
      });
      const nama = divisi.data?.find((d) => d.id === divisionId)?.name;
      toast(nama ? `${m.email} masuk divisi ${nama}` : `${m.email} dilepas dari divisinya`);
      members.refetch();
    } catch (e) { toast((e as Error).message, 'error'); members.refetch(); }
  }
  async function removeMember(m: Member) {
    if (!confirm(`Keluarkan ${m.email} dari organisasi? Aksesnya dicabut seketika.`)) return;
    try {
      await api(`/api/team/members/${m.id}`, { method: 'DELETE' });
      toast(`${m.email} dikeluarkan`); members.refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Team</h1><p className="sub">Anggota &amp; peran tenant. Data terisolasi oleh Row-Level Security.</p></div>
        {canInvite && (
          <button className="btn btn-primary" onClick={() => setInviting(true)}>
            <Icon name="plus" size={16} /> Undang anggota
          </button>
        )}
      </div>

      <PageTabs tabs={tabs} active={active} onPick={setTab} label="Bagian tim" />

      {active === 'anggota' &&
      <div className="card">
        <div className="panel-head"><span className="t">anggota</span>
          <span className="microlabel">{members.data?.length ?? 0} ORANG</span></div>
        {members.error ? <ErrorState message={members.error} onRetry={members.refetch} />
          : members.loading || !members.data ? <Skeleton rows={2} />
          : (
            <div className="card-pad stack gap-4">
            <TabelAlat
              t={t} rows={members.data} cariLabel="Cari nama, email, peran, atau status"
              saring={[
                { kunci: 'role', label: 'Semua peran', lebar: 150, ambil: (m) => m.role },
                { kunci: 'status', label: 'Semua status', lebar: 150, ambil: (m) => m.status },
                { kunci: 'divisi', label: 'Semua divisi', lebar: 165, pilihan: [
                  ...(divisi.data ?? []).map((d) => ({ nilai: d.id, label: d.name })),
                  { nilai: '-', label: '— tanpa divisi —' },
                ] },
              ]}
            />
            <div className="table-wrap"><table className="table">
              <thead><tr>
                <ThNo />
                <Th t={t} kunci="name">Nama</Th>
                <Th t={t} kunci="email">Email</Th>
                <Th t={t} kunci="role">Peran</Th>
                {/* Tak bisa diurutkan: yang disimpan baris ini adalah id divisi,
                    dan mengurutkan uuid memberi urutan yang terlihat acak.
                    Menyaringnya tetap berguna, dan itu yang disediakan. */}
                <th>Divisi</th>
                <Th t={t} kunci="status">Status</Th>
                <Th t={t} kunci="createdAt">Bergabung</Th>
                {canInvite && <th />}
              </tr></thead>
              <tbody>
                <BarisKosong t={t} kolom={canInvite ? 8 : 7} />
                {t.hasil.tampil.map((m, idx) => {
                  const untouchable = m.role === 'superadmin' || m.email === u?.email;
                  return (
                    <tr key={m.id}>
                      <TdNo n={t.nomor(idx)} />
                      <td><b>{m.name ?? '—'}</b>{m.email === u?.email && <span className="microlabel" style={{ marginLeft: 8 }}>KAMU</span>}</td>
                      <td style={{ color: 'var(--muted)' }}>{m.email}</td>
                      <td>
                        {canInvite && !untouchable ? (
                          <Select className="select-sm"  style={{ width: 120 }}
                            value={m.role} onChange={(e) => changeRole(m, e.target.value)}>
                            <option value="admin">admin</option>
                            <option value="member">member</option>
                          </Select>
                        ) : <span className="badge badge-source">{m.role}</span>}
                      </td>
                      <td>
                        {/* Admin & superadmin memang melihat SELURUH divisi menurut
                            keputusan produk, jadi menempatkan mereka tak mengubah
                            apa pun — dan pilihan yang tak berpengaruh lebih
                            membingungkan daripada tak ada pilihan sama sekali. */}
                        {m.role === 'member' && canInvite ? (
                          <Select className="select-sm" style={{ width: 150 }}
                            value={m.divisionId ?? ''} onChange={(e) => changeDivision(m, e.target.value)}>
                            <option value="">— tanpa divisi —</option>
                            {(divisi.data ?? []).map((d) => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </Select>
                        ) : m.role === 'member' ? (
                          <span style={{ color: 'var(--muted)' }}>
                            {divisi.data?.find((d) => d.id === m.divisionId)?.name ?? '—'}
                          </span>
                        ) : <span className="microlabel">SEMUA DIVISI</span>}
                      </td>
                      <td><StatusBadge status={m.status} /></td>
                      <td className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{m.createdAt?.slice(0, 10)}</td>
                      {canInvite && (
                        <td>{!untouchable && (
                          <div className="cluster gap-2">
                            {/* Pemulihan berdiri BERDAMPINGAN dengan Keluarkan,
                                bukan tersembunyi di menu: yang membukanya
                                sedang menolong rekan yang tak bisa masuk, dan
                                aksi yang harus dicari dulu tak pernah ketemu
                                pada saat orang sedang panik. */}
                            <button className="btn btn-sm" onClick={() => setPulih(m)}>Pulihkan</button>
                            <button className="btn btn-sm btn-ghost" onClick={() => removeMember(m)}>Keluarkan</button>
                          </div>
                        )}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
            <TabelKaki t={t} satuan="anggota" />
            </div>
          )}
      </div>}

      {active === 'undangan' && canInvite && <Invitations feed={invites} onInvite={() => setInviting(true)} />}

      {/* Antrean verifikasi menembus batas tenant (tiap signup = tenant sendiri),
          jadi hanya peran platform yang boleh melihatnya. */}
      {active === 'verifikasi' && u?.role === 'superadmin' && <SignupApprovals />}

      {/* Drawer/overlay tetap di luar tab — dipicu dari tabel anggota. */}
      {inviting && <InviteDrawer onClose={() => setInviting(false)}
        onSent={() => { invites.refetch(); members.refetch(); }} />}
      {pulih && <PulihkanDrawer member={pulih} onClose={() => setPulih(null)} />}
    </>
  );
}

/* ── undangan anggota ───────────────────────────────────────────────── */

const KEADAAN_UNDANGAN = (i: Invitation) =>
  (i.acceptedAt ? 'diterima' : i.expired ? 'kedaluwarsa' : 'menunggu');

const OPSI_UNDANGAN: OpsiTabel<Invitation> = {
  cari: (i) => [i.email, i.role, KEADAAN_UNDANGAN(i)],
  saring: { keadaan: KEADAAN_UNDANGAN, role: (i) => i.role },
  urut: {
    email: (i) => i.email, role: (i) => i.role,
    keadaan: KEADAAN_UNDANGAN, expiresAt: (i) => i.expiresAt,
  },
};

function Invitations({ feed, onInvite }: {
  feed: ReturnType<typeof useApi<Invitation[]>>; onInvite: () => void;
}) {
  const toast = useToast();
  const t = useTabel(feed.data ?? [], OPSI_UNDANGAN);

  async function revoke(inv: Invitation) {
    try {
      await api(`/api/team/invitations/${inv.id}`, { method: 'DELETE' });
      toast(`Undangan ${inv.email} dicabut`); feed.refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head"><span className="t">undangan</span>
        <button className="btn btn-sm" onClick={onInvite}><Icon name="plus" size={14} /> Undang</button></div>

      {feed.error ? <ErrorState message={feed.error} onRetry={feed.refetch} />
        : feed.loading || !feed.data ? <Skeleton rows={2} />
        : feed.data.length === 0 ? <EmptyState title="Belum ada undangan"
            hint="Undang rekan lewat email; mereka bergabung ke workspace ini, bukan membuat baru."
            action={<button className="btn btn-primary btn-sm" onClick={onInvite}>Undang anggota</button>} />
        : (
          <div className="card-pad stack gap-4">
          <TabelAlat
            t={t} rows={feed.data} cariLabel="Cari email undangan"
            saring={[
              { kunci: 'keadaan', label: 'Semua keadaan', lebar: 160, pilihan: [
                { nilai: 'menunggu', label: 'Menunggu' },
                { nilai: 'diterima', label: 'Diterima' },
                { nilai: 'kedaluwarsa', label: 'Kedaluwarsa' },
              ] },
              { kunci: 'role', label: 'Semua peran', lebar: 145, ambil: (i) => i.role },
            ]}
          />
          <div className="table-wrap"><table className="table">
            <thead><tr>
              <ThNo />
              <Th t={t} kunci="email">Email</Th>
              <Th t={t} kunci="role">Peran</Th>
              <Th t={t} kunci="keadaan">Status</Th>
              <Th t={t} kunci="expiresAt">Berlaku sampai</Th>
              <th />
            </tr></thead>
            <tbody>
              <BarisKosong t={t} kolom={6} />
              {t.hasil.tampil.map((i, idx) => (
                <tr key={i.id}>
                  <TdNo n={t.nomor(idx)} />
                  <td>{i.email}</td>
                  <td><span className="badge badge-source">{i.role}</span></td>
                  <td>
                    {i.acceptedAt
                      ? <span className="badge badge-ok"><span className="led led-live" />diterima</span>
                      : i.expired
                        ? <span className="badge"><span className="led led-off" />kedaluwarsa</span>
                        : <span className="badge badge-signal"><span className="led led-off" />menunggu</span>}
                  </td>
                  <td className="mono" style={{ color: 'var(--muted)', fontSize: 12 }}>{i.expiresAt?.slice(0, 10)}</td>
                  <td>{!i.acceptedAt && (
                    <button className="btn btn-sm btn-ghost" onClick={() => revoke(i)}>Cabut</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <TabelKaki t={t} satuan="undangan" />
          </div>
        )}
    </div>
  );
}

function InviteDrawer({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const toast = useToast();

  async function send() {
    setBusy(true);
    try {
      const r = await api<{ inviteUrl: string }>('/api/team/invitations', {
        method: 'POST', body: JSON.stringify({ email, role }),
      });
      setLink(r.inviteUrl);      // hanya muncul SEKALI — sesudah ini cuma hash yg tersimpan
      onSent();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Drawer onClose={onClose} label="Undang anggota">
        <div className="dh"><h3>Undang anggota</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" size={16} /></button></div>

        {link ? (
          <div className="db stack gap-4">
            <p style={{ fontSize: 14, lineHeight: 1.6 }}>
              Undangan dibuat. <b>Salin tautan ini sekarang</b> — hanya hash-nya
              yang tersimpan, jadi tautannya tidak bisa ditampilkan lagi.
            </p>
            <textarea className="textarea mono" readOnly rows={3} value={link}
              onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 12 }} />
            <button className="btn" onClick={() => {
              navigator.clipboard?.writeText(link).then(() => toast('Tautan disalin'));
            }}>Salin tautan</button>
            <p className="microlabel">BERLAKU 7 HARI · SEKALI PAKAI</p>
          </div>
        ) : (
          <div className="db stack gap-4">
            <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="rekan@perusahaan.com" /></Field>
            <Field label="Peran"><Select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')}>
                <option value="member">Member — pakai chatbot &amp; knowledge</option>
                <option value="admin">Admin — kelola tim &amp; pengaturan</option>
              </Select></Field>
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              Yang diundang bergabung ke workspace ini dan langsung aktif —
              tidak perlu menunggu verifikasi, karena undangan ini sendiri yang
              menjadi jaminannya.
            </p>
          </div>
        )}

        <div className="df">
          {link
            ? <button className="btn btn-primary" onClick={onClose}>Selesai</button>
            : <>
                <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} disabled={busy || !email} onClick={send}>Buat undangan</button>
                <button className="btn btn-ghost" onClick={onClose}>Batal</button>
              </>}
        </div>
      </Drawer>
    </>
  );
}

/* ── pemulihan akun (kartu a-account-recovery) ──────────────────────── */

/**
 * Tautan pemulihan untuk anggota yang tak bisa mengakses emailnya.
 *
 * TIDAK dikirim lewat email — itu inti kartunya. Setiap jalur pemulihan yang
 * ada sebelumnya bermuara ke kotak surat yang justru sudah tak bisa dibuka,
 * jadi mengirim tautan ini ke sana akan mengembalikan buntu yang sama persis.
 * Ia ditampilkan SEKALI di sini, lalu disampaikan lewat jalur yang sudah
 * dipercaya organisasi: tatap muka, telepon, chat internal.
 */
function PulihkanDrawer({ member, onClose }: { member: Member; onClose: () => void }) {
  const toast = useToast();
  const [hasil, setHasil] = useState<{ tautan: string; email: string; berlakuSampai: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function terbitkan() {
    setBusy(true);
    try {
      setHasil(await api(`/api/team/members/${member.id}/recover`, { method: 'POST' }));
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  return (
    <Drawer onClose={onClose} label="Pulihkan akun anggota">
      <div className="dh">
        <h3>Pulihkan akses {member.name ?? member.email}</h3>
        <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="close" size={16} /></button>
      </div>
      <div className="db stack gap-4">
        {!hasil ? (
          <>
            <p className="sub" style={{ margin: 0 }}>
              Untuk anggota yang <b>tak bisa lagi membuka emailnya</b> — resign, domain pindah,
              kotak surat dihapus IT. Semua jalur pemulihan lain bermuara ke email yang sama,
              jadi hanya kamu yang bisa membukanya.
            </p>
            <p className="microlabel">
              KAMU YANG MENJAMIN INI ORANGNYA. TAUTANNYA MEMBERI SIAPA PUN YANG MEMEGANGNYA
              KEMAMPUAN MENGATUR ULANG KATA SANDI AKUN INI. PENERBITANNYA DICATAT DI AUDIT
              LENGKAP DENGAN NAMAMU.
            </p>
            <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} disabled={busy} onClick={terbitkan}>
              Terbitkan tautan pemulihan
            </button>
          </>
        ) : (
          <>
            <Field label={`Tautan sekali pakai untuk ${hasil.email}`}
              hint={`BERLAKU SAMPAI ${new Date(hasil.berlakuSampai).toLocaleString('id-ID')} — SETELAH ITU MATI SENDIRI.`}>
              <div className="mono" style={{
                fontSize: 12.5, wordBreak: 'break-all', background: 'var(--card-2)',
                border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px',
              }}>{hasil.tautan}</div>
            </Field>
            <button className="btn btn-primary" onClick={() => {
              navigator.clipboard?.writeText(hasil.tautan); toast('Tautan disalin');
            }}>Salin tautan</button>
            <p className="microlabel">
              {/* Dikatakan justru di sini, saat tautannya ada di layar dan
                  godaan menempelkannya ke email paling besar. */}
              JANGAN KIRIM LEWAT EMAIL — ITU KOTAK SURAT YANG SEDANG TAK BISA DIBUKA.
              SAMPAIKAN LANGSUNG, LEWAT TELEPON, ATAU CHAT INTERNAL. TAUTAN INI TIDAK DISIMPAN
              DI MANA PUN DAN TAK BISA DITAMPILKAN ULANG.
            </p>
          </>
        )}
      </div>
      <div className="df"><button className="btn" style={{ flex: 1 }} onClick={onClose}>Tutup</button></div>
    </Drawer>
  );
}

/* ── verifikasi pendaftaran (superadmin) ────────────────────────────── */

function SignupApprovals() {
  const [scope, setScope] = useState<'pending' | 'all'>('pending');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [cari, setCari] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();

  /* Pencariannya DIKIRIM KE SERVER — daftar ini berhalaman, jadi menyaringnya
     di peramban hanya akan menyaring 25 baris yang kebetulan tampil. Mengetik
     sebuah email lalu tak menemukannya akan terbaca sebagai "belum mendaftar"
     padahal ia ada di halaman berikutnya, dan ini layar yang dipakai
     memutuskan siapa boleh masuk. */
  useEffect(() => {
    const id = setTimeout(() => { setCari(q); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const { data, loading, error, refetch } = useApi<ApprovalPage>(
    `/api/admin/users?status=${scope}&page=${page}`
    + (cari.trim() ? `&q=${encodeURIComponent(cari.trim())}` : ''));

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
          <input
            className="input select-sm" type="search" style={{ width: 220 }}
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Cari email, nama, organisasi" aria-label="Cari pendaftar"
          />
          <Select className="select-sm"  style={{ width: 150 }}
            value={scope} onChange={(e) => { setScope(e.target.value as 'pending' | 'all'); setPage(1); }}>
            <option value="pending">Menunggu</option>
            <option value="all">Semua akun</option>
          </Select>
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={refetch} />
        : loading || !data ? <Skeleton rows={3} />
        : data.rows.length === 0 ? <EmptyState
            title={cari.trim() ? 'Tak ada yang cocok'
              : scope === 'pending' ? 'Tak ada yang menunggu' : 'Belum ada akun'}
            hint={cari.trim() ? 'Coba kata kunci lain, atau ganti ke "Semua akun".'
              : scope === 'pending'
              ? 'Pendaftar baru muncul di sini sebelum bisa masuk.'
              : 'Akun akan muncul setelah ada yang mendaftar.'} />
        : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th className="col-no">#</th><th>Nama</th><th>Email</th><th>Organisasi</th><th>Daftar</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.rows.map((p, i) => (
                <tr key={p.id}>
                  {/* Nomornya GLOBAL, dihitung dari halaman server — baris
                      pertama halaman 2 bernomor 26, bukan 1. */}
                  <td className="col-no">{((data.page - 1) * data.pageSize + i + 1).toLocaleString('id-ID')}</td>
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
      {data && <Pager meta={data} onPage={setPage} />}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'active' ? 'badge-ok' : status === 'rejected' ? 'badge-danger' : 'badge-signal';
  const led = status === 'active' ? 'led-live' : status === 'rejected' ? 'led-err' : 'led-off';
  const label = status === 'active' ? 'aktif' : status === 'rejected' ? 'ditolak' : 'menunggu';
  return <span className={`badge ${cls}`}><span className={`led ${led}`} />{label}</span>;
}

/** Gate plan (D14): halaman ini fitur berbayar — Free melihat ajakan upgrade
 *  yang menjelaskan apa yang dibuka, bukan sekadar penolakan. */
export default function TeamPage() {
  return (
    <FeatureGate feature="team" title="Anggota tim & RBAC"
      benefit="Undang rekan lewat email, atur peran admin/member, dan kelola siapa yang boleh mengubah chatbot serta knowledge base.">
      <TeamPageInner />
    </FeatureGate>
  );
}
