/**
 * PEKERJA MEMORY — menjalankan Memory Agent sampai TUNTAS, di luar Vercel.
 *
 *   npm run memory:worker -- --daftar              # lihat calonnya dulu, tanpa memanggil LLM
 *   npm run memory:worker -- --chatbot=hr          # satu chatbot (nama atau uuid)
 *   npm run memory:worker -- --tenant=<uuid>       # semua chatbot satu tenant
 *   npm run memory:worker                          # semua chatbot yang punya dokumen
 *
 * KENAPA ADA. Pipeline memory memanggil LLM SEKALI PER DOKUMEN dan baru
 * menyimpan catatannya di L4, setelah semua dokumen selesai. Di Vercel fungsi
 * dipaksa berhenti pada 300 detik, jadi begitu sebuah KB melewati ±6 dokumen
 * tombol "Jalankan Agent" tak akan pernah sampai ke L4 — dan yang tersisa
 * BUKAN sebagian catatan melainkan NOL, tanpa galat yang terlihat pengguna.
 * Terukur pada KB nyata 2026-08-21: 25 dokumen → 116 catatan → 1.277 detik.
 * Empat kali lipat tenggat lambda.
 *
 * Jadi ini bukan alat pengembang. Ia satu-satunya cara pemilik data
 * menjalankan agennya sendiri pada KB berukuran sungguhan, sampai pipeline-nya
 * dipecah agar bisa dilanjutkan bertahap (kartu a-memory-bertahap).
 *
 * TAK ADA KODE MEMORY BARU DI SINI, dan itu syaratnya — sama seperti
 * ingest-worker. Pekerja memanggil `runMemoryPipeline` yang sama persis dengan
 * yang dipakai POST /api/memory/run; kalau ia punya jalurnya sendiri, jalur itu
 * akan berbeda dalam hal yang tak seorang pun sadari sampai hasil lewat
 * pekerja ternyata tak sama dengan hasil lewat tombol.
 *
 * BASIS DATANYA SAMA dengan yang dibaca Vercel. Yang berbeda hanya pemicunya —
 * dan tenggatnya, yang di sini tak ada.
 *
 * BIAYA: tiap dokumen = satu panggilan LLM dengan kunci API tenant yang
 * bersangkutan. `--daftar` ada supaya jumlah itu bisa dilihat SEBELUM dibayar.
 */
import { sql } from 'drizzle-orm';
import { db, client } from '@/modules/core/db';
import { tenants } from '@/modules/core/db/schema';
import { withTenant } from '@/modules/core/db/tenant-context';
import { runMemoryPipeline } from '@/modules/memory/memory-agent.service';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const flag = (n: string) => process.argv.includes(`--${n}`);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Calon {
  tenantId: string;
  tenantNama: string;
  chatbotId: string;
  chatbotNama: string;
  /** Dokumen (doc_ref unik) di semua KB yang di-assign ke chatbot ini. */
  dokumen: number;
  /** Catatan memory yang sudah ada — 0 berarti belum pernah dipetakan. */
  catatan: number;
}

let berhenti = false;
for (const sinyal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sinyal, () => {
    /* Berhenti DI ANTARA chatbot, bukan di tengah satu run. Memutus run di
       tengah membuang seluruh distill yang sudah dibayar — catatannya baru
       ditulis di L4. */
    if (berhenti) process.exit(130);
    console.log(`\n[memory] ${sinyal} diterima — berhenti setelah chatbot ini selesai.`);
    berhenti = true;
  });
}

/**
 * Chatbot yang punya bahan untuk dipetakan.
 *
 * Dihitung dari doc_ref UNIK, bukan jumlah potongan: pipeline meringkas per
 * dokumen logis, jadi 268 potongan dari 25 berkas adalah 25 panggilan LLM —
 * dan angka itulah yang menentukan biaya maupun durasinya.
 */
async function calon(filterTenant?: string, filterChatbot?: string): Promise<Calon[]> {
  const ts = await db.select({ id: tenants.id, nama: tenants.name }).from(tenants);
  const out: Calon[] = [];

  for (const t of ts) {
    if (filterTenant && t.id !== filterTenant) continue;

    const rows = (await withTenant(t.id, (tx) => tx.execute(sql`
      select c.id::text        as "chatbotId",
             c.name            as "chatbotNama",
             (select count(distinct d.doc_ref) from documents d
               where d.knowledge_base_id in (
                 select knowledge_base_id from chatbot_knowledge_bases
                  where chatbot_id = c.id and deleted_at is null)
                 and d.deleted_at is null and d.title is not null)::int as dokumen,
             (select count(*) from memory_notes n
               where n.chatbot_id = c.id and n.deleted_at is null)::int as catatan
        from chatbots c
       where c.deleted_at is null
       order by c.name
    `))) as unknown as Array<Omit<Calon, 'tenantId' | 'tenantNama'>>;

    for (const r of rows) {
      if (!r.dokumen) continue;   // tak ada bahan — menjalankan agen tak menghasilkan apa pun
      if (filterChatbot) {
        const cocok = UUID.test(filterChatbot)
          ? r.chatbotId === filterChatbot
          : r.chatbotNama.toLowerCase() === filterChatbot.toLowerCase();
        if (!cocok) continue;
      }
      out.push({ tenantId: t.id, tenantNama: t.nama, ...r });
    }
  }
  return out;
}

async function main() {
  const daftarSaja = flag('daftar');
  const filterTenant = arg('tenant');
  const filterChatbot = arg('chatbot');

  const list = await calon(filterTenant, filterChatbot);
  if (!list.length) {
    console.log(filterChatbot
      ? `[memory] tak ada chatbot "${filterChatbot}" yang punya dokumen untuk dipetakan.`
      : '[memory] tak ada chatbot yang punya dokumen untuk dipetakan.');
    return;
  }

  console.log(`[memory] ${list.length} chatbot dengan bahan:`);
  for (const c of list) {
    console.log(`  ${c.chatbotNama.padEnd(20)} ${String(c.dokumen).padStart(4)} dokumen `
      + `· ${String(c.catatan).padStart(4)} catatan sekarang  (${c.tenantNama})`);
  }
  const totalDokumen = list.reduce((n, c) => n + c.dokumen, 0);
  console.log(`[memory] total ${totalDokumen} panggilan LLM bila dijalankan semua.`);

  if (daftarSaja) {
    console.log('[memory] --daftar: berhenti di sini, tak ada yang dijalankan.');
    return;
  }

  for (const c of list) {
    if (berhenti) { console.log('[memory] dihentikan.'); break; }
    const mulai = Date.now();
    console.log(`\n[memory] ${c.chatbotNama} (${c.dokumen} dokumen) — mulai…`);
    try {
      const r = await runMemoryPipeline(c.tenantId, c.chatbotId);
      const detik = ((Date.now() - mulai) / 1000).toFixed(1);
      console.log(`[memory] ${c.chatbotNama} SELESAI ${detik}s — ${r.catatan} catatan `
        + `dari ${r.dokumen} dokumen`
        + (r.distillKosong || r.distillCacat
          ? ` · distill gagal: ${r.distillKosong} kosong, ${r.distillCacat} cacat`
          : ''));
    } catch (e) {
      /* Satu chatbot gagal TIDAK boleh menghentikan sisanya — biasanya
         sebabnya milik chatbot itu sendiri (kunci provider tenant belum
         diisi), dan chatbot lain masih bisa dipetakan. */
      const detik = ((Date.now() - mulai) / 1000).toFixed(1);
      console.error(`[memory] ${c.chatbotNama} GAGAL setelah ${detik}s: ${(e as Error).message}`);
    }
  }
}

main()
  .catch((e) => { console.error('[memory] berhenti:', e); process.exitCode = 1; })
  .finally(() => client.end({ timeout: 5 }));
