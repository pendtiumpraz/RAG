/**
 * LATIHAN PEMULIHAN — pulihkan ke titik waktu, buktikan datanya ada, buang lagi.
 *
 *   NEON_API_KEY=... NEON_PROJECT_ID=... npm run dr:drill
 *   ... npm run dr:drill -- --jam=48        # titik waktu 48 jam lalu
 *
 * KENAPA ADA. docs/RUNBOOK.md bagian 6 menulis: "Butuh akses Neon Console —
 * itu langkah manusia, bukan langkah yang bisa diotomasi dari repo ini."
 * Kalimat itu KELIRU, dan berbahaya justru karena terdengar masuk akal: Neon
 * punya REST API yang bisa membuat branch dari titik waktu, memberi
 * connection string, dan menghapusnya lagi. Prosedur yang hanya hidup sebagai
 * langkah manual adalah prosedur yang tak pernah dijalankan — dan pemulihan
 * yang belum pernah dicoba bukan pemulihan.
 *
 * APA YANG SEBENARNYA DIBUKTIKAN. `dr:verify` membandingkan BENTUK produksi
 * dengan patokan di repo; ia tak pernah menyentuh isinya. Berkas ini yang
 * menjawab pertanyaan berikutnya: kalau produksi hilang sekarang, apakah
 * DATANYA benar-benar bisa dibaca kembali dari titik waktu kemarin. Bedanya
 * bukan akademis — bentuk yang utuh di atas basis data kosong terlihat persis
 * sama sehatnya di setiap pemeriksaan otomatis.
 *
 * MUSTAHIL MENYENTUH PRODUKSI, dan itu dijaga berlapis, bukan diserahkan pada
 * kehati-hatian orang yang menjalankannya:
 *   1. Ia hanya pernah menghapus branch yang IA SENDIRI buat, lewat id yang
 *      dikembalikan API saat membuatnya. Tak ada satu pun jalur yang menerima
 *      nama branch dari luar.
 *   2. URI hasilnya dibandingkan dengan DATABASE_URL; kalau sama, berhenti.
 *   3. Seluruh kueri terhadap branch hanya membaca.
 * Lapisan ketiga tanpa dua yang pertama tak cukup: satu salah ketik pada nama
 * branch sudah bisa menghapus branch produksi, dan penghapusan itu tak punya
 * langkah "apakah kamu yakin".
 */
import postgres from 'postgres';

const API = 'https://console.neon.tech/api/v2';
const KEY = process.env.NEON_API_KEY?.trim();
const PROJECT = process.env.NEON_PROJECT_ID?.trim();

const argJam = process.argv.find((a) => a.startsWith('--jam='));
const JAM_LALU = Number(argJam?.split('=')[1] ?? 24);

function keluar(pesan: string, kode = 1): never {
  console.error(pesan);
  process.exit(kode);
}

async function neon<T>(jalur: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${jalur}`, {
    ...init,
    headers: {
      authorization: `Bearer ${KEY}`,
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`Neon ${init?.method ?? 'GET'} ${jalur} → ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json() as Promise<T>;
}

/**
 * Tabel yang harus BERISI di basis data produksi yang hidup.
 *
 * Sengaja bukan "semua tabel": banyak tabel memang wajar kosong (sampah,
 * undangan, pembayaran pada pemasangan baru). Yang di sini adalah tabel yang
 * kalau kosong berarti pemulihannya TIDAK membawa apa pun yang berguna —
 * dan itulah bentuk kegagalan yang paling mudah tidak disadari, karena
 * seluruh pemeriksaan bentuk tetap hijau di atas basis data kosong.
 */
const HARUS_BERISI = ['tenants', 'users', 'chatbots', 'knowledge_bases', 'documents'];

async function main() {
  if (!KEY || !PROJECT) {
    keluar(
      'NEON_API_KEY dan NEON_PROJECT_ID belum diisi.\n\n'
      + 'Keduanya ada di Neon Console → Account settings → API keys, dan\n'
      + 'Project settings → General. Tanpa itu latihan ini tak bisa dijalankan —\n'
      + 'dan itu memang keadaan yang jujur untuk dilaporkan, bukan untuk\n'
      + 'disiasati dengan menguji sesuatu yang lebih mudah.',
    );
  }

  const sejak = new Date(Date.now() - JAM_LALU * 3_600_000).toISOString();
  const nama = `dr-drill-${sejak.slice(0, 19).replace(/[:T]/g, '')}`;
  console.log(`LATIHAN PEMULIHAN · titik waktu ${sejak} (${JAM_LALU} jam lalu)\n`);

  /* ── 1. branch dari titik waktu ──────────────────────────────────── */
  console.log('1/5  membuat branch dari titik waktu…');
  const dibuat = await neon<{
    branch: { id: string; name: string };
    connection_uris?: Array<{ connection_uri: string }>;
  }>(`/projects/${PROJECT}/branches`, {
    method: 'POST',
    body: JSON.stringify({
      branch: { name: nama, parent_timestamp: sejak },
      endpoints: [{ type: 'read_write' }],
    }),
  });
  const branchId = dibuat.branch.id;
  const uri = dibuat.connection_uris?.[0]?.connection_uri;
  console.log(`     branch ${dibuat.branch.name} (${branchId})`);

  let gagal: string | null = null;
  try {
    if (!uri) throw new Error('Neon tak mengembalikan connection_uri untuk branch baru');

    /* Lapis kedua: kalau URI-nya sama dengan produksi, ada yang salah paham
       secara mendasar dan tak ada yang boleh dilanjutkan. */
    const prod = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '';
    if (prod && uri.split('@')[1] === prod.split('@')[1]) {
      throw new Error('URI branch SAMA dengan produksi — dihentikan sebelum menyentuh apa pun.');
    }

    const sql = postgres(uri, { max: 1, prepare: false, ssl: 'require' });
    try {
      /* ── 2. bentuknya ────────────────────────────────────────────── */
      console.log('2/5  memeriksa bentuk (tabel, indeks, kebijakan, RLS)…');
      const [{ n: tabel }] = await sql<{ n: number }[]>`
        select count(*)::int as n from pg_tables where schemaname='public'`;
      const [{ n: kebijakan }] = await sql<{ n: number }[]>`
        select count(*)::int as n from pg_policies where schemaname='public'`;
      const [{ n: rls }] = await sql<{ n: number }[]>`
        select count(*)::int as n from pg_tables where schemaname='public' and rowsecurity`;
      console.log(`     ${tabel} tabel · ${kebijakan} kebijakan · RLS aktif di ${rls} tabel`);
      if (tabel < 20) throw new Error(`hanya ${tabel} tabel — branch tak membawa skema yang utuh`);

      /* ── 3. DATANYA, yang justru tak pernah dibuktikan dr:verify ── */
      console.log('3/5  memeriksa ISI — bentuk utuh di atas basis data kosong tampak sama sehatnya…');
      const kosong: string[] = [];
      for (const t of HARUS_BERISI) {
        const [{ n }] = await sql<{ n: number }[]>`
          select count(*)::int as n from ${sql(t)}`;
        console.log(`     ${t.padEnd(18)} ${n} baris`);
        if (n === 0) kosong.push(t);
      }
      if (kosong.length) throw new Error(`tabel yang seharusnya berisi ternyata KOSONG: ${kosong.join(', ')}`);

      /* ── 4. isolasi tenant ikut terpulihkan ──────────────────────── */
      console.log('4/5  memeriksa RLS benar-benar menempel, bukan cuma ada…');
      const tanpaRls = await sql<{ tablename: string }[]>`
        select t.tablename from pg_tables t
        where t.schemaname='public' and not t.rowsecurity
          and exists (
            select 1 from information_schema.columns c
            where c.table_name = t.tablename and c.column_name = 'tenant_id')`;
      if (tanpaRls.length) {
        throw new Error(
          `tabel ber-tenant_id TANPA RLS: ${tanpaRls.map((x) => x.tablename).join(', ')} — `
          + 'pemulihan yang mematikan isolasi lebih buruk daripada tak memulihkan');
      }
      console.log('     tiap tabel ber-tenant_id punya RLS aktif');
    } finally {
      await sql.end();
    }
  } catch (e) {
    gagal = (e as Error).message;
  } finally {
    /* ── 5. selalu dibuang, berhasil maupun gagal ─────────────────────
       Branch yang tertinggal terus menagih biaya penyimpanan dan, lebih
       buruk, jadi salinan data pelanggan yang hidup di luar jalur yang
       dijaga siapa pun. Karena itu di `finally`, bukan di jalur sukses. */
    console.log('5/5  menghapus branch latihan…');
    await neon(`/projects/${PROJECT}/branches/${branchId}`, { method: 'DELETE' })
      .then(() => console.log(`     branch ${branchId} dihapus`))
      .catch((e) => console.error(`     GAGAL menghapus branch ${branchId}: ${(e as Error).message}\n`
        + '     HAPUS MANUAL DI NEON CONSOLE — ia berisi salinan data pelanggan.'));
  }

  if (gagal) keluar(`\nLATIHAN GAGAL: ${gagal}`);
  console.log(
    '\nLATIHAN BERHASIL. Yang dibuktikan: pada titik waktu itu, bentuk DAN isi\n'
    + 'basis data bisa dibaca kembali, dengan isolasi tenant yang masih menempel.\n\n'
    + 'Yang TETAP tidak dibuktikan: rahasia di env Vercel. CREDENTIALS_ENCRYPTION_KEY\n'
    + 'yang hilang tak bisa dipulihkan cadangan mana pun — setiap kunci API penyedia\n'
    + 'yang tersimpan berubah jadi data acak. Lihat docs/RUNBOOK.md bagian 6.',
  );
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
