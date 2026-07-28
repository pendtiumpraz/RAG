/**
 * Uji beban jalur RETRIEVAL (pgvector HNSW).
 *
 *   npm run bench                      # 2000 chunk, 4 chatbot, 60 query
 *   npm run bench -- --chunks=10000 --bots=8 --queries=100
 *   npm run bench -- --keep            # jangan hapus data uji
 *
 * MENGUKUR APA: latensi `retrieve` seperti yang benar-benar dijalankan
 * produksi — query yang sama persis dengan retrieval.service, di bawah
 * withTenant() sehingga RLS ikut aktif.
 *
 * KENAPA INI YANG DIUKUR: index HNSW hanya ada pada kolom `embedding`,
 * sementara query memfilter `chatbot_id` + `embedding_model`. pgvector
 * karenanya melakukan POST-FILTER: ia menelusuri index lalu membuang baris
 * yang tak cocok. Konsekuensinya latensi memburuk seiring mengecilnya porsi
 * chatbot target terhadap isi tabel — dan itulah bentuk beban sesungguhnya
 * pada SaaS multi-tenant, bukan sekadar "berapa juta vektor".
 *
 * Vektor dibuat acak, BUKAN hasil embedding: yang diuji perilaku indeks, dan
 * memanggil model untuk puluhan ribu chunk hanya menambah waktu tanpa
 * mengubah karakteristik yang diukur.
 *
 * Data uji dihapus PERMANEN di akhir. Rule #3 (soft delete) melindungi data
 * pengguna; baris sintetis benchmark justru harus benar-benar hilang, kalau
 * tidak ia terus menempati kuota dan mencemari pengukuran berikutnya.
 */
import { sql } from 'drizzle-orm';
import { db, client } from '../src/modules/core/db';
import { withTenant } from '../src/modules/core/db/tenant-context';

const arg = (name: string, def: number): number => {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? Number(m.split('=')[1]) : def;
};
const CHUNKS = arg('chunks', 2000);
const BOTS = arg('bots', 4);
const QUERIES = arg('queries', 60);
const KEEP = process.argv.includes('--keep');
const DIM = 1536;
const MODEL = 'bench-model';

/** Vektor acak ternormalisasi — cosine jadi bermakna. */
function randomUnitVector(): string {
  const v = new Array(DIM);
  let norm = 0;
  for (let i = 0; i < DIM; i++) { const x = Math.random() * 2 - 1; v[i] = x; norm += x * x; }
  norm = Math.sqrt(norm);
  for (let i = 0; i < DIM; i++) v[i] = (v[i] / norm).toFixed(6);
  return `[${v.join(',')}]`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

const ms = (n: number) => `${n.toFixed(1)} ms`;

async function main() {
  console.log(`\nUji beban retrieval — ${CHUNKS} chunk · ${BOTS} chatbot · ${QUERIES} query · ${DIM} dim\n`);

  // Tenant & chatbot sintetis. Dibuat lewat SQL langsung (bukan service)
  // supaya benchmark tak ikut mengukur signup/validasi.
  const [tenant] = await db.execute<{ id: string }>(sql`
    insert into tenants (name, plan) values ('BENCH (hapus otomatis)', 'enterprise') returning id
  `) as unknown as Array<{ id: string }>;
  const tenantId = tenant.id;

  const botIds: string[] = [];
  await withTenant(tenantId, async (tx) => {
    for (let i = 0; i < BOTS; i++) {
      const rows = await tx.execute<{ id: string }>(sql`
        insert into chatbots (tenant_id, owner_id, name, public_key)
        values (${tenantId}, ${tenantId}, ${'bench-' + i}, ${'cb_bench_' + Date.now() + '_' + i})
        returning id
      `) as unknown as Array<{ id: string }>;
      botIds.push(rows[0].id);
    }
  });
  const target = botIds[0];

  /* ── seeding bertahap + pengukuran di tiap titik ────────────────── */
  const checkpoints = [Math.floor(CHUNKS / 4), Math.floor(CHUNKS / 2), CHUNKS].filter((n, i, a) => n > 0 && a.indexOf(n) === i);
  const BATCH = 50;
  let inserted = 0;
  const results: Array<{ n: number; targetShare: string; p50: number; p95: number; p99: number; wallP50: number; insertRate: number }> = [];
  let scanKind = '(tak terdeteksi)';

  for (const upto of checkpoints) {
    const t0 = Date.now();
    while (inserted < upto) {
      const size = Math.min(BATCH, upto - inserted);
      const values: ReturnType<typeof sql>[] = [];
      for (let i = 0; i < size; i++) {
        const bot = botIds[(inserted + i) % BOTS];
        values.push(sql`(${tenantId}, ${bot}, ${'bench ' + (inserted + i)}, ${'Konten sintetis nomor ' + (inserted + i) + ' untuk uji beban retrieval.'}, ${MODEL}, ${randomUnitVector()}::vector)`);
      }
      await withTenant(tenantId, (tx) => tx.execute(sql`
        insert into documents (tenant_id, knowledge_base_id, title, content, embedding_model, embedding)
        values ${sql.join(values, sql`, `)}
      `));
      inserted += size;
      process.stdout.write(`\r  seeding… ${inserted}/${CHUNKS}`);
    }
    const insertRate = inserted / ((Date.now() - t0) / 1000 || 1);
    process.stdout.write('\r' + ' '.repeat(40) + '\r');

    // Query persis seperti retrieval.service (post-filter chatbot + model).
    //
    // DUA angka diukur, dan bedanya penting:
    //  • wall  — dari sisi klien. Termasuk latensi jaringan, dan withTenant()
    //            membuka TRANSAKSI (BEGIN + set_config + SELECT + COMMIT =
    //            4 perjalanan bolak-balik). Dijalankan dari jauh, angka ini
    //            didominasi geografi, bukan database.
    //  • db    — waktu eksekusi di server (EXPLAIN ANALYZE). Inilah yang
    //            benar-benar mencerminkan perilaku indeks dan yang berlaku di
    //            produksi, karena app & database ada di region yang sama.
    const wall: number[] = [];
    const dbms: number[] = [];
    for (let q = 0; q < QUERIES; q++) {
      const vec = randomUnitVector();
      const t = Date.now();
      const plan = await withTenant(tenantId, (tx) => tx.execute(sql`
        explain (analyze, format json)
        select id, title, content, 1 - (embedding <=> ${vec}::vector) as score
        from documents
        where knowledge_base_id = ${target} and embedding_model = ${MODEL} and deleted_at is null
        order by embedding <=> ${vec}::vector
        limit 6
      `));
      wall.push(Date.now() - t);
      const rows = plan as unknown as Array<Record<string, unknown>>;
      const raw = rows[0]?.['QUERY PLAN'];
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const exec = Array.isArray(parsed) ? parsed[0]?.['Execution Time'] : undefined;
      if (typeof exec === 'number') dbms.push(exec);
      if (q === 0 && Array.isArray(parsed)) {
        const node = JSON.stringify(parsed[0]?.Plan ?? {});
        scanKind = node.includes('Index Scan') ? 'Index Scan (HNSW dipakai)' : 'Seq Scan (INDEKS TIDAK DIPAKAI)';
      }
    }
    wall.sort((a, b) => a - b); dbms.sort((a, b) => a - b);
    results.push({
      n: inserted,
      targetShare: `${(100 / BOTS).toFixed(0)}%`,
      p50: percentile(dbms, 50), p95: percentile(dbms, 95), p99: percentile(dbms, 99),
      wallP50: percentile(wall, 50),
      insertRate,
    });
    console.log(`  ${String(inserted).padStart(6)} chunk · DB p50 ${ms(percentile(dbms, 50)).padStart(8)} p95 ${ms(percentile(dbms, 95)).padStart(8)} · wall p50 ${ms(percentile(wall, 50)).padStart(9)} · tulis ${insertRate.toFixed(0)}/dtk`);
  }

  /* ── ukuran nyata di disk ───────────────────────────────────────── */
  // `count(*)` di sini akan kena RLS (nol baris) dan membuat hitungan per-baris
  // ngawur — jadi pakai jumlah yang kita masukkan sendiri.
  const size = await db.execute<{ total_b: string; heap: string; idx: string; toast_b: string }>(sql`
    select pg_total_relation_size('documents')            as total_b,
           pg_size_pretty(pg_relation_size('documents'))  as heap,
           pg_size_pretty(pg_indexes_size('documents'))   as idx,
           pg_total_relation_size('documents')
             - pg_relation_size('documents')
             - pg_indexes_size('documents')               as toast_b
  `) as unknown as Array<{ total_b: string; heap: string; idx: string; toast_b: string }>;
  const totalB = Number(size[0].total_b);
  console.log(`\n  jenis pemindaian : ${scanKind}`);
  console.log(`  tabel documents  : total ${(totalB / 1048576).toFixed(1)} MB (heap ${size[0].heap} + index ${size[0].idx} + TOAST ${(Number(size[0].toast_b) / 1048576).toFixed(1)} MB)`);
  console.log(`  per baris        : ± ${(totalB / Math.max(inserted, 1) / 1024).toFixed(1)} KB  (vektor 1536 dim = 6,1 KB, di-TOAST keluar heap)`);

  const buf = await db.execute<{ setting: string }>(sql`select setting from pg_settings where name='shared_buffers'`) as unknown as Array<{ setting: string }>;
  console.log(`  shared_buffers: ${(Number(buf[0].setting) * 8 / 1024).toFixed(0)} MB — index HNSW yang melebihi ini mulai memukul disk`);

  /* ── bersih-bersih ──────────────────────────────────────────────── */
  if (KEEP) {
    console.log(`\n  --keep: data uji DIBIARKAN (tenant ${tenantId.slice(0, 8)}…). Hapus manual bila tak perlu.`);
  } else {
    await withTenant(tenantId, (tx) => tx.execute(sql`delete from documents where tenant_id = ${tenantId}`));
    await withTenant(tenantId, (tx) => tx.execute(sql`delete from chatbots where tenant_id = ${tenantId}`));
    await db.execute(sql`delete from tenants where id = ${tenantId}`);

    // DELETE saja tidak mengembalikan ruang — ia hanya menandainya bisa
    // dipakai ulang, sehingga tabel tetap tercatat puluhan MB. Di plan dengan
    // kuota ketat itu terlihat seperti kapasitas yang hilang. VACUUM FULL
    // menulis ulang tabel + indeksnya (mengunci sebentar; pada sisa data yang
    // kecil hitungan detik).
    try {
      const t0 = Date.now();
      await client.unsafe('VACUUM FULL documents');
      console.log(`\n  data uji dihapus + VACUUM FULL (${Date.now() - t0} ms) — ruang dikembalikan.`);
    } catch (e) {
      console.log('\n  data uji dihapus. VACUUM FULL gagal (' + (e as Error).message + ')');
      console.log('  Jalankan manual sebagai owner agar ruangnya kembali: VACUUM FULL documents;');
    }
  }

  console.log('\nRINGKASAN');
  for (const r of results) {
    console.log(`  ${String(r.n).padStart(6)} chunk (target ${r.targetShare} dari tabel) → p50 ${ms(r.p50)} · p95 ${ms(r.p95)}`);
  }
  console.log();
}

main()
  .catch((e) => { console.error('BENCH GAGAL:', e.message); process.exitCode = 1; })
  .finally(() => client.end());
