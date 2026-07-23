import { sql, and, eq, isNull } from 'drizzle-orm';
import { documents, tenantSettings, memoryNotes, memoryEdges } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { getLlmModel } from '@/modules/core/registry';
import { registerJobHandler, enqueueJob, getJobStatus, type JobStatus } from '@/modules/core/jobs';
import { audit } from '@/modules/core/guardrails';
import { apiKeyResolver } from '@/modules/settings/credentials.repository';
import { completeChat } from '@/modules/chat/llm';
import { embed } from '@/modules/knowledge/embeddings';
import { memoryService, slugify } from './memory.service';

/**
 * ═══════════════════════════════════════════════════════════════════
 * OBSIDIAN MEMORY AGENT — LEVEL 1–4
 * (Level 5 "self-evolving" SENGAJA di luar scope untuk saat ini.)
 *
 *  L1 CAPTURE  — tiap dokumen sumber → 1 note markdown mentah
 *                (frontmatter + ref sumber + kutipan).
 *  L2 DISTILL  — LLM meringkas: abstrak + poin kunci, ditulis ke note.
 *  L3 LINK     — LLM mengekstrak entitas/topik → [[wikilink]] antar note
 *                + note topik (MOC / Map of Content).
 *  L4 GRAPH    — edges wikilink + similarity (embedding note), backlink,
 *                graph utk dashboard, export vault `_nalar-memory/`.
 *
 *  L5 SELF-EVOLVING — agen merawat vault-nya sendiri tiap run:
 *      (a) MERGE note near-duplicate (similarity ≥ 0.93) — konten
 *          digabung, edges dialihkan, duplikat di-soft-delete;
 *      (b) PRUNE note MOC yatim (tanpa edge aktif).
 *      Semua keputusan tercatat di audit (Guardrail L5).
 * ═══════════════════════════════════════════════════════════════════
 */

export const MEMORY_MAX_LEVEL = 5 as const;
const MERGE_THRESHOLD = 0.93;
const SIMILARITY_EDGE_THRESHOLD = 0.82;
const MAX_DOC_CHARS_FOR_LLM = 6000;
const MAX_DOCS_PER_RUN = 40;

interface RunPayload { tenantId: string; chatbotId: string; }

registerJobHandler('memory.run', async (payload) => {
  const { tenantId, chatbotId } = payload as RunPayload;
  await runMemoryPipeline(tenantId, chatbotId);
});

export const memoryAgent = {
  /** Antrekan run untuk satu chatbot (dedup bila masih berjalan). */
  enqueueRun(tenantId: string, chatbotId: string): JobStatus {
    return enqueueJob('memory.run', `${tenantId}:${chatbotId}`, { tenantId, chatbotId } satisfies RunPayload);
  },

  runStatus(tenantId: string, chatbotId: string): JobStatus | null {
    return getJobStatus('memory.run', `${tenantId}:${chatbotId}`);
  },
};

/* ── pipeline ─────────────────────────────────────────────────────── */

export async function runMemoryPipeline(tenantId: string, chatbotId: string): Promise<void> {
  const getApiKey = apiKeyResolver(tenantId);

  // model & key tenant (dipakai L2/L3)
  const settings = await withTenant(tenantId, async (tx) =>
    (await tx.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1))[0]);
  const llmModel = settings?.activeLlmModel ?? 'claude-sonnet-5';
  const embeddingModel = settings?.activeEmbeddingModel ?? 'all-MiniLM-L6-v2';
  const provider = getLlmModel(llmModel)?.provider;
  const apiKey = provider ? await getApiKey(provider) : null;
  if (!apiKey) throw new Error(`Memory agent butuh API key provider ${provider}`);

  /* ── L1 · CAPTURE — agregasi chunk per judul dokumen ────────────── */
  const docs = await withTenant(tenantId, async (tx) => {
    const rows = await tx.execute(sql`
      select title,
             string_agg(content, E'\n' order by (metadata->>'chunk')::int) as full_text
      from documents
      where chatbot_id = ${chatbotId} and deleted_at is null and title is not null
      group by title
      limit ${MAX_DOCS_PER_RUN}
    `);
    return rows as unknown as Array<{ title: string; full_text: string }>;
  });

  const noteDrafts: Array<{ slug: string; title: string; source: string; body: string }> = [];

  for (const doc of docs) {
    const slug = slugify(doc.title);
    const excerpt = doc.full_text.slice(0, MAX_DOC_CHARS_FOR_LLM);

    /* ── L2 · DISTILL — ringkasan LLM ─────────────────────────────── */
    const distilled = await completeChat(llmModel, [
      { role: 'system', content:
        'Kamu meringkas dokumen untuk basis pengetahuan. Balas HANYA JSON valid: ' +
        '{"abstract": "...1-2 kalimat...", "keyPoints": ["...", "..."], "entities": ["Topik A", "Topik B"]} ' +
        'entities = 2-6 topik/entitas penting (nama pendek, Title Case). Bahasa mengikuti dokumen.' },
      { role: 'user', content: `Judul: ${doc.title}\n\n${excerpt}` },
    ], apiKey, 2000);

    let abstract = '', keyPoints: string[] = [], entities: string[] = [];
    try {
      const parsed = JSON.parse(distilled.slice(distilled.indexOf('{'), distilled.lastIndexOf('}') + 1));
      abstract = String(parsed.abstract ?? '');
      keyPoints = Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String).slice(0, 8) : [];
      entities = Array.isArray(parsed.entities) ? parsed.entities.map(String).slice(0, 6) : [];
    } catch {
      abstract = distilled.slice(0, 300); // fallback: pakai teks mentah
    }

    /* ── L3 · LINK — entitas → [[wikilink]] + kumpulkan MOC ───────── */
    const entityLinks = entities.map((e) => `[[${slugify(e)}]]`).join(' ');
    const body = [
      '---',
      `title: "${doc.title.replace(/"/g, '')}"`,
      `source: document`,
      `generated: nalar-memory-agent`,
      `level: ${MEMORY_MAX_LEVEL}`,
      '---',
      '',
      `# ${doc.title}`,
      '',
      abstract,
      '',
      ...(keyPoints.length ? ['## Poin kunci', ...keyPoints.map((k) => `- ${k}`), ''] : []),
      ...(entities.length ? [`Topik: ${entityLinks}`, ''] : []),
    ].join('\n');

    noteDrafts.push({ slug, title: doc.title, source: doc.title, body });

    // note topik (MOC) — dibuat/di-update agar wikilink tidak dangling
    for (const e of entities) {
      const eSlug = slugify(e);
      const mocBody = [
        '---', `title: "${e.replace(/"/g, '')}"`, 'type: moc', 'generated: nalar-memory-agent', '---', '',
        `# ${e}`, '', `Peta konten topik **${e}**. Terkait: [[${slug}]]`, '',
      ].join('\n');
      noteDrafts.push({ slug: eSlug, title: e, source: 'moc', body: mocBody });
    }
  }

  /* ── L4 · GRAPH — upsert notes (+edges wikilink) + edges similarity ─ */
  // Embed ringkasan tiap note utk edges similarity.
  const uniqueDrafts = dedupBySlug(noteDrafts);
  const texts = uniqueDrafts.map((n) => n.body.slice(0, 1500));
  const vectors = await embed(embeddingModel, texts, { tenantId, getApiKey });

  const idBySlug = new Map<string, string>();
  for (let i = 0; i < uniqueDrafts.length; i++) {
    const n = uniqueDrafts[i];
    const noteId = await memoryService.upsertNote(tenantId, {
      chatbotId, slug: n.slug, title: n.title, contentMd: n.body, embedding: vectors[i],
    });
    idBySlug.set(n.slug, noteId);
  }
  // pass kedua: resolve wikilink yang tadinya dangling (target baru dibuat)
  for (const n of uniqueDrafts) {
    await memoryService.upsertNote(tenantId, {
      chatbotId, slug: n.slug, title: n.title, contentMd: n.body,
      embedding: vectors[uniqueDrafts.indexOf(n)],
    });
  }

  // edges similarity (cosine antar embedding note; vektor sudah normalized)
  await withTenant(tenantId, async (tx) => {
    await tx.update(memoryEdges).set({ deletedAt: new Date() })
      .where(and(
        eq(memoryEdges.tenantId, tenantId),
        eq(memoryEdges.chatbotId, chatbotId),
        eq(memoryEdges.kind, 'similarity'),
        isNull(memoryEdges.deletedAt),
      ));
    for (let a = 0; a < uniqueDrafts.length; a++) {
      for (let b = a + 1; b < uniqueDrafts.length; b++) {
        const sim = dot(vectors[a], vectors[b]);
        if (sim >= SIMILARITY_EDGE_THRESHOLD) {
          await tx.insert(memoryEdges).values({
            tenantId, chatbotId,
            fromNoteId: idBySlug.get(uniqueDrafts[a].slug)!,
            toNoteId: idBySlug.get(uniqueDrafts[b].slug)!,
            kind: 'similarity', weight: sim,
          });
        }
      }
    }
  });

  /* ── L5 · SELF-EVOLVING — merge duplikat + prune orphan ─────────── */
  const evolution = await runSelfEvolution(tenantId, chatbotId, uniqueDrafts, vectors, idBySlug);

  await audit(tenantId, 'system', 'memory.run', chatbotId, {
    documents: docs.length, notes: uniqueDrafts.length, level: MEMORY_MAX_LEVEL,
    l5: evolution,
  });
}

/**
 * L5: vault merawat dirinya sendiri.
 *  a) MERGE — pasangan note similarity ≥ MERGE_THRESHOLD digabung:
 *     konten duplikat ditempel sebagai seksi di note utama, semua edge
 *     duplikat dialihkan ke note utama, duplikat di-soft-delete.
 *     Note MOC tidak pernah di-merge (fungsinya indeks, bukan konten).
 *  b) PRUNE — MOC tanpa edge aktif (yatim) di-soft-delete.
 */
async function runSelfEvolution(
  tenantId: string,
  chatbotId: string,
  drafts: Array<{ slug: string; title: string; source: string; body: string }>,
  vectors: number[][],
  idBySlug: Map<string, string>,
): Promise<{ merged: number; pruned: number }> {
  let merged = 0, pruned = 0;
  const isMoc = (d: { source: string }) => d.source === 'moc';
  const deadSlugs = new Set<string>();

  await withTenant(tenantId, async (tx) => {
    /* a) MERGE near-duplicates (non-MOC saja) */
    for (let a = 0; a < drafts.length; a++) {
      if (isMoc(drafts[a]) || deadSlugs.has(drafts[a].slug)) continue;
      for (let b = a + 1; b < drafts.length; b++) {
        if (isMoc(drafts[b]) || deadSlugs.has(drafts[b].slug)) continue;
        const sim = dot(vectors[a], vectors[b]);
        if (sim < MERGE_THRESHOLD) continue;

        const keepId = idBySlug.get(drafts[a].slug)!;
        const dropId = idBySlug.get(drafts[b].slug)!;

        // gabungkan konten duplikat sebagai seksi di note utama
        const mergedBody = drafts[a].body +
          `\n\n## Digabung dari [[${drafts[b].slug}]] (sim ${sim.toFixed(2)})\n\n` +
          drafts[b].body.replace(/^---[\s\S]*?---\n/, ''); // buang frontmatter dup
        await tx.update(memoryNotes)
          .set({ contentMd: mergedBody, updatedAt: new Date() })
          .where(eq(memoryNotes.id, keepId));

        // alihkan seluruh edge duplikat → note utama
        await tx.update(memoryEdges).set({ fromNoteId: keepId, updatedAt: new Date() })
          .where(and(eq(memoryEdges.fromNoteId, dropId), isNull(memoryEdges.deletedAt)));
        await tx.update(memoryEdges).set({ toNoteId: keepId, updatedAt: new Date() })
          .where(and(eq(memoryEdges.toNoteId, dropId), isNull(memoryEdges.deletedAt)));

        // soft-delete duplikat (Rule #3 — bisa dipulihkan)
        await tx.update(memoryNotes)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(memoryNotes.id, dropId));

        deadSlugs.add(drafts[b].slug);
        merged++;
      }
    }

    /* b) PRUNE MOC yatim */
    for (const d of drafts) {
      if (!isMoc(d) || deadSlugs.has(d.slug)) continue;
      const noteId = idBySlug.get(d.slug)!;
      const edges = await tx.execute(sql`
        select count(*)::int as n from memory_edges
        where (from_note_id = ${noteId} or to_note_id = ${noteId})
          and deleted_at is null
      `);
      const n = (edges as unknown as Array<{ n: number }>)[0]?.n ?? 0;
      if (n === 0) {
        await tx.update(memoryNotes)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(memoryNotes.id, noteId));
        pruned++;
      }
    }
  });

  return { merged, pruned };
}

function dedupBySlug<T extends { slug: string }>(arr: T[]): T[] {
  const seen = new Map<string, T>();
  for (const n of arr) if (!seen.has(n.slug)) seen.set(n.slug, n);
  return [...seen.values()];
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) s += a[i] * b[i];
  return s;
}
