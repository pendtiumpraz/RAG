/**
 * EKSPOR ADEGAN HLA — SVG + WebP, dibungkus satu ZIP.
 *
 * Tiga hal yang membuat ini tidak sesederhana "serialisasi lalu simpan":
 *
 * 1. SVG yang dirender lewat <img> TERISOLASI dari CSS halaman. Semua warna
 *    dan font adegan datang dari kelas (`sc-t`, `sc-box`) dan variabel
 *    (`--font-sans`). Diserialisasi apa adanya, hasilnya teks hitam Times New
 *    Roman tanpa warna — bukan yang terlihat di layar. Karena itu gayanya
 *    DISALIN masuk sebagai <style> dengan nilai yang sudah diresolusi.
 *
 * 2. Animasinya harus dibekukan pada KEADAAN AKHIR. Kelas `an-in` memulai
 *    dengan opacity 0; tanpa dibekukan, separuh gambar terekspor kosong.
 *
 * 3. ZIP ditulis sendiri, store-only, tanpa pustaka. WebP sudah terkompresi
 *    sehingga kompresi ulang tak berguna, dan menambah dependensi 100 KB
 *    untuk satu tombol ekspor bukan pertukaran yang masuk akal.
 */

/* ── penulis ZIP (store-only) ──────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Bytes): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * `Uint8Array<ArrayBuffer>` — bukan `Uint8Array` biasa.
 *
 * TypeScript modern membedakan buffer biasa dari SharedArrayBuffer, dan
 * `BlobPart` hanya menerima yang pertama. Menuliskannya eksplisit di sini
 * jauh lebih jujur daripada memaksa dengan `as` di tempat pemakaian.
 */
type Bytes = Uint8Array<ArrayBuffer>;

interface ZipEntry { name: string; data: Bytes }

/**
 * Susun ZIP tanpa kompresi (metode 0 = stored).
 *
 * Tanggalnya sengaja TETAP (1 Jan 2020), bukan waktu sekarang: ZIP yang
 * isinya sama harus menghasilkan berkas yang sama, supaya bisa dibandingkan
 * dan tak berubah hanya karena diunduh ulang.
 */
export function buildZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder();
  const locals: Bytes[] = [];
  const centrals: Bytes[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);   // tanda header lokal
    local.setUint16(4, 20, true);           // versi minimum
    local.setUint16(6, 0, true);            // flag
    local.setUint16(8, 0, true);            // metode 0 = stored
    local.setUint16(10, 0, true);           // waktu (tetap)
    local.setUint16(12, 0x5021, true);      // tanggal: 2020-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);           // panjang extra

    const lh = new Uint8Array(30 + name.length) as Bytes;
    lh.set(new Uint8Array(local.buffer), 0);
    lh.set(name, 30);
    locals.push(lh, e.data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, 0, true);
    central.setUint16(14, 0x5021, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);

    const ch = new Uint8Array(46 + name.length) as Bytes;
    ch.set(new Uint8Array(central.buffer), 0);
    ch.set(name, 46);
    centrals.push(ch);

    offset += lh.length + size;
  }

  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...locals, ...centrals, new Uint8Array(end.buffer) as Bytes],
    { type: 'application/zip' });
}

/* ── gaya adegan, diresolusi ke nilai harfiah ──────────────────────── */

/**
 * Gaya adegan yang harus IKUT masuk ke dalam SVG.
 *
 * Ditulis ulang di sini alih-alih dibaca dari stylesheet halaman, dan itu
 * disengaja: membaca `document.styleSheets` gagal begitu CSS-nya dilayani
 * dari domain lain, dan `getComputedStyle` per elemen menghasilkan berkas
 * berkali lipat besarnya. Yang dijaga adalah kesamaannya dengan dataroom.css
 * — ada uji yang membandingkan daftar kelasnya.
 */
function sceneStyle(): string {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, fb: string) => (cs.getPropertyValue(n).trim() || fb);
  const sans = v('--font-sans', 'Inter, system-ui, sans-serif');
  const mono = v('--font-mono', 'ui-monospace, monospace');

  return `
    text { white-space: pre; }
    .sc-t{ font-family:${sans}; font-size:11px; fill:#0F172A; font-weight:650 }
    .sc-s{ font-family:${sans}; font-size:9px;  fill:#475569 }
    .sc-m{ font-family:${mono}; font-size:8.5px; fill:#475569; letter-spacing:.04em }
    .sc-k{ font-family:${mono}; font-size:8px; fill:#94A3B8; letter-spacing:.16em; text-transform:uppercase }
    .sc-w{ fill:#fff }
    .sc-box{ fill:#fff; stroke:#D8E0EA; stroke-width:1.5 }
    .sc-box.hi{ stroke:#2563EB; stroke-width:2 }
    .sc-box.src{ stroke:#F59E0B; stroke-width:2 }
    .sc-box.ink{ fill:#0F172A; stroke:#0F172A }
    .sc-line{ stroke:#B6C2D2; stroke-width:1.5; fill:none }
    .sc-line.hi{ stroke:#2563EB }
    /* Animasi DIBEKUKAN pada keadaan akhir: kelas an-in mulai dari opacity 0,
       dan tanpa ini separuh gambar terekspor kosong. */
    .an-in,.an-pop{ opacity:1 !important; transform:none !important; animation:none !important }
    .an-draw,.an-mark{ stroke-dashoffset:0 !important; animation:none !important }
    .an-bar{ transform:none !important; animation:none !important }
    .an-pulse{ animation:none !important; opacity:.3 }
    .an-pkt{ display:none }
  `.replace(/\s+/g, ' ').trim();
}

/** SVG mandiri: gaya disalin masuk, latar putih ditambahkan. */
export function standaloneSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const box = svg.viewBox.baseVal;
  const w = box.width || svg.clientWidth || 760;
  const h = box.height || svg.clientHeight || 250;

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = sceneStyle();
  // Latar putih EKSPLISIT: SVG tanpa latar jadi transparan, dan teks navy di
  // atas transparan tak terbaca saat ditempel ke dokumen berlatar gelap.
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
  bg.setAttribute('width', String(w)); bg.setAttribute('height', String(h));
  bg.setAttribute('fill', '#ffffff');

  clone.insertBefore(bg, clone.firstChild);
  clone.insertBefore(style, clone.firstChild);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
}

/** SVG → WebP. Skala 2× supaya tetap tajam saat ditempel & di-zoom. */
export async function svgToWebp(svgText: string, w: number, h: number, scale = 2): Promise<Bytes> {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('SVG gagal dimuat sebagai gambar'));
      img.src = url;
    });
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/webp', 0.92));
    if (!blob) throw new Error('Peramban ini tak bisa membuat WebP');
    return new Uint8Array(await blob.arrayBuffer()) as Bytes;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Nama berkas yang aman & berurutan: "03-tiga-kaki-pencarian". */
export function slideFileName(i: number, title: string): string {
  const slug = title.toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return `${String(i + 1).padStart(2, '0')}-${slug || 'slide'}`;
}
