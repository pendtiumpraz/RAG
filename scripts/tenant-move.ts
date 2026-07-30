/**
 * EKSPOR / IMPOR SATU TENANT antar basis data Postgres mana pun.
 *
 *   npm run tenant:export -- <tenantId> ./keluar/           # dari DATABASE_URL
 *   npm run tenant:import -- ./keluar/ "postgres://…"       # ke tujuan
 *
 * Kenapa bukan pg_dump: pg_dump tak bisa menyaring per baris. Yang dibutuhkan
 * adalah `where tenant_id = …` di 23 tabel, dalam urutan ketergantungan yang
 * harus dijaga aplikasi karena proyek ini sengaja tanpa foreign key.
 *
 * Kenapa COPY dan bukan JSON: format teks Postgres menangani `vector`,
 * `jsonb`, dan timestamp dengan tepat dan bolak-balik tanpa kehilangan
 * apa pun. Vektor 1.536 dimensi sebagai JSON membengkak dua kali lipat dan
 * membuka peluang salah pembulatan yang tak akan pernah terlihat sampai
 * hasil pencariannya berubah.
 *
 * IMPOR TIDAK MENGHAPUS APA PUN. Ia menambahkan; tenant yang sudah ada di
 * tujuan akan bentrok pada kunci utama dan dilaporkan, bukan ditimpa.
 */
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import postgres from 'postgres';
import { decideSsl } from '../src/modules/core/db/ssl';
import { TENANT_TABLES, TENANT_ROOT_TABLE } from '../src/modules/core/db/tenant-tables';

interface Manifest {
  tenantId: string;
  tenantName: string;
  createdAt: string;
  /** Jumlah baris per tabel saat diekspor — dipakai memverifikasi impor. */
  rows: Record<string, number>;
  /** Berapa berkas migrasi ada di sumber; tujuan harus setara atau lebih. */
  migrations: number;
  order: string[];
}

function open(url: string) {
  const { ssl } = decideSsl(url);
  return postgres(url, { max: 1, prepare: false, ssl, idle_timeout: 30 });
}

/** `copy … to stdout` untuk satu tabel, disaring ke satu tenant. */
async function exportTable(
  sql: ReturnType<typeof postgres>, table: string, tenantId: string, dir: string,
): Promise<number> {
  const kolom = table === TENANT_ROOT_TABLE ? 'id' : 'tenant_id';
  const n = (await sql.unsafe(
    `select count(*)::int n from ${table} where ${kolom} = $1`, [tenantId],
  ))[0].n as number;

  // Berkas tetap dibuat walau kosong: manifest dan berkas harus sepadan,
  // supaya impor bisa membedakan "nol baris" dari "ekspornya gagal".
  const q = sql.unsafe(
    `copy (select * from ${table} where ${kolom} = '${tenantId}') to stdout`,
  );
  await pipeline(await q.readable(), createWriteStream(join(dir, `${table}.copy`)));
  return n;
}

async function doExport(tenantId: string, outDir: string) {
  const sql = open(process.env.DATABASE_URL!);
  try {
    const t = await sql`select id, name from tenants where id = ${tenantId}`;
    if (!t[0]) throw new Error(`Tenant ${tenantId} tak ditemukan di DATABASE_URL`);

    /* WAJIB: peran aplikasi tunduk pada RLS, jadi tanpa GUC ini setiap tabel
       tenant terbaca KOSONG — ekspor berhasil, berkasnya nol baris, dan tak
       ada satu pun galat. Kegagalan yang paling berbahaya dari alat semacam
       ini: ia melapor sukses sambil tak memindahkan apa-apa. */
    await sql`select set_config('app.current_tenant', ${tenantId}, false)`;

    await mkdir(outDir, { recursive: true });
    const rows: Record<string, number> = {};
    const urutan = [TENANT_ROOT_TABLE, ...TENANT_TABLES];

    console.log(`\nMengekspor "${t[0].name}" (${tenantId})\n`);
    for (const tabel of urutan) {
      const n = await exportTable(sql, tabel, tenantId, outDir);
      rows[tabel] = n;
      console.log(`  ${tabel.padEnd(26)} ${String(n).padStart(9)} baris`);
    }

    // Dicatat sebagai penanda versi skema: impor ke tujuan yang skemanya
    // lebih tua akan gagal di tengah, setelah sebagian tabel terisi.
    const migrations = (await readdir(join(process.cwd(), 'migrations')))
      .filter((f) => f.endsWith('.sql')).length;

    const manifest: Manifest = {
      tenantId, tenantName: t[0].name as string,
      createdAt: new Date().toISOString(),
      rows, migrations, order: urutan,
    };
    await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const total = Object.values(rows).reduce((a, b) => a + b, 0);
    console.log(`\n${total.toLocaleString('id-ID')} baris → ${outDir}`);
    console.log('\nUntuk memasukkannya ke basis data lain:');
    console.log(`  npm run tenant:import -- "${outDir}" "postgres://…"\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function doImport(inDir: string, url: string) {
  const manifest: Manifest = JSON.parse(await readFile(join(inDir, 'manifest.json'), 'utf8'));
  const sql = open(url);
  try {
    /* Skema tujuan harus setara. Mengimpor ke skema yang lebih tua akan gagal
       pada kolom yang belum ada — dan gagalnya di tengah, setelah sebagian
       tabel terlanjur terisi. */
    const ada = await sql`
      select count(*)::int n from information_schema.tables
      where table_schema = 'public' and table_name = 'documents'`;
    if (Number(ada[0].n) === 0) {
      throw new Error('Skema Nalar belum ada di tujuan. Jalankan `npm run db:target -- "<url>"` dulu.');
    }

    const bentrok = await sql`select 1 from tenants where id = ${manifest.tenantId}`;
    if (bentrok[0]) {
      throw new Error(
        `Tenant ${manifest.tenantId} SUDAH ADA di tujuan. Impor tidak menimpa apa pun — `
        + 'hapus dulu di tujuan bila memang ingin menggantinya.',
      );
    }

    console.log(`\nMengimpor "${manifest.tenantName}" (${manifest.tenantId})\n`);

    /* RLS dipaksa aktif pada tabel tenant, jadi COPY FROM akan ditolak kecuali
       `app.current_tenant` terpasang. Dipasang di level SESI (bukan transaksi)
       karena tiap COPY berjalan sebagai perintahnya sendiri. */
    await sql`select set_config('app.current_tenant', ${manifest.tenantId}, false)`;

    const hasil: Record<string, number> = {};
    for (const tabel of manifest.order) {
      const berkas = join(inDir, `${tabel}.copy`);
      const ukuran = (await stat(berkas)).size;
      if (ukuran === 0) { hasil[tabel] = 0; console.log(`  ${tabel.padEnd(26)}         0 baris`); continue; }

      const q = sql.unsafe(`copy ${tabel} from stdin`);
      await pipeline(createReadStream(berkas), await q.writable());

      const kolom = tabel === TENANT_ROOT_TABLE ? 'id' : 'tenant_id';
      const n = (await sql.unsafe(
        `select count(*)::int n from ${tabel} where ${kolom} = $1`, [manifest.tenantId],
      ))[0].n as number;
      hasil[tabel] = n;

      // Diverifikasi PER TABEL, bukan di akhir: selisih yang ketahuan lebih
      // awal masih bisa ditelusuri ke tabel mana penyebabnya.
      const cocok = n === manifest.rows[tabel];
      console.log(`  ${tabel.padEnd(26)} ${String(n).padStart(9)} baris ${cocok ? '' : `⚠ diharapkan ${manifest.rows[tabel]}`}`);
    }

    const selisih = manifest.order.filter((t) => hasil[t] !== manifest.rows[t]);
    console.log();
    if (selisih.length) {
      console.error(`SELISIH pada: ${selisih.join(', ')}`);
      console.error('Datanya masuk sebagian. Periksa sebelum mengarahkan siapa pun ke sini.\n');
      process.exit(4);
    }
    console.log('Seluruh baris cocok dengan manifest.\n');
    console.log('Langkah berikutnya: `analyze;` di tujuan agar perencana kueri punya statistik.\n');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const mode = process.argv[2];
  if (mode === 'export') {
    const [, , , tenantId, out] = process.argv;
    if (!tenantId || !out) {
      console.error('Pemakaian: npm run tenant:export -- <tenantId> ./keluar/');
      process.exit(1);
    }
    await doExport(tenantId, out);
  } else if (mode === 'import') {
    const [, , , dir, url] = process.argv;
    if (!dir || !url?.startsWith('postgres')) {
      console.error('Pemakaian: npm run tenant:import -- ./keluar/ "postgres://…"');
      process.exit(1);
    }
    await doImport(dir, url);
  } else {
    console.error('Mode harus `export` atau `import`.');
    process.exit(1);
  }
}

main().catch((e) => { console.error(`\n${String(e?.message ?? e)}\n`); process.exit(1); });
