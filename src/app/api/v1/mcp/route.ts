import { NextResponse } from 'next/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { chatbots } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { settingsService } from '@/modules/settings/settings.service';
import { retrievalService } from '@/modules/chat/retrieval.service';
import { apiRoute } from '../_guard';
import {
  ALAT, KODE, adalahNotifikasi, alatBerhasil, alatGagal, galat, hasil,
  keteranganServer, periksaAmplop, ringkasPencarian,
} from '@/modules/integrations/mcp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/v1/mcp — server MCP (Model Context Protocol) untuk workspace ini.
 *
 * Membuat basis pengetahuan tenant bisa dipanggil langsung dari Claude, IDE,
 * atau agen mana pun yang berbicara MCP, tanpa pelanggan menulis integrasi
 * sendiri. Autentikasinya kunci API yang sama dengan `/api/v1/*` —
 * `Authorization: Bearer nk_live_…`.
 *
 * Cakupan `chat`, bukan `read`. Pencarian semantik memuat embedding kueri, dan
 * itu pekerjaan yang berbiaya — cakupannya disamakan dengan `/api/v1/search`
 * supaya kunci "baca saja" tak diam-diam membuka jalur yang lebih mahal.
 *
 * Transport: JSON biasa, bukan SSE. Server ini tak pernah mengirim pesan lebih
 * dulu (tak ada sampling, tak ada notifikasi perubahan alat), jadi saluran
 * dua arah hanya akan menambah bagian yang bisa rusak tanpa menambah apa pun.
 */
export const POST = apiRoute('chat', async (req, _ctx, caller) => {
  const body = await req.json().catch(() => null);

  const salah = periksaAmplop(body);
  if (salah) {
    // Amplop yang rusak = galat PROTOKOL, dan id-nya belum tentu terbaca.
    const id = (body && typeof body === 'object' && !Array.isArray(body)
      ? (body as { id?: string | number | null }).id ?? null : null);
    return NextResponse.json(galat(id, body === null ? KODE.PARSE : KODE.PERMINTAAN_TAK_SAH, salah));
  }

  const b = body as { id?: string | number | null; method: string; params?: Record<string, unknown> };

  /* NOTIFIKASI TIDAK DIBALAS SAMA SEKALI — termasuk saat metodenya tak
     dikenal. Klien MCP tak menunggu jawaban untuk notifikasi; mengirim satu
     tetap akan dibaca sebagai balasan atas permintaan LAIN yang sedang
     menunggu, dan pasangan permintaan-jawabannya bergeser sejak titik itu. */
  if (adalahNotifikasi(b)) return new NextResponse(null, { status: 202 });

  const id = b.id ?? null;

  switch (b.method) {
    case 'initialize':
      return NextResponse.json(hasil(id, keteranganServer()));

    case 'ping':
      return NextResponse.json(hasil(id, {}));

    case 'tools/list':
      return NextResponse.json(hasil(id, { tools: ALAT }));

    case 'tools/call':
      return NextResponse.json(hasil(id, await panggilAlat(caller.tenantId, b.params)));

    default:
      return NextResponse.json(galat(id, KODE.METODE_TAK_DIKENAL, `Metode "${b.method}" tak dikenal.`));
  }
});

/**
 * Jalankan satu alat.
 *
 * SELALU mengembalikan `result`, tak pernah melempar galat JSON-RPC. Kegagalan
 * alat adalah jawaban yang dibaca model pemanggil, dan model yang membacanya
 * bisa mencoba hal lain — sementara galat protokol dibaca sebagai sambungan
 * rusak dan memicu percobaan ulang yang takkan pernah berhasil.
 */
async function panggilAlat(tenantId: string, params: Record<string, unknown> | undefined) {
  const nama = typeof params?.name === 'string' ? params.name : '';
  const arg = (params?.arguments ?? {}) as Record<string, unknown>;

  if (nama === 'daftar_chatbot') {
    const rows = await withTenant(tenantId, (tx) =>
      tx.select({ id: chatbots.id, name: chatbots.name, context: chatbots.context })
        .from(chatbots).where(isNull(chatbots.deletedAt)).orderBy(desc(chatbots.createdAt)));
    if (rows.length === 0) {
      return alatGagal('Workspace ini belum punya chatbot, jadi belum ada basis pengetahuan '
        + 'yang bisa dicari. Buat satu lebih dulu di dashboard Nalar.');
    }
    return alatBerhasil(rows.map((r) =>
      `${r.id} — ${r.name}${r.context ? `\n    ${r.context.slice(0, 200)}` : ''}`).join('\n'));
  }

  if (nama === 'cari_dokumen') {
    const chatbotId = typeof arg.chatbotId === 'string' ? arg.chatbotId.trim() : '';
    const query = typeof arg.query === 'string' ? arg.query.trim() : '';
    if (!chatbotId || !query) {
      return alatGagal('cari_dokumen menuntut "chatbotId" dan "query". '
        + 'Panggil daftar_chatbot untuk mengetahui chatbotId yang tersedia.');
    }
    const kMentah = typeof arg.k === 'number' ? Math.trunc(arg.k) : 6;
    const k = Math.min(Math.max(kMentah, 1), 20);

    /* Chatbot wajib milik tenant pemegang kunci. RLS sudah menjaminnya, tapi
       memeriksanya di sini memberi jawaban yang jujur alih-alih hasil kosong
       yang akan ditafsirkan model sebagai "topiknya tak ada di dokumen". */
    const bot = await withTenant(tenantId, async (tx) =>
      (await tx.select({ id: chatbots.id }).from(chatbots)
        .where(and(eq(chatbots.id, chatbotId), isNull(chatbots.deletedAt))).limit(1))[0]);
    if (!bot) {
      return alatGagal(`Chatbot "${chatbotId}" tidak ada di workspace ini. `
        + 'Panggil daftar_chatbot untuk mendapatkan id yang benar.');
    }

    const settings = await settingsService.get(tenantId);
    const model = settings?.activeEmbeddingModel ?? 'all-MiniLM-L6-v2';
    const potongan = await retrievalService.retrieve(tenantId, chatbotId, model, query, k);
    return alatBerhasil(ringkasPencarian(query, potongan));
  }

  return alatGagal(`Alat "${nama || '(kosong)'}" tak dikenal. `
    + `Yang tersedia: ${ALAT.map((a) => a.name).join(', ')}.`);
}
