/**
 * PLAIN TEXT ENFORCEMENT — jawaban chatbot dijamin teks polos, tanpa Markdown.
 *
 * Kenapa ada: protokol SSE memang sudah JSON (`data: {"text": …}`), tapi ISI
 * teksnya ditulis LLM yang gemar Markdown (**tebal**, ###, ```…```). Keputusan
 * produk: frontend memegang penuh styling — teks yang sampai ke client tidak
 * boleh membawa sintaks format apa pun. Dua lapis:
 *
 *  1. Instruksi keras di system prompt (chat.service) — menghentikan sebagian
 *     besar Markdown di sumbernya.
 *  2. Penyaring di server (berkas ini) — menjamin sisanya. Bukan di frontend,
 *     supaya SEMUA client (halaman Chat, widget embed, integrasi API pihak
 *     ketiga) menerima teks yang sudah bersih.
 *
 * Sitasi `[1]`, `[2]` BUKAN Markdown — wajib lolos utuh, dipakai frontend
 * untuk chip sitasi.
 */

/** Regex teks-PENUH. Dipakai untuk teks lengkap (simpan DB / flush akhir) —
 *  tanpa masalah batas delta, jadi boleh agresif. */
export function stripMarkdown(text: string): string {
  let t = text.replace(/\r\n/g, '\n');
  // baris pagar kode ```lang dibuang utuh; ISI di dalamnya dipertahankan
  t = t.replace(/^[ \t]*```[^\n]*$/gm, '');
  // inline code / sisa backtick
  t = t.replace(/`([^`\n]*)`/g, '$1').replace(/`/g, '');
  // pasangan penegasan
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
  t = t.replace(/__([^_]+)__/g, '$1');
  t = t.replace(/~~([^~]+)~~/g, '$1');
  // *miring* / _miring_ satu bintang — hanya bila berbatas kata, supaya
  // "2*3" atau snake_case tidak rusak
  t = t.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,;:!?)])/gm, '$1$2');
  t = t.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:!?)])/gm, '$1$2');
  // heading & blockquote di awal baris
  t = t.replace(/^#{1,6}[ \t]+/gm, '');
  t = t.replace(/^>[ \t]?/gm, '');
  // bullet Markdown → bullet teks biasa (angka "1." memang teks polos, biarkan)
  t = t.replace(/^([ \t]*)[-*+][ \t]+/gm, '$1• ');
  // garis pemisah --- / *** sendirian
  t = t.replace(/^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '');
  // tautan [teks](http…) → teks. Sitasi [1] TIDAK cocok pola ini (tanpa kurung URL)
  t = t.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1');
  // sisa penanda ganda yang tak berpasangan
  t = t.replace(/\*\*/g, '').replace(/~~/g, '');
  return t;
}

/**
 * Penyaring STREAMING — stateful, aman terhadap token yang TERBELAH antar
 * delta (mis. `*` di ujung satu delta dan `*` di awal delta berikutnya).
 *
 * Strategi: proses per BARIS UTUH bila ada newline; untuk ekor baris yang
 * belum selesai, pancarkan bagian yang pasti aman dan TAHAN karakter penanda
 * di ujung (bisa jadi setengah token). Sisa tahanan dibersihkan di flush().
 * Penegasan satu-bintang di tengah baris yang belum utuh dibiarkan lolos di
 * stream (ditangkap instruksi prompt + full-pass sebelum disimpan) — menahan
 * seluruh baris demi kasus langka itu akan mematikan rasa streaming.
 */
export function createStreamStripper(): { push(delta: string): string; flush(): string } {
  let carry = '';
  let atLineStart = true;
  let skipLine = false; // sedang membuang baris pagar ```

  // transform baris yang DIKETAHUI dimulai di awal baris (tanpa newline)
  function lineStartTransforms(line: string): string {
    return line
      .replace(/^#{1,6}[ \t]+/, '')
      .replace(/^>[ \t]?/, '')
      .replace(/^([ \t]*)[-*+][ \t]+/, '$1• ');
  }
  function inlineStrip(s: string): string {
    return s.replace(/\*\*|__|~~|`/g, '');
  }

  return {
    push(delta: string): string {
      let s = carry + delta;
      carry = '';
      let out = '';
      while (s.length > 0) {
        if (skipLine) {
          const nl = s.indexOf('\n');
          if (nl === -1) return out; // seluruh sisa milik baris pagar — buang
          s = s.slice(nl + 1);
          skipLine = false; atLineStart = true;
          continue;
        }
        const nl = s.indexOf('\n');
        // Awal baris tapi datanya masih terlalu pendek untuk memastikan
        // prefiksnya ("###### " butuh 7 karakter) → tahan dulu.
        if (atLineStart && nl === -1 && s.length < 8 && /^[#`>\-*+\t ]*$/.test(s)) {
          carry = s; return out;
        }
        let line = nl === -1 ? s : s.slice(0, nl);
        if (atLineStart) {
          if (/^[ \t]*```/.test(line)) { // baris pagar: buang sampai newline
            if (nl === -1) { skipLine = true; return out; }
            s = s.slice(nl + 1); atLineStart = true;
            continue;
          }
          line = lineStartTransforms(line);
        }
        line = inlineStrip(line);
        if (nl === -1) {
          // ekor tanpa newline: tahan penanda di ujung — bisa setengah token
          const m = line.match(/[*_~`]{1,2}$/);
          if (m) { carry = m[0]; line = line.slice(0, -m[0].length); }
          out += line;
          if (line.length > 0) atLineStart = false;
          return out;
        }
        out += line + '\n';
        s = s.slice(nl + 1);
        atLineStart = true;
      }
      return out;
    },
    flush(): string {
      const rest = skipLine ? '' : stripMarkdown(carry);
      carry = ''; skipLine = false; atLineStart = true;
      return rest;
    },
  };
}
