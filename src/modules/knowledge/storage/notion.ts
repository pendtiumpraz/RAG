/**
 * NOTION — halaman & database sebagai sumber pengetahuan.
 *
 * TANPA APLIKASI OAUTH KITA, dan itulah yang membuka kartu ini. Anggapannya
 * selama ini: Notion menuntut kami mendaftarkan aplikasi publik dan memegang
 * client secret-nya, jadi kartunya menunggu kredensial pihak ketiga. Itu
 * hanya benar untuk integrasi MARKETPLACE. Notion juga punya "internal
 * integration": pelanggan membuatnya sendiri di ruang kerjanya, menekan
 * Share pada halaman yang mau dibagi, dan menempelkan tokennya — persis pola
 * S3, tempat pelanggan memasok kunci aksesnya sendiri.
 *
 * Konsekuensinya penting untuk dicatat: pelanggan MEMILIH halaman mana yang
 * dibagikan ke integrasinya. Yang tak dibagikan tak pernah terlihat, bahkan
 * oleh token yang sah. Batas aksesnya ditentukan pemilik datanya, bukan oleh
 * kami — dan itu batas yang lebih baik daripada apa pun yang bisa kami tulis.
 *
 * VERSI = `last_edited_time`. Notion memperbaruinya pada tiap suntingan, jadi
 * planDelta() bisa melewatkan halaman yang tak berubah tanpa mengunduh
 * satu blok pun.
 */

const API = 'https://api.notion.com/v1';
/**
 * Versi API dipatok, bukan "terbaru".
 *
 * Notion mewajibkan header ini dan mengubah bentuk responsnya antar versi.
 * Mengikuti "terbaru" berarti integrasi ini bisa rusak pada hari mereka
 * merilis sesuatu — tanpa satu baris pun kode di sini berubah, dan tanpa ada
 * yang menduga sebabnya.
 */
const VERSI_API = '2022-06-28';

const TENGGAT_MS = 30_000;

export interface KredensialNotion { token: string }

interface HalamanNotion {
  id: string;
  last_edited_time?: string;
  archived?: boolean;
  in_trash?: boolean;
  properties?: Record<string, unknown>;
  parent?: { type?: string };
}

async function panggil<T>(kred: KredensialNotion, jalur: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${jalur}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: `Bearer ${kred.token}`,
      'Notion-Version': VERSI_API,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TENGGAT_MS),
  });
  if (!r.ok) {
    const teks = (await r.text().catch(() => '')).slice(0, 200);
    if (r.status === 401) throw new Error('Token Notion ditolak — periksa integrasi & tokennya.');
    if (r.status === 404) throw new Error('Halaman tak terlihat oleh integrasi — bagikan halamannya lebih dulu.');
    throw new Error(`Notion ${r.status}: ${teks}`);
  }
  return r.json() as Promise<T>;
}

/** Judul halaman dari properti bertipe `title`, apa pun namanya. */
export function judulHalaman(props: Record<string, unknown> | undefined): string {
  for (const nilai of Object.values(props ?? {})) {
    const p = nilai as { type?: string; title?: Array<{ plain_text?: string }> };
    if (p?.type !== 'title' || !Array.isArray(p.title)) continue;
    const t = p.title.map((x) => x.plain_text ?? '').join('').trim();
    if (t) return t;
  }
  return 'Tanpa judul';
}

/**
 * Daftar halaman yang dibagikan ke integrasi.
 *
 * `truncated` dikembalikan apa adanya dan itu MENENTUKAN: planDelta() tak
 * boleh menghapus dokumen yang kebetulan berada di luar jendela pendaftaran.
 * Halaman yang tak ikut terdaftar bukan halaman yang hilang.
 */
export async function daftarHalaman(
  kred: KredensialNotion, batasHalaman = 500,
): Promise<{ halaman: Array<{ id: string; judul: string; versi: string }>; terpotong: boolean }> {
  const out: Array<{ id: string; judul: string; versi: string }> = [];
  let cursor: string | undefined;
  let terpotong = false;

  for (let putaran = 0; putaran < 20; putaran += 1) {
    const r = await panggil<{ results: HalamanNotion[]; next_cursor?: string; has_more?: boolean }>(
      kred, '/search',
      { filter: { property: 'object', value: 'page' }, page_size: 100, start_cursor: cursor },
    );
    for (const h of r.results ?? []) {
      /* Arsip & sampah dilewati. Menyerapnya berarti chatbot menjawab dari
         halaman yang pemiliknya sudah putuskan untuk dibuang — dan mereka tak
         punya cara menduga kenapa. */
      if (h.archived || h.in_trash) continue;
      out.push({
        id: h.id,
        judul: judulHalaman(h.properties),
        versi: h.last_edited_time ?? '',
      });
      if (out.length >= batasHalaman) { terpotong = true; break; }
    }
    if (out.length >= batasHalaman) break;
    if (!r.has_more || !r.next_cursor) break;
    cursor = r.next_cursor;
    if (putaran === 19) terpotong = true;
  }
  return { halaman: out, terpotong };
}

/* ── isi halaman ──────────────────────────────────────────────────────── */

interface Blok {
  id: string; type: string; has_children?: boolean;
  [k: string]: unknown;
}

/** Ratakan rich_text jadi teks biasa. */
export function teksKaya(v: unknown): string {
  if (!Array.isArray(v)) return '';
  return v.map((x) => (x as { plain_text?: string })?.plain_text ?? '').join('');
}

/**
 * Ubah satu blok jadi baris Markdown.
 *
 * Markdown, bukan teks polos: penanda judul dan daftar adalah SINYAL STRUKTUR
 * yang ikut dipakai pemotong dokumen dan kaki leksikal. Membuangnya membuat
 * satu halaman panjang jadi satu gumpalan tanpa batas alami.
 */
export function blokKeMarkdown(b: Blok): string {
  const isi = (b as Record<string, { rich_text?: unknown }>)[b.type]?.rich_text;
  const t = teksKaya(isi);
  switch (b.type) {
    case 'heading_1': return `# ${t}`;
    case 'heading_2': return `## ${t}`;
    case 'heading_3': return `### ${t}`;
    case 'bulleted_list_item': return `- ${t}`;
    case 'numbered_list_item': return `1. ${t}`;
    case 'to_do': return `- [ ] ${t}`;
    case 'quote': return `> ${t}`;
    case 'code': return `\`\`\`\n${t}\n\`\`\``;
    case 'divider': return '---';
    default: return t;
  }
}

/**
 * Ambil isi halaman sebagai Markdown.
 *
 * KEDALAMAN DIBATASI. Blok Notion bisa bersarang tanpa batas, dan halaman
 * yang saling menautkan bisa membuat penelusuran naif berjalan sangat lama —
 * di lambda dengan tenggat 60 detik, itu berarti sync yang mati di tengah
 * tanpa kabar. Tiga tingkat menangkap hampir semua struktur nyata (judul →
 * daftar → sub-daftar).
 */
export async function isiHalaman(
  kred: KredensialNotion, pageId: string, kedalaman = 3,
): Promise<string> {
  const baris: string[] = [];

  async function telusuri(blokId: string, tingkat: number, indent: string) {
    if (tingkat > kedalaman) return;
    let cursor: string | undefined;
    for (let putaran = 0; putaran < 10; putaran += 1) {
      const q = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
      const r = await panggil<{ results: Blok[]; next_cursor?: string; has_more?: boolean }>(
        kred, `/blocks/${blokId}/children?${q}`,
      );
      for (const b of r.results ?? []) {
        const teks = blokKeMarkdown(b);
        if (teks.trim()) baris.push(indent + teks);
        if (b.has_children) await telusuri(b.id, tingkat + 1, `${indent}  `);
      }
      if (!r.has_more || !r.next_cursor) break;
      cursor = r.next_cursor;
    }
  }

  await telusuri(pageId, 1, '');
  return baris.join('\n');
}
