import { NextRequest, NextResponse, after } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { dataSources, knowledgeBases } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { requireRole } from '@/modules/core/auth';
import { knowledgeService } from '@/modules/knowledge/knowledge.service';
import { extractText, isExtractable } from '@/modules/knowledge/sync.service';
import { jobsSettled } from '@/modules/core/jobs';
import { ensureIntegrations } from '../../../_wire';

export const runtime = 'nodejs';
/** Ekstraksi + embed beberapa berkas butuh waktu setelah respons terkirim. */
export const maxDuration = 60;

/**
 * POST /api/knowledge-bases/{id}/upload — unggah berkas langsung ke KB.
 *
 * Jalur untuk pelanggan yang dokumennya TIDAK ada di Drive/SharePoint. Sampai
 * sekarang jenis sumber `upload` hanya ada di enum skema tanpa jalur apa pun,
 * jadi mereka terpaksa lewat API.
 *
 * Berbeda dari sumber storage, unggahan TIDAK bisa disinkronkan ulang: berkas
 * aslinya tak tinggal di mana pun yang bisa kita tengok lagi. Karena itu
 * ekstraksi + ingest dikerjakan langsung di sini, bukan lewat job sync.
 *
 * Semua berkas satu KB bermuara ke SATU baris sumber "Unggahan manual", dan
 * tiap berkas memakai namanya sebagai `externalId`. Konsekuensinya sengaja:
 * mengunggah ulang nama yang sama MENGGANTI isi lamanya alih-alih menumpuk
 * dua salinan — perilaku yang diharapkan orang saat memperbaiki dokumen.
 *
 * BATAS 4,5 MB per permintaan datang dari Vercel, bukan dari kita. Itu batas
 * badan permintaan fungsi serverless dan tak bisa dinaikkan dari sisi aplikasi;
 * UI menyebutkannya apa adanya supaya kegagalannya tak terasa misterius.
 */
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 20;
const SOURCE_NAME = 'Unggahan manual';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  ensureIntegrations();
  // Anggota tenant boleh mengunggah ke KB milik TENANT-nya (RLS menjaga ia
  // tak pernah menyentuh KB/tenant lain). Yang dulu hanya superadmin/admin
  // kini dibuka ke member — unggahan langsung adalah jalur yang paling sering
  // dipakai pemilik data yang belum punya storage terhubung.
  const user = await requireRole('superadmin', 'admin', 'member');
  const { id: knowledgeBaseId } = await ctx.params;

  const kb = await withTenant(user.tenantId, async (tx) =>
    (await tx.select({ id: knowledgeBases.id }).from(knowledgeBases)
      .where(and(eq(knowledgeBases.id, knowledgeBaseId), isNull(knowledgeBases.deletedAt)))
      .limit(1))[0]);
  if (!kb) return NextResponse.json({ error: 'Knowledge base tidak ditemukan' }, { status: 404 });

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json(
      { error: 'Gagal membaca berkas. Total unggahan mungkin melebihi 4,5 MB — batas Vercel per permintaan.' },
      { status: 413 });
  }

  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: 'Tak ada berkas yang dikirim' }, { status: 400 });
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Maksimal ${MAX_FILES} berkas per unggahan` }, { status: 400 });
  }
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL_BYTES) {
    return NextResponse.json(
      { error: `Total ${(total / 1048576).toFixed(1)} MB melebihi batas 4 MB per unggahan. Bagi jadi beberapa kali.` },
      { status: 413 });
  }

  // Satu baris sumber per KB — dibuat sekali, lalu dipakai ulang.
  const source = await withTenant(user.tenantId, async (tx) => {
    const found = (await tx.select().from(dataSources).where(and(
      eq(dataSources.knowledgeBaseId, knowledgeBaseId),
      eq(dataSources.kind, 'upload'),
      isNull(dataSources.deletedAt),
    )).limit(1))[0];
    if (found) return found;
    return (await tx.insert(dataSources).values({
      tenantId: user.tenantId, knowledgeBaseId, kind: 'upload',
      config: { name: SOURCE_NAME }, status: 'ready',
    }).returning())[0];
  });

  const ingested: Array<{ name: string; chunks: number }> = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  for (const f of files) {
    if (!isExtractable(f.name, f.type)) {
      skipped.push({ name: f.name, reason: 'format tak didukung' });
      continue;
    }
    try {
      const buf = Buffer.from(await f.arrayBuffer());
      const text = await extractText(f.name, buf, f.type);
      if (!text?.trim()) {
        // PDF hasil pindaian tanpa lapisan teks adalah kasus paling sering di
        // sini — sebutkan spesifik, jangan cuma "gagal".
        skipped.push({ name: f.name, reason: 'tak ada teks yang bisa dibaca (PDF hasil pindai?)' });
        continue;
      }
      // Potongan lama dengan nama yang sama DIBUANG dulu. `ingest()` tak
      // melakukannya sendiri — jalur sync memanggil removeExternal() secara
      // terpisah sebelum meng-ingest ulang. Tanpa langkah ini, mengunggah
      // dokumen yang diperbaiki akan menyimpan DUA versi sekaligus, dan
      // retrieval bisa menjawab dari yang usang. Terbukti saat pengujian:
      // ingest dua kali dengan externalId sama menghasilkan dua potongan.
      await knowledgeService.removeExternal(user.tenantId, source.id, [f.name]);

      const chunks = await knowledgeService.ingest(user.tenantId, {
        knowledgeBaseId,
        title: f.name,
        text,
        sourceId: source.id,
        externalId: f.name,
        externalVersion: String(f.size),
        metadata: { uploadedBy: user.id, size: f.size, mime: f.type || null },
      });
      ingested.push({ name: f.name, chunks });
    } catch (e) {
      // Satu berkas rusak tak boleh menggagalkan seluruh unggahan.
      skipped.push({ name: f.name, reason: (e as Error).message.slice(0, 120) });
    }
  }

  await withTenant(user.tenantId, (tx) => tx.update(dataSources).set({
    status: 'ready', lastSyncedAt: new Date(), updatedAt: new Date(),
    config: {
      name: SOURCE_NAME,
      lastSync: { ingested: ingested.length, skipped: skipped.length },
    },
  }).where(eq(dataSources.id, source.id)));

  // Vercel membekukan lambda begitu respons terkirim; agen memory yang
  // terpicu oleh ingest akan mati di tengah tanpa ini.
  after(jobsSettled);

  return NextResponse.json({
    ok: true,
    sourceId: source.id,
    ingested,
    skipped,
    chunks: ingested.reduce((n, x) => n + x.chunks, 0),
  }, { status: 201 });
}
