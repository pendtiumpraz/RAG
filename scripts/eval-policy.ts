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
import { jalankanEvalKebijakan, type RingkasanKebijakan } from '../src/modules/eval/policy-runner';
import { AMBANG_BAHASA_SALAH } from '../src/modules/eval/policy-checks';

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
  let bahasaBuruk = false;

  /**
   * Berapa kali himpunan dijalankan, lalu dirata-rata.
   *
   * ADA KARENA TERBUKTI PERLU, bukan untuk kelengkapan. Pada 31 Jul 2026
   * sebuah perubahan prompt diukur satu jalan sebelum dan satu jalan
   * sesudah, dan angkanya membaik — lalu mengulangnya tiga kali menunjukkan
   * sebaran yang BERTUMPANG TINDIH (tanpa perubahan: 3·2·1 pelanggaran
   * bahasa; dengan perubahan: 2·1·0). Satu jalan tak bisa membedakan
   * perbaikan dari keberuntungan, dan eval yang memberi angka meyakinkan
   * atas dasar satu jalan lebih berbahaya daripada tak ada eval: ia
   * membuat orang MENGIRA sudah membuktikan.
   */
  const ulang = Math.max(1, Number(arg('ulang') ?? 1));

  for (const f of dipakai) {
    const himpunan: HimpunanBaku = validasi(JSON.parse(await fs.readFile(path.join(DIR, f), 'utf8')));
    console.log(`\n▸ ${himpunan.nama} — ${himpunan.pertanyaan.length} pertanyaan`
      + (ulang > 1 ? ` × ${ulang} jalan` : ''));
    console.log('  (tiap pertanyaan = satu panggilan model; sabar)');

    const jalan: RingkasanKebijakan[] = [];
    for (let i = 0; i < ulang; i++) {
      jalan.push(await jalankanEvalKebijakan(t.id, himpunan, { chatbotId: bot }));
      if (ulang > 1) {
        const j = jalan[i];
        console.log(`   jalan ${i + 1}: karangan ${j.tolakSeharusnya - j.tolakBenar}`
          + ` · bahasa salah ${j.bahasaSalah} · tak terbaca ${j.bahasaTakTerbaca}`);
      }
    }
    /* Laporan rinci memakai jalan TERAKHIR; sebarannya sudah dicetak di
       atas. Merata-rata teks jawaban tak berarti apa-apa, dan menampilkan
       seluruh jalan akan menenggelamkan yang penting. */
    const r = jalan[jalan.length - 1];

    if (ulang > 1) {
      const rata = (f: (x: typeof r) => number) =>
        (jalan.reduce((a, x) => a + f(x), 0) / ulang).toFixed(1);
      const rentang = (f: (x: typeof r) => number) => {
        const v = jalan.map(f);
        return `${Math.min(...v)}–${Math.max(...v)}`;
      };
      console.log(`\n  RATA-RATA ${ulang} jalan`);
      console.log(`    karangan     ${rata((x) => x.tolakSeharusnya - x.tolakBenar)}  (rentang ${rentang((x) => x.tolakSeharusnya - x.tolakBenar)})`);
      console.log(`    bahasa salah ${rata((x) => x.bahasaSalah)}  (rentang ${rentang((x) => x.bahasaSalah)})`);
      console.log(`    tak terbaca  ${rata((x) => x.bahasaTakTerbaca)}  (rentang ${rentang((x) => x.bahasaTakTerbaca)})`);
      /* RENTANG ikut dicetak, bukan rata-rata saja. Rata-rata sendirian
         menyembunyikan justru hal yang menentukan apakah selisih dua
         pengukuran berarti sesuatu. */
      console.log('    → bandingkan RENTANG, bukan rata-rata: sebaran yang bertumpang tindih bukan bukti perbaikan');
    }

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

    /* GERBANG BAHASA. Dipasang setelah perbaikannya TERUKUR (31 Jul 2026):
       mengulang aturan bahasa sesudah blok konteks menurunkan pelanggaran
       dari 1·6·4 jadi 1·0·1 pada himpunan 14 pertanyaan. Tanpa gerbang,
       perubahan prompt berikutnya bisa mengembalikannya tanpa ada yang tahu —
       gejalanya cuma "jawaban terasa aneh bagi pengguna berbahasa Inggris",
       dan tak seorang pun akan menghubungkannya dengan satu baris prompt.

       Ambangnya LONGGAR dengan sengaja (20%, sementara keadaan baik ada di
       0–7%): pada temperature 0,2 angkanya bergoyang, dan gerbang yang
       sering berbunyi palsu akan dimatikan orang — lalu tak menjaga apa pun.
       Yang ingin ditangkap adalah kemunduran ke keadaan lama (26–43%), bukan
       selisih satu pertanyaan. */
    if (r.bahasaDinilai > 0 && r.bahasaSalah / r.bahasaDinilai > AMBANG_BAHASA_SALAH) {
      bahasaBuruk = true;
      console.log(`\n  ⚠ pelanggaran bahasa ${r.bahasaSalah}/${r.bahasaDinilai}`
        + ` melewati ambang ${Math.round(AMBANG_BAHASA_SALAH * 100)}%`);
    }

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
  if (bahasaBuruk) {
    console.log(`\nGAGAL: pelanggaran bahasa melewati ${Math.round(AMBANG_BAHASA_SALAH * 100)}%`
      + ' dari pertanyaan yang menguji bahasa.');
    process.exit(1);
  }
  console.log('\nTak ada karangan terdeteksi.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
