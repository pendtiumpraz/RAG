/**
 * MCP (Model Context Protocol) — lapisan protokolnya, tanpa HTTP dan tanpa DB.
 *
 * Gunanya: basis pengetahuan tenant bisa dipanggil langsung dari Claude, IDE,
 * atau agen mana pun yang berbicara MCP — tanpa pelanggan menulis integrasi
 * sendiri.
 *
 * Yang dibangun di sini SENGAJA tipis. Seluruh kemampuannya sudah ada di
 * `/api/v1/*`: pencarian semantik per chatbot, daftar chatbot, daftar dokumen.
 * MCP hanyalah cara lain memanggilnya. Menulis ulang logikanya di sini akan
 * melahirkan dua jalur yang menyimpang perlahan, dan yang menyimpang adalah
 * yang lebih jarang dipakai — persis yang paling sulit ketahuan rusak.
 *
 * DUA KELAS KEGAGALAN YANG SERING TERTUKAR, dan ini yang paling menentukan:
 *
 *   • Galat PROTOKOL (metode tak dikenal, JSON rusak) → balasan JSON-RPC
 *     `error`. Klien memperlakukannya sebagai kerusakan sambungan.
 *   • Galat ALAT (chatbot tak ditemukan, kueri kosong) → balasan `result`
 *     dengan `isError: true`. Klien memperlakukannya sebagai jawaban yang
 *     bisa dibaca modelnya, lalu mencoba hal lain.
 *
 * Menukar keduanya membuat agen mencoba ulang tanpa henti pada kesalahan yang
 * takkan pernah berubah — dan tiap percobaan itu memanggil kita lagi.
 */

/** Versi protokol yang dijawab saat `initialize`. */
export const VERSI_PROTOKOL = '2025-06-18';

export const KODE = {
  PARSE: -32_700,
  PERMINTAAN_TAK_SAH: -32_600,
  METODE_TAK_DIKENAL: -32_601,
  PARAMETER_TAK_SAH: -32_602,
  INTERNAL: -32_603,
} as const;

export interface PermintaanRpc {
  jsonrpc: '2.0';
  /** Tidak ada `id` = NOTIFIKASI: tak boleh dibalas sama sekali. */
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface BalasanRpc {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export function hasil(id: string | number | null, result: unknown): BalasanRpc {
  return { jsonrpc: '2.0', id, result };
}

export function galat(id: string | number | null, code: number, message: string): BalasanRpc {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/**
 * Hasil pemanggilan ALAT yang gagal.
 *
 * Bukan galat JSON-RPC. Isinya teks yang memang ditujukan untuk dibaca model
 * pemanggil, jadi kalimatnya harus menjelaskan apa yang bisa dicoba
 * berikutnya — bukan sekadar menyatakan ada yang salah.
 */
export function alatGagal(pesan: string) {
  return { content: [{ type: 'text', text: pesan }], isError: true };
}

export function alatBerhasil(teks: string) {
  return { content: [{ type: 'text', text: teks }], isError: false };
}

/**
 * Periksa amplop JSON-RPC.
 *
 * Mengembalikan pesan galat, atau null bila sah. Array DITOLAK secara tegas:
 * spesifikasi MCP 2025-06-18 membuang dukungan batch, dan menerima separuh
 * lebih buruk daripada menolak — klien akan mengira batch-nya bekerja sampai
 * satu permintaan hilang tanpa jejak.
 */
export function periksaAmplop(body: unknown): string | null {
  if (Array.isArray(body)) return 'Batch JSON-RPC tidak didukung pada MCP 2025-06-18.';
  if (!body || typeof body !== 'object') return 'Badan permintaan bukan objek JSON-RPC.';
  const b = body as Record<string, unknown>;
  if (b.jsonrpc !== '2.0') return 'Kolom "jsonrpc" harus "2.0".';
  if (typeof b.method !== 'string' || !b.method) return 'Kolom "method" wajib berupa teks.';
  if ('id' in b && b.id !== null && typeof b.id !== 'string' && typeof b.id !== 'number') {
    return 'Kolom "id" harus teks, angka, atau null.';
  }
  return null;
}

/** Notifikasi = tanpa `id`. Tidak boleh dibalas apa pun, termasuk galat. */
export function adalahNotifikasi(b: { id?: unknown }): boolean {
  return !('id' in b) || b.id === undefined;
}

/* ── daftar alat ─────────────────────────────────────────────────────── */

export interface AlatMcp {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Alat yang ditawarkan.
 *
 * `tanya` (menjalankan LLM) SENGAJA TIDAK ADA. Agen yang memanggil kita sudah
 * punya modelnya sendiri — yang tak dimilikinya adalah dokumen pelanggan.
 * Memberi pencarian saja membuat token dibakar di sisi pemanggil, bukan di
 * sisi kami, dan karena itu ia juga tak memotong kuota pesan pelanggan.
 * Menambah `tanya` berarti membebankan biaya LLM tanpa menambah kemampuan
 * yang belum ada.
 */
export const ALAT: AlatMcp[] = [
  {
    name: 'daftar_chatbot',
    description: 'Daftar chatbot pada workspace ini, beserta id-nya. '
      + 'Panggil ini lebih dulu untuk mengetahui chatbotId yang dipakai cari_dokumen.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'cari_dokumen',
    description: 'Cari potongan dokumen paling relevan pada basis pengetahuan sebuah chatbot. '
      + 'Mengembalikan kutipan beserta judul dokumen dan skor kemiripannya. '
      + 'Tidak menjalankan model bahasa — susun jawabannya sendiri dari kutipan ini.',
    inputSchema: {
      type: 'object',
      properties: {
        chatbotId: { type: 'string', description: 'Id chatbot dari daftar_chatbot.' },
        query: { type: 'string', description: 'Pertanyaan atau kata kunci.' },
        k: { type: 'integer', minimum: 1, maximum: 20, default: 6,
          description: 'Berapa potongan yang dikembalikan.' },
      },
      required: ['chatbotId', 'query'],
      additionalProperties: false,
    },
  },
];

/** Kemampuan server. Hanya `tools` — tak ada resources/prompts yang dijanjikan. */
export function keteranganServer() {
  return {
    protocolVersion: VERSI_PROTOKOL,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: 'nalar', version: '1' },
    instructions: 'Basis pengetahuan Nalar. Panggil daftar_chatbot untuk menemukan chatbotId, '
      + 'lalu cari_dokumen untuk mengambil kutipan. Jawaban disusun oleh modelmu sendiri, '
      + 'dan setiap kutipan menyebutkan dokumen asalnya supaya bisa dirujuk.',
  };
}

/* ── penyusunan keluaran alat ───────────────────────────────────────── */

export interface PotonganHasil {
  title: string | null;
  content: string;
  score: number;
}

/**
 * Susun hasil pencarian jadi teks yang berguna bagi model pemanggil.
 *
 * Menyertakan JUDUL dan SKOR di tiap kutipan, bukan cuma isinya: tanpa judul
 * model tak bisa merujuk sumbernya, dan tanpa skor ia tak punya cara menakar
 * mana yang meyakinkan. Keduanya hilang kalau hasilnya digabung jadi satu
 * gumpalan teks.
 */
export function ringkasPencarian(query: string, potongan: PotonganHasil[]): string {
  if (potongan.length === 0) {
    return `Tidak ada potongan dokumen yang cocok untuk "${query}". `
      + 'Basis pengetahuan chatbot ini mungkin belum memuat topik tersebut.';
  }
  const baris = potongan.map((p, i) =>
    `[${i + 1}] ${p.title ?? '(tanpa judul)'} — kemiripan ${p.score.toFixed(3)}\n${p.content.trim()}`);
  return `${potongan.length} kutipan untuk "${query}":\n\n${baris.join('\n\n')}`;
}
