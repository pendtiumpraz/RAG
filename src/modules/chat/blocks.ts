import { stripMarkdown } from './plaintext';

/**
 * JAWABAN TERSTRUKTUR — chatbot membalas JSON berisi BLOK, bukan prosa mentah.
 *
 * Keputusan produk: frontend memegang penuh styling. Model diminta menyusun
 * jawabannya sebagai daftar blok bertipe; server memvalidasi + memancarkan
 * blok yang sudah UTUH satu per satu (SSE `event: block`), sehingga jawaban
 * muncul komponen demi komponen — bukan token demi token.
 *
 *   text  — 1–3 kalimat per blok (satu "bubble" kecil)
 *   list  — butir berurut (ordered) / tidak; tiap butir teks polos
 *   cards — fakta kunci: {title, value, desc?} → kartu statistik
 *   chart — SATU seri angka {kind:'bar'|'line', title?, unit?, labels, values}
 *
 * Sitasi tetap inline sebagai [1], [2] di dalam string — frontend mengubahnya
 * jadi chip. Model yang mengabaikan format (balas prosa) TIDAK mematahkan
 * apa pun: finalize() memecah teks polosnya jadi blok text/list (fallback).
 */

export type AnswerBlock =
  | { type: 'text'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'cards'; items: Array<{ title: string; value: string; desc?: string }> }
  | { type: 'chart'; kind: 'bar' | 'line'; title?: string; unit?: string; labels: string[]; values: number[] };

/** Instruksi format utk system prompt. Skema dijaga KECIL — makin sedikit
 *  pilihan, makin patuh model kecil. */
export const BLOCK_FORMAT_INSTRUCTIONS = [
  'OUTPUT FORMAT — respond with JSON ONLY (no prose outside it, no code fences):',
  '{"blocks":[',
  '  {"type":"text","text":"1-3 plain sentences. May contain citations like [1]."},',
  '  {"type":"list","ordered":true,"items":["item one [2]","item two"]},',
  '  {"type":"cards","items":[{"title":"Label","value":"9120206721876","desc":"optional short note [1]"}]},',
  '  {"type":"chart","kind":"bar","title":"Chart title","unit":"optional","labels":["A","B"],"values":[10,20]}',
  ']}',
  'Rules: plain text inside strings — NO Markdown (**, #, `, links). Keep each',
  'text block short (1-3 sentences) so the answer reads as small steps. Use',
  '"list" for enumerations, "cards" for key facts/figures (2-4 cards), and',
  '"chart" ONLY when the context contains a numeric series worth comparing',
  '(same unit, 2-12 points) — never invent numbers. Keep citations [1], [2]',
  'inline in strings, matching the <doc id> numbers.',
].join('\n');

/* ── validasi & normalisasi ───────────────────────────────────────── */

const MAX_BLOCKS = 24;
const MAX_ITEMS = 24;
const MAX_TEXT = 2000;
const MAX_POINTS = 12;

const clean = (v: unknown, max = MAX_TEXT) =>
  stripMarkdown(String(v ?? '')).slice(0, max).trim();

/** Satu blok mentah dari model → blok valid, atau null bila tak bisa dipakai.
 *  Semua string melewati stripMarkdown — model suka menyelipkan ** di JSON. */
export function sanitizeBlock(raw: unknown): AnswerBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;

  if (b.type === 'text') {
    const text = clean(b.text);
    return text ? { type: 'text', text } : null;
  }
  if (b.type === 'list' && Array.isArray(b.items)) {
    const items = b.items.slice(0, MAX_ITEMS).map((i) => clean(i, 500)).filter(Boolean);
    return items.length ? { type: 'list', ordered: b.ordered !== false, items } : null;
  }
  if (b.type === 'cards' && Array.isArray(b.items)) {
    const items = b.items.slice(0, 8).flatMap((c) => {
      if (!c || typeof c !== 'object') return [];
      const card = c as Record<string, unknown>;
      const title = clean(card.title, 120); const value = clean(card.value, 200);
      if (!title && !value) return [];
      const desc = clean(card.desc, 300);
      return [{ title, value, ...(desc ? { desc } : {}) }];
    });
    return items.length ? { type: 'cards', items } : null;
  }
  if (b.type === 'chart' && Array.isArray(b.labels) && Array.isArray(b.values)) {
    const n = Math.min(b.labels.length, b.values.length, MAX_POINTS);
    const labels: string[] = []; const values: number[] = [];
    for (let i = 0; i < n; i++) {
      const v = Number(b.values[i]);
      if (!Number.isFinite(v)) continue;
      labels.push(clean(b.labels[i], 60) || `#${i + 1}`);
      values.push(v);
    }
    if (values.length < 2) return null; // 1 angka = bukan chart; model diminta pakai cards
    const kind = b.kind === 'line' ? 'line' : 'bar';
    const title = clean(b.title, 140); const unit = clean(b.unit, 30);
    return { type: 'chart', kind, ...(title ? { title } : {}), ...(unit ? { unit } : {}), labels, values };
  }
  return null;
}

/** Padanan teks polos — utk `messages.content` (analytics, riwayat prompt,
 *  estimasi token) dan pemeriksaan sitasi. */
export function blocksToPlainText(blocks: AnswerBlock[]): string {
  return blocks.map((b) => {
    if (b.type === 'text') return b.text;
    if (b.type === 'list') return b.items.map((it, i) => (b.ordered ? `${i + 1}. ${it}` : `• ${it}`)).join('\n');
    if (b.type === 'cards') return b.items.map((c) => `${c.title}: ${c.value}${c.desc ? ` — ${c.desc}` : ''}`).join('\n');
    return `${b.title ?? 'Data'}: ${b.labels.map((l, i) => `${l} ${b.values[i]}${b.unit ? ` ${b.unit}` : ''}`).join(', ')}`;
  }).join('\n\n');
}

/* ── parser streaming ─────────────────────────────────────────────── */

/**
 * Ekstraktor blok inkremental: menerima delta MENTAH dari model, memancarkan
 * objek blok yang sudah UTUH begitu kurung kurawalnya menutup — sadar-string
 * (kurung di dalam "…" tak dihitung), toleran pagar ```json di awal.
 *
 * finalize(): dipanggil setelah stream habis. Bila tak ada satu blok pun yang
 * berhasil diparse (model membalas prosa), seluruh teks jatuh ke fallback:
 * stripMarkdown → pecah per paragraf/daftar jadi blok text/list. Model boleh
 * gagal soal format — pengguna tetap menerima jawaban terstruktur.
 */
export function createBlockStreamParser(onBlock: (b: AnswerBlock) => void) {
  let raw = '';          // seluruh keluaran model (utk fallback & audit)
  let buf = '';          // jendela kerja pencarian blok
  let inArray = false;   // sudah melewati '"blocks" : ['
  let emitted = 0;

  function tryExtract() {
    if (!inArray) {
      const m = buf.match(/"blocks"\s*:\s*\[/);
      if (!m) return;
      buf = buf.slice((m.index ?? 0) + m[0].length);
      inArray = true;
    }
    // pindai objek { … } utuh di level teratas array
    for (;;) {
      const start = buf.indexOf('{');
      if (start === -1) return;
      let depth = 0; let inStr = false; let esc = false; let end = -1;
      for (let i = start; i < buf.length; i++) {
        const ch = buf[i];
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end === -1) return; // objek belum lengkap — tunggu delta berikutnya
      const jsonStr = buf.slice(start, end + 1);
      buf = buf.slice(end + 1);
      try {
        const block = sanitizeBlock(JSON.parse(jsonStr));
        if (block) { emitted++; onBlock(block); }
      } catch { /* objek korup — lewati, jangan matikan stream */ }
    }
  }

  return {
    push(delta: string): void {
      raw += delta; buf += delta;
      tryExtract();
    },
    /** @returns blok yang DIPANCARKAN lewat onBlock selama finalize (fallback),
     *  plus penanda fallback utk audit. */
    finalize(): { fallback: boolean; raw: string } {
      tryExtract();
      if (emitted > 0) return { fallback: false, raw };
      // Model mengabaikan format → jadikan teks polosnya blok-blok.
      for (const block of plainTextToBlocks(raw)) { emitted++; onBlock(block); }
      return { fallback: true, raw };
    },
  };
}

/** Fallback: prosa → blok. Paragraf jadi `text`; deretan baris "1. …"/"- …"
 *  jadi `list`. Dipakai juga utk menampilkan pesan lama pra-fitur. */
export function plainTextToBlocks(text: string): AnswerBlock[] {
  const plain = stripMarkdown(text).trim();
  if (!plain) return [];
  const out: AnswerBlock[] = [];
  for (const para of plain.split(/\n{2,}/)) {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const ordered = lines.every((l) => /^\d+[.)]\s+/.test(l));
    const bullet = lines.every((l) => /^[•]\s+/.test(l));
    if ((ordered || bullet) && lines.length > 1) {
      out.push({
        type: 'list', ordered,
        items: lines.map((l) => l.replace(/^(\d+[.)]|[•])\s+/, '')).slice(0, MAX_ITEMS),
      });
    } else {
      const text = lines.join('\n').slice(0, MAX_TEXT);
      out.push({ type: 'text', text });
    }
    if (out.length >= MAX_BLOCKS) break;
  }
  return out;
}
