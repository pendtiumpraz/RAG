import { and, eq, isNull } from 'drizzle-orm';
import { memoryNotes, memoryEdges } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { dispatch } from '@/modules/core/events';

/**
 * MEMORY MODULE — Obsidian Memory Agent (fondasi).
 *
 * Catatan markdown ber-[[wikilink]] per (tenant, chatbot) + graph edges.
 * Agent penuh (crawl storage → entity mapping via LLM → tulis vault balik
 * ke Drive) menyusul di fase workers; service ini menyediakan primitives.
 */

const WIKILINK = /\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g;

export function extractWikilinks(md: string): string[] {
  const out = new Set<string>();
  for (const m of md.matchAll(WIKILINK)) out.add(slugify(m[1]));
  return [...out];
}

export function slugify(s: string): string {
  return s.trim().toLowerCase()
    .replace(/[^a-z0-9À-ɏ]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const memoryService = {
  /** Upsert satu note; sinkronkan cache linksTo + edges wikilink. */
  async upsertNote(tenantId: string, input: {
    chatbotId: string; slug: string; title: string;
    contentMd: string; sourceDocumentId?: string; embedding?: number[];
    /** Kategori (migrasi 0031). Note MOC/topik tak punya dokumen asal → 'lain'. */
    category?: string;
    /** 'active' | 'pending' | 'rejected' (migrasi 0032). */
    status?: string;
    /** Identitas dokumen logis — sama dengan documents.doc_ref. */
    docRef?: string;
  }) {
    const linksTo = extractWikilinks(input.contentMd);

    return withTenant(tenantId, async (tx) => {
      const existing = await tx.select({ id: memoryNotes.id }).from(memoryNotes)
        .where(and(
          eq(memoryNotes.tenantId, tenantId),
          eq(memoryNotes.chatbotId, input.chatbotId),
          eq(memoryNotes.slug, input.slug),
          isNull(memoryNotes.deletedAt),
        )).limit(1);

      let noteId: string;
      if (existing[0]) {
        noteId = existing[0].id;
        await tx.update(memoryNotes).set({
          title: input.title, contentMd: input.contentMd, linksTo,
          sourceDocumentId: input.sourceDocumentId, embedding: input.embedding,
          ...(input.category ? { category: input.category } : {}),
          ...(input.docRef ? { docRef: input.docRef } : {}),
          // `status` SENGAJA tak ikut di-update: keputusan manusia (setujui/
          // tolak) tak boleh dibatalkan hanya karena agen berjalan lagi.
          updatedAt: new Date(),
        }).where(eq(memoryNotes.id, noteId));
        // rebuild wikilink edges dari note ini
        await tx.update(memoryEdges).set({ deletedAt: new Date() })
          .where(and(eq(memoryEdges.fromNoteId, noteId), eq(memoryEdges.kind, 'wikilink')));
      } else {
        const created = await tx.insert(memoryNotes).values({
          tenantId, chatbotId: input.chatbotId, slug: input.slug, title: input.title,
          contentMd: input.contentMd, linksTo,
          category: input.category ?? 'lain',
          status: input.status ?? 'active',
          docRef: input.docRef,
          sourceDocumentId: input.sourceDocumentId, embedding: input.embedding,
        }).returning({ id: memoryNotes.id });
        noteId = created[0].id;
      }

      // resolve [[slug]] → edge (yang targetnya sudah ada; sisanya dangling, sah di Obsidian)
      for (const target of linksTo) {
        const t = await tx.select({ id: memoryNotes.id }).from(memoryNotes)
          .where(and(
            eq(memoryNotes.tenantId, tenantId),
            eq(memoryNotes.chatbotId, input.chatbotId),
            eq(memoryNotes.slug, target),
            isNull(memoryNotes.deletedAt),
          )).limit(1);
        if (t[0]) {
          await tx.insert(memoryEdges).values({
            tenantId, chatbotId: input.chatbotId,
            fromNoteId: noteId, toNoteId: t[0].id, kind: 'wikilink', weight: 1,
          });
        }
      }

      await dispatch('memory.note.upserted', { tenantId, chatbotId: input.chatbotId, noteId, slug: input.slug });
      return noteId;
    });
  },

  /** Graph untuk halaman Memory (nodes + edges aktif). */
  graph(tenantId: string, chatbotId: string) {
    return withTenant(tenantId, async (tx) => {
      const nodes = await tx.select({
        id: memoryNotes.id, slug: memoryNotes.slug, title: memoryNotes.title, linksTo: memoryNotes.linksTo,
        category: memoryNotes.category,
      }).from(memoryNotes)
        .where(and(
          eq(memoryNotes.tenantId, tenantId),
          eq(memoryNotes.chatbotId, chatbotId),
          // Hanya catatan AKTIF yang jadi graf. Yang menunggu tinjauan atau
          // ditolak tak boleh muncul — graf adalah pengetahuan yang DIAKUI,
          // bukan antrean kerja. Antreannya punya panel sendiri.
          eq(memoryNotes.status, 'active'),
          isNull(memoryNotes.deletedAt),
        ));
      const edges = await tx.select({
        from: memoryEdges.fromNoteId, to: memoryEdges.toNoteId,
        kind: memoryEdges.kind, weight: memoryEdges.weight,
      }).from(memoryEdges)
        .where(and(
          eq(memoryEdges.tenantId, tenantId),
          eq(memoryEdges.chatbotId, chatbotId),
          isNull(memoryEdges.deletedAt),
        ));
      return { nodes, edges };
    });
  },

  /** Serialisasi vault `_nalar-memory/` — file .md siap disync ke Drive user. */
  exportVault(tenantId: string, chatbotId: string) {
    return withTenant(tenantId, async (tx) => {
      const notes = await tx.select().from(memoryNotes)
        .where(and(
          eq(memoryNotes.tenantId, tenantId),
          eq(memoryNotes.chatbotId, chatbotId),
          // Vault yang ditulis balik ke Drive pelanggan HANYA berisi catatan
          // yang diakui — ringkasan yang belum ditinjau tak boleh mendarat di
          // Drive mereka sebagai kalau-kalau sudah sah.
          eq(memoryNotes.status, 'active'),
          isNull(memoryNotes.deletedAt),
        ));
      return notes.map((n) => ({ path: `_nalar-memory/${n.slug}.md`, content: n.contentMd }));
    });
  },

  /**
   * Write-back vault ke Google Drive user (folder `_nalar-memory` di root).
   * Butuh scope drive.file (diberikan saat login Google). File di-upsert
   * by-name — vault di Drive selalu cermin kondisi terkini, bisa dibuka
   * langsung sebagai vault Obsidian via aplikasi Drive desktop.
   */
  async syncVaultToDrive(tenantId: string, userId: string, chatbotId: string): Promise<{ uploaded: number }> {
    const { connectionService } = await import('@/modules/connections/connection.service');
    const { ensureUserDriveFolder, upsertUserDriveTextFile } = await import('@/modules/knowledge/storage/gdrive');
    const { audit } = await import('@/modules/core/guardrails');

    const token = await connectionService.getAccessToken(tenantId, userId, 'google');
    if (!token) throw new Error('Google Drive belum terhubung (login Google dgn izin Drive)');

    const files = await this.exportVault(tenantId, chatbotId);
    const folderId = await ensureUserDriveFolder(token, '_nalar-memory');
    let uploaded = 0;
    for (const f of files) {
      const name = f.path.split('/').pop()!;
      await upsertUserDriveTextFile(token, folderId, name, f.content);
      uploaded++;
    }
    await audit(tenantId, userId, 'memory.vault.sync', chatbotId, { uploaded });
    return { uploaded };
  },
};
