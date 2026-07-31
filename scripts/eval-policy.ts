/**
 * EVAL KEPATUHAN JAWABAN — apakah model benar-benar MENURUTI kebijakan.
 *
 *   npm run eval:policy                 # jalankan seluruh himpunan
 *   npm run eval:policy -- --set=nama   # satu himpunan
 *   npm run eval:policy -- --detail     # cetak jawabannya
 *
 * BERBIAYA, dan itu sebabnya ia perintah terpisah dari `npm run eval`.
 * Eval retrieval berhenti di pencarian dan tak memakai satu token pun;
 * yang ini menjalankan giliran chat SUNGGUHAN — satu panggilan model per
 * pertanyaan, tercatat di tabel percakapan, terhitung pada kuota bulanan
 * tenant. Menggabungkannya supaya "sekalian" akan membuat orang berhenti
 * menjalankan eval retrieval yang murah dan sering.
 *
 * KELUAR DENGAN KODE 1 bila ada KARANGAN — jawaban percaya diri atas
 * pertanyaan yang jawabannya tak ada di korpus. Pelanggaran lain (bahasa,
 * sitasi, menolak-padahal-ada) dilaporkan tapi tidak menggagalkan: ketiganya
 * mengganggu, sedangkan karangan menghancurkan alasan produk ini dibeli.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { db, client } from '../src/modules/core/db';
import { tenants } from '../src/modules/core/db/schema';
import { withTenant } from '../src/modules/core/db/tenant-context';
import { validasi, type HimpunanBaku } from '../src/modules/eval/golden';
import { jalankanEvalKebijakan } from '../src/modules/eval/policy-runner';

const DIR = path.join(process.cwd(), 'eval', 'golden');
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const flag = (n: string) => process.argv.includes(`--${n}`);
const pct = (a: number, b: number) => b === 0 ? '—' : `${((a / b) * 100).toFixed(0)}% (${a}/${b})`;

async function main() {
  const berkas = (await fs.readdir(DIR)).filter((f) => f.endsWith('.json'));
  const pilih = arg('set');
  const dipakai = pilih ? berkas.filter((f) => f.includes(pilih)) : berkas;
  if (!dipakai.length) { console.error(`Himpunan "${pilih ?? ''}" tak ditemukan.`); process.exit(1); }

  const t = (await db.select().from(tenants).where(eq(tenants.isPlatform, true)).limit(1))[0];
  if (!t) { console.error('Tenant platform tak ditemukan.'); process.exit(1); }

  const bot = (await withTenant(t.id, (tx) => tx.execute(sql`
    select a.chatbot_id as id
      from chatbot_knowledge_bases a
      join documents d on d.knowledge_base_id = a.knowledge_base_id and d.deleted_at is null
     where a.deleted_at is null
     group by 1 order by count(*) desc limit 1
  `)) as unknown as Array<{ id: string }>)[0]?.id;
  if (!bot) { console.error('Tak ada chatbot dengan dokumen.'); process.exit(1); }

  let adaKarangan = false;

  for (const f of dipakai) {
    const himpunan: HimpunanBaku = validasi(JSON.parse(await fs.readFile(path.join(DIR, f), 'utf8')));
    console.log(`\n▸ ${himpunan.nama} — ${himpunan.pertanyaan.length} pertanyaan`);
    console.log('  (tiap pertanyaan = satu panggilan model; sabar)');

    const r = await jalankanEvalKebijakan(t.id, himpunan, { chatbotId: bot });

    console.log(`\n  ANTI-KARANGAN  menolak dengan benar ${pct(r.tolakBenar, r.tolakSeharusnya)}`);
    /* Tiga angka, bukan satu: "salah" adalah pelanggaran produk, "tak
       terbaca" adalah batas pengukurnya. Menyatukannya akan menuntun orang
       memperbaiki hal yang tak rusak. */
    console.log(`  BAHASA         cocok ${pct(r.bahasaCocok, r.bahasaDinilai)}`
      + ` · salah ${r.bahasaSalah} · tak terbaca ${r.bahasaTakTerbaca}`);
    console.log(`  SITASI         jawaban berklaim tanpa rujukan: ${r.tanpaSitasi}`);
    console.log(`  MENOLAK BERLEBIH  ${r.tolakBerlebih} (dokumen memuat jawabannya, tapi ditolak)`);
    console.log(`  total pelanggaran: ${r.pelanggaran}`);

    const karangan = r.hasil.filter((h) => h.pelanggaran.some((v) => v.jenis === 'mengarang'));
    if (karangan.length) adaKarangan = true;

    for (const h of r.hasil) {
      const tampil = flag('detail') || h.pelanggaran.length > 0;
      if (!tampil) continue;
      const tanda = h.pelanggaran.some((v) => v.jenis === 'mengarang') ? '🔴'
        : h.pelanggaran.length ? '⚠ ' : '✓ ';
      console.log(`\n  ${tanda} ${h.id}  "${h.q.slice(0, 62)}"`);
      for (const v of h.pelanggaran) console.log(`       ${v.jenis}: ${v.catatan}`);
      if (flag('detail') || h.pelanggaran.length) {
        console.log(`       bahasa=${h.bahasa ?? '?'} sitasi=${h.sitasi} menolak=${h.menolak}`);
        console.log(`       jawaban: ${h.jawaban.replace(/\s+/g, ' ').slice(0, 220)}`);
      }
    }
  }

  if (adaKarangan) {
    console.log('\nGAGAL: ada jawaban yang MENGARANG atas pertanyaan tanpa jawaban di korpus.');
    process.exit(1);
  }
  console.log('\nTak ada karangan terdeteksi.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
