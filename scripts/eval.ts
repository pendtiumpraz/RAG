/**
 * EVAL RETRIEVAL terhadap himpunan baku.
 *
 *   npm run eval                       # jalankan & bandingkan dgn garis dasar
 *   npm run eval -- --set=nama         # pilih himpunan tertentu
 *   npm run eval -- --simpan-dasar     # tetapkan hasil ini sbg garis dasar
 *   npm run eval -- --detail           # tampilkan tiap pertanyaan
 *
 * KENAPA CLI, BUKAN UNIT TEST: ini menyentuh basis data sungguhan, memanggil
 * model embedding, dan hasilnya bergantung pada isi korpus — tiga hal yang
 * membuatnya mustahil dijalankan di CI tanpa data. Yang MASUK unit test
 * adalah perhitungan metriknya (`tests/eval.test.ts`), karena itulah satu-
 * satunya bagian yang bisa dibuktikan benar tanpa data.
 *
 * KELUAR DENGAN KODE 1 bila ada regresi melewati toleransi. Gerbang yang
 * hanya mencetak peringatan lalu keluar 0 tidak pernah menghentikan apa pun.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { db, tenants, client } from '../src/modules/core/db';
import { withTenant } from '../src/modules/core/db/tenant-context';
import { validasi, type HimpunanBaku } from '../src/modules/eval/golden';
import { jalankanEval, type HasilEval } from '../src/modules/eval/runner';
import { bandingkan, TOLERANSI, type Agregat } from '../src/modules/eval/metrics';

const DIR = path.join(process.cwd(), 'eval', 'golden');
const DASAR = path.join(process.cwd(), 'eval', 'baseline.json');

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const flag = (n: string) => process.argv.includes(`--${n}`);

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

async function main() {
  const berkas = (await fs.readdir(DIR)).filter((f) => f.endsWith('.json'));
  if (!berkas.length) {
    console.error(`Tak ada himpunan baku di ${DIR}. Buat satu berkas .json lebih dulu.`);
    process.exit(1);
  }
  const pilih = arg('set');
  const dipakai = pilih ? berkas.filter((f) => f.includes(pilih)) : berkas;
  if (!dipakai.length) { console.error(`Himpunan "${pilih}" tak ditemukan.`); process.exit(1); }

  const t = (await db.select().from(tenants).where(eq(tenants.isPlatform, true)).limit(1))[0];
  if (!t) { console.error('Tenant platform tak ditemukan.'); process.exit(1); }

  const semua: HasilEval[] = [];
  for (const f of dipakai) {
    const himpunan: HimpunanBaku = validasi(JSON.parse(await fs.readFile(path.join(DIR, f), 'utf8')));

    /* Chatbot & model embedding diambil dari keadaan NYATA tenant, bukan
       dituliskan di himpunan: himpunan baku memuat pertanyaan dan jawaban,
       bukan konfigurasi. Menaruh id chatbot di dalamnya berarti himpunannya
       mati begitu chatbot itu dihapus. */
    const bot = himpunan.chatbotId ?? (await withTenant(t.id, (tx) => tx.execute(sql`
      select a.chatbot_id as id
        from chatbot_knowledge_bases a
        join documents d on d.knowledge_base_id = a.knowledge_base_id and d.deleted_at is null
       where a.deleted_at is null
       group by 1 order by count(*) desc limit 1
    `)) as unknown as Array<{ id: string }>)[0]?.id;
    if (!bot) { console.error('Tak ada chatbot dengan dokumen. Ingest sesuatu dulu.'); process.exit(1); }

    const model = (await withTenant(t.id, (tx) => tx.execute(sql`
      select active_embedding_model as m from tenant_settings limit 1
    `)) as unknown as Array<{ m: string | null }>)[0]?.m ?? 'all-MiniLM-L6-v2';

    console.log(`\n▸ ${himpunan.nama} — ${himpunan.pertanyaan.length} pertanyaan, k=${himpunan.k ?? 10}`);
    const hasil = await jalankanEval(t.id, himpunan, { chatbotId: bot, embeddingModel: model });
    semua.push(hasil);

    const a = hasil.terjawab;
    console.log(`  TERJAWAB   n=${a.n}  recall ${pct(a.recall)}  presisi ${pct(a.precision)}  `
      + `MRR ${a.rr.toFixed(3)}  nDCG ${a.ndcg.toFixed(3)}  gagal-total ${a.gagalTotal}`);
    const z = hasil.tanpaJawaban;
    console.log(`  TAK ADA    n=${z.n}  rata hasil ${z.rataHasil.toFixed(1)} dokumen  `
      + `kosong sempurna ${z.kosongSempurna}/${z.n}`);

    if (flag('detail') || a.gagalTotal > 0) {
      /* Pertanyaan yang GAGAL TOTAL selalu dicetak, bahkan tanpa --detail.
         Rata-rata yang bagus bisa menyembunyikan satu pertanyaan yang
         berubah dari terjawab jadi tak terjawab sama sekali — dan itu
         persis bentuk kerusakan yang paling dirasakan pengguna. */
      for (const h of hasil.perPertanyaan) {
        const tampil = flag('detail') || (!h.tanpaJawaban && h.skor.recall === 0);
        if (!tampil) continue;
        const tanda = h.tanpaJawaban ? (h.didapat.length ? '~' : '✓')
          : h.skor.recall === 1 ? '✓' : h.skor.recall === 0 ? '✗' : '~';
        console.log(`    ${tanda} ${h.id}  recall ${pct(h.skor.recall)}  "${h.q.slice(0, 60)}"`);
        if (h.skor.recall < 1 && !h.tanpaJawaban) {
          const hilang = h.diharapkan.filter((d) => !h.didapat.includes(d));
          console.log(`        tak ditemukan: ${hilang.join(', ') || '—'}`);
          console.log(`        didapat      : ${h.didapat.slice(0, 5).join(', ') || '(kosong)'}`);
        }
      }
    }
  }

  /* ── garis dasar ─────────────────────────────────────────────────── */
  const kini: Record<string, Agregat> = {};
  for (const h of semua) kini[h.nama] = h.terjawab;

  if (flag('simpan-dasar')) {
    await fs.mkdir(path.dirname(DASAR), { recursive: true });
    await fs.writeFile(DASAR, JSON.stringify(kini, null, 2) + '\n');
    console.log(`\nGaris dasar disimpan ke ${path.relative(process.cwd(), DASAR)}.`);
    return;
  }

  let dasar: Record<string, Agregat> | null = null;
  try { dasar = JSON.parse(await fs.readFile(DASAR, 'utf8')); } catch { /* belum ada */ }
  if (!dasar) {
    console.log('\nBelum ada garis dasar. Jalankan dengan --simpan-dasar untuk menetapkannya.');
    return;
  }

  let adaRegresi = false;
  for (const [nama, a] of Object.entries(kini)) {
    const d = dasar[nama];
    if (!d) { console.log(`\n${nama}: belum ada di garis dasar — dilewati.`); continue; }
    const beda = bandingkan(d, a);
    const turun = beda.filter((b) => b.turun);
    if (!turun.length) {
      console.log(`\n${nama}: tak ada regresi (toleransi ${pct(TOLERANSI)}).`);
      continue;
    }
    adaRegresi = true;
    console.log(`\n${nama}: REGRESI`);
    for (const b of turun) {
      console.log(`  ${b.metrik.padEnd(11)} ${b.dasar.toFixed(3)} → ${b.kini.toFixed(3)}  (${b.selisih.toFixed(3)})`);
    }
  }

  if (adaRegresi) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
