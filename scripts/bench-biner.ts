/**
 * UKUR KUANTISASI BINER — apakah lapisan penyaringnya benar-benar aman.
 *
 *   npm run bench:biner
 *
 * PERTANYAAN YANG DIJAWAB, dan hanya itu: apakah "saring dengan jarak Hamming
 * lalu urutkan ulang dengan jarak eksak" mengembalikan potongan yang SAMA
 * dengan "urutkan langsung dengan jarak eksak". Kalau tidak, lapisan itu tak
 * boleh dinyalakan siapa pun — berapa pun penghematannya.
 *
 * Yang TIDAK dijawab: apakah ia lebih cepat. Pada korpus sekecil ini
 * pertanyaan itu tak punya jawaban yang berarti; kecepatannya baru terukur
 * pada korpus yang memang besar, dan mengukurnya di sini hanya akan
 * menghasilkan angka yang terdengar meyakinkan tanpa menjelaskan apa pun.
 *
 * Vektor kuerinya diambil dari EMBEDDING DOKUMEN YANG SUDAH ADA, bukan dari
 * model: kartu ini soal geometri indeks, bukan soal kualitas embedding, dan
 * memanggil model hanya akan menambah satu sumber ketidakpastian pada
 * pengukuran yang seharusnya bersih.
 */
import postgres from 'postgres';
import { FAKTOR_SARING, porsiSaring } from '../src/modules/chat/kuantisasi';

const K = 6;          // sebanyak yang benar-benar dipakai jalur chat
const POOL = 60;      // sebanyak yang ditarik kaki vektor sebelum fusi

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!;
  const sql = postgres(url, { max: 1, prepare: false, ssl: 'require' });

  try {
    const [{ dims }] = await sql<{ dims: number }[]>`
      select embedding_dims as dims from documents
      where deleted_at is null and embedding is not null
      group by 1 order by count(*) desc limit 1`;
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from documents
      where deleted_at is null and embedding is not null and embedding_dims = ${dims}`;

    console.log(`KUANTISASI BINER · korpus ${n} potongan · ${dims} dimensi`);
    console.log(`k=${K} · pool=${POOL} · saring=${porsiSaring(POOL)} (faktor ${FAKTOR_SARING})\n`);

    /* Kueri diambil dari potongan yang tersebar merata di korpus — bukan yang
       berdekatan — supaya hasilnya tak bergantung pada satu sudut ruang. */
    const kueri = await sql<{ id: string; emb: string }[]>`
      select id, embedding::text as emb from documents
      where deleted_at is null and embedding is not null and embedding_dims = ${dims}
      order by id limit 25`;

    let identik = 0;
    let totalIrisan = 0;
    let identikHnsw = 0;
    let totalIrisanHnsw = 0;
    const meleset: string[] = [];

    for (const q of kueri) {
      /* KEBENARAN DASARNYA adalah pemindaian penuh, bukan indeks.
         `idx_documents_dims_384` itu HNSW — APROKSIMASI. Versi pertama skrip
         ini memakainya sebagai patokan, lalu melaporkan jalur dua tahap
         "meleset 12%" — padahal yang meleset justru patokannya. Membandingkan
         hasil eksak dengan tebakan lalu menyebut yang eksak salah adalah cara
         paling rapi untuk membuang perbaikan yang benar. */
      const eksak = await sql.begin(async (t) => {
        await t`set local enable_indexscan = off`;
        await t`set local enable_bitmapscan = off`;
        return t<{ id: string }[]>`
          select id, (subvector(embedding, 1, ${dims})::halfvec(${sql.unsafe(String(dims))})
                   <=> subvector(${q.emb}::halfvec, 1, ${dims})::halfvec(${sql.unsafe(String(dims))})) as d
          from documents
          where deleted_at is null and embedding is not null and embedding_dims = ${dims}
          order by 2 limit ${K}`;
      }) as unknown as Array<{ id: string; d: number }>;

      /* Jalur produksi HARI INI: satu tahap lewat indeks HNSW. Diukur juga,
         karena tanpa angkanya tak ada cara tahu apakah dua tahap lebih baik
         atau lebih buruk dari yang sedang berjalan. */
      const hnsw = await sql<{ id: string; d: number }[]>`
        select id, (subvector(embedding, 1, ${dims})::halfvec(${sql.unsafe(String(dims))})
                 <=> subvector(${q.emb}::halfvec, 1, ${dims})::halfvec(${sql.unsafe(String(dims))})) as d
        from documents
        where deleted_at is null and embedding is not null and embedding_dims = ${dims}
        order by 2 limit ${K}`;

      const dua = await sql.begin(async (t) => {
        /* ef_search HARUS ikut naik bersama limit penyaring.
           HNSW tak pernah mengembalikan lebih dari ef_search kandidat, berapa
           pun LIMIT yang ditulis — jadi `limit 480` dengan ef_search bawaan
           (40) diam-diam menyaring jadi 40, dan 440 sisanya tak pernah ada.
           Versi pertama pengukuran ini melewatkannya dan menyalahkan
           kuantisasi bit atas kehilangan yang sebenarnya milik parameter
           indeks. */
        await t`set local hnsw.ef_search = ${sql.unsafe(String(Math.max(40, porsiSaring(POOL))))}`;
        return t<{ id: string }[]>`
        with saring as (
          select id, embedding from documents
          where deleted_at is null and embedding is not null and embedding_dims = ${dims}
          order by binary_quantize(subvector(embedding, 1, ${dims}))::bit(${sql.unsafe(String(dims))})
                <~> binary_quantize(subvector(${q.emb}::halfvec, 1, ${dims}))::bit(${sql.unsafe(String(dims))})
          limit ${porsiSaring(POOL)}
        )
        select id, (subvector(embedding, 1, ${dims})::halfvec(${sql.unsafe(String(dims))})
                 <=> subvector(${q.emb}::halfvec, 1, ${dims})::halfvec(${sql.unsafe(String(dims))})) as d
        from saring order by 2 limit ${K}`;
      }) as unknown as Array<{ id: string; d: number }>;

      /* DIBANDINGKAN LEWAT JARAK, BUKAN LEWAT ID — dan koreksi ini yang
         mengubah seluruh kesimpulan.

         Korpus ini penuh embedding KEMBAR: enam dokumen teratas untuk sebuah
         kueri sama-sama berjarak 0,0000. Di antara baris seri, urutan mana pun
         sama benarnya, dan yang dipilih ditentukan urutan baca di disk. Versi
         pertama pengukuran ini membandingkan ID, melihat urutan seri yang
         berbeda, dan melaporkan "meleset 12%" — padahal tak satu pun potongan
         yang lebih jauh pernah terambil. Yang diukurnya bukan recall,
         melainkan tie-break. */
      const jarak = (xs: Array<{ d: number }>) => xs.map((x) => Number(x.d));
      const samaJarak = (x: number[], y: number[]) =>
        x.length === y.length && x.every((v, i) => Math.abs(v - y[i]) < 1e-6);

      const a = jarak(eksak);
      if (samaJarak(a, jarak(dua))) { identik += 1; totalIrisan += 1; } else {
        const b = jarak(dua);
        const seberapa = b.map((v, i) => v - (a[i] ?? 0)).reduce((m, v) => Math.max(m, v), 0);
        meleset.push(`${q.id.slice(0, 8)}: jarak terburuk lebih jauh ${seberapa.toFixed(4)}`);
      }
      if (samaJarak(a, jarak(hnsw))) { identikHnsw += 1; totalIrisanHnsw += 1; }
    }

    const persenIdentik = (identik / kueri.length) * 100;
    const persenIrisan = (totalIrisan / kueri.length) * 100;
    const persenIdentikH = (identikHnsw / kueri.length) * 100;
    const persenIrisanH = (totalIrisanHnsw / kueri.length) * 100;
    console.log('Patokan: pemindaian penuh (eksak), bukan indeks HNSW.\n');
    console.log('Dibandingkan lewat JARAK, bukan ID: korpus ini penuh embedding kembar,');
    console.log('dan di antara baris seri urutan mana pun sama benarnya.\n');
    console.log(`BINER + RERANK EKSAK   jarak top-${K} identik: ${persenIdentik.toFixed(1)}%`);
    console.log(`HNSW SATU TAHAP (kini) jarak top-${K} identik: ${persenIdentikH.toFixed(1)}%`);
    if (meleset.length) {
      console.log('\nyang tidak identik:');
      for (const m of meleset.slice(0, 10)) console.log(`  ${m}`);
    }
    console.log(
      persenIrisan === 100
        ? '\nAMAN pada korpus ini: penyaring biner tak menjatuhkan satu pun potongan\n'
          + 'yang seharusnya terambil. Ini BUKAN jaminan untuk korpus lain —\n'
          + 'jalankan lagi setelah korpusnya tumbuh, karena pengganggu bertambah\n'
          + 'sementara faktor saringnya tetap.'
        : '\nBELUM AMAN: ada potongan yang tersingkir di tahap biner dan tak pernah\n'
          + 'sempat dilihat jarak eksak. Naikkan FAKTOR_SARING di kuantisasi.ts,\n'
          + 'atau biarkan saklarnya mati.',
    );
  } finally {
    await sql.end();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
