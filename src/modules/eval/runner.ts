import { sql } from 'drizzle-orm';
import { withTenant } from '@/modules/core/db/tenant-context';
import { retrievalService } from '@/modules/chat/retrieval.service';
import { agregat, skorSatu, type Agregat, type SkorPertanyaan } from './metrics';
import { tanpaJawaban, type HimpunanBaku } from './golden';

/**
 * PELARI EVAL — menjalankan himpunan baku terhadap retrieval yang SUNGGUHAN.
 *
 * Memanggil `retrievalService.retrieve` persis seperti jalur chat, di bawah
 * `withTenant()` sehingga RLS ikut aktif. Menyalin kuerinya ke sini akan
 * membuat eval mengukur kode yang bukan kode produksi — dan eval semacam itu
 * paling berbahaya justru saat ia hijau.
 *
 * TIDAK memanggil model bahasa sama sekali. Yang diukur di sini adalah
 * PENCARIANNYA, dan pencarian tak memakai token; memaksakan jawaban model ke
 * dalam pengukuran ini hanya menambah biaya, waktu, dan derau pada angka yang
 * seharusnya dapat diulang. Kepatuhan jawaban punya kartunya sendiri
 * (a-answer-policy-eval), dengan alat yang berbeda.
 */

/** Hasil satu pertanyaan — disimpan utuh supaya kegagalan bisa DIPERIKSA. */
export interface HasilPertanyaan {
  id: string;
  q: string;
  /** doc_ref yang benar menurut himpunan baku. */
  diharapkan: string[];
  /** doc_ref hasil pencarian, berurut peringkat. */
  didapat: string[];
  skor: SkorPertanyaan;
  /** Pertanyaan jenis "tak ada jawabannya di korpus". */
  tanpaJawaban: boolean;
}

export interface HasilEval {
  nama: string;
  k: number;
  /** Rata-rata makro atas pertanyaan yang PUNYA jawaban. */
  terjawab: Agregat;
  /**
   * Pertanyaan tanpa jawaban dinilai TERPISAH dan dengan ukuran berbeda:
   * di sini yang baik adalah mengembalikan SEDIKIT, bukan banyak.
   */
  tanpaJawaban: { n: number; rataHasil: number; kosongSempurna: number };
  perPertanyaan: HasilPertanyaan[];
}

/**
 * Peta potongan → dokumen logis.
 *
 * `documentId` adalah id BARIS potongan dan berubah tiap dokumen di-ingest
 * ulang; `doc_ref` adalah identitas dokumen logis yang bertahan. Himpunan
 * baku wajib melabeli dengan doc_ref — melabeli dengan documentId berarti
 * himpunannya membusuk diam-diam setiap sync, dan angkanya anjlok tanpa ada
 * yang benar-benar memburuk.
 */
async function petaDocRef(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  /* `any(array[...])` dengan tiap nilai jadi parameter sendiri — BUKAN
     `any(${ids}::uuid[])`. Drizzle memperluas larik JavaScript jadi TUPLE
     `($1,$2,…)`, dan Postgres menolak melakukan cast record → uuid[]
     (42846 cannot cast type record to uuid[]). Kesalahannya tak terlihat
     saat menulis maupun saat typecheck; ia hanya muncul ketika kuerinya
     benar-benar dijalankan. */
  const rows = await withTenant(tenantId, (tx) => tx.execute(sql`
    select id::text as id, doc_ref as "docRef"
      from documents
     where id = any(array[${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)}])
       and deleted_at is null
  `)) as unknown as Array<{ id: string; docRef: string | null }>;
  const m = new Map<string, string>();
  for (const r of rows) if (r.docRef) m.set(r.id, r.docRef);
  return m;
}

/**
 * Urutan doc_ref yang unik, mempertahankan peringkat kemunculan PERTAMA.
 *
 * Beberapa potongan dari dokumen yang sama lazim muncul berdampingan.
 * Menghitungnya sebagai beberapa hasil akan menghukum presisi karena sistem
 * melakukan hal yang benar (mengambil beberapa bagian dari dokumen yang
 * memang relevan), dan menaikkan recall tanpa satu pun dokumen tambahan
 * ditemukan.
 */
export function docRefUnik(refs: readonly (string | undefined)[]): string[] {
  const out: string[] = [];
  const ada = new Set<string>();
  for (const r of refs) {
    if (!r || ada.has(r)) continue;
    ada.add(r); out.push(r);
  }
  return out;
}

export async function jalankanEval(
  tenantId: string,
  himpunan: HimpunanBaku,
  opts: { chatbotId: string; embeddingModel: string },
): Promise<HasilEval> {
  const k = himpunan.k ?? 10;
  const perPertanyaan: HasilPertanyaan[] = [];

  for (const p of himpunan.pertanyaan) {
    const potongan = await retrievalService.retrieve(
      tenantId, opts.chatbotId, opts.embeddingModel, p.q, k);

    /* Potongan Memory DIBUANG dari penilaian retrieval. Ia ringkasan buatan
       LLM atas dokumen, bukan dokumen — memasukkannya berarti menilai
       pencarian atas teks yang tidak ada di korpus pelanggan, dan
       himpunan baku melabeli dokumen sungguhan. */
    const dokumenSaja = potongan.filter((c) => c.kind !== 'memory');
    const peta = await petaDocRef(tenantId, dokumenSaja.map((c) => c.documentId));
    const didapat = docRefUnik(dokumenSaja.map((c) => peta.get(c.documentId)));

    perPertanyaan.push({
      id: p.id, q: p.q, diharapkan: p.docRefs, didapat,
      skor: skorSatu(didapat, p.docRefs, k),
      tanpaJawaban: tanpaJawaban(p),
    });
  }

  const terjawab = perPertanyaan.filter((h) => !h.tanpaJawaban);
  const kosong = perPertanyaan.filter((h) => h.tanpaJawaban);

  return {
    nama: himpunan.nama, k,
    terjawab: agregat(terjawab.map((h) => h.skor)),
    tanpaJawaban: {
      n: kosong.length,
      rataHasil: kosong.length
        ? kosong.reduce((a, h) => a + h.didapat.length, 0) / kosong.length : 0,
      kosongSempurna: kosong.filter((h) => h.didapat.length === 0).length,
    },
    perPertanyaan,
  };
}
