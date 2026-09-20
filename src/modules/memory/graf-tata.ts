/**
 * TATA LETAK GRAF MEMORY — fisika + penyaringan, dipisah dari kanvas supaya
 * BISA DIUKUR tanpa browser.
 *
 * KENAPA ADA. Graf memory chatbot "Asisten PDP" menumpuk jadi satu bola di
 * tengah dan tak terbaca (dilaporkan 20 Sep 2026). Diukur di produksi, bukan
 * diduga — dan angkanya menunjuk satu sebab yang jelas:
 *
 *     Asisten PDP   225 catatan · 2.165 sisi  → derajat rata-rata 19,2
 *     hr            115 catatan ·   270 sisi  → 4,7
 *     Kepatuhan      42 catatan ·   108 sisi  → 5,1
 *
 * Hanya PDP yang runtuh, dan itu bukan kebetulan. Tiga hal bekerja bersama:
 *
 * 1 · PEGAS TAK DINORMALISASI. Tiap sisi menarik dengan gaya yang sama, jadi
 *     node berderajat 19 menerima 19 tarikan sementara repulsinya DIBATASI
 *     3,5 per pasangan. Pada derajat 5 keduanya seimbang; pada derajat 19
 *     pegas menang berlipat dan seluruh graf menciut ke satu titik. Node yang
 *     paling ter-link — yang justru paling ingin dilihat orang — paling dalam
 *     terkubur.
 *
 * 2 · UKURAN TATA LETAK TETAP. Panjang rehat pegas 62 px dan sebaran awal
 *     60–172 px dipakai untuk 40 node maupun 1.000. Fruchterman–Reingold
 *     sudah lama menyatakan panjang ideal sisi sebanding √(luas/N): jarak
 *     harus TUMBUH bersama jumlah node, kalau tidak ruangnya memang tak ada.
 *
 * 3 · 1.655 DARI 2.165 SISI ADALAH KEMIRIPAN. Sisi kemiripan lahir dari
 *     ambang kosinus, jadi sekelompok catatan bertopik dekat membentuk
 *     hampir-klik: tiap anggota tersambung ke tiap anggota lain. Meski
 *     fisikanya benar, menggambar semuanya tetap menghasilkan bubur garis.
 *
 * Yang TIDAK dilakukan: membuang data. Sisi kemiripan tetap ada di basis data
 * dan tetap dipakai retrieval; yang dibatasi hanya berapa yang DIGAMBAR, dan
 * batas itu ditunjukkan apa adanya di layar supaya tak ada yang menyangka
 * grafnya lebih sepi daripada kenyataannya.
 */

/** Satu sisi dari API graf. */
export interface SisiGraf { from: string; to: string; kind: string; weight: number }

/** Derajat tiap node — dipakai ukuran node, normalisasi pegas, dan ambang label. */
export function hitungDerajat(sisi: Array<{ from: string; to: string }>): Map<string, number> {
  const d = new Map<string, number>();
  for (const e of sisi) {
    d.set(e.from, (d.get(e.from) ?? 0) + 1);
    d.set(e.to, (d.get(e.to) ?? 0) + 1);
  }
  return d;
}

/** Derajat rata-rata: 2E/N. Inilah angka yang membedakan graf terbaca dari bubur. */
export function derajatRataRata(jumlahNode: number, jumlahSisi: number): number {
  return jumlahNode > 0 ? (2 * jumlahSisi) / jumlahNode : 0;
}

/**
 * Berapa sisi kemiripan per node yang layak digambar, dihitung dari
 * kepadatannya sendiri.
 *
 * Graf yang memang sepi tak boleh ikut dipangkas — pada `hr` dan `Kepatuhan`
 * (derajat 4,7 dan 5,1) tiap sisi masih terbaca, dan memangkasnya hanya
 * menghilangkan struktur yang benar. Pemangkasan baru masuk akal ketika
 * derajatnya sudah melewati apa yang bisa ditelusuri mata.
 *
 * `Infinity` berarti "gambar semuanya".
 */
export function batasOtomatis(derajatRata: number): number {
  if (derajatRata <= 8) return Infinity;
  if (derajatRata <= 14) return 4;
  return 3;
}

/**
 * Batasi sisi KEMIRIPAN ke `k` terkuat per node; wikilink tak pernah dibuang.
 *
 * Wikilink adalah tautan yang DITULIS agen memory — ia struktur, bukan
 * kedekatan statistik. Membuangnya berarti membuang satu-satunya bagian graf
 * yang punya makna eksplisit.
 *
 * Sebuah sisi kemiripan lolos bila ia masuk k-terkuat milik SALAH SATU
 * ujungnya (union, bukan irisan). Dengan irisan, node sepi yang tetangga
 * terdekatnya adalah sebuah hub akan kehilangan satu-satunya sisinya dan
 * menggantung sebagai titik lepas — yang justru membuat graf lebih
 * membingungkan, bukan lebih bersih.
 */
export function batasiKemiripan(sisi: SisiGraf[], k: number): { sisi: SisiGraf[]; dibuang: number } {
  if (!Number.isFinite(k)) return { sisi, dibuang: 0 };

  const mirip = sisi.filter((e) => e.kind !== 'wikilink');
  const perNode = new Map<string, SisiGraf[]>();
  for (const e of mirip) {
    (perNode.get(e.from) ?? perNode.set(e.from, []).get(e.from)!).push(e);
    (perNode.get(e.to) ?? perNode.set(e.to, []).get(e.to)!).push(e);
  }

  const lolos = new Set<SisiGraf>();
  for (const daftar of perNode.values()) {
    daftar.sort((a, b) => b.weight - a.weight);
    for (const e of daftar.slice(0, Math.max(0, k))) lolos.add(e);
  }

  const hasil = sisi.filter((e) => e.kind === 'wikilink' || lolos.has(e));
  return { sisi: hasil, dibuang: sisi.length - hasil.length };
}

/**
 * Ambang derajat supaya paling banyak `maks` label tergambar sekaligus.
 *
 * Aturan lama `deg >= 6` adalah ambang MUTLAK, dan di graf padat ia berlaku
 * untuk hampir semua node: pada PDP (derajat rata-rata 19) itu berarti 225
 * label digambar bertumpuk — sebab kedua "tak bisa dibaca", yang berdiri
 * sendiri terpisah dari fisikanya. Ambang yang benar bersifat PERINGKAT:
 * tunjukkan hub teratas saja, berapa pun derajat absolutnya.
 */
export function ambangLabel(derajat: number[], maks = 14): number {
  if (derajat.length <= maks) return 0;
  const urut = [...derajat].sort((a, b) => b - a);
  return urut[maks - 1] + 1;
}

/** Kotak teks satu label pada koordinat dunia. */
export interface KotakLabel { x: number; y: number; lebar: number; tinggi: number }

/**
 * Buang label yang akan MENIMPA label lain — yang datang duluan menang.
 *
 * Membatasi jumlah label saja tak cukup: hub justru berkumpul di pusat
 * gugusnya, jadi belasan label bisa tetap bertumpuk di satu tempat sementara
 * tepi graf kosong melompong. Terlihat langsung pada graf PDP sesudah
 * fisikanya dibetulkan — 11 label, dan beberapa masih saling tindih.
 *
 * Pemanggil mengurutkan kandidat menurut PRIORITAS lebih dulu (yang disorot,
 * lalu hub terbesar), karena yang pertama dalam daftar inilah yang
 * dipertahankan saat dua label bertabrakan.
 */
export function saringTumpang<T extends KotakLabel>(kandidat: T[]): T[] {
  const simpan: T[] = [];
  for (const k of kandidat) {
    const bentrok = simpan.some((s) =>
      k.x < s.x + s.lebar && k.x + k.lebar > s.x
      && k.y < s.y + s.tinggi && k.y + k.tinggi > s.y);
    if (!bentrok) simpan.push(k);
  }
  return simpan;
}

/** Konstanta fisika yang ikut tumbuh bersama jumlah node. */
export interface ParameterFisika {
  repulsi: number; maksGaya: number;
  pegasWiki: number; pegasMirip: number;
  panjangWiki: number; panjangMirip: number;
  gravitasi: number; redam: number; maksKecepatan: number;
  denyut: number; sebarAwal: number;
}

/**
 * Parameter tata letak untuk `n` node.
 *
 * 40 node = graf "normal" tempat nilai lama sudah terbukti enak dilihat, jadi
 * di sanalah skalanya 1 dan perilakunya tak berubah sedikit pun. Di atasnya
 * jarak, repulsi, dan kecepatan maksimum tumbuh bersama √(n/40) — dibatasi 3
 * supaya graf raksasa tak melesat keluar layar sebelum sempat dirapikan.
 */
export function parameterFisika(n: number): ParameterFisika {
  const s = Math.min(3, Math.max(1, Math.sqrt(Math.max(1, n) / 40)));
  return {
    repulsi: 2400 * s * s,
    /* Tutup gaya ikut tumbuh: tanpa ini repulsi jarak-dekat tetap terkunci di
       3,5 sementara jumlah pegas yang melawannya bertambah. */
    maksGaya: 3.5 * s,
    /* Wikilink kaku (struktur), kemiripan lunak dan lebih panjang (kedekatan).
       Dua nilai berbeda inilah yang membuat gugus topik saling berdekatan
       tanpa menempel jadi satu bola. */
    pegasWiki: 0.05,
    pegasMirip: 0.012,
    panjangWiki: 62 * s,
    panjangMirip: 96 * s,
    /* Gravitasi MELEMAH saat tata letak membesar — kalau tetap, ia menarik
       tepi graf besar dengan gaya sebanding jaraknya dan meniadakan seluruh
       pelebaran di atas. */
    gravitasi: 0.005 / s,
    redam: 0.9,
    maksKecepatan: 7 * s,
    denyut: 0.045,
    sebarAwal: 60 * s,
  };
}

/** Node dalam simulasi. */
export interface NodeSim {
  id: string; x: number; y: number; vx: number; vy: number;
  r: number; deg: number; seed: number;
}
/** Sisi dalam simulasi — sudah menunjuk node, bukan id. */
export interface SisiSim { a: NodeSim; b: NodeSim; wiki: boolean }

/**
 * Satu langkah simulasi. Mengembalikan `alpha` berikutnya.
 *
 * Murni terhadap waktu & masukan: tak menyentuh DOM, kanvas, maupun
 * `window` — itulah yang membuat perilakunya bisa DIUKUR di tes alih-alih
 * dinilai dengan mata di layar.
 */
export function langkah(
  nodes: NodeSim[], links: SisiSim[], p: ParameterFisika,
  alpha: number, waktu: number, seret: NodeSim | null = null,
): number {
  const t = waktu * 0.00035;

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      // Dua node berimpit: dorong ke arah acak, kalau tidak gayanya tak
      // berhingga dan seluruh graf meledak.
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
      const f = Math.min(p.repulsi / d2, p.maksGaya) * alpha;
      const d = Math.sqrt(d2);
      a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
    a.vx -= a.x * p.gravitasi; a.vy -= a.y * p.gravitasi;
    // Denyut: tiap node punya fasenya sendiri → mengambang, bukan bergetar.
    a.vx += Math.cos(t + a.seed) * p.denyut;
    a.vy += Math.sin(t * 1.13 + a.seed * 1.7) * p.denyut;
  }

  for (const l of links) {
    const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const rehat = l.wiki ? p.panjangWiki : p.panjangMirip;
    const f = (l.wiki ? p.pegasWiki : p.pegasMirip) * (d - rehat);
    /* DINORMALISASI DERAJAT — inti perbaikannya. Tanpa pembagian ini, node
       berderajat 19 menerima 19 tarikan penuh sementara repulsinya bertutup,
       dan graf padat pasti menciut. Akar (bukan pembagian penuh) dipilih
       supaya hub tetap tertarik lebih kuat daripada node sepi — hierarkinya
       terjaga, keruntuhannya tidak. */
    const na = f / Math.sqrt(Math.max(1, l.a.deg));
    const nb = f / Math.sqrt(Math.max(1, l.b.deg));
    l.a.vx += (dx / d) * na; l.a.vy += (dy / d) * na;
    l.b.vx -= (dx / d) * nb; l.b.vy -= (dy / d) * nb;
  }

  for (const n of nodes) {
    if (n === seret) { n.vx = 0; n.vy = 0; continue; }
    n.vx *= p.redam; n.vy *= p.redam;
    const v = Math.hypot(n.vx, n.vy);
    if (v > p.maksKecepatan) {
      n.vx = (n.vx / v) * p.maksKecepatan; n.vy = (n.vy / v) * p.maksKecepatan;
    }
    n.x += n.vx; n.y += n.vy;
  }

  return alpha > 1 ? Math.max(1, alpha * 0.985) : 1;
}

/**
 * Zoom + geser supaya SELURUH graf masuk viewport.
 *
 * Fisika yang benar saja tak cukup: graf 225 node yang sudah melebar dengan
 * benar tetap tak terbaca bila viewport-nya masih memperlihatkan petak 460 px
 * di tengahnya. Dulu satu-satunya jalan adalah menggulir dan menyeret sampai
 * ketemu — pekerjaan yang seharusnya dikerjakan sekali oleh program.
 */
export function pasKeLayar(
  nodes: Array<{ x: number; y: number; r: number }>, W: number, H: number,
  tepi = 28, maks = 4, min = 0.05,
): { scale: number; tx: number; ty: number } {
  if (!nodes.length || W <= 0 || H <= 0) return { scale: 1, tx: W / 2, ty: H / 2 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r);
    x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r);
  }
  const lebar = Math.max(1, x1 - x0), tinggi = Math.max(1, y1 - y0);
  const scale = Math.min(maks, Math.max(min,
    Math.min((W - tepi * 2) / lebar, (H - tepi * 2) / tinggi)));
  return {
    scale,
    tx: W / 2 - ((x0 + x1) / 2) * scale,
    ty: H / 2 - ((y0 + y1) / 2) * scale,
  };
}
