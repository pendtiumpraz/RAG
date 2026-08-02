/**
 * SLACK — kanal sebagai sumber pengetahuan.
 *
 * TANPA APLIKASI OAUTH KITA, sama seperti Notion. Pelanggan membuat aplikasi
 * di ruang kerjanya sendiri, memberinya cakupan baca, mengundangnya ke kanal
 * yang mau dibagi, lalu menempelkan bot token (`xoxb-…`). Tak ada yang perlu
 * kami daftarkan, dan tak ada persetujuan marketplace yang perlu ditunggu.
 *
 * SATU KANAL = SATU DOKUMEN, dan pilihan ini yang paling menentukan hasilnya.
 * Alternatifnya — satu pesan satu dokumen — menghasilkan puluhan ribu potongan
 * sepanjang satu kalimat yang hampir tak pernah cukup untuk menjawab apa pun,
 * sekaligus menghabiskan kuota potongan pelanggan dalam sekali sync. Percakapan
 * baru punya arti sebagai RANGKAIAN: pertanyaan, jawaban, dan koreksinya
 * duduk di pesan yang berbeda.
 *
 * VERSI = stempel waktu pesan terbaru. Kanal yang tak ada pesan barunya tak
 * pernah diunduh ulang, dan kanal yang ramai selalu ikut di putaran berikutnya.
 *
 * YANG SENGAJA TIDAK DIAMBIL: pesan langsung (DM) dan grup privat. Cakupannya
 * memang bisa diminta, tapi menyerap percakapan pribadi ke dalam mesin yang
 * menjawab pertanyaan seluruh perusahaan adalah kebocoran yang tak bisa
 * ditarik kembali begitu terjadi — dan tak ada layar di produk ini yang cukup
 * jelas untuk membuat orang benar-benar memahami apa yang mereka setujui.
 */

const API = 'https://slack.com/api';
const TENGGAT_MS = 30_000;

/** Berapa pesan terakhir yang diambil per kanal. */
export const BATAS_PESAN = 500;

export interface KredensialSlack { token: string }

interface Kanal { id: string; name?: string; is_archived?: boolean; num_members?: number }
interface Pesan { ts?: string; text?: string; user?: string; bot_id?: string; subtype?: string }

async function panggil<T>(
  kred: KredensialSlack, metode: string, params: Record<string, string> = {},
): Promise<T & { ok: boolean; error?: string; response_metadata?: { next_cursor?: string } }> {
  const q = new URLSearchParams(params);
  const r = await fetch(`${API}/${metode}?${q}`, {
    headers: { authorization: `Bearer ${kred.token}` },
    signal: AbortSignal.timeout(TENGGAT_MS),
  });
  if (!r.ok) throw new Error(`Slack ${metode} HTTP ${r.status}`);
  const json = await r.json() as T & { ok: boolean; error?: string };
  if (!json.ok) {
    /* Galat Slack datang sebagai HTTP 200 dengan `ok:false` — memeriksa status
       HTTP saja membuat kegagalan otentikasi terbaca sebagai "tak ada kanal",
       dan pemiliknya menyimpulkan integrasinya bekerja tapi kosong. */
    const e = json.error ?? 'tidak diketahui';
    if (e === 'invalid_auth' || e === 'not_authed') throw new Error('Token Slack ditolak — periksa bot token-nya.');
    if (e === 'missing_scope') throw new Error('Cakupan (scope) bot Slack kurang: butuh channels:read & channels:history.');
    throw new Error(`Slack ${metode}: ${e}`);
  }
  return json as never;
}

/**
 * Kanal publik yang botnya ikut serta.
 *
 * `exclude_archived` dipasang di sisi Slack, bukan disaring belakangan: kanal
 * arsip bisa berjumlah ribuan di ruang kerja lama, dan menariknya semua lalu
 * membuangnya berarti membayar seluruh biayanya tanpa satu pun hasil.
 */
export async function daftarKanal(
  kred: KredensialSlack, batas = 200,
): Promise<{ kanal: Array<{ id: string; nama: string }>; terpotong: boolean }> {
  const out: Array<{ id: string; nama: string }> = [];
  let cursor = '';
  let terpotong = false;

  for (let putaran = 0; putaran < 10; putaran += 1) {
    const r = await panggil<{ channels: Kanal[] }>(kred, 'conversations.list', {
      types: 'public_channel', exclude_archived: 'true', limit: '200',
      ...(cursor ? { cursor } : {}),
    });
    for (const c of r.channels ?? []) {
      if (c.is_archived) continue;
      out.push({ id: c.id, nama: c.name ?? c.id });
      if (out.length >= batas) { terpotong = true; break; }
    }
    if (out.length >= batas) break;
    cursor = r.response_metadata?.next_cursor ?? '';
    if (!cursor) break;
    if (putaran === 9) terpotong = true;
  }
  return { kanal: out, terpotong };
}

/** Stempel waktu pesan terbaru — dipakai sebagai versi delta. */
export async function versiKanal(kred: KredensialSlack, id: string): Promise<string> {
  const r = await panggil<{ messages: Pesan[] }>(kred, 'conversations.history', {
    channel: id, limit: '1',
  });
  return r.messages?.[0]?.ts ?? '';
}

/**
 * Riwayat kanal sebagai teks.
 *
 * URUTANNYA DIBALIK jadi kronologis. Slack menjawab dari yang terbaru, dan
 * percakapan yang dibaca mundur kehilangan justru hal yang membuatnya berarti:
 * pertanyaan muncul setelah jawabannya.
 */
export async function isiKanal(
  kred: KredensialSlack, id: string, nama: string, batas = BATAS_PESAN,
): Promise<string> {
  const pesan: Pesan[] = [];
  let cursor = '';

  for (let putaran = 0; putaran < 10 && pesan.length < batas; putaran += 1) {
    const r = await panggil<{ messages: Pesan[] }>(kred, 'conversations.history', {
      channel: id, limit: String(Math.min(200, batas - pesan.length)),
      ...(cursor ? { cursor } : {}),
    });
    pesan.push(...(r.messages ?? []));
    cursor = r.response_metadata?.next_cursor ?? '';
    if (!cursor) break;
  }

  return susunTranskrip(pesan, nama);
}

/**
 * Susun transkrip. MURNI — supaya bentuknya bisa diuji tanpa jaringan.
 *
 * Pesan gabung/keluar kanal dibuang: ia mengisi ruang tanpa membawa satu pun
 * jawaban, dan pada kanal ramai jumlahnya bisa melampaui pesan sungguhan.
 */
export function susunTranskrip(pesan: Pesan[], nama: string): string {
  const DIBUANG = new Set(['channel_join', 'channel_leave', 'channel_topic', 'channel_purpose']);
  const baris = [...pesan]
    .filter((m) => !m.subtype || !DIBUANG.has(m.subtype))
    .filter((m) => (m.text ?? '').trim())
    .reverse()                                   // Slack menjawab terbaru dulu
    .map((m) => {
      const waktu = m.ts ? new Date(Number(m.ts) * 1000).toISOString().slice(0, 16).replace('T', ' ') : '';
      const siapa = m.user ?? m.bot_id ?? 'tak dikenal';
      return `[${waktu}] ${siapa}: ${m.text!.trim()}`;
    });
  return baris.length ? `# #${nama}\n\n${baris.join('\n')}` : '';
}
