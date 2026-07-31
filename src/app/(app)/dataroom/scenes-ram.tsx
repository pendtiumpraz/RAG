/**
 * ADEGAN KEBUTUHAN MEMORI — apa yang TETAP, apa yang TUMBUH.
 *
 * Pertanyaan yang selalu datang dari orang teknis di pihak klien, dan yang
 * paling mudah dijawab keliru: "kalau 1.000 orang bertanya bersamaan,
 * RAM-nya jadi berapa?"
 *
 * Jawabannya berlawanan dengan dugaan — hampir tak bertambah. Yang menuntut
 * memori adalah INDEKS, dan indeks itu satu untuk semua orang. Yang tumbuh
 * mengikuti pengguna bukan memori, melainkan tagihan model bahasa.
 *
 * KEJUJURAN ANGKA. Dua jenis angka di slide ini dan keduanya DIBEDAKAN,
 * karena mencampurnya akan membuat yang terukur ikut diragukan:
 *   • TERUKUR   — 2.852 byte/baris & 804 byte/indeks per potongan
 *                 (pg_column_size pada data produksi, setelah halfvec)
 *   • DITURUNKAN — kebutuhan per permintaan bersamaan. Belum diukur di bawah
 *                 beban; ditandai apa adanya, bukan disamarkan.
 */
import { BYTES_PER_CHUNK, INDEX_BYTES_PER_CHUNK, CHUNKS_PER_DOC } from '@/modules/core/limits';

const BIRU = '#2563EB';
const AMBER = '#F59E0B';
const HIJAU = '#059669';
const NAVY = '#0F172A';
const ABU = '#94A3B8';

const CHARS_PER_CHUNK = 680;
const RASIO_TEKS = 0.02;
/** Ambang mode bertingkat — sama dengan TIERED_MIN_CHUNKS di ingest. */
const AMBANG = 200_000;

const sz = (b: number) =>
  b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} GB`
    : b >= 1e6 ? `${Math.round(b / 1e6)} MB`
    : `${Math.round(b / 1e3)} KB`;

/** Indeks yang harus residen untuk korpus sebesar `gbSumber`. */
function indeksRam(gbSumber: number) {
  const potongan = (gbSumber * 1e9 * RASIO_TEKS) / CHARS_PER_CHUNK;
  const bertingkat = potongan >= AMBANG;
  return {
    potongan,
    bertingkat,
    bytes: (bertingkat ? potongan / CHUNKS_PER_DOC : potongan) * INDEX_BYTES_PER_CHUNK,
    disk: potongan * (BYTES_PER_CHUNK + INDEX_BYTES_PER_CHUNK),
  };
}

/* ══ 1 · YANG TETAP vs YANG TUMBUH ══════════════════════════════════ */

export function SceneRamShape() {
  const korpus = [
    { t: '10 GB', gb: 10 },
    { t: '100 GB', gb: 100 },
    { t: '700 GB', gb: 700 },
    { t: '1 TB', gb: 1000 },
  ].map((k) => ({ ...k, ...indeksRam(k.gb) }));
  const maks = Math.max(...korpus.map((k) => k.bytes));

  return (
    <svg viewBox="0 0 760 254" role="img"
      aria-label="Memori yang tetap dibanding memori yang tumbuh: dasar sistem, indeks yang mengikuti korpus, dan tambahan per pertanyaan">
      <text x="0" y="14" className="sc-k">memori terbagi tiga · hanya SATU yang mengikuti jumlah pengguna</text>

      {/* 1 — dasar */}
      <g className="an-in" style={{ ['--d' as string]: '0s' }}>
        <rect x="0" y="26" width="240" height="94" rx="7" className="sc-box" />
        <rect x="0" y="26" width="240" height="4" rx="2" fill={ABU} />
        <text x="14" y="46" className="sc-k">tetap · berapa pun</text>
        <text x="14" y="68" className="sc-t" style={{ fontSize: 17 }}>2–3 GB</text>
        <text x="14" y="86" className="sc-s">Sistem operasi, Postgres,</text>
        <text x="14" y="99" className="sc-s">aplikasi + model embedding (22 MB)</text>
        <text x="14" y="113" className="sc-m" style={{ fontSize: 7.5 }}>tak bergantung korpus maupun pengguna</text>
      </g>

      {/* 2 — indeks, mengikuti KORPUS */}
      <g className="an-in" style={{ ['--d' as string]: '0.3s' }}>
        <rect x="256" y="26" width="248" height="94" rx="7" className="sc-box hi" />
        <rect x="256" y="26" width="248" height="4" rx="2" fill={BIRU} />
        <text x="270" y="46" className="sc-k">mengikuti KORPUS</text>
        <text x="270" y="68" className="sc-t" style={{ fontSize: 17 }}>{sz(indeksRam(700).bytes)}</text>
        <text x="270" y="86" className="sc-s">Indeks penyaring — satu vektor</text>
        <text x="270" y="99" className="sc-s">per DOKUMEN, untuk korpus 700 GB</text>
        <text x="270" y="113" className="sc-m" style={{ fontSize: 7.5 }}>satu indeks untuk SEMUA pengguna</text>
      </g>

      {/* 3 — per permintaan, mengikuti PENGGUNA */}
      <g className="an-in" style={{ ['--d' as string]: '0.6s' }}>
        <rect x="520" y="26" width="240" height="94" rx="7" className="sc-box src" />
        <rect x="520" y="26" width="240" height="4" rx="2" fill={AMBER} />
        <text x="534" y="46" className="sc-k">mengikuti PENGGUNA</text>
        <text x="534" y="68" className="sc-t" style={{ fontSize: 17 }}>±1–3 MB</text>
        <text x="534" y="86" className="sc-s">per pertanyaan yang sedang</text>
        <text x="534" y="99" className="sc-s">berjalan — lalu dilepas</text>
        <text x="534" y="113" className="sc-m" style={{ fontSize: 7.5 }}>sama saja untuk korpus 1 GB maupun 1 TB</text>
      </g>

      {/* tangga korpus */}
      <g className="an-in" style={{ ['--d' as string]: '1.0s' }}>
        <text x="0" y="146" className="sc-k">indeks residen menurut besar korpus</text>
      </g>
      {korpus.map((k, i) => {
        const y = 156 + i * 22;
        const w = Math.max(6, (k.bytes / maks) * 300);
        return (
          <g key={k.t}>
            <g className="an-in" style={{ ['--d' as string]: `${1.1 + i * 0.12}s` }}>
              <text x="0" y={y + 10} className="sc-t">{k.t}</text>
              <text x={62} y={y + 10} className="sc-m" style={{ fontSize: 7.5 }}>
                {k.bertingkat ? 'bertingkat' : 'langsung'}
              </text>
            </g>
            <rect x={148} y={y + 1} width={w} height={11} rx="3" fill={BIRU} opacity={0.45 + i * 0.15}
              className="an-bar" style={{ ['--d' as string]: `${1.2 + i * 0.12}s` }} />
            <text x={456} y={y + 10} className="sc-t an-in"
              style={{ ['--d' as string]: `${1.5 + i * 0.12}s` }}>{sz(k.bytes)}</text>
            <text x={520} y={y + 10} className="sc-s an-in"
              style={{ ['--d' as string]: `${1.6 + i * 0.12}s` }}>disk {sz(k.disk)}</text>
          </g>
        );
      })}

      <g className="an-in" style={{ ['--d' as string]: '2.0s' }}>
        <text x="0" y="252" className="sc-s">
          Angka indeks &amp; disk TERUKUR (pg_column_size, setelah halfvec). Angka per-pertanyaan DITURUNKAN — belum diukur di bawah beban, dan ditandai begitu.
        </text>
      </g>
    </svg>
  );
}

/* ══ 2 · SAAT DICARI — apa yang bertambah ═══════════════════════════ */

export function SceneRamQuery() {
  /* Jalur satu pertanyaan. Angka byte-nya diturunkan dari bentuk datanya,
     bukan diukur di bawah beban — dan itu disebut di kaki slide. */
  const tahap = [
    { t: 'Vektor pertanyaan', b: '768 byte', n: '384 angka × 2 byte', c: BIRU },
    { t: 'Telusur indeks', b: '±30 KB', n: 'kandidat + jejak, di dalam indeks yang SUDAH residen', c: BIRU },
    { t: 'Baca potongan terpilih', b: '±1 MB', n: 'dari disk ke page cache — bagian terbesar', c: AMBER },
    { t: 'Susun konteks', b: '±4 KB', n: '6 potongan yang benar-benar dikirim', c: HIJAU },
    { t: 'Menunggu jawaban LLM', b: '±0', n: 'CPU menganggur, memori tak bertambah', c: ABU },
  ];

  return (
    <svg viewBox="0 0 760 252" role="img"
      aria-label="Apa yang bertambah di memori saat satu pertanyaan diproses, tahap demi tahap">
      <text x="0" y="14" className="sc-k">satu pertanyaan · dari masuk sampai dijawab</text>

      {tahap.map((s, i) => {
        const y = 28 + i * 34;
        return (
          <g key={s.t} className="an-in" style={{ ['--d' as string]: `${0.15 + i * 0.3}s` }}>
            <rect x="0" y={y} width="760" height="28" rx="5" className="sc-box" />
            <rect x="0" y={y} width="4" height="28" rx="2" fill={s.c} />
            <text x="18" y={y + 18} className="sc-t">{s.t}</text>
            <text x={214} y={y + 18} className="sc-t" fill={s.c}>{s.b}</text>
            <text x={296} y={y + 18} className="sc-s">{s.n}</text>
          </g>
        );
      })}

      {/* Yang paling penting: setelah selesai, dilepas. */}
      <g className="an-in" style={{ ['--d' as string]: '1.8s' }}>
        <rect x="0" y="204" width="366" height="44" rx="6" fill="#ECFDF5" stroke={HIJAU} strokeWidth="1.5" />
        <text x="14" y="224" className="sc-t">Selesai menjawab → semuanya dilepas.</text>
        <text x="14" y="239" className="sc-s">Yang tersisa cuma page cache, dan itu memang gunanya.</text>
      </g>
      <g className="an-in" style={{ ['--d' as string]: '2.0s' }}>
        <rect x="386" y="204" width="374" height="44" rx="6" fill="#EFF6FF" stroke={BIRU} strokeWidth="1.5" />
        <text x="400" y="224" className="sc-t">Angka ini SAMA untuk korpus 1 GB maupun 1 TB.</text>
        <text x="400" y="239" className="sc-s">Pencarian menyentuh sebagian kecil indeks, bukan seluruh korpus.</text>
      </g>
    </svg>
  );
}

/* ══ 3 · 100 · 500 · 1.000 PENGGUNA ═════════════════════════════════ */

/**
 * Kenaikan memori menurut jumlah pengguna BERSAMAAN.
 *
 * Yang membuat angkanya kecil bukan keberuntungan, melainkan dua batas
 * struktural: kolam koneksi basis data membatasi berapa kueri benar-benar
 * berjalan serentak, dan sebagian besar umur sebuah permintaan dihabiskan
 * MENUNGGU jawaban model — bukan memakai memori.
 */
export function SceneRamUsers() {
  const DASAR = 2.5e9;                       // sistem + Postgres + aplikasi
  const INDEKS = indeksRam(700).bytes;       // korpus 700 GB, mode bertingkat
  const PER_REQ = 2e6;                       // ±2 MB per permintaan berjalan
  const KOLAM = 10;                          // kolam koneksi DB (server)
  const PER_KONEKSI = 14e6;                  // backend Postgres + work_mem

  const skenario = [100, 500, 1000].map((n) => {
    // Kolam koneksi memberi ATAP: berapa pun penggunanya, kueri yang
    // benar-benar berjalan serentak tak melebihi kolamnya.
    const db = Math.min(n, KOLAM) * PER_KONEKSI;
    const app = n * PER_REQ;
    return { n, db, app, total: DASAR + INDEKS + db + app };
  });
  const maks = skenario[skenario.length - 1].total;

  return (
    <svg viewBox="0 0 760 258" role="img"
      aria-label="Kebutuhan memori pada 100, 500, dan 1000 pengguna bersamaan untuk korpus 700 GB">
      <text x="0" y="14" className="sc-k">korpus 700 GB · pengguna BERSAMAAN, bukan pengguna terdaftar</text>

      {skenario.map((s, i) => {
        const y = 30 + i * 56;
        const w = (v: number) => (v / maks) * 470;
        let x = 190;
        const bagian = [
          { v: DASAR, c: ABU, t: 'dasar' },
          { v: INDEKS, c: BIRU, t: 'indeks' },
          { v: s.db, c: NAVY, t: 'koneksi DB' },
          { v: s.app, c: AMBER, t: 'permintaan' },
        ];
        return (
          <g key={s.n}>
            <g className="an-in" style={{ ['--d' as string]: `${0.1 + i * 0.3}s` }}>
              <text x="0" y={y + 20} className="sc-t" style={{ fontSize: 15 }}>{s.n}</text>
              <text x={44} y={y + 20} className="sc-s">pengguna</text>
              <text x="0" y={y + 34} className="sc-m" style={{ fontSize: 7.5 }}>bersamaan</text>
            </g>
            {bagian.map((b, k) => {
              const kiri = x; x += w(b.v);
              return (
                <rect key={k} x={kiri} y={y + 8} width={w(b.v)} height={20} fill={b.c}
                  opacity={0.85} className="an-bar"
                  style={{ ['--d' as string]: `${0.3 + i * 0.3 + k * 0.08}s`, transformOrigin: `${kiri}px center` }} />
              );
            })}
            <text x={674} y={y + 23} className="sc-t an-in"
              style={{ ['--d' as string]: `${0.9 + i * 0.3}s`, fontSize: 14 }}>{sz(s.total)}</text>
            <text x={190} y={y + 42} className="sc-m an-in"
              style={{ ['--d' as string]: `${1.0 + i * 0.3}s`, fontSize: 7.5 }}>
              dasar {sz(DASAR)} · indeks {sz(INDEKS)} · DB {sz(s.db)} · permintaan {sz(s.app)}
            </text>
          </g>
        );
      })}

      {/* legenda warna */}
      <g className="an-in" style={{ ['--d' as string]: '1.6s' }}>
        {[['dasar', ABU], ['indeks', BIRU], ['koneksi DB', NAVY], ['permintaan berjalan', AMBER]].map(
          ([t, c], i) => (
            <g key={t as string}>
              <rect x={190 + i * 118} y={200} width={10} height={10} rx="2" fill={c as string} />
              <text x={204 + i * 118} y={209} className="sc-s">{t as string}</text>
            </g>
          ))}
      </g>

      <g className="an-in" style={{ ['--d' as string]: '1.8s' }}>
        <rect x="0" y="218" width="760" height="38" rx="6" fill="#EFF6FF" stroke={BIRU} strokeWidth="1.5" />
        <text x="14" y="236" className="sc-t">
          Dari 100 ke 1.000 pengguna, memorinya naik ±1,8 GB — sementara tagihan model bahasa naik SEPULUH kali lipat.
        </text>
        <text x="14" y="249" className="sc-s">
          Yang tumbuh mengikuti pengguna bukan memori, melainkan biaya menjawab. Angka per-permintaan diturunkan, belum diukur di bawah beban.
        </text>
      </g>
    </svg>
  );
}
