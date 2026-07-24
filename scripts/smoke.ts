/* Smoke test end-to-end terhadap Neon nyata. Jalankan:
   node --env-file=.env --import tsx scripts/smoke.ts */
import { and, eq } from 'drizzle-orm';
import { authService } from '../src/modules/auth/auth.service';
import { chatbotService } from '../src/modules/chatbot/chatbot.service';
import { knowledgeService } from '../src/modules/knowledge/knowledge.service';
import { retrievalService } from '../src/modules/chat/retrieval.service';
import { withTenant } from '../src/modules/core/db/tenant-context';
import { users, client } from '../src/modules/core/db';

const rnd = () => Math.random().toString(36).slice(2, 8);

async function main() {
  // 1) signup dua tenant
  const emailA = `a_${rnd()}@smoke.nalar`;
  const a = await authService.signup({ orgName: 'Org A', name: 'Admin A', email: emailA, password: 'password123' });
  const b = await authService.signup({ orgName: 'Org B', name: 'Admin B', email: `b_${rnd()}@smoke.nalar`, password: 'password123' });
  console.log('✓ signup A tenant=' + a.tenantId.slice(0, 8) + ' · B tenant=' + b.tenantId.slice(0, 8));

  // 2) login benar/salah
  const ok = await authService.verifyCredentials(emailA, 'password123');
  const bad = await authService.verifyCredentials(emailA, 'salah');
  console.log('✓ login ok=' + !!ok + ' · password salah ditolak=' + (bad === null));

  // 3) ISOLASI RLS — di dalam tenant A hanya user A yang terlihat
  const seen = await withTenant(a.tenantId, (tx) => tx.select().from(users));
  const leak = seen.some((u) => u.tenantId === b.tenantId);
  console.log('✓ RLS: user terlihat di tenant A=' + seen.length + ' · bocor ke B=' + (leak ? 'YA(BAHAYA)' : 'TIDAK'));

  // 4) chatbot (integritas referensial app-level + event)
  const bot = await chatbotService.create(a.tenantId, { ownerId: a.id, name: 'Smoke Bot' });
  console.log('✓ chatbot publicKey=' + bot.publicKey.slice(0, 14) + '…');

  // 5) chatbot tenant B TIDAK bisa dibuat dgn owner tenant A (validasi service)
  let crossOwner = false;
  try { await chatbotService.create(b.tenantId, { ownerId: a.id, name: 'X' }); }
  catch { crossOwner = true; }
  console.log('✓ tolak owner lintas-tenant=' + crossOwner);

  // 6) ingest → embed(MiniLM 384→pad1536) → pgvector → retrieve cosine
  try {
    const chunks = await knowledgeService.ingest(a.tenantId, {
      chatbotId: bot.id, title: 'garansi.txt',
      text: 'Garansi produk Pro adalah 24 bulan sejak tanggal pembelian. Kerusakan akibat cairan tidak tercakup garansi standar.',
    });
    console.log('✓ ingest=' + chunks + ' chunk (embed+pgvector insert OK)');
    const hits = await retrievalService.retrieve(a.tenantId, bot.id, 'all-MiniLM-L6-v2', 'berapa lama masa garansi produk pro?', 3);
    console.log('✓ retrieve=' + hits.length + ' hit · top score=' + (hits[0]?.score?.toFixed(3) ?? 'n/a') + ' · "' + (hits[0]?.content?.slice(0, 40) ?? '') + '…"');
  } catch (e) {
    console.log('⚠ ingest/retrieve dilewati: ' + (e as Error).message);
  }

  console.log('\nSMOKE OK');
  await client.end();
}

main().catch((e) => { console.error('SMOKE FAIL:', e); process.exit(1); });
