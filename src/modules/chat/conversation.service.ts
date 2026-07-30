import { withTenant } from '@/modules/core/db/tenant-context';
import { toPage, type Paging, type Page } from '@/modules/core/pagination';
import { conversationRepository as repo, type ConvoFilter } from './conversation.repository';

/** Baca riwayat percakapan (list + transcript) — terkurung tenant (RLS). */
export const conversationService = {
  /** Berhalaman: daftar percakapan tumbuh terus, jadi tak boleh ditarik utuh. */
  async list(tenantId: string, chatbotId: string | null, p: Paging, f: ConvoFilter = {}): Promise<Page<unknown>> {
    return withTenant(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        repo.list(tx, tenantId, chatbotId, p.limit, p.offset, f),
        repo.countAll(tx, tenantId, chatbotId, f),
      ]);
      return toPage(rows, total, p);
    });
  },
  messages(tenantId: string, conversationId: string) {
    return withTenant(tenantId, (tx) => repo.history(tx, tenantId, conversationId));
  },

  /**
   * Ekspor transkrip yang cocok filter sebagai CSV.
   *
   * CSV, bukan JSON: yang meminta ekspor umumnya membawanya ke spreadsheet
   * untuk ditandai dan dibahas bersama tim, bukan ke program lain — untuk yang
   * terakhir sudah ada /api/v1.
   *
   * Satu BARIS PER PESAN, bukan per percakapan. Transkrip yang dipadatkan ke
   * satu sel akan langsung dipecah lagi oleh siapa pun yang membacanya, dan
   * sel raksasa memang menyiksa di spreadsheet mana pun.
   */
  async exportCsv(tenantId: string, chatbotId: string | null, f: ConvoFilter): Promise<string> {
    const convos = await withTenant(tenantId, (tx) => repo.forExport(tx, tenantId, chatbotId, f));
    const head = ['percakapan_id', 'chatbot', 'pengunjung', 'dimulai', 'urutan', 'peran', 'waktu', 'isi'];
    const lines = [head.join(',')];
    for (const c of convos) {
      c.messages.forEach((m, i) => {
        lines.push([
          c.id,
          c.chatbotName,
          c.visitorId ?? '',
          c.startedAt.toISOString(),
          String(i + 1),
          m.role,
          m.createdAt.toISOString(),
          m.content ?? '',
        ].map(csvCell).join(','));
      });
    }
    return lines.join('\r\n');
  },
};

/**
 * Satu sel CSV.
 *
 * Selain mengutip koma/kutip/baris baru, sel yang DIAWALI `=`, `+`, `-`, atau
 * `@` diberi awalan kutip tunggal. Tanpa itu, isi percakapan yang kebetulan
 * dimulai dengan tanda tersebut akan dieksekusi sebagai RUMUS saat berkasnya
 * dibuka di Excel atau Sheets. Isi percakapan datang dari pengunjung anonim,
 * jadi ia wajib diperlakukan sebagai masukan yang tak dipercaya — CSV
 * injection adalah jalur nyata untuk membocorkan data lewat berkas yang
 * tampak tak berbahaya.
 */
export function csvCell(v: string): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}
