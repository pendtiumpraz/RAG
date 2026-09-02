import { and, eq, isNull, sql } from 'drizzle-orm';
import { uploadedFiles, type Db } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';

/**
 * PENCATAT + PENGUKUR BERKAS ORISINAL UNGGAHAN MANUAL.
 *
 * Tabel `uploaded_files` (migrasi 0052) menyimpan jejak setiap berkas yang
 * disimpan ke blob/BYOB lewat jalur unggahan manual. Service ini menulis baris
 * baru saat berkas tersimpan, dan menjumlahkan ukurannya per tenant untuk
 * menegakkan kuota paket `storageBytes`.
 *
 * Penting: tabel ini MURNI untuk jalur UNGGAHAN MANUAL. Drive/SharePoint
 * (dan konektor lain) TIDAK pernah menulis ke sini — mereka sync langsung
 * dan tak memakai blob, jadi tak dihitung terhadap kuota ini.
 */
export const uploadedFileService = {
  /**
   * Catat satu berkas yang sudah berhasil disimpan ke storage. Idempoten per
   * (sourceId, filename): unggahan ulang nama yang sama MENGGANTI baris lama
   * (soft-delete) alih-alih menumpuk — konsisten dengan perilaku ingest yang
   * mengganti isi dokumen senama, dan menjauhkan penghitungan kuota dari
   * duplikat tak terlihat.
   */
  async simpan(tx: Db, input: {
    tenantId: string; userId: string; knowledgeBaseId: string; sourceId: string;
    filename: string; sizeBytes: number;
    provider: string; storageConnectionId: string | null;
    path: string; url?: string | null; mime?: string | null;
  }): Promise<void> {
    // Baris lama (nama sama di sumber yang sama) di-soft-delete dulu.
    await tx.update(uploadedFiles)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(uploadedFiles.tenantId, input.tenantId),
        eq(uploadedFiles.sourceId, input.sourceId),
        eq(uploadedFiles.filename, input.filename),
        isNull(uploadedFiles.deletedAt),
      ));

    await tx.insert(uploadedFiles).values({
      tenantId: input.tenantId,
      userId: input.userId,
      knowledgeBaseId: input.knowledgeBaseId,
      sourceId: input.sourceId,
      filename: input.filename,
      sizeBytes: input.sizeBytes,
      provider: input.provider,
      storageConnectionId: input.storageConnectionId,
      path: input.path,
      url: input.url ?? null,
      mime: input.mime ?? null,
    });
  },

  /**
   * Total BYTE berkas orisinal yang tersimpan (blob/BYOB) untuk tenant ini.
   * Dipakai menegakkan kuota `storageBytes` sebelum menyimpan berkas baru.
   */
  async usageBytes(tenantId: string): Promise<number> {
    return withTenant(tenantId, async (tx) => {
      const r = await tx.execute(sql`
        select coalesce(sum(size_bytes), 0)::bigint as total
          from uploaded_files
         where tenant_id = ${tenantId}::uuid and deleted_at is null`);
      return Number((r as unknown as Array<{ total: number }>)[0]?.total ?? 0);
    });
  },

  /**
   * DAFTAR berkas orisinal milik tenant — berhalaman.
   *
   * ── KENAPA INI BARU ADA SEKARANG ────────────────────────────────────────
   *
   * Tabel `uploaded_files` sudah menyimpan setiap berkas sejak migrasi 0052,
   * tapi service ini hanya bisa MENULIS dan MENJUMLAHKAN byte-nya. Tak ada satu
   * pun cara membaca daftarnya. Akibatnya nyata: berkas asli tersimpan rapi di
   * blob, tapi tak ada permukaan mana pun yang bisa memberitahu pemiliknya
   * berkas apa saja yang ia punya, apalagi mengunduhnya kembali. Data yang
   * tersimpan tapi tak bisa dilihat sama saja dengan hilang.
   */
  async daftar(
    tenantId: string,
    opsi: { knowledgeBaseId?: string | null; limit: number; offset: number },
  ): Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
    return withTenant(tenantId, async (tx) => {
      const kb = opsi.knowledgeBaseId;
      // Penyaring tenant eksplisit di samping RLS — pola yang sama dengan rute
      // v1 lain; RLS pernah lumpuh total di produksi dan baris inilah penahannya.
      const saring = sql`
        tenant_id = ${tenantId}::uuid and deleted_at is null
        ${kb ? sql`and knowledge_base_id = ${kb}::uuid` : sql``}`;
      const rows = await tx.execute(sql`
        select id, filename, size_bytes, provider, storage_connection_id,
               path, url, mime, knowledge_base_id, source_id, created_at
          from uploaded_files
         where ${saring}
         order by created_at desc
         limit ${opsi.limit} offset ${opsi.offset}`);
      const c = await tx.execute(sql`
        select count(*)::int as n from uploaded_files where ${saring}`);
      return {
        rows: rows as unknown as Array<Record<string, unknown>>,
        total: Number((c as unknown as Array<{ n: number }>)[0]?.n ?? 0),
      };
    });
  },

  /**
   * Satu baris berkas milik tenant ini — untuk mengunduh ulang isinya.
   *
   * Mengembalikan null (bukan melempar) bila bukan milik tenant tersebut,
   * supaya pemanggil menjawab 404: membedakan "tak ada" dari "bukan milikmu"
   * justru memberi tahu penebak bahwa id itu nyata.
   */
  async satu(tenantId: string, id: string): Promise<Record<string, unknown> | null> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        select id, filename, size_bytes, provider, storage_connection_id,
               path, url, mime, knowledge_base_id, created_at
          from uploaded_files
         where id = ${id}::uuid and tenant_id = ${tenantId}::uuid and deleted_at is null
         limit 1`);
      return (rows as unknown as Array<Record<string, unknown>>)[0] ?? null;
    });
  },

  /**
   * Soft-delete jejak berkas-orisinal untuk parameter sumber & filename.
   *
   * Dipanggil jalur unggahan ketika dokumen senama diganti (baris lama tak
   * lagi menunjuk berkas yang benar) — ukurannya ikut hilang dari pemakaian.
   */
  async hapus(tx: Db, tenantId: string, sourceId: string, filename: string): Promise<void> {
    await tx.update(uploadedFiles)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(uploadedFiles.tenantId, tenantId),
        eq(uploadedFiles.sourceId, sourceId),
        eq(uploadedFiles.filename, filename),
        isNull(uploadedFiles.deletedAt),
      ));
  },
};
