import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, requireRole } from '@/modules/core/auth';
import { AksesDitolakError, chatbotService, ValidationError } from '@/modules/chatbot/chatbot.service';
import { QuotaError } from '@/modules/usage/usage.service';
import { divisionService } from '@/modules/settings/division.service';
import { ensureIntegrations } from '../_wire';

export const runtime = 'nodejs';

/** GET /api/chatbots — daftar chatbot aktif yang BOLEH dilihat pemanggil. */
export async function GET() {
  const user = await getCurrentUser();
  const rows = await chatbotService.list(user.tenantId, await divisionService.aktor(user));
  return NextResponse.json(rows);
}

const CreateBody = z.object({
  name: z.string().min(1).default('Chatbot Baru'),
  allowedOrigins: z.array(z.string()).optional(),
  greeting: z.string().optional(),
  themeConfig: z.record(z.unknown()).optional(),
  /** D11: konteks divisi/persona chatbot. */
  /* NULLABLE, bukan cuma optional. Form mengirim `context: null` setiap kali
     kolom Konteks dibiarkan kosong — dan itu keadaan NORMAL untuk chatbot
     baru. Tanpa .nullable(), setiap pembuatan chatbot polos ditolak 400, dan
     galat zod-nya sampai ke layar sebagai "[object Object]": pesan yang tak
     menyebutkan apa pun tentang sebabnya. PatchBody sudah nullable sejak awal;
     yang ini tertinggal. */
  context: z.string().max(2000).nullable().optional(),
  /* Divisi PEMILIK (migrasi 0040) — beda dari `context` di atas, yang cuma
     prosa untuk system prompt. Hanya dihormati bila pembuatnya berperan
     lintas divisi; member selalu mengikuti divisinya sendiri. */
  divisionId: z.string().uuid().nullable().optional(),
});

/** POST /api/chatbots — buat chatbot → balikan termasuk embed snippet. */
export async function POST(req: NextRequest) {
  ensureIntegrations();
  const user = await requireRole('superadmin', 'admin');
  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    const chatbot = await chatbotService.create(user.tenantId, await divisionService.aktor(user), {
      ownerId: user.id, ...parsed.data,
      themeConfig: parsed.data.themeConfig as never,
    });
    /* Ciphertext rahasia tak pernah meninggalkan server — lihat tanpaRahasia(). */
    return NextResponse.json({ chatbot: chatbotService.tanpaRahasia(chatbot),
      snippet: chatbotService.embedSnippet(chatbot.publicKey) }, { status: 201 });
  } catch (e) {
    if (e instanceof AksesDitolakError) return NextResponse.json({ error: e.message }, { status: 403 });
    // 402 memisahkan "jatahmu habis" (upgrade) dari "permintaanmu salah" (422).
    if (e instanceof QuotaError) return NextResponse.json({ error: e.message, quota: { used: e.used, limit: e.limit } }, { status: 402 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
