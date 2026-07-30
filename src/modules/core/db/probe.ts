import postgres from 'postgres';
import { decideSsl } from './ssl';

/**
 * UJI KELAYAKAN sebuah Postgres sebelum dipakai Nalar.
 *
 * Ada karena "bisa connect" jauh dari cukup. Basis data yang tersambung tapi
 * tak punya pgvector akan gagal pada ingest PERTAMA — setelah pemindahan
 * dilakukan, setelah aplikasi diarahkan ke sana, dan setelah yang lama
 * dimatikan. Pemeriksaan yang datang terlambat sama tak bergunanya dengan
 * pemeriksaan yang tak ada.
 *
 * Yang paling penting di sini bukan versi atau ekstensi, melainkan PERAN:
 * kalau aplikasi menyambung sebagai pemilik basis data, Row-Level Security
 * dilewati DIAM-DIAM dan isolasi antar pelanggan mati tanpa satu pun pesan.
 * Itu pernah terjadi sungguhan di proyek ini.
 */

export type ProbeLevel = 'ok' | 'warn' | 'fail';

export interface ProbeItem {
  key: string;
  label: string;
  level: ProbeLevel;
  detail: string;
}

export interface ProbeResult {
  reachable: boolean;
  /** 'require' bila TLS dipakai; undefined bila tidak — beserta alasannya. */
  ssl: string;
  items: ProbeItem[];
  /** Layak dipakai? Satu `fail` saja sudah cukup untuk tidak. */
  usable: boolean;
}

/** Versi Postgres minimum. pgvector 0.7+ (halfvec, subvector) butuh 13+; kita
 *  menuntut 15 karena beberapa migrasi memakai sintaks yang lebih baru. */
const MIN_PG = 15;

/**
 * @param intent Peran apa yang sedang dinilai. Menentukan apakah "bisa
 *   melewati RLS" itu CACAT (peran aplikasi) atau MEMANG SEHARUSNYA
 *   (peran migrasi). Menilai keduanya dengan ukuran yang sama akan
 *   melaporkan gagal untuk koneksi admin yang sepenuhnya benar.
 */
export async function probeDatabase(
  url: string,
  intent: 'app' | 'admin' = 'app',
  timeoutMs = 10_000,
): Promise<ProbeResult> {
  const { ssl, reason } = decideSsl(url);
  const items: ProbeItem[] = [];
  const add = (key: string, label: string, level: ProbeLevel, detail: string) =>
    items.push({ key, label, level, detail });

  add('tls', 'Enkripsi koneksi', ssl ? 'ok' : 'warn',
    ssl ? `TLS aktif — ${reason}` : `TLS TIDAK aktif — ${reason}. Sah hanya bila basis datanya di jaringan yang sama.`);

  let sql: ReturnType<typeof postgres> | null = null;
  try {
    sql = postgres(url, {
      max: 1, prepare: false, ssl,
      connect_timeout: Math.ceil(timeoutMs / 1000),
      idle_timeout: 5,
    });

    /* ── tersambung & versi ──────────────────────────────────────── */
    const v = await sql`select version() as v, current_setting('server_version_num') as num`;
    const num = Number(v[0]?.num ?? 0);
    const major = Math.floor(num / 10_000);
    add('version', 'Versi Postgres', major >= MIN_PG ? 'ok' : 'fail',
      major >= MIN_PG ? `PostgreSQL ${major}` : `PostgreSQL ${major} — minimum ${MIN_PG}`);

    /* ── pgvector ────────────────────────────────────────────────── */
    const ext = await sql`
      select
        (select extversion from pg_extension where extname = 'vector') as terpasang,
        (select 1 from pg_available_extensions where name = 'vector') as tersedia`;
    const terpasang = ext[0]?.terpasang as string | null;
    const tersedia = ext[0]?.tersedia != null;
    add('pgvector', 'Ekstensi pgvector',
      terpasang ? 'ok' : tersedia ? 'warn' : 'fail',
      terpasang ? `terpasang, versi ${terpasang}`
        : tersedia ? 'tersedia tapi belum dipasang — migrasi akan memasangnya'
        : 'TIDAK tersedia di server ini. Tanpa pgvector, pencarian makna mustahil.');

    /* ── peran & RLS: bagian yang paling menentukan ──────────────── */
    const role = await sql`
      select current_user as user,
             (select rolsuper from pg_roles where rolname = current_user) as super,
             (select rolbypassrls from pg_roles where rolname = current_user) as bypass,
             (select 1 from pg_roles where rolname = 'nalar_app') as ada_nalar_app`;
    const r = role[0] as Record<string, unknown>;
    const bypass = r.bypass === true || r.super === true;
    add('role', 'Peran koneksi',
      intent === 'admin' ? (bypass ? 'ok' : 'warn') : (bypass ? 'fail' : 'ok'),
      intent === 'admin'
        ? (bypass
            ? `"${r.user}" berhak penuh — benar untuk koneksi migrasi.`
            : `"${r.user}" tak berhak penuh; sebagian migrasi mungkin ditolak.`)
        : (bypass
            ? `Menyambung sebagai "${r.user}" yang BISA MELEWATI Row-Level Security. `
              + 'Isolasi antar pelanggan akan mati DIAM-DIAM — gunakan peran nalar_app.'
            : `"${r.user}" tak bisa melewati RLS — benar.`));
    add('nalar_app', 'Peran nalar_app', r.ada_nalar_app ? 'ok' : 'warn',
      r.ada_nalar_app ? 'sudah ada' : 'belum ada — jalankan npm run db:setup-role');

    /* ── hak akses ───────────────────────────────────────────────────
       DUA peran, DUA kebutuhan yang berbeda — dan menyamakannya adalah
       kesalahan yang wajar tapi menyesatkan:

         • peran APLIKASI (nalar_app) butuh SELECT/INSERT/UPDATE/DELETE, dan
           justru TIDAK BOLEH bisa membuat tabel. Menguji DDL padanya akan
           melaporkan "gagal" untuk basis data yang sebenarnya sehat.
         • peran ADMIN butuh DDL, karena migrasilah yang memakainya.

       Karena itu haknya diperiksa lewat has_*_privilege — tak ada tabel yang
       benar-benar dibuat, jadi aman dijalankan terhadap produksi. */
    const priv = await sql`
      select
        has_schema_privilege(current_user, 'public', 'USAGE')  as pakai,
        has_schema_privilege(current_user, 'public', 'CREATE') as ddl,
        (to_regclass('public.documents') is not null)          as ada_dokumen,
        case when to_regclass('public.documents') is not null
             then has_table_privilege(current_user, 'public.documents', 'INSERT')
             else null end                                     as bisa_tulis`;
    const p = priv[0] as Record<string, unknown>;

    add('usage', 'Akses skema public', p.pakai === true ? 'ok' : 'fail',
      p.pakai === true ? 'boleh dipakai' : 'tak punya hak USAGE pada skema public');

    if (p.ada_dokumen === true) {
      // Skema Nalar sudah ada → yang relevan adalah hak MENULIS DATA.
      add('write', 'Hak tulis data', p.bisa_tulis === true ? 'ok' : 'fail',
        p.bisa_tulis === true ? 'boleh menulis ke tabel dokumen'
          : 'tak boleh menulis ke tabel dokumen — ingest akan gagal');
      add('ddl', 'Hak ubah skema', p.ddl === true ? 'warn' : 'ok',
        p.ddl === true
          ? 'peran ini BISA mengubah skema. Untuk peran aplikasi itu berlebihan; '
            + 'pakai peran terpisah untuk migrasi.'
          : 'tak bisa mengubah skema — benar untuk peran aplikasi. '
            + 'Migrasi dijalankan dengan peran admin terpisah.');
    } else {
      // Basis data masih kosong → yang relevan adalah bisakah dimigrasikan.
      add('ddl', 'Hak ubah skema', p.ddl === true ? 'ok' : 'fail',
        p.ddl === true ? 'boleh membuat tabel — migrasi bisa dijalankan'
          : 'tak boleh membuat tabel. Untuk basis data kosong, sambungkan '
            + 'dengan peran admin agar migrasinya bisa jalan.');
    }

    /* ── sudah berisi data Nalar? ────────────────────────────────── */
    const t = await sql`
      select count(*)::int n from information_schema.tables
      where table_schema = 'public' and table_name in ('tenants','documents','chatbots')`;
    const n = Number((t[0] as { n: number })?.n ?? 0);
    add('schema', 'Skema Nalar', 'ok',
      n === 0 ? 'basis data kosong — siap dimigrasikan'
        : n < 3 ? `sebagian tabel sudah ada (${n}/3) — migrasi akan melengkapinya`
        : 'skema Nalar sudah lengkap di sini');

    await sql.end({ timeout: 5 });
  } catch (e) {
    if (sql) { try { await sql.end({ timeout: 1 }); } catch { /* sudah tertutup */ } }
    add('connect', 'Sambungan', 'fail', (e as Error).message.slice(0, 200));
    return { reachable: false, ssl: ssl ?? 'tidak', items, usable: false };
  }

  return {
    reachable: true,
    ssl: ssl ?? 'tidak',
    items,
    usable: !items.some((i) => i.level === 'fail'),
  };
}
