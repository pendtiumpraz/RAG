import { sql } from 'drizzle-orm';
import { tenantSettings } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { resolveLlmModel } from '@/modules/chat/llm-catalog';
import { apiKeyResolver } from '@/modules/settings/credentials.repository';
import { completeChat } from '@/modules/chat/llm';
import { audit } from '@/modules/core/guardrails';
import { eq } from 'drizzle-orm';
import { FALLBACK_SLUG, categorySlug, namaTerlaluSamar } from './categories';
import { categoryService } from './category.service';
import { platformSettingsService } from '@/modules/payments/platform-settings.service';

/**
 * KATEGORISASI ULANG DARI RINGKASAN — membereskan dokumen yang tersangkut di
 * penampung, tanpa membaca ulang dokumennya.
 *
 * MASALAH YANG DISELESAIKAN. Kategori hanya ditetapkan sekali, saat agen
 * Memory meringkas dokumen. Kalau penilaian itu gagal — JSON model cacat,
 * usulan kategori ditolak, kategorinya belakangan dihapus pengguna — catatan
 * itu jatuh ke "Belum dikategorikan" dan TIDAK PERNAH keluar lagi. Satu-
 * satunya jalan keluar sebelumnya adalah menjalankan ulang seluruh agen
 * Memory: membaca ulang setiap dokumen, meringkas ulang semuanya, membangun
 * ulang grafnya. Untuk membetulkan kategori saja, itu ongkos yang tak masuk
 * akal — dan karena mahal, tak pernah dilakukan, sehingga penampungnya
 * menumpuk selamanya.
 *
 * KENAPA DARI RINGKASAN, DAN APA HARGANYA. Agen sengaja menilai kategori dari
 * ISI DOKUMEN, bukan dari ringkasannya — ringkasan sudah kehilangan detail,
 * jadi menilai lewatnya berarti menilai lewat tafsiran. Itu tetap benar, dan
 * jalur ini memang LEBIH LEMAH. Yang membuatnya tetap pilihan yang betul di
 * sini: yang mau dibereskan adalah dokumen yang kategorinya sekarang
 * "belum" — bukan salah, melainkan TIDAK ADA. Ringkasan satu paragraf hampir
 * selalu cukup menjawab "ini dokumen jenis apa", dan biayanya sepersekian
 * dari membaca ulang berkasnya. Tukar-tambah itu ditulis di UI juga, bukan
 * cuma di sini.
 *
 * YANG TIDAK PERNAH DISENTUH. Hanya catatan yang kategorinya `belum` yang
 * dinilai ulang. Kategori yang sudah punya nilai — apa pun asalnya, agen
 * maupun pengguna — dibiarkan. Tombol yang diam-diam memindahkan dokumen yang
 * sudah sengaja diarsipkan seseorang adalah tombol yang membuat orang berhenti
 * mempercayai seluruh fiturnya.
 */

/**
 * Berapa ringkasan dikirim dalam SATU panggilan model.
 *
 * DITURUNKAN 20 → 8 setelah kegagalan nyata di produksi: dengan 20 ringkasan,
 * model bernalar (deepseek-v4-flash) menghabiskan seluruh anggaran token untuk
 * penalaran internal dan mengembalikan ISI KOSONG. Dengan 3 ringkasan model
 * yang sama menjawab benar. Batch kecil juga gagal lebih anggun: yang hilang
 * satu kelompok, bukan seluruh jalannya.
 */
const PER_BATCH = 8;

/**
 * Anggaran token KELUARAN untuk satu batch.
 *
 * Dikirim lewat argumen `sampling`, BUKAN argumen keempat completeChat —
 * argumen keempat itu `maxChars` (pemotong panjang string di sisi kita), dan
 * memakainya sebagai batas token adalah persis kekeliruan yang membuat
 * anggaran sesungguhnya diam-diam jatuh ke bawaan 2.048. Model bernalar
 * memakai sebagian besar anggaran untuk berpikir, jadi angkanya harus jauh di
 * atas panjang jawaban yang terlihat.
 */
const MAX_TOKEN_BATCH = 6_000;
/** Potongan ringkasan yang dikirim — cukup untuk menilai jenis dokumen. */
const MAX_RINGKASAN_CHARS = 700;
/** Batas satu kali jalan; sisanya dilaporkan sebagai `pending`. */
const MAX_PER_RUN = 200;

export interface RecategorizeResult {
  /** Catatan yang benar-benar berpindah kategori. */
  diperbarui: number;
  /** Dinilai tapi model tetap tak bisa memutuskan — tetap di penampung. */
  tetapBelum: number;
  /** Punya kategori 'belum' TAPI ringkasannya kosong — tak bisa dinilai. */
  tanpaRingkasan: number;
  /**
   * Model TIDAK MENJAWAB dengan bentuk yang bisa dibaca (kosong, atau JSON
   * cacat). Dipisahkan dari `tetapBelum` karena artinya berlawanan:
   * `tetapBelum` berarti model sudah menilai dan tak bisa memutuskan;
   * yang ini berarti penilaiannya TAK PERNAH TERJADI. Sebelum dipisah,
   * kegagalan model terbaca persis seperti dokumen yang memang sulit — dan
   * tombolnya melapor "33 tetap belum" berkali-kali tanpa seorang pun tahu
   * bahwa modelnya sendiri yang diam.
   */
  gagalDinilai: number;
  /** Belum tersentuh karena batas satu kali jalan. */
  tersisa: number;
  /** Kategori baru yang DIUSULKAN model (masih menunggu persetujuan). */
  usulanBaru: string[];
  /** Rincian per kategori tujuan — supaya hasilnya bisa diperiksa, bukan dipercaya. */
  perKategori: Array<{ slug: string; jumlah: number }>;
}

interface Baris { id: string; title: string | null; content_md: string | null }

/**
 * Berapa kali `dariRingkasan` boleh diulang dalam satu permintaan.
 *
 * Ada batasnya, dan batas itu bukan kepengecutan: tanpa atap, satu tombol
 * bisa memanggil model ratusan kali dalam satu permintaan HTTP yang lambat
 * laun kehabisan waktu — dan pekerjaan yang sudah selesai tetap tersimpan
 * sementara pemanggilnya tak pernah tahu sampai mana. 10 × 200 = 2.000
 * catatan per tekan, cukup untuk hampir semua korpus SaaS sekali jalan.
 */
const MAX_PUTARAN = 10;

export const recategorizeService = {
  /**
   * Berapa yang bisa dibereskan — dipakai UI untuk memutuskan apakah
   * tombolnya perlu ditampilkan sama sekali, dan untuk menyebut angkanya
   * SEBELUM pengguna menekan sesuatu yang memakai kuota model.
   */
  async hitungKandidat(tenantId: string, knowledgeBaseId?: string) {
    const kbFilter = knowledgeBaseId
      ? sql`and exists (
              select 1 from documents d
              where d.doc_ref = n.doc_ref and d.deleted_at is null
                and d.knowledge_base_id = ${knowledgeBaseId}::uuid)`
      : sql``;
    const rows = await withTenant(tenantId, (tx) => tx.execute(sql`
      select
        count(*) filter (where coalesce(nullif(trim(n.content_md), ''), null) is not null)::int as "siap",
        count(*) filter (where coalesce(nullif(trim(n.content_md), ''), null) is null)::int     as "tanpaRingkasan"
      from memory_notes n
      where n.category = ${FALLBACK_SLUG}
        and n.status <> 'rejected'
        and n.deleted_at is null
        ${kbFilter}
    `)) as unknown as Array<{ siap: number; tanpaRingkasan: number }>;
    return rows[0] ?? { siap: 0, tanpaRingkasan: 0 };
  },

  /**
   * Nilai ulang kategori dari ringkasan yang SUDAH ADA.
   *
   * Tak ada dokumen yang diunduh, tak ada teks yang di-embed ulang, tak ada
   * graf yang dibangun ulang. Yang berjalan hanya panggilan model atas
   * ringkasan — dan itu pun DIBUNDEL: dua puluh ringkasan sekali kirim.
   * Satu panggilan per dokumen akan membuat fitur ini semahal menjalankan
   * ulang agennya, yang justru sedang dihindari.
   */
  async dariRingkasan(
    tenantId: string,
    opts: { knowledgeBaseId?: string } = {},
  ): Promise<RecategorizeResult> {
    const kategoriAktif = await categoryService.activeSlugs(tenantId);
    const daftar = kategoriAktif
      .filter((k) => k.slug !== FALLBACK_SLUG)
      .map((k) => `${k.slug} (${k.label})`).join(', ');

    const kbFilter = opts.knowledgeBaseId
      ? sql`and exists (
              select 1 from documents d
              where d.doc_ref = n.doc_ref and d.deleted_at is null
                and d.knowledge_base_id = ${opts.knowledgeBaseId}::uuid)`
      : sql``;

    /* Ringkasan kosong DIPISAHKAN, tidak sekadar tak terpilih: ia keadaan
       yang berbeda dan pengguna berhak tahu bedanya. "12 dokumen tak bisa
       dinilai karena belum diringkas" mengarahkan orang menjalankan agen
       Memory; "12 dokumen gagal" tidak mengarahkan ke mana pun. */
    const semua = await withTenant(tenantId, (tx) => tx.execute(sql`
      select n.id::text as id, n.title, n.content_md
      from memory_notes n
      where n.category = ${FALLBACK_SLUG}
        and n.status <> 'rejected'
        and n.deleted_at is null
        ${kbFilter}
      order by n.created_at asc
      limit ${MAX_PER_RUN + 1}
    `)) as unknown as Baris[];

    const tersisa = Math.max(0, semua.length - MAX_PER_RUN);
    const batasan = semua.slice(0, MAX_PER_RUN);
    const siap = batasan.filter((r) => (r.content_md ?? '').trim().length > 0);
    const tanpaRingkasan = batasan.length - siap.length;

    const kosong: RecategorizeResult = {
      diperbarui: 0, tetapBelum: 0, gagalDinilai: 0, tanpaRingkasan, tersisa,
      usulanBaru: [], perKategori: [],
    };
    if (!siap.length) return kosong;
    if (!kategoriAktif.some((k) => k.slug !== FALLBACK_SLUG)) {
      // Tanpa satu pun kategori tujuan, memanggil model hanya membakar kuota
      // untuk jawaban yang pasti tak bisa dipakai.
      return kosong;
    }

    const settings = await withTenant(tenantId, async (tx) =>
      (await tx.select().from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId)).limit(1))[0]);
    const llmModel = settings?.activeLlmModel ?? await platformSettingsService.modelCadangan();
    /* Katalog, bukan registry statis — lihat alasan yang sama di
       memory-agent.service.ts: model dari server LLM sendiri (`vps:…`)
       memakai token server, bukan kunci provider milik tenant. */
    const provider = (await resolveLlmModel(llmModel))?.provider;
    const apiKey = provider && provider !== 'selfhosted' ? await apiKeyResolver(tenantId)(provider) : null;
    if (!apiKey && provider !== 'selfhosted') {
      throw new Error(`Kategorisasi butuh API key provider ${provider}`);
    }

    const hasil = new Map<string, string>();   // noteId → slug
    const usulanBaru = new Set<string>();
    let gagalDinilai = 0;   // dokumen di batch yang jawabannya tak terbaca

    for (let i = 0; i < siap.length; i += PER_BATCH) {
      const batch = siap.slice(i, i + PER_BATCH);
      const daftarDok = batch.map((r, n) =>
        `[${n + 1}] ${r.title ?? '(tanpa judul)'}\n${(r.content_md ?? '').trim().slice(0, MAX_RINGKASAN_CHARS)}`,
      ).join('\n\n');

      const jawaban = await completeChat(llmModel, [
        { role: 'system', content:
          'Kamu mengelompokkan dokumen perusahaan berdasarkan RINGKASANNYA. ' +
          'Balas HANYA JSON valid berbentuk {"hasil":[{"n":1,"category":"slug"}, ...]}. ' +
          `n = nomor dokumen persis seperti diberikan. category = WAJIB salah satu slug berikut — ${daftar}. ` +
          'Pilih yang PALING mendekati; hampir setiap dokumen perusahaan masuk salah satunya. ' +
          'Hanya bila sebuah dokumen sungguh-sungguh tak berhubungan dengan satu pun, ' +
          'tulis nama kategori BARU yang singkat dan umum (2-3 kata). ' +
          // Instruksi yang sama dengan agen. Model tetap sesekali menjawab
          // "umum"; yang menahannya bukan kalimat ini melainkan namaTerlaluSamar()
          // di categoryService.propose — kalimat ini hanya mengurangi frekuensinya.
          'JANGAN menulis "lain", "lainnya", "umum", atau "tidak diketahui" — ' +
          'itu bukan kategori. Bila ragu antara dua, pilih yang lebih spesifik. ' +
          'Sertakan SEMUA nomor yang diberikan, satu entri masing-masing.' },
        { role: 'user', content: daftarDok },
      /* null hanya mungkin utk 'selfhosted' — kredensial diambil dari server. */
      ], apiKey ?? '', { maxChars: 8_000, maxTokens: MAX_TOKEN_BATCH });

      try {
        const parsed = JSON.parse(
          jawaban.slice(jawaban.indexOf('{'), jawaban.lastIndexOf('}') + 1),
        ) as { hasil?: Array<{ n?: unknown; category?: unknown }> };

        for (const item of parsed.hasil ?? []) {
          const idx = Number(item.n) - 1;
          const baris = batch[idx];
          if (!baris) continue;                       // nomor di luar batch
          const usul = String(item.category ?? '').trim();
          if (!usul) continue;

          const cocok = kategoriAktif.find(
            (k) => k.slug === categorySlug(usul) || k.label.toLowerCase() === usul.toLowerCase(),
          );
          if (cocok && cocok.slug !== FALLBACK_SLUG) { hasil.set(baris.id, cocok.slug); continue; }

          /* Kategori tak dikenal DICATAT sebagai usulan, dan dokumennya
             TETAP di penampung sampai usulannya disetujui. Memakainya
             langsung berarti dokumen menunjuk kategori yang mungkin ditolak
             besok — dan menolaknya lalu berarti mereka jadi yatim. Perilaku
             ini sama persis dengan agen Memory; dua jalur yang menulis
             kategori tak boleh punya aturan berbeda. */
          await categoryService.propose(tenantId, usul);
          /* propose() SELALU mengembalikan penampung untuk kategori yang baru
             diusulkan — itulah maksudnya. Jadi nilai kembaliannya tak bisa
             dipakai membedakan "diusulkan" dari "ditolak karena samar";
             yang membedakan adalah namanya sendiri. Tanpa pemisahan ini, UI
             akan melaporkan "0 usulan baru" padahal ada belasan menunggu
             persetujuan, dan tak seorang pun akan membukanya. */
          if (!namaTerlaluSamar(usul)) usulanBaru.add(usul);
        }
      } catch {
        /* Satu batch dengan jawaban tak terbaca TIDAK menggagalkan sisanya —
           dokumen di dalamnya tetap di penampung, keadaan yang sama seperti
           sebelum tombol ditekan, jadi menekannya lagi aman.

           Tapi ia DIHITUNG. Sebelumnya batch semacam ini hanya `continue`,
           dan hasilnya masuk ke `tetapBelum` — tak bisa dibedakan dari
           dokumen yang memang sulit. Itulah yang membuat kegagalan nyata di
           produksi (model bernalar kehabisan anggaran token dan membalas
           kosong) terlihat seperti "modelnya sudah menilai dan tak yakin",
           berulang kali, tanpa satu pun petunjuk. */
        gagalDinilai += batch.length;
        continue;
      }
    }

    if (!hasil.size) {
      return { ...kosong, tetapBelum: siap.length - gagalDinilai, gagalDinilai, usulanBaru: [...usulanBaru] };
    }

    /* Satu UPDATE untuk semuanya, bukan satu per catatan: pada 200 dokumen
       selisihnya 1 perjalanan basis data melawan 200. */
    /* Pasangan (id, slug) dirakit sebagai VALUES berparameter, BUKAN
       `unnest(${ids}::uuid[])`. Drizzle memperluas larik JavaScript jadi
       TUPLE `($1,$2,…)` dan Postgres menolak cast record → uuid[] dengan
       42846. Cacat itu tak terlihat saat menulis maupun saat typecheck —
       hanya muncul ketika kuerinya benar-benar dijalankan, yaitu ketika ada
       dokumen yang berhasil dinilai. Ketahuan saat menulis harness eval,
       yang kebetulan memakai pola yang sama. */
    const pasangan = [...hasil.entries()];
    const nilai = sql.join(
      pasangan.map(([id, slug]) => sql`(${id}::uuid, ${slug}::text)`),
      sql`, `,
    );
    await withTenant(tenantId, (tx) => tx.execute(sql`
      update memory_notes n
         set category = v.slug, updated_at = now()
        from (values ${nilai}) as v(id, slug)
       where n.id = v.id and n.deleted_at is null
    `));
    const slugs = pasangan.map(([, s]) => s);

    const perKategori = [...new Set(slugs)].map((slug) => ({
      slug, jumlah: slugs.filter((s) => s === slug).length,
    })).sort((a, b) => b.jumlah - a.jumlah);

    await audit(tenantId, 'user', 'memory.recategorize', opts.knowledgeBaseId, {
      diperbarui: hasil.size, dinilai: siap.length, gagalDinilai, sumber: 'ringkasan',
    });

    return {
      diperbarui: hasil.size,
      tetapBelum: siap.length - hasil.size - gagalDinilai,
      gagalDinilai,
      tanpaRingkasan, tersisa,
      usulanBaru: [...usulanBaru],
      perKategori,
    };
  },

  /**
   * SATU TEKAN, SELESAI SEMUA — mengulang `dariRingkasan` sampai habis.
   *
   * Kenapa perlu ada di samping `dariRingkasan`: batas 200 per panggilan itu
   * nyata dan tak bisa dihapus (satu permintaan HTTP punya tenggat), tetapi
   * membebankan pengulangannya kepada pengguna adalah membocorkan batas
   * teknis ke antarmuka. Orang yang melihat "1.400 belum dikategorikan" tak
   * ingin menekan tombol tujuh kali sambil menghitung; ia ingin menekannya
   * sekali.
   *
   * BERHENTI pada tiga keadaan, dan ketiganya dilaporkan apa adanya:
   *   • tak ada lagi yang bisa dinilai        → tuntas
   *   • satu putaran tak memindahkan apa pun  → mandek, bukan tuntas
   *   • MAX_PUTARAN tercapai                  → masih ada sisa
   *
   * Keadaan kedua yang paling penting ditangkap: kalau model terus-menerus
   * mengusulkan kategori yang belum disetujui, tiap putaran akan sibuk tanpa
   * memindahkan satu dokumen pun. Tanpa penjaga ini, tombol "kerjakan semua"
   * akan memutar sepuluh kali, membakar kuota model, lalu melaporkan nol —
   * dan tak seorang pun tahu kenapa.
   */
  async semuanya(
    tenantId: string,
    opts: { knowledgeBaseId?: string } = {},
  ): Promise<RecategorizeResult & { putaran: number; mandek: boolean }> {
    const gabungan: RecategorizeResult & { putaran: number; mandek: boolean } = {
      diperbarui: 0, tetapBelum: 0, gagalDinilai: 0, tanpaRingkasan: 0, tersisa: 0,
      usulanBaru: [], perKategori: [], putaran: 0, mandek: false,
    };
    const usul = new Set<string>();
    const kategori = new Map<string, number>();

    for (let i = 0; i < MAX_PUTARAN; i++) {
      const r = await recategorizeService.dariRingkasan(tenantId, opts);
      gabungan.putaran = i + 1;
      gabungan.diperbarui += r.diperbarui;
      /* Ketiga angka ini diambil dari putaran TERAKHIR, bukan dijumlahkan:
         ia menggambarkan keadaan yang tersisa sekarang, dan menjumlahkan
         keadaan akan menghitung dokumen yang sama berkali-kali. */
      gabungan.tetapBelum = r.tetapBelum;
      gabungan.gagalDinilai = r.gagalDinilai;
      gabungan.tanpaRingkasan = r.tanpaRingkasan;
      gabungan.tersisa = r.tersisa;
      for (const u of r.usulanBaru) usul.add(u);
      for (const k of r.perKategori) kategori.set(k.slug, (kategori.get(k.slug) ?? 0) + k.jumlah);

      // Tak ada lagi yang bisa dinilai → benar-benar tuntas.
      if (r.tersisa === 0 && r.tetapBelum === 0) break;
      // Sibuk tapi tak memindahkan apa pun → mandek. Memutar lagi hanya
      // membakar kuota untuk hasil yang sudah terbukti sama.
      if (r.diperbarui === 0) { gabungan.mandek = true; break; }
    }

    gabungan.usulanBaru = [...usul];
    gabungan.perKategori = [...kategori.entries()]
      .map(([slug, jumlah]) => ({ slug, jumlah }))
      .sort((a, b) => b.jumlah - a.jumlah);
    return gabungan;
  },
};
