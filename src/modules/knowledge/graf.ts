/**
 * GRAF PENGETAHUAN — bentuk dan tata letaknya, murni.
 *
 * Diminta pemilik produk (1 Agu 2026): peta yang memperlihatkan chatbot mana
 * memakai knowledge base mana, dan mana yang BERBAGI. Chatbot di tepi
 * lingkaran, knowledge di tengah, garis HANYA pada yang benar-benar
 * terhubung.
 *
 * DATANYA SUDAH ADA. `chatbot_knowledge_bases` memang N:M sejak D11: satu KB
 * boleh dipakai banyak chatbot, dan itulah "berbagi" dalam arti yang paling
 * langsung. Jadi berkas ini tak menemukan hubungan apa pun — ia hanya
 * menggambar hubungan yang sudah tercatat. Itu perbedaan yang penting: graf
 * yang MENYIMPULKAN hubungan akan memajang garis yang tak pernah ada, dan
 * orang mempercayainya karena ia digambar.
 *
 * SVG murni, tanpa pustaka graf. Peta sebesar ini (puluhan simpul) tak
 * menuntut mesin tata letak, dan menambah pustaka berarti menambah berat
 * halaman untuk sesuatu yang bisa dihitung dengan sinus-kosinus.
 */

export interface SimpulChatbot { id: string; nama: string }
export interface SimpulKb { id: string; nama: string; potongan: number }
export interface Sisi { chatbotId: string; kbId: string }

export interface Titik { x: number; y: number }
export interface SimpulTerletak<T> { data: T; titik: Titik }

/**
 * Sebaran melingkar.
 *
 * Dimulai dari ATAS (-90°) dan bukan dari kanan (0°), karena mata membaca
 * lingkaran dari puncaknya — dan simpul pertama yang mendarat di sisi kanan
 * membuat urutannya terasa acak walau sebenarnya tidak.
 *
 * Satu simpul ditaruh di TENGAH lingkaran, bukan di tepi jam dua belas: titik
 * tunggal di pinggir lingkaran kosong terbaca sebagai kesalahan gambar.
 */
export function lingkaran(n: number, jari: number, pusat: Titik): Titik[] {
  if (n <= 0) return [];
  if (n === 1) return [{ ...pusat }];
  return Array.from({ length: n }, (_, i) => {
    const sudut = (i / n) * Math.PI * 2 - Math.PI / 2;
    return {
      x: pusat.x + Math.cos(sudut) * jari,
      y: pusat.y + Math.sin(sudut) * jari,
    };
  });
}

export interface Graf {
  chatbot: Array<SimpulTerletak<SimpulChatbot>>;
  kb: Array<SimpulTerletak<SimpulKb>>;
  sisi: Sisi[];
  /** KB yang dipakai LEBIH DARI SATU chatbot — inilah "berbagi". */
  berbagi: Set<string>;
  /** KB yang tak dipakai chatbot mana pun. */
  kbYatim: Set<string>;
  /** Chatbot yang tak punya KB sama sekali. */
  chatbotYatim: Set<string>;
}

/**
 * Susun graf lengkap beserta letaknya.
 *
 * SISI YANG MENUNJUK SIMPUL TAK DIKENAL DIBUANG. Baris assignment bisa
 * menunjuk chatbot atau KB yang sudah di-soft-delete — tanpa FK (Rule #2) tak
 * ada yang mencegahnya — dan menggambar garis ke simpul yang tak ada
 * menghasilkan garis yang berujung di kehampaan. Lebih buruk lagi: ia
 * membuat "berbagi" terhitung lebih banyak dari kenyataannya.
 */
export function susunGraf(input: {
  chatbot: SimpulChatbot[];
  kb: SimpulKb[];
  sisi: Sisi[];
  lebar: number;
  tinggi: number;
}): Graf {
  const pusat = { x: input.lebar / 2, y: input.tinggi / 2 };
  /* Chatbot di TEPI, knowledge di TENGAH — persis seperti yang diminta.
     Jari-jari dalam dibuat 0,42 dari luar supaya garisnya cukup panjang untuk
     terbaca arahnya, tapi tak sampai membuat simpul tengah bertumpuk. */
  const jariLuar = Math.min(input.lebar, input.tinggi) / 2 - 70;
  const jariDalam = jariLuar * 0.42;

  const chatbot = lingkaran(input.chatbot.length, jariLuar, pusat)
    .map((titik, i) => ({ data: input.chatbot[i], titik }));
  const kb = lingkaran(input.kb.length, jariDalam, pusat)
    .map((titik, i) => ({ data: input.kb[i], titik }));

  const adaChatbot = new Set(input.chatbot.map((c) => c.id));
  const adaKb = new Set(input.kb.map((k) => k.id));
  const sisi = input.sisi.filter((s) => adaChatbot.has(s.chatbotId) && adaKb.has(s.kbId));

  const perKb = new Map<string, Set<string>>();
  const perChatbot = new Map<string, Set<string>>();
  for (const s of sisi) {
    if (!perKb.has(s.kbId)) perKb.set(s.kbId, new Set());
    perKb.get(s.kbId)!.add(s.chatbotId);
    if (!perChatbot.has(s.chatbotId)) perChatbot.set(s.chatbotId, new Set());
    perChatbot.get(s.chatbotId)!.add(s.kbId);
  }

  return {
    chatbot,
    kb,
    sisi,
    berbagi: new Set([...perKb].filter(([, v]) => v.size > 1).map(([k]) => k)),
    kbYatim: new Set(input.kb.filter((k) => !perKb.has(k.id)).map((k) => k.id)),
    chatbotYatim: new Set(input.chatbot.filter((c) => !perChatbot.has(c.id)).map((c) => c.id)),
  };
}

/**
 * Kelompokkan per chatbot — mode tampilan kedua yang diminta.
 *
 * Chatbot yang TAK punya KB tetap ikut, dengan daftar kosong. Membuangnya
 * akan menyembunyikan persis kasus yang paling perlu dilihat: chatbot yang
 * sudah dipasang di situs pelanggan tapi tak punya pengetahuan apa pun, dan
 * karena itu menjawab "tidak ada di dokumen" untuk segalanya.
 */
export function perChatbot(input: {
  chatbot: SimpulChatbot[]; kb: SimpulKb[]; sisi: Sisi[];
}): Array<{ chatbot: SimpulChatbot; kb: SimpulKb[] }> {
  const petaKb = new Map(input.kb.map((k) => [k.id, k]));
  return input.chatbot.map((c) => ({
    chatbot: c,
    kb: input.sisi
      .filter((s) => s.chatbotId === c.id)
      .map((s) => petaKb.get(s.kbId))
      .filter((k): k is SimpulKb => !!k),
  }));
}
