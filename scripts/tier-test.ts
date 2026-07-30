/* Uji bertingkat vs datar pada data nyata.
   Dibandingkan berdasarkan ISI, bukan id baris: korpus ini punya potongan
   yang benar-benar kembar (hasil ingest berulang) sehingga jaraknya SAMA
   PERSIS. Urutan antar-kembar itu ditentukan rencana kueri, bukan relevansi,
   jadi membandingkan id baris akan melaporkan "beda" untuk jawaban yang
   sebenarnya identik kata per kata. */
import { eq, sql } from 'drizzle-orm';
import { db, tenants, documentVectors, client } from '../src/modules/core/db';
import { withTenant } from '../src/modules/core/db/tenant-context';
import { retrievalService } from '../src/modules/chat/retrieval.service';
import { documentVectorsService } from '../src/modules/knowledge/document-vectors.service';

const Q = ['apa itu NIB sainskerta', 'alamat kantor perusahaan', 'siapa direktur utama', 'jam operasional'];
const isi = (rs: Array<{ content: string }>) => rs.map((r) => r.content.slice(0, 120)).join('§');

async function main() {
  const t = (await db.select().from(tenants).where(eq(tenants.isPlatform, true)).limit(1))[0];
  const kb = (await withTenant(t.id, (tx) => tx.execute(sql`
    select a.knowledge_base_id kb, a.chatbot_id bot
    from chatbot_knowledge_bases a
    join documents d on d.knowledge_base_id = a.knowledge_base_id and d.deleted_at is null
    where a.deleted_at is null group by 1,2 order by count(*) desc limit 1`)) as unknown as Array<{kb:string;bot:string}>)[0];

  const M = 'all-MiniLM-L6-v2';
  const datar: Record<string, string> = {};
  for (const q of Q) datar[q] = isi(await retrievalService.retrieve(t.id, kb.bot, M, q, 4));

  const n = await documentVectorsService.rebuild(t.id, kb.kb, M);
  console.log('vektor dokumen dibangun:', n);

  let sama = 0;
  for (const q of Q) {
    const b = isi(await retrievalService.retrieve(t.id, kb.bot, M, q, 4));
    if (b === datar[q]) sama++;
    console.log(`  "${q.slice(0, 26).padEnd(26)}" → ${b === datar[q] ? 'IDENTIK' : 'BEDA'}`);
  }
  console.log(`\nidentik: ${sama}/${Q.length}`);

  await withTenant(t.id, (tx) => tx.delete(documentVectors).where(eq(documentVectors.knowledgeBaseId, kb.kb)));
  console.log('lapisan pertama dibersihkan (tenant demo kembali datar)');
  await client.end();
  process.exit(sama === Q.length ? 0 : 1);
}
main().catch((e) => { console.error(String(e.message ?? e).slice(0, 300)); process.exit(1); });
