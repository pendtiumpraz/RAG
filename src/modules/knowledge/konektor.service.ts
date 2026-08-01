import { db, platformSettings } from '@/modules/core/db';
import { eq } from 'drizzle-orm';
import { bersihkanPengaturan, daftarKonektor, konektorBoleh } from './konektor';

/**
 * SAKLAR KONEKTOR — pembacaan & penegakannya.
 *
 * Aturannya murni di `konektor.ts`; berkas ini yang menyimpannya.
 *
 * Di-cache singkat karena dibaca pada tiap penambahan sumber DAN pada tiap
 * pemuatan halaman Knowledge, sementara isinya berubah beberapa kali setahun.
 */
const UMUR_CACHE_MS = 30_000;
let cache: { pada: number; nilai: Record<string, boolean> | null } | null = null;

export const konektorService = {
  async pengaturan(): Promise<Record<string, boolean> | null> {
    if (cache && Date.now() - cache.pada < UMUR_CACHE_MS) return cache.nilai;
    const rows = await db.select({ v: platformSettings.connectorsEnabled })
      .from(platformSettings).limit(1);
    const nilai = rows[0]?.v ?? null;
    cache = { pada: Date.now(), nilai };
    return nilai;
  },

  async daftar() {
    return daftarKonektor(await this.pengaturan());
  },

  /** Penjaga tunggal untuk jalur tulis — dipanggil sebelum sumber dibuat. */
  async boleh(jenis: string): Promise<boolean> {
    return konektorBoleh(jenis, await this.pengaturan());
  },

  async simpan(masuk: Record<string, unknown>): Promise<Record<string, boolean>> {
    const bersih = bersihkanPengaturan(masuk);
    await db.update(platformSettings)
      .set({ connectorsEnabled: bersih, updatedAt: new Date() })
      .where(eq(platformSettings.id, 1));
    /* Cache dilupakan seketika: saklar yang sudah dimatikan tapi masih
       meloloskan sumber selama setengah menit adalah persis keadaan yang
       membuat orang mengira saklarnya tak bekerja. */
    cache = null;
    return bersih;
  },

  lupakanCache() { cache = null; },
};
