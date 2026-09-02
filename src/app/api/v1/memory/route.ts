import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { chatbots } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { memoryService } from '@/modules/memory/memory.service';
import { apiRoute } from '../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/v1/memory?chatbotId=… — catatan Memory + peta keterkaitannya.
 *
 * ── KENAPA RUTE INI ADA ─────────────────────────────────────────────────────
 *
 * Memory Agent sudah lama menyusun rangkuman dari dokumen tenant, saling
 * terhubung lewat `[[wikilink]]`, dan semuanya sudah tersedia lewat
 * `memoryService.graph()` dan `exportVault()`. Tapi satu-satunya pintunya —
 * `/api/memory/*` — dijaga SESI LOGIN Nalar.
 *
 * Pemakai yang datang lewat sistem lain (mis. Maira) sengaja tidak punya sesi
 * itu: satu akun di sana sama dengan satu tenant di sini, dikendalikan lewat
 * kunci API server-side. Akibatnya fitur yang sudah jadi ini tak pernah bisa
 * mereka lihat sama sekali.
 *
 * Jadi ini bukan fitur baru, melainkan membuka fitur yang sudah ada ke jalur
 * autentikasi yang benar — pola yang sama dengan unggah berkas v1.
 *
 * ── KENAPA SATU RUTE, BUKAN DUA ─────────────────────────────────────────────
 *
 * Graf dan isi catatan selalu ditampilkan bersama di satu layar: klik simpul,
 * baca isinya. Dua permintaan terpisah untuk satu layar berarti dua kali
 * penyambungan basis data dari lambda dingin — biaya yang justru paling terasa
 * di sini. Keduanya kecil (rangkuman, bukan dokumen mentah), jadi digabung.
 */
export const GET = apiRoute('read', async (req, _ctx, caller) => {
  const chatbotId = (new URL(req.url).searchParams.get('chatbotId') ?? '').trim();
  if (!chatbotId) {
    return NextResponse.json(
      { error: '`chatbotId` wajib — memory selalu milik satu chatbot' }, { status: 400 });
  }

  // Kepemilikan chatbot diperiksa LEBIH DULU dan eksplisit. memoryService sudah
  // menyaring tenant di kuerinya, tapi tanpa langkah ini id chatbot milik orang
  // lain dijawab dengan graf kosong — dan balasan kosong yang berarti "bukan
  // milikmu" tak bisa dibedakan dari "belum ada catatan".
  const bot = await withTenant(caller.tenantId, async (tx) =>
    (await tx.select({ id: chatbots.id, name: chatbots.name }).from(chatbots)
      .where(and(
        eq(chatbots.tenantId, caller.tenantId),
        eq(chatbots.id, chatbotId),
        isNull(chatbots.deletedAt),
      )).limit(1))[0]);
  if (!bot) return NextResponse.json({ error: 'Chatbot tidak ditemukan' }, { status: 404 });

  const [graph, vault] = await Promise.all([
    memoryService.graph(caller.tenantId, chatbotId),
    memoryService.exportVault(caller.tenantId, chatbotId),
  ]);

  // Isi catatan dipetakan ke slug supaya klien bisa menampilkannya saat sebuah
  // simpul diklik, tanpa permintaan kedua. Jalur `_nalar-memory/<slug>.md`
  // dipotong di sini — itu detail penulisan vault ke Drive, bukan urusan klien.
  const isiPerSlug: Record<string, string> = {};
  for (const f of vault) {
    const slug = f.path.replace(/^_nalar-memory\//, '').replace(/\.md$/, '');
    isiPerSlug[slug] = f.content;
  }

  return NextResponse.json({
    chatbot: { id: bot.id, name: bot.name },
    notes: graph.nodes.map((n) => ({
      id: n.id,
      slug: n.slug,
      title: n.title,
      category: n.category,
      linksTo: n.linksTo ?? [],
      content: isiPerSlug[n.slug] ?? null,
    })),
    // Bentuk graf DIPERTAHANKAN apa adanya dari memoryService, bukan disusun
    // ulang: klien yang menggambar graf ini harus melihat data yang sama persis
    // dengan yang digambar panel Nalar sendiri. Dua bentuk berbeda untuk satu
    // graf adalah cara termudah membuat keduanya perlahan menyimpang.
    edges: graph.edges,
    total: graph.nodes.length,
  });
});
