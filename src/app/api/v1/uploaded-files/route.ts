import { NextResponse } from 'next/server';
import { uploadedFileService } from '@/modules/knowledge/uploaded-file.service';
import { apiRoute } from '../_guard';
import { bacaPaging, balasanDaftar } from '../_paging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/v1/uploaded-files?knowledgeBaseId=… — berkas ASLI yang tersimpan.
 *
 * Berbeda dari `/api/v1/documents`, dan bedanya penting: `documents` adalah
 * TEKS yang sudah dipotong dan diembed — yang benar-benar dibaca chatbot.
 * Endpoint ini adalah BERKASNYA sendiri, apa adanya di blob/BYOB.
 *
 * Keduanya bisa tak sejalan, dan justru di situ gunanya: berkas yang tersimpan
 * tapi gagal di-parse akan muncul di sini TANPA punya dokumen — satu-satunya
 * cara pemiliknya bisa tahu bahwa PDF-nya masuk tapi teksnya tak terbaca.
 * Sebaliknya, teks yang ditempel lewat API punya dokumen tanpa berkas asli.
 *
 * `path` dan `url` sengaja TIDAK dikembalikan. Keduanya alamat internal di
 * penyimpanan, dan pada penyedia tertentu bisa dipakai langsung untuk membaca
 * berkasnya tanpa melewati pemeriksaan tenant. Untuk mengambil isinya, ada
 * `/api/v1/uploaded-files/{id}/download` yang memeriksa kepemilikan lebih dulu.
 */
export const GET = apiRoute('read', async (req, _ctx, caller) => {
  const kbId = new URL(req.url).searchParams.get('knowledgeBaseId');
  const paging = bacaPaging(req);
  const { rows, total } = await uploadedFileService.daftar(caller.tenantId, {
    knowledgeBaseId: kbId,
    limit: paging.limit,
    offset: paging.offset,
  });
  return NextResponse.json(balasanDaftar(
    'files',
    rows.map((r) => ({
      id: String(r.id),
      filename: String(r.filename ?? ''),
      sizeBytes: Number(r.size_bytes ?? 0),
      mime: r.mime ?? null,
      provider: String(r.provider ?? ''),
      knowledgeBaseId: r.knowledge_base_id ?? null,
      createdAt: r.created_at,
    })),
    total,
    paging,
  ));
});
