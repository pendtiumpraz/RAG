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
 *  L5 (nanti)  — agen mereorganisasi/merge/prune note-nya sendiri secara
 *                berkala. TIDAK diimplement — kompleksitas > kebutuhan.
 * ═══════════════════════════════════════════════════════════════════
 */

export const MEMORY_MAX_LEVEL = 4 as const;
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

  await audit(tenantId, 'system', 'memory.run', chatbotId, {
    documents: docs.length, notes: uniqueDrafts.length, level: MEMORY_MAX_LEVEL,
  });
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
