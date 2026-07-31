import { sql } from 'drizzle-orm';
import { withTenant } from '@/modules/core/db/tenant-context';
import { audit } from '@/modules/core/guardrails';
import { memoryService } from './memory.service';
import {
  type BarisPertanyaan, MIN_PERCAKAPAN, kelompokkan, susunCatatan,
} from './percakapan';

/**
 * TAHAP L1b — belajar dari PERCAKAPAN, bukan hanya dari dokumen.
 *
 * Agen Memory selama ini hanya membaca `documents`. Pertanyaan yang benar-
 * benar diajukan orang — sinyal paling langsung tentang apa yang ingin
 * mereka ketahui — tak pernah dilihat sama sekali.
 *
 * Tahap ini menumpang pada `memory.run` yang sudah ada dan TIDAK menambah
 * satu pun panggilan LLM: mengenali pertanyaan berulang cukup dengan
 * menghitung. Biayanya satu kueri agregasi per run.
 */

/** Jendela percakapan yang dibaca. Lebih lebar hanya menambah kebisingan lama. */
const HARI = 90;

/** Batas catatan per run — antrean tinjauan yang panjang tak akan ditinjau. */
const MAKS_CATATAN = 15;

export const percakapanMemory = {
  /**
   * Baca pertanyaan pengguna beserta apakah jawabannya bersitasi.
   *
   * Sitasi dipakai sebagai penanda "terjawab dari dokumen" karena itulah
   * definisi yang dipakai seluruh sistem ini: jawaban tanpa sitasi berarti
   * korpus tak memuat jawabannya (lihat analytics.service).
   */
  async baca(tenantId: string, chatbotId: string): Promise<BarisPertanyaan[]> {
    const sejak = new Date(Date.now() - HARI * 86_400_000).toISOString();
    return withTenant(tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        select u.conversation_id,
               u.content,
               /* Jawaban = pesan assistant PERTAMA setelah pertanyaannya di
                  percakapan yang sama. Memakai "ada sitasi di percakapan ini"
                  akan menandai pertanyaan yang tak terjawab sebagai terjawab
                  hanya karena pertanyaan LAIN di sesi yang sama berhasil. */
               coalesce(jsonb_array_length(a.citations) > 0, false) as terjawab,
               coalesce(a.citations, '[]'::jsonb) as citations
        from messages u
        join conversations c on c.id = u.conversation_id
        left join lateral (
          select m.citations
          from messages m
          where m.conversation_id = u.conversation_id
            and m.role = 'assistant'
            and m.created_at > u.created_at
            and m.deleted_at is null
          order by m.created_at asc
          limit 1
        ) a on true
        where c.chatbot_id = ${chatbotId}
          and u.role = 'user'
          and u.deleted_at is null
          and c.deleted_at is null
          and u.created_at >= ${sejak}
      `);
      return (rows as unknown as Array<{
        conversation_id: string; content: string; terjawab: boolean;
        citations: Array<{ title?: string | null }>;
      }>).map((r) => ({
        conversationId: r.conversation_id,
        content: r.content,
        terjawab: Boolean(r.terjawab),
        sumber: (r.citations ?? []).map((c) => c.title).filter((t): t is string => Boolean(t)),
      }));
    });
  },

  /**
   * Jalankan tahapnya: kelompokkan, tulis catatan, kembalikan jumlahnya.
   *
   * SELURUH catatan ditulis `pending`, tanpa kecuali dan tanpa memandang
   * pengaturan tinjauan tenant. Alasannya bukan kehati-hatian umum melainkan
   * satu jalur yang nyata: catatan berstatus `active` IKUT TERAMBIL saat
   * chatbot menjawab (kaki Memory di retrieval.service), sementara isi
   * catatan ini berasal dari teks yang diketik pengunjung publik. Menulisnya
   * `active` berarti pertanyaan satu pengunjung bisa muncul di jawaban untuk
   * pengunjung lain.
   */
  async jalankan(tenantId: string, chatbotId: string): Promise<{ dibaca: number; catatan: number }> {
    const baris = await this.baca(tenantId, chatbotId);
    const kelompok = kelompokkan(baris, MIN_PERCAKAPAN).slice(0, MAKS_CATATAN);

    for (const k of kelompok) {
      const c = susunCatatan(k);
      await memoryService.upsertNote(tenantId, {
        chatbotId,
        slug: c.slug,
        title: c.title,
        contentMd: c.contentMd,
        category: 'pertanyaan-berulang',
        status: 'pending',
      });
    }

    if (kelompok.length) {
      await audit(tenantId, 'system', 'memory.percakapan', chatbotId, {
        dibaca: baris.length, kelompok: kelompok.length,
        kesenjangan: kelompok.filter((k) => k.terjawab / k.percakapan < 0.5).length,
      });
    }
    return { dibaca: baris.length, catatan: kelompok.length };
  },
};
