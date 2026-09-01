import { NextRequest, NextResponse, after } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { dataSources, knowledgeBases } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { knowledgeService, QuotaError } from '@/modules/knowledge/knowledge.service';
import { extractText, isExtractable } from '@/modules/knowledge/sync.service';
import { knowledgeBaseService } from '@/modules/knowledge/knowledge-base.service';
import { memoryAgent } from '@/modules/memory/memory-agent.service';
import { storageService } from '@/modules/storage';
import { uploadedFileService } from '@/modules/knowledge/uploaded-file.service';
import { jobsSettled } from '@/modules/core/jobs';
import { apiRoute } from '../../../_guard';
import { tenantOwner } from '../../../_actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Ekstraksi + embed butuh waktu; disamakan dengan rute unggah dashboard. */
export const maxDuration = 300;

/**
 * POST /api/v1/knowledge-bases/{id}/upload — unggah BERKAS (bukan teks tempel).
 *
 * ── KENAPA RUTE INI ADA ─────────────────────────────────────────────────────
 *
 * Nalar sudah punya jalur unggah lengkap — ekstraksi PDF (`pdf-parse`) dan DOCX
 * (`mammoth`), simpan blob, ingest ke KB — tapi ia tinggal di
 * `POST /api/knowledge-bases/{id}/upload` dan dijaga `requireRole()`, yaitu
 * SESI LOGIN Nalar.
 *
 * Pemakai Maira sengaja TIDAK punya sesi Nalar (satu akun Maira = satu tenant
 * Nalar, dikendalikan lewat API key server-side). Akibatnya dari dalam Maira
 * hanya bisa menempel teks lewat `POST /api/v1/documents` — PDF tidak bisa
 * diunggah sama sekali, dan itu justru bentuk dokumen yang paling sering
 * dimiliki orang: SOP, daftar harga, profil perusahaan.
 *
 * Jadi ini bukan menyalin fitur, melainkan membuka fitur yang sudah ada ke
 * jalur autentikasi yang benar. Seluruh langkah beratnya memakai layanan yang
 * SAMA PERSIS dengan rute dashboard — rute itu tidak disentuh sedikit pun,
 * supaya jalur yang sudah bekerja tidak ikut berisiko.
 *
 * ── BATAS 2 MB ──────────────────────────────────────────────────────────────
 *
 * Lebih ketat daripada 4 MB milik rute dashboard, dan itu keputusan pemilik.
 * Alasannya nyata: permintaan ini melewati DUA fungsi serverless (proxy Maira,
 * lalu Nalar), dan masing-masing punya langit-langit ~4,5 MB dari Vercel yang
 * tidak bisa dinaikkan dari kode. Menerima berkas yang pasti tertolak di tengah
 * jalan cuma memindahkan kegagalannya ke tempat yang lebih membingungkan.
 */
const MAKS_BYTE = 2 * 1024 * 1024;
const MAKS_BERKAS = 5;
const NAMA_SUMBER = 'Unggahan manual';

export const POST = apiRoute<{ params: Promise<{ id: string }> }>(
  'write',
  async (req: NextRequest, ctx, caller) => {
    const { id: knowledgeBaseId } = await ctx.params;

    // Penyaring tenant EKSPLISIT di samping RLS — lihat catatan di withTenant.
    const kb = await withTenant(caller.tenantId, async (tx) =>
      (await tx.select({ id: knowledgeBases.id }).from(knowledgeBases)
        .where(and(
          eq(knowledgeBases.tenantId, caller.tenantId),
          eq(knowledgeBases.id, knowledgeBaseId),
          isNull(knowledgeBases.deletedAt),
        ))
        .limit(1))[0]);
    if (!kb) return NextResponse.json({ error: 'Knowledge base tidak ditemukan' }, { status: 404 });

    const owner = await tenantOwner(caller.tenantId);
    if (!owner) return NextResponse.json({ error: 'Tenant tak punya admin aktif.' }, { status: 409 });

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json(
        { error: 'Gagal membaca berkas. Ukurannya mungkin melebihi batas permintaan.' },
        { status: 413 });
    }

    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (!files.length) return NextResponse.json({ error: 'Tak ada berkas yang dikirim' }, { status: 400 });
    if (files.length > MAKS_BERKAS) {
      return NextResponse.json({ error: `Maksimal ${MAKS_BERKAS} berkas per unggahan` }, { status: 400 });
    }
    const total = files.reduce((n, f) => n + f.size, 0);
    if (total > MAKS_BYTE) {
      // Menyebut angkanya DAN batasnya: "terlalu besar" saja membuat orang
      // menebak-nebak berapa yang boleh.
      return NextResponse.json(
        { error: `Total ${(total / 1048576).toFixed(1)} MB melebihi batas 2 MB per unggahan. Bagi jadi beberapa kali.` },
        { status: 413 });
    }

    // Satu baris sumber per KB — dibuat sekali, lalu dipakai ulang. Sengaja
    // memakai `kind` dan nama yang SAMA dengan rute dashboard, supaya unggahan
    // lewat Maira dan lewat panel Nalar tidak melahirkan dua sumber terpisah
    // untuk knowledge base yang sama.
    const source = await withTenant(caller.tenantId, async (tx) => {
      const found = (await tx.select().from(dataSources).where(and(
        eq(dataSources.tenantId, caller.tenantId),
        eq(dataSources.knowledgeBaseId, knowledgeBaseId),
        eq(dataSources.kind, 'upload'),
        isNull(dataSources.deletedAt),
      )).limit(1))[0];
      if (found) return found;
      return (await tx.insert(dataSources).values({
        tenantId: caller.tenantId, knowledgeBaseId, kind: 'upload',
        config: { name: NAMA_SUMBER }, status: 'ready',
      }).returning())[0];
    });

    const masuk: Array<{ name: string; chunks: number; stored: boolean }> = [];
    const tersimpanSaja: Array<{ name: string; reason: string }> = [];
    const dilewati: Array<{ name: string; reason: string }> = [];

    for (const f of files) {
      if (!isExtractable(f.name, f.type)) {
        dilewati.push({ name: f.name, reason: 'format tak didukung' });
        continue;
      }
      try {
        const buf = Buffer.from(await f.arrayBuffer());

        // SIMPAN DULU, BARU PARSE — urutan yang sama dengan rute dashboard.
        // Parser yang gagal tidak berarti dokumennya rusak; berkas aslinya harus
        // aman lebih dulu supaya bisa di-ingest ulang nanti.
        await knowledgeService.assertStorageBlobQuota(caller.tenantId, f.size);
        const simpan = await storageService.simpanBerkasUpload(
          caller.tenantId, owner.id,
          { knowledgeBaseId, nama: f.name, bytes: buf, mime: f.type || null },
        ).catch((e: unknown) => {
          console.error('[v1 upload] gagal simpan ke blob:', (e as Error).message);
          return null;
        });

        if (simpan) {
          await withTenant(caller.tenantId, (tx) => uploadedFileService.simpan(tx, {
            tenantId: caller.tenantId,
            userId: owner.id,
            knowledgeBaseId,
            sourceId: source.id,
            filename: f.name,
            sizeBytes: f.size,
            provider: simpan.provider,
            storageConnectionId: simpan.storageConnectionId,
            path: simpan.path,
            url: simpan.url,
            mime: f.type || null,
          }));
        }

        const text = await extractText(f.name, buf, f.type);
        if (!text?.trim()) {
          tersimpanSaja.push({
            name: f.name,
            reason: simpan
              ? 'tersimpan, tapi teksnya belum bisa dibaca — belum masuk KB'
              : 'gagal disimpan & teksnya belum bisa dibaca',
          });
          continue;
        }

        // Buang potongan lama bernama sama dulu — `ingest` tidak melakukannya
        // sendiri, dan tanpa ini mengunggah dokumen yang diperbaiki menyimpan
        // DUA versi sekaligus, lalu retrieval bisa menjawab dari yang usang.
        await knowledgeService.removeExternal(caller.tenantId, source.id, [f.name]);

        const chunks = await knowledgeService.ingest(caller.tenantId, {
          knowledgeBaseId,
          title: f.name,
          text,
          sourceId: source.id,
          externalId: f.name,
          externalVersion: String(f.size),
          metadata: {
            uploadedVia: 'maira',
            size: f.size,
            mime: f.type || null,
            ...(simpan ? { storage: { provider: simpan.provider, path: simpan.path, url: simpan.url } } : {}),
          },
        });
        masuk.push({ name: f.name, chunks, stored: Boolean(simpan) });
      } catch (e) {
        // Kuota habis menghentikan SELURUH unggahan: berkas berikutnya pasti
        // ditolak juga, dan pemilik data harus tahu jatahnya penuh — bukan
        // menyangka berkasnya rusak satu per satu.
        if (e instanceof QuotaError) throw e;
        dilewati.push({ name: f.name, reason: (e as Error).message.slice(0, 120) });
      }
    }

    // Status sumber ikut diperbarui supaya panel Nalar tidak menampilkan
    // sumber yang kelihatan mandek padahal barusan diisi dari Maira.
    await withTenant(caller.tenantId, (tx) => tx.update(dataSources).set({
      status: 'ready', lastSyncedAt: new Date(), updatedAt: new Date(),
      config: {
        name: NAMA_SUMBER,
        lastSync: { ingested: masuk.length, disimpan: tersimpanSaja.length, skipped: dilewati.length },
      },
    }).where(and(eq(dataSources.tenantId, caller.tenantId), eq(dataSources.id, source.id))));

    /**
     * RANTAI MEMORY — disalin dari rute dashboard DENGAN SENGAJA.
     *
     * Komentar di sana mencatat kejadian nyata 21 Agu 2026: tanpa baris ini
     * dokumen unggahan manual tak pernah punya catatan memory, dan menekan
     * Sync sesudahnya TIDAK menolong — berkasnya sudah masuk lewat rute
     * unggah, jadi sync melihatnya `unchanged` dan melewati rantainya.
     *
     * Menghilangkannya di sini akan melahirkan ulang bug yang sama persis,
     * kali ini khusus untuk dokumen yang diunggah dari Maira — bentuk cacat
     * yang paling sulit dilacak, karena jalur dashboard-nya tampak sehat.
     */
    if (masuk.length) {
      const botIds = await knowledgeBaseService.assignedChatbots(caller.tenantId, knowledgeBaseId);
      for (const botId of botIds) memoryAgent.enqueueRun(caller.tenantId, botId);
    }
    // Vercel membekukan lambda begitu respons terkirim; tanpa ini agen memory
    // yang barusan diantrikan mati di tengah jalan.
    after(jobsSettled);

    return NextResponse.json({
      ok: true,
      sourceId: source.id,
      ingested: masuk,
      storedOnly: tersimpanSaja,
      skipped: dilewati,
      chunks: masuk.reduce((n, x) => n + x.chunks, 0),
    }, { status: 201 });
  });
