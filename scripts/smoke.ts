/* Smoke test end-to-end terhadap Neon nyata. Jalankan:
   node --env-file=.env --import tsx scripts/smoke.ts */
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { authService } from '../src/modules/auth/auth.service';
import { chatbotService } from '../src/modules/chatbot/chatbot.service';
import { knowledgeService } from '../src/modules/knowledge/knowledge.service';
import { retrievalService } from '../src/modules/chat/retrieval.service';
import { withTenant } from '../src/modules/core/db/tenant-context';
import { users, client } from '../src/modules/core/db';

const rnd = () => Math.random().toString(36).slice(2, 8);

/**
 * Bagian yang gagal dijalankan.
 *
 * Di mesin lokal, melewati bagian yang butuh unduhan model itu wajar. Di CI
 * tidak: kalau semua bagian "dilewati", pipeline akan hijau padahal tak
 * menguji apa pun — persis kondisi yang membuat bug widget embed lolos ke
 * produksi. Karena itu SMOKE_STRICT=1 mengubah lewatan jadi kegagalan.
 */
const STRICT = process.env.SMOKE_STRICT === '1';
let skippedCount = 0;

function skipped(bagian: string, e: unknown) {
  skippedCount++;
  const msg = (e as Error)?.message ?? String(e);
  if (STRICT) {
    console.error(`✗ ${bagian} GAGAL (mode ketat): ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`⚠ uji ${bagian} dilewati: ${msg}`);
  }
}

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
    skipped('ingest/retrieve', e);
  }

  // 7) DELTA SYNC — manifest & pembuangan chunk lewat DB nyata (di bawah RLS).
  //    Rule #2 (tanpa FK) berarti sourceId sintetis cukup untuk uji ini.
  try {
    const { planDelta } = await import('../src/modules/knowledge/sync.service');
    const sourceId = randomUUID();
    const doc = (externalId: string, externalVersion: string, text: string) =>
      knowledgeService.ingest(a.tenantId, {
        chatbotId: bot.id, title: externalId, text, sourceId, externalId, externalVersion,
      });

    await doc('f1', 'v1', 'Kebijakan retur berlaku 14 hari setelah barang diterima.');
    await doc('f2', 'v1', 'Pengiriman reguler memakan waktu 3 sampai 5 hari kerja.');

    const m1 = await knowledgeService.manifestBySource(a.tenantId, sourceId);
    console.log('✓ manifest=' + m1.size + ' file · f1=' + m1.get('f1') + ' f2=' + m1.get('f2'));

    // f1 berubah versi · f2 lenyap dari upstream · f3 baru
    const plan = planDelta(
      [{ externalId: 'f1', name: 'f1', version: 'v2' }, { externalId: 'f3', name: 'f3', version: 'v1' }],
      m1,
    );
    console.log('✓ plan: create=' + plan.create.map((f) => f.externalId)
      + ' update=' + plan.update.map((f) => f.externalId)
      + ' remove=' + plan.remove + ' unchanged=' + plan.unchanged);

    const removed = await knowledgeService.removeExternal(a.tenantId, sourceId, plan.remove);
    const m2 = await knowledgeService.manifestBySource(a.tenantId, sourceId);
    console.log('✓ remove f2: ' + removed + ' chunk soft-delete · manifest sekarang=' + [...m2.keys()]);

    // chunk warisan pra-delta (tanpa external_id) harus bisa dibuang sekali jalan
    await knowledgeService.ingest(a.tenantId, {
      chatbotId: bot.id, title: 'warisan.txt', sourceId,
      text: 'Dokumen hasil sync lama tanpa penanda versi upstream.',
    });
    const legacy = await knowledgeService.removeLegacy(a.tenantId, sourceId);
    const m3 = await knowledgeService.manifestBySource(a.tenantId, sourceId);
    console.log('✓ buang warisan: ' + legacy + ' chunk · manifest tak terpengaruh=' + [...m3.keys()]);

    const pass = m1.size === 2 && plan.update.length === 1 && plan.create.length === 1
      && plan.remove.join() === 'f2' && removed > 0 && !m2.has('f2') && legacy > 0 && m3.size === 1;
    console.log((pass ? '✓' : '✗') + ' DELTA SYNC ' + (pass ? 'OK' : 'GAGAL'));
    if (!pass) process.exitCode = 1;
  } catch (e) {
    skipped('delta sync', e);
  }

  // 8) GERBANG VERIFIKASI PENDAFTARAN — daftar terbuka, login ditahan sampai
  //    superadmin memverifikasi. Diuji lewat DB nyata (policy lintas-tenant).
  try {
    const { userApprovalService } = await import('../src/modules/auth/user-approval.service');
    const gateEmail = `gate_${rnd()}@smoke.nalar`;
    const g = await authService.signup({
      orgName: 'Smoke Gate', name: 'Gate', email: gateEmail, password: 'password123',
    });
    const blocked = await authService.verifyCredentials(gateEmail, 'password123');
    const why = await authService.credentialOutcome(gateEmail, 'password123');
    const wrongPw = await authService.credentialOutcome(gateEmail, 'salah');

    const queue = await userApprovalService.listPending();
    const inQueue = queue.some((p) => p.email === gateEmail);

    await userApprovalService.setStatus({ id: g.id, tenantId: g.tenantId }, g.id, 'active');
    const allowed = await authService.verifyCredentials(gateEmail, 'password123');

    await userApprovalService.setStatus({ id: g.id, tenantId: g.tenantId }, g.id, 'rejected');
    const reblocked = await authService.verifyCredentials(gateEmail, 'password123');

    const pass = g.status === 'pending' && blocked === null && why === 'pending'
      && wrongPw === 'invalid' && inQueue && !!allowed && reblocked === null;
    console.log(`${pass ? '✓' : '✗'} gerbang verifikasi: daftar=pending · login ditahan (alasan "${why}") · `
      + `password salah tetap "invalid" · muncul di antrean=${inQueue} · setelah verifikasi=${!!allowed} · ditolak lagi=${reblocked === null}`);
    if (!pass) process.exitCode = 1;
  } catch (e) {
    skipped('gerbang verifikasi', e);
  }

  // 9) JALUR PUBLIK WIDGET EMBED — pernah rusak TOTAL tanpa jejak: `chatbots`
  //    FORCE RLS, dan lookup by publicKey berjalan tanpa konteks tenant, jadi
  //    RLS mengembalikan nol baris (bukan galat) dan SETIAP widget membalas
  //    404. Diuji di sini supaya tak bisa diam-diam rusak lagi.
  try {
    const { resolveChatbotByPublicKey } = await import('../src/modules/core/db/tenant-context');
    await chatbotService.update(a.tenantId, bot.id, {
      greeting: 'Halo dari smoke!',
      themeConfig: { brand: { name: 'Smoke Co', logo: 'SC' }, theme: { signal: '#E11D48' } },
    });
    const served = await resolveChatbotByPublicKey(bot.publicKey);
    const bogus = await resolveChatbotByPublicKey('cb_live_tidak_ada');
    // Kunci tema harus yang BENAR-BENAR dibaca public/embed.js.
    const th = (served?.theme_config ?? {}) as { brand?: { name?: string }; theme?: { signal?: string } };
    const pass = !!served && bogus === null
      && served.greeting === 'Halo dari smoke!'
      && th.brand?.name === 'Smoke Co' && th.theme?.signal === '#E11D48';
    console.log(`${pass ? '✓' : '✗'} embed publik: chatbot ditemukan=${!!served} · greeting terkirim=${served?.greeting === 'Halo dari smoke!'} · tema terkirim=${th.theme?.signal === '#E11D48'} · key ngawur ditolak=${bogus === null}`);
    if (!pass) process.exitCode = 1;
  } catch (e) {
    skipped('embed publik', e);
  }

  if (skippedCount > 0 && !STRICT) {
    console.log(`\n⚠ ${skippedCount} bagian dilewati — jalankan dengan SMOKE_STRICT=1 agar itu dihitung gagal.`);
  }
  console.log(process.exitCode ? '\nSMOKE ADA YANG GAGAL' : '\nSMOKE OK');
  await client.end();
}

main().catch((e) => { console.error('SMOKE FAIL:', e); process.exit(1); });
