/**
 * RERANKER — sisi jaringannya.
 *
 * Dipisah dari `rerank.ts` supaya seluruh aturan keselamatan penggabungan
 * peringkat bisa diuji tanpa satu pun panggilan keluar. Yang di sini murni
 * "bicara dengan penyedia", dan setiap penyedia menjawab dengan bentuk yang
 * berbeda-beda; menormalkannya di satu tempat berarti retrieval tak perlu
 * tahu siapa yang menjawab.
 *
 * TIGA PENYEDIA, dan ketiganya sengaja ada. Ini bukan kemewahan: keputusan
 * "di mana model lintas-encoder di-host" tak bisa ditebak dari sini — jawaban
 * yang benar berbeda untuk SaaS (API pihak ketiga, tanpa infrastruktur) dan
 * on-premise (tak boleh ada teks dokumen yang keluar jaringan sama sekali).
 * Karena itu ketiganya dibangun dan pilihannya diserahkan ke saklar, bukan
 * ditanyakan lalu ditunggu.
 */
import { assertPublicHttpUrl } from '@/modules/core/net';
import type { HasilRerank, KandidatRerank } from './rerank';

export type PenyediaRerank = 'cohere' | 'jina' | 'selfhosted';

export interface ModelRerank {
  id: string;
  label: string;
  penyedia: PenyediaRerank;
  /** Nama model yang dikirim ke penyedia, bila berbeda dari `id`. */
  modelPenyedia?: string;
  catatan: string;
}

/**
 * Daftar reranker yang boleh dipilih.
 *
 * Menambah satu = menambah satu baris di sini, sama seperti registry model —
 * dan sengaja pendek: tiap baris di sini adalah satu janji bahwa jalurnya
 * benar-benar diuji, bukan sekadar disebut di dokumen.
 */
export const MODEL_RERANK: ModelRerank[] = [
  {
    id: 'rerank-v3.5', label: 'Cohere Rerank v3.5', penyedia: 'cohere',
    catatan: 'Multibahasa, termasuk Indonesia. Butuh kunci API Cohere di Models & Keys.',
  },
  {
    id: 'jina-reranker-v2-base-multilingual', label: 'Jina Reranker v2 (multibahasa)', penyedia: 'jina',
    catatan: 'Multibahasa. Butuh kunci API Jina.',
  },
  {
    id: 'selfhosted', label: 'Server sendiri (on-premise)', penyedia: 'selfhosted',
    catatan: 'Tak ada teks dokumen yang meninggalkan jaringanmu. Atur RERANK_SELFHOSTED_URL.',
  },
];

export const cariRerank = (id: string | null | undefined): ModelRerank | undefined =>
  (id ? MODEL_RERANK.find((m) => m.id === id) : undefined);

/** Batas waktu satu panggilan rerank. */
export const TENGGAT_MS = 8_000;

export interface KonteksRerank {
  /** Pengambil kunci API per tenant — sama seperti jalur embedding & LLM. */
  ambilKunci: (penyedia: string) => Promise<string | null>;
}

/**
 * Konfigurasi server rerank sendiri. Null bila belum diatur.
 *
 * Penjagaan https-nya sama persis dengan server embedding, dan alasannya juga
 * sama: yang melintas ke sana adalah ISI DOKUMEN tenant. Isolasi dijaga ketat
 * sampai level basis data; mengirim teksnya lewat HTTP polos membocorkan
 * semuanya di satu titik yang tak dijaga.
 */
export function konfigSelfhosted(): { baseUrl: string; token: string | null } | null {
  const raw = process.env.RERANK_SELFHOSTED_URL?.trim();
  if (!raw) return null;
  return {
    baseUrl: raw.replace(/\/+$/, ''),
    token: process.env.RERANK_SELFHOSTED_TOKEN?.trim() || null,
  };
}

async function panggil(url: string, body: unknown, header: Record<string, string>) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...header },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TENGGAT_MS),
  });
  if (!r.ok) throw new Error(`rerank ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<{ results?: Array<{ index: number; relevance_score?: number; score?: number }> }>;
}

/**
 * Nilai ulang kandidat. Melempar bila penyedianya gagal — pemanggilnya yang
 * memutuskan apa yang terjadi sesudahnya (dan di retrieval, jawabannya:
 * lanjutkan dengan urutan lama, karena hasil pencarian yang agak kurang tepat
 * jauh lebih baik daripada tak ada jawaban sama sekali).
 */
export async function nilaiUlang(
  model: ModelRerank,
  query: string,
  kandidat: KandidatRerank[],
  ctx: KonteksRerank,
): Promise<HasilRerank[]> {
  if (!kandidat.length) return [];
  const dokumen = kandidat.map((c) => c.content);
  const namaModel = model.modelPenyedia ?? model.id;

  let json: Awaited<ReturnType<typeof panggil>>;
  if (model.penyedia === 'selfhosted') {
    const cfg = konfigSelfhosted();
    if (!cfg) throw new Error('RERANK_SELFHOSTED_URL belum diatur');
    /* Penjagaan yang sama dengan sumber pengetahuan dari URL & webhook: wajib
       https kecuali loopback, dan tak boleh menunjuk alamat internal. */
    assertPublicHttpUrl(cfg.baseUrl, { allowLoopback: true, label: 'RERANK_SELFHOSTED_URL' });
    json = await panggil(`${cfg.baseUrl}/rerank`, { query, documents: dokumen, model: namaModel },
      cfg.token ? { authorization: `Bearer ${cfg.token}` } : {});
  } else {
    const kunci = await ctx.ambilKunci(model.penyedia);
    if (!kunci) throw new Error(`kunci API ${model.penyedia} belum diisi`);
    const url = model.penyedia === 'cohere'
      ? 'https://api.cohere.com/v2/rerank'
      : 'https://api.jina.ai/v1/rerank';
    json = await panggil(url, { model: namaModel, query, documents: dokumen },
      { authorization: `Bearer ${kunci}` });
  }

  /* Ketiga penyedia menjawab dengan bentuk yang sama-sama berpusat pada
     INDEKS, bukan id: `{ results: [{ index, relevance_score }] }`. Indeks di
     luar jangkauan diabaikan di sini — dan yang lolos tetap disaring lagi oleh
     terapkanRerank(), karena satu lapis pemeriksaan pada data dari luar tak
     pernah cukup. */
  return (json.results ?? []).flatMap((x) => {
    const c = kandidat[x.index];
    if (!c) return [];
    const skor = x.relevance_score ?? x.score;
    return typeof skor === 'number' ? [{ id: c.id, skor }] : [];
  });
}
