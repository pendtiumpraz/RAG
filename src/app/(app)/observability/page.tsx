'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useApi } from '../../_lib/api';
import { Skeleton, ErrorState, EmptyState } from '../../_components/ui';
import { Select } from '../../_components/select';
import { BarisKosong, TabelAlat, TabelKaki, TdNo, Th, ThNo, useTabel } from '../../_components/tabel';
import type { OpsiTabel } from '../../_lib/tabel';

interface Aksi { action: string; count: number }
interface Galat { at: string; tenantId: string; message: string }
interface TenantSibuk { tenantId: string; name: string; messages: number }

interface Ops {
  window: string;
  actions: Aksi[];
  errors: Galat[];
  guardrail: { flagged: number };
  usage: { tenants: number; messages: number; tokensIn: number; tokensOut: number; period: string };
  topTenants: TenantSibuk[];
}

const fmt = (n: number) => n.toLocaleString('id-ID');

/** `chat.answer` → `chat`. Modul adalah cara orang benar-benar membaca daftar
 *  ini ("apa yang terjadi di knowledge?"), bukan aksi satu per satu. */
const modul = (a: string) => a.split('.')[0] ?? a;

const OPSI_AKSI: OpsiTabel<Aksi> = {
  cari: (a) => [a.action],
  saring: { modul: (a) => modul(a.action) },
  urut: { action: (a) => a.action, count: (a) => a.count },
};

const OPSI_GALAT: OpsiTabel<Galat> = {
  cari: (e) => [e.message, e.tenantId],
  saring: { tenant: (e) => e.tenantId },
  urut: { at: (e) => e.at, message: (e) => e.message },
};

const OPSI_TENANT: OpsiTabel<TenantSibuk> = {
  cari: (t) => [t.name],
  urut: { name: (t) => t.name, messages: (t) => t.messages },
};

export default function ObservabilityPage() {
  const { data: session } = useSession();
  const [hours, setHours] = useState(24);
  const { data, loading, error, refetch } = useApi<Ops>(`/api/admin/ops?hours=${hours}`);
  const health = useApi<{ ok: boolean; db: { ok: boolean; latencyMs: number | null }; mode: string }>('/api/health');

  if (session?.user?.role !== 'superadmin') {
    return <div className="card"><EmptyState title="Khusus superadmin"
      hint="Ringkasan operasional mencakup seluruh tenant, jadi hanya peran platform yang bisa membukanya." /></div>;
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Observability</h1><p className="sub">Kesehatan sistem &amp; aktivitas nyata lintas tenant.</p></div>
        <Select style={{ width: 160 }} value={hours}
          onChange={(e) => setHours(Number(e.target.value))}>
          <option value={1}>1 jam terakhir</option>
          <option value={24}>24 jam terakhir</option>
          <option value={168}>7 hari terakhir</option>
        </Select>
      </div>

      <div className="grid g2" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="card">
          <div className="panel-head"><span className="t">kesehatan</span></div>
          <div className="card-pad stack gap-2">
            <Row label="Status" value={
              health.loading ? '…' : health.data?.ok
                ? <span className="badge badge-ok"><span className="led led-live" />sehat</span>
                : <span className="badge badge-danger"><span className="led led-err" />bermasalah</span>} />
            <Row label="Database" value={<span className="mono">
              {health.data?.db.latencyMs != null ? `${health.data.db.latencyMs} ms` : '—'}</span>} />
            <Row label="Mode" value={<span className="mono">{health.data?.mode ?? '—'}</span>} />
          </div>
        </div>

        <div className="card">
          <div className="panel-head"><span className="t">pemakaian bulan {data?.usage.period ?? ''}</span></div>
          <div className="card-pad stack gap-2">
            <Row label="Tenant aktif" value={<span className="mono">{fmt(data?.usage.tenants ?? 0)}</span>} />
            <Row label="Pesan" value={<span className="mono">{fmt(data?.usage.messages ?? 0)}</span>} />
            <Row label="Token in / out" value={<span className="mono">
              {fmt(data?.usage.tokensIn ?? 0)} / {fmt(data?.usage.tokensOut ?? 0)}</span>} />
            <Row label="Guardrail ditandai" value={
              <span className="mono" style={{ color: (data?.guardrail.flagged ?? 0) > 0 ? 'var(--source)' : undefined }}>
                {fmt(data?.guardrail.flagged ?? 0)}</span>} />
          </div>
        </div>
      </div>

      {error ? <div className="card"><ErrorState message={error} onRetry={refetch} /></div>
        : loading || !data ? <div className="card"><Skeleton rows={4} /></div>
        : (
          <>
          <VizSection data={data} hours={hours} />
          <div className="grid g2">
            <div className="card">
              <div className="panel-head"><span className="t">aktivitas ({data.window})</span></div>
              {data.actions.length === 0
                ? <EmptyState title="Belum ada aktivitas" hint="Aksi tercatat begitu ada chat, ingest, atau perubahan admin." />
                : <TabelAksi rows={data.actions} />}
            </div>

            <div className="card">
              <div className="panel-head"><span className="t">galat terakhir</span>
                <span className="microlabel">{data.errors.length} TERCATAT</span></div>
              {data.errors.length === 0
                ? <EmptyState title="Tak ada galat" hint={`Tidak ada galat tercatat dalam ${data.window} terakhir.`} />
                : <TabelGalat rows={data.errors} />}
            </div>

            <div className="card">
              <div className="panel-head"><span className="t">tenant tersibuk</span></div>
              {data.topTenants.length === 0
                ? <EmptyState title="Belum ada pemakaian" hint="Peringkat muncul setelah ada percakapan bulan ini." />
                : <TabelTenantSibuk rows={data.topTenants} />}
            </div>
          </div>
          </>
        )}
    </>
  );
}

/* ── Visualisasi ─────────────────────────────────────────────────────────
   Tiga chart ringan tanpa pustaka: bar CSS untuk peringkat, sparkline SVG
   untuk tren galat sepanjang jendela waktu. Semuanya dari data useApi yang
   sudah ada — tabel di bawahnya tetap ada untuk detail yang bisa dicari. */

/** Agregasi aksi per modul: `chat.answer` + `chat.stream` → satu batang
 *  `chat`. Cara orang benar-benar membaca beban sistem. */
function perModul(actions: Aksi[]) {
  const m = new Map<string, number>();
  for (const a of actions) m.set(modul(a.action), (m.get(modul(a.action)) ?? 0) + a.count);
  return [...m.entries()].map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value).slice(0, 7);
}

/** Galat dibagi ke 12 selang sepanjang `hours` — indeks 0 = paling lama,
 *  terakhir = paling baru. Timestamp di luar jendela diabaikan. */
function trenGalat(errors: Galat[], hours: number): number[] {
  const now = Date.now();
  const span = hours * 3600_000;
  const buckets = 12;
  const out = new Array<number>(buckets).fill(0);
  for (const e of errors) {
    const age = now - new Date(e.at).getTime();
    if (!(age >= 0) || age > span) continue;
    const idx = Math.min(buckets - 1, Math.floor(((span - age) / span) * buckets));
    out[idx] += 1;
  }
  return out;
}

function VizSection({ data, hours }: { data: Ops; hours: number }) {
  const modules = perModul(data.actions);
  const tenants = data.topTenants.slice(0, 7).map((t) => ({ label: t.name, value: t.messages }));
  const tren = trenGalat(data.errors, hours);
  const totalGalat = tren.reduce((a, b) => a + b, 0);
  return (
    <div className="grid g3" style={{ marginBottom: 'var(--sp-4)' }}>
      <div className="card">
        <div className="panel-head"><span className="t">aktivitas per modul</span></div>
        <div className="card-pad">
          {modules.length === 0
            ? <EmptyState title="Belum ada aktivitas" hint="Batang muncul begitu ada chat, ingest, atau aksi admin." />
            : <BarViz rows={modules} />}
        </div>
      </div>

      <div className="card">
        <div className="panel-head"><span className="t">tren galat</span>
          <span className="microlabel">{fmt(totalGalat)} DALAM {data.window}</span></div>
        <div className="card-pad stack gap-3">
          <Sparkline points={tren} color="var(--danger)" />
          <div className="viz-legend">
            <span><span className="dot" style={{ background: 'var(--danger)' }} />
              galat per selang ({data.window})</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="panel-head"><span className="t">distribusi tenant</span></div>
        <div className="card-pad">
          {tenants.length === 0
            ? <EmptyState title="Belum ada pemakaian" hint="Peringkat muncul setelah ada percakapan bulan ini." />
            : <BarViz rows={tenants} color="var(--source)" />}
        </div>
      </div>
    </div>
  );
}

/** Bar horizontal murni CSS: panjang batang = nilai relatif terhadap maksimum,
 *  angka absolut di kanan. Tanpa SVG, tanpa pustaka. */
function BarViz({ rows, color }: { rows: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="viz-bars">
      {rows.map((r) => (
        <div key={r.label} className="viz-row">
          <span className="lbl" title={r.label}>{r.label}</span>
          <div className="viz-track">
            <div className="viz-fill" style={{ width: `${(r.value / max) * 100}%`, background: color ?? 'var(--signal)' }} />
          </div>
          <span className="viz-val mono">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Sparkline area SVG: viewBox 100×32 diregangkan penuh lebar kartu
 *  (preserveAspectRatio none), garis tak ikut menebal (non-scaling-stroke). */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 100, h = 32;
  const max = Math.max(1, ...points);
  const n = points.length;
  const coords = points.map((v, i) => {
    const x = n === 1 ? 0 : (i / (n - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = coords.join(' ');
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
      style={{ width: '100%', height: 52, display: 'block' }} aria-hidden>
      <polygon points={area} fill={color} opacity={0.12} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* Tiga tabel di halaman ini duduk di kartu selebar setengah layar, jadi
   ukuran halaman bawaannya 10 — cukup untuk terbaca sekaligus tanpa memaksa
   kartunya tumbuh melewati tetangganya. */

function TabelAksi({ rows }: { rows: Aksi[] }) {
  const t = useTabel(rows, OPSI_AKSI);
  return (
    <div className="card-pad stack gap-3">
      <TabelAlat
        t={t} rows={rows} cariLabel="Cari aksi"
        saring={[{ kunci: 'modul', label: 'Semua modul', lebar: 150, ambil: (a) => modul(a.action) }]}
      />
      <div className="table-wrap"><table className="table">
        <thead><tr>
          <ThNo />
          <Th t={t} kunci="action">Aksi</Th>
          <Th t={t} kunci="count" num>Jumlah</Th>
        </tr></thead>
        <tbody>
          <BarisKosong t={t} kolom={3} />
          {t.hasil.tampil.map((a, i) => (
            <tr key={a.action}>
              <TdNo n={t.nomor(i)} />
              <td className="mono" style={{ fontSize: 13 }}>{a.action}</td>
              <td className="num">{fmt(a.count)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <TabelKaki t={t} satuan="aksi" />
    </div>
  );
}

function TabelGalat({ rows }: { rows: Galat[] }) {
  const t = useTabel(rows, OPSI_GALAT);
  return (
    <div className="card-pad stack gap-3">
      <TabelAlat
        t={t} rows={rows} cariLabel="Cari isi pesan galat"
        saring={[{ kunci: 'tenant', label: 'Semua tenant', lebar: 150, ambil: (e) => e.tenantId }]}
      />
      <div className="table-wrap"><table className="table">
        <thead><tr>
          <ThNo />
          <Th t={t} kunci="at">Waktu</Th>
          <Th t={t} kunci="message">Pesan</Th>
        </tr></thead>
        <tbody>
          <BarisKosong t={t} kolom={3} />
          {t.hasil.tampil.map((e, i) => (
            <tr key={`${e.at}:${i}`}>
              <TdNo n={t.nomor(i)} />
              <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                {e.at.slice(5, 16).replace('T', ' ')}</td>
              <td style={{ fontSize: 13, color: 'var(--danger)' }}>{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <TabelKaki t={t} satuan="galat" />
    </div>
  );
}

function TabelTenantSibuk({ rows }: { rows: TenantSibuk[] }) {
  const t = useTabel(rows, OPSI_TENANT);
  return (
    <div className="card-pad stack gap-3">
      {/* Tanpa penyaring: satu-satunya ragam di tabel ini adalah organisasinya
          sendiri, dan itu sudah dijawab kotak cari. */}
      <TabelAlat t={t} rows={rows} cariLabel="Cari organisasi" />
      <div className="table-wrap"><table className="table">
        <thead><tr>
          <ThNo />
          <Th t={t} kunci="name">Organisasi</Th>
          <Th t={t} kunci="messages" num>Pesan</Th>
        </tr></thead>
        <tbody>
          <BarisKosong t={t} kolom={3} />
          {t.hasil.tampil.map((tn, i) => (
            <tr key={tn.tenantId}>
              <TdNo n={t.nomor(i)} />
              <td>{tn.name}</td>
              <td className="num">{fmt(tn.messages)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <TabelKaki t={t} satuan="organisasi" />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="cluster" style={{ justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>{value}
    </div>
  );
}
