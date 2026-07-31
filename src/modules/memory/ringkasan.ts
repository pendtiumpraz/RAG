import { stripMarkdown } from '@/modules/chat/plaintext';

/**
 * RINGKASAN CATATAN → teks yang enak dibaca manusia.
 *
 * Catatan Memory disimpan sebagai berkas Markdown ala Obsidian: ada
 * frontmatter YAML, judul H1, penegasan `**tebal**`, dan `[[wikilink]]`.
 * Bentuk itu memang disengaja — vault-nya bisa diekspor dan dibuka di
 * Obsidian sungguhan. Tapi di halaman Dokumen yang dibaca ORANG, penanda itu
 * bocor apa adanya ke layar: pengguna melihat `---`, `# Judul`, dan
 * `[[nib-ssn]]`, dan menyangka ringkasannya rusak.
 *
 * Modul MURNI: tak menyentuh basis data maupun React, jadi bisa diuji sendiri.
 *
 * KENAPA TIDAK MEMAKAI stripMarkdown SAJA. Ia menangani hampir semuanya —
 * heading, penegasan, bullet, tautan — tapi tidak `[[wikilink]]`, yang bukan
 * Markdown baku melainkan kebiasaan Obsidian. Ia juga tak tahu bahwa BARIS
 * PERTAMA catatan ini selalu judul yang sudah ditampilkan di atas layar.
 */

/** Buang frontmatter YAML di awal berkas. */
function tanpaFrontmatter(md: string): string {
  return md.replace(/^---[\s\S]*?\n---\n?/, '');
}

/**
 * `[[nib-ssn]]` → `nib ssn`, `[[Kebijakan Garansi]]` → `Kebijakan Garansi`.
 *
 * Tanda kurung ganda dibuang, dan slug bertanda hubung dikembalikan jadi kata
 * berspasi — `[[nib-ssn]]` yang dicetak apa adanya tak terbaca siapa pun.
 * Yang sudah berupa kalimat (mengandung spasi) dibiarkan utuh, karena tanda
 * hubung di dalamnya mungkin memang bagian dari namanya.
 */
export function bukaWikilink(teks: string): string {
  return teks.replace(/\[\[([^\]]+)\]\]/g, (_, isi: string) =>
    (isi.includes(' ') ? isi : isi.replace(/-/g, ' ')));
}

/**
 * Judul H1 pertama dibuang.
 *
 * Halaman Dokumen sudah menampilkan judul dokumennya tepat di atas ringkasan.
 * Mengulanginya di baris pertama membuat pembaca mengira ada dua hal berbeda,
 * lalu membandingkan keduanya — pekerjaan yang tak perlu ada.
 */
function tanpaJudulPertama(teks: string): string {
  return teks.replace(/^\s*#\s+[^\n]*\n?/, '');
}

/**
 * Ringkasan yang siap ditampilkan: tanpa frontmatter, tanpa judul ulang,
 * tanpa penanda Markdown, dan tanpa kurung wikilink.
 */
export function ringkasanBersih(md: string | null | undefined): string {
  if (!md) return '';
  const t = tanpaJudulPertama(tanpaFrontmatter(md));
  return stripMarkdown(bukaWikilink(t))
    // Baris "Topik: a b c" adalah metadata graf, bukan bagian ringkasan.
    .replace(/^Topik:.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Satu kalimat pembuka untuk pratinjau di tabel.
 *
 * Mengembalikan null — bukan string kosong — bila tak ada isi yang bisa
 * dibaca. Pemanggilnya perlu membedakan "belum ada ringkasan" dari
 * "ringkasannya kosong", dan string kosong menyamarkan keduanya jadi sama.
 */
export function abstrakBersih(md: string | null | undefined): string | null {
  const bersih = ringkasanBersih(md);
  if (!bersih) return null;
  const baris = bersih.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('•'));
  return baris[0] ?? null;
}
