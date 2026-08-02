import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { chatbots } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { settingsService } from '@/modules/settings/settings.service';
import { retrievalService } from '@/modules/chat/retrieval.service';
import { apiRoute } from '../_guard';
import { bersihkanSaring } from '@/modules/knowledge/saring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/v1/search — pencarian semantik MURNI, tanpa LLM.
 *
 * Endpoint yang paling berguna bagi agen milik pelanggan: ia mengembalikan
 * potongan dokumen beserta skor kemiripannya, lalu agen itu sendiri yang
 * menyusun jawaban dengan modelnya sendiri. Tak ada token LLM yang terbakar di
 * sisi kami, jadi ia juga tak memotong kuota pesan.
 *
 * Terikat pada satu chatbot karena di situlah cakupan pengetahuan ditentukan:
 * chatbot menunjuk knowledge base mana yang boleh dibacanya (D11). Tanpa itu
 * pencarian akan menembus seluruh KB tenant — melanggar pemisahan divisi yang
 * justru jadi alasan chatbot punya KB masing-masing.
 */
const Body = z.object({
  chatbotId: z.string().uuid(),
  query: z.string().min(1).max(2_000),
  /** jumlah potongan yang dikembalikan */
  k: z.number().int().min(1).max(20).default(6),
  /** ambang skor; potongan di bawahnya dibuang */
  minScore: z.number().min(0).max(1).optional(),
  /**
   * Penyaring metadata — dipakai SEBELUM pencarian vektor, bukan sesudah.
   *
   * Bedanya menentukan di korpus besar: menyaring sesudah berarti indeks
   * vektor tetap menyapu seluruh korpus dan hasilnya baru dibuang di memori,
   * jadi yang tersisa bisa kurang dari k tanpa ada yang tahu kenapa.
   *
   * Dibiarkan longgar di zod dan dibersihkan bersihkanSaring() — satu tempat
   * yang sama dengan jalur chat, supaya aturannya tak pernah bercabang.
   */
  saring: z.record(z.unknown()).optional(),
});

export const POST = apiRoute('chat', async (req, _ctx, caller) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const { chatbotId, query, k, minScore } = parsed.data;
  let saring;
  try {
    saring = bersihkanSaring(parsed.data.saring);
  } catch (e) {
    /* Tanggal ngawur MELEMPAR, tidak diam-diam jadi "tanpa penyaring".
       Penyaring yang hilang diam-diam membuat pemanggil melihat hasil dari
       SELURUH korpus sambil mengira ia sedang melihat satu folder. */
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // Chatbot wajib milik tenant pemegang kunci. RLS sudah menjamin ini, tapi
  // memeriksanya di sini memberi 404 yang jujur alih-alih hasil kosong yang
  // membingungkan.
  const bot = await withTenant(caller.tenantId, async (tx) =>
    (await tx.select({ id: chatbots.id }).from(chatbots)
      .where(and(eq(chatbots.id, chatbotId), isNull(chatbots.deletedAt))).limit(1))[0]);
  if (!bot) return NextResponse.json({ error: 'Chatbot tidak ditemukan' }, { status: 404 });

  const settings = await settingsService.get(caller.tenantId);
  const model = settings?.activeEmbeddingModel ?? 'all-MiniLM-L6-v2';

  const chunks = await retrievalService.retrieve(caller.tenantId, chatbotId, model, query, k, saring);
  const results = (minScore ? chunks.filter((c) => c.score >= minScore) : chunks);

  return NextResponse.json({
    query,
    embeddingModel: model,
    results: results.map((c) => ({
      documentId: c.documentId,
      title: c.title,
      content: c.content,
      score: Number(c.score.toFixed(4)),
    })),
  });
});
