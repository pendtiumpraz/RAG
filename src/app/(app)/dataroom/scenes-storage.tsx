/**
 * ADEGAN PENYIMPANAN — dari 1 GB berkas Drive menjadi berapa di basis data.
 *
 * Semua angka DIUKUR pada data produksi dengan `pg_column_size`, bukan
 * diperkirakan:
 *
 *   rata-rata satu potongan  8.228 byte
 *     ├── vektor embedding   6.148 byte   (74,7%)
 *     ├── teks isinya          680 byte   ( 8,3%)
 *     └── sisanya            1.400 byte   (id, judul, metadata, indeks teks)
 *
 * Fakta yang paling sering mengejutkan orang, dan yang membuat adegan ini
 * layak jadi slide sendiri: yang memenuhi basis data BUKAN teks dokumennya,
 * melainkan vektornya — sembilan kali lebih besar dari teks yang diwakilinya.
 */

const BIRU = '#2563EB';
const AMBER = '#F59E0B';
const HIJAU = '#059669';
const ABU = '#94A3B8';

/* Terukur di produksi. Diubah hanya bila diukur ulang, bukan diperkirakan. */
const BYTE_VEKTOR = 776;    // halfvec 384 dim; sebelumnya 6.148 (vector 1536)
const BYTE_TEKS = 680;
const BYTE_BARIS = 2_852;   // setelah halfvec (0035); sebelumnya 8.228
const BYTE_INDEKS = 804;    // setelah halfvec; sebelumnya 1.572
/** Potongan maju ±680 karakter (800 dikurangi tumpang tindih 120). */
const CHAR_PER_POTONGAN = 680;
/** Bagian berkas kantoran yang benar-benar jadi teks. Rentang lazim 1–3%. */
const RASIO_TEKS = 0.02;

const mb = (b: number) => `${Math.round(b / 1e6).toLocaleString('id-ID')} MB`;

export function SceneStorage() {
  const sumber = 1e9;                                   // 1 GB
  const teks = sumber * RASIO_TEKS;                     // ±20 MB
  const potongan = teks / CHAR_PER_POTONGAN;            // ±29.400
  const db = potongan * (BYTE_BARIS + BYTE_INDEKS);     // ±288 MB

  const bagian = [
    { t: 'Vektor embedding', b: BYTE_VEKTOR, c: BIRU, n: '384 angka × 2 byte (halfvec)' },
    { t: 'Sisanya', b: BYTE_BARIS - BYTE_VEKTOR - BYTE_TEKS, c: ABU, n: 'id, judul, metadata, indeks teks' },
    { t: 'Teks dokumennya', b: BYTE_TEKS, c: AMBER, n: '±680 karakter' },
  ];

  return (
    <svg viewBox="0 0 760 250" role="img"
      aria-label="Dari satu gigabyte berkas Drive menjadi berapa megabyte di basis data, dan apa isi tiap potongan">
      <text x="0" y="14" className="sc-k">diukur pg_column_size pada data produksi · bukan perkiraan</text>

      {/* rantai perubahan ukuran */}
      {[
        { t: '1 GB', s: 'berkas di Drive', n: 'PDF, DOCX, slide', c: 'ink' as const },
        { t: mb(teks), s: 'teks hasil ekstraksi', n: '±2% — sisanya gambar & format', c: 'src' as const },
        { t: `${Math.round(potongan / 1000)} rb`, s: 'potongan', n: '±680 karakter per potongan', c: '' as const },
        { t: mb(db), s: 'di basis data', n: 'baris + indeks vektor', c: 'hi' as const },
      ].map((b, i) => {
        const x = i * 196;
        return (
          <g key={b.s}>
            <g className="an-in" style={{ ['--d' as string]: `${i * 0.35}s` }}>
              <rect x={x} y={34} width={168} height={72} rx="7" className={`sc-box ${b.c}`} />
              <text x={x + 84} y={62} textAnchor="middle"
                className={`sc-t ${b.c === 'ink' ? 'sc-w' : ''}`}
                style={{ fontSize: 17 }}>{b.t}</text>
              <text x={x + 84} y={80} textAnchor="middle"
                className={b.c === 'ink' ? 'sc-w' : 'sc-s'} style={{ fontSize: 10 }}>{b.s}</text>
              <text x={x + 84} y={96} textAnchor="middle" className="sc-m"
                fill={b.c === 'ink' ? '#94A3B8' : undefined} style={{ fontSize: 8 }}>{b.n}</text>
            </g>
            {i < 3 && (
              <g className="an-in" style={{ ['--d' as string]: `${0.2 + i * 0.35}s` }}>
                <path d={`M ${x + 170} 70 L ${x + 192} 70`} stroke={BIRU} strokeWidth="1.5" fill="none" />
                <polygon points={`${x + 194},70 ${x + 188},67 ${x + 188},73`} fill={BIRU} />
              </g>
            )}
          </g>
        );
      })}

      {/* apa isi satu potongan — inilah bagian yang mengejutkan */}
      <g className="an-in" style={{ ['--d' as string]: '1.4s' }}>
        <text x="0" y="140" className="sc-k">isi satu potongan · 8.228 byte</text>
      </g>
      {(() => {
        let x = 0;
        return bagian.map((p, i) => {
          const w = (p.b / BYTE_BARIS) * 560;
          const kiri = x; x += w;
          return (
            <g key={p.t}>
              <rect x={kiri} y={150} width={w} height={26} fill={p.c} opacity="0.85"
                className="an-bar" style={{ ['--d' as string]: `${1.5 + i * 0.2}s`, transformOrigin: `${kiri}px center` }} />
              <g className="an-in" style={{ ['--d' as string]: `${1.9 + i * 0.2}s` }}>
                <text x={kiri + 6} y={192} className="sc-t" style={{ fontSize: 10 }}>{p.t}</text>
                <text x={kiri + 6} y={204} className="sc-m" style={{ fontSize: 8 }}>
                  {p.b.toLocaleString('id-ID')} B · {Math.round((p.b / BYTE_BARIS) * 100)}%
                </text>
              </g>
            </g>
          );
        });
      })()}

      <g className="an-in" style={{ ['--d' as string]: '2.5s' }}>
        <rect x="580" y="140" width="180" height="66" rx="6" fill="#EFF6FF" stroke={BIRU} strokeWidth="1.5" />
        <text x="594" y="160" className="sc-t">Vektornya kini</text>
        <text x="594" y="174" className="sc-t">27% dari baris,</text>
        <text x="594" y="188" className="sc-t">dulu 75%.</text>
        <text x="594" y="200" className="sc-m">halfvec + tanpa padding</text>
      </g>

      <g className="an-in" style={{ ['--d' as string]: '2.8s' }}>
        <text x="0" y="228" className="sc-s">
          Basis datanya justru LEBIH KECIL dari berkas sumbernya — karena sebagian besar isi PDF adalah gambar dan format, bukan teks.
        </text>
        <text x="0" y="242" className="sc-s">
          Rasio 2% adalah nilai tengah korpus perkantoran; berkas hasil pindai mendekati 0%, sedangkan CSV dan teks polos mendekati 100%.
        </text>
      </g>
    </svg>
  );
}

/** Dipakai kalkulator agar rumusnya tak pernah menyimpang dari slide. */
export const STORAGE_MODEL = {
  BYTE_BARIS, BYTE_INDEKS, BYTE_VEKTOR, BYTE_TEKS,
  CHAR_PER_POTONGAN, RASIO_TEKS,
  /** Berapa potongan dari sekian byte berkas sumber. */
  potonganDariSumber: (byteSumber: number, rasio = RASIO_TEKS) =>
    (byteSumber * rasio) / CHAR_PER_POTONGAN,
  /** Berapa byte di basis data untuk sekian potongan. */
  byteDatabase: (potongan: number) => potongan * (BYTE_BARIS + BYTE_INDEKS),
};

export const SceneStorageDefault = SceneStorage;

/* ══ SKALA — 1 GB sampai 1 TB ═══════════════════════════════════════ */

/**
 * Tabel skala. Sengaja memuat DUA rasio, bukan satu:
 *
 *   2% — nilai tengah korpus perkantoran, dipakai untuk memperkirakan
 *   3% — batas atas, dipakai MERENCANAKAN server
 *
 * Merencanakan dengan nilai tengah adalah cara paling rapi untuk kehabisan
 * memori enam bulan setelah pemasangan. Angka 3% inilah yang dipakai slide
 * proposal on-premise (69 GB RAM untuk 1 TB), jadi kedua dek tak berselisih.
 */
export function SceneScale() {
  const skala = [
    { t: '1 GB', b: 1e9 },
    { t: '100 GB', b: 100e9 },
    { t: '700 GB', b: 700e9, n: 'korpus klien' },
    { t: '1 TB', b: 1e12 },
  ];
  const hitung = (byteSumber: number, rasio: number) => {
    const potongan = (byteSumber * rasio) / CHAR_PER_POTONGAN;
    return {
      potongan,
      db: potongan * (BYTE_BARIS + BYTE_INDEKS),
      ramDatar: potongan * BYTE_INDEKS,
      ramTingkat: (potongan / 10) * BYTE_INDEKS,   // ±10 potongan per dokumen
    };
  };
  const sz = (b: number) =>
    b >= 1e12 ? `${(b / 1e12).toFixed(1).replace('.', ',')} TB`
      : b >= 1e9 ? `${(b / 1e9).toFixed(b < 1e10 ? 1 : 0).replace('.', ',')} GB`
      : `${Math.round(b / 1e6)} MB`;
  const pot = (n: number) =>
    n >= 1e6 ? `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0).replace('.', ',')} jt` : `${Math.round(n / 1e3)} rb`;

  const kol = [92, 168, 268, 372, 486, 610];
  return (
    <svg viewBox="0 0 760 250" role="img"
      aria-label="Perhitungan penyimpanan dari 1 GB sampai 1 TB berkas sumber, pada rasio teks 2 persen dan 3 persen">
      <text x="0" y="14" className="sc-k">
        rasio teks 2% (perkiraan) dan 3% (perencanaan) · 680 karakter per potongan
      </text>

      {/* kepala */}
      <g className="an-in" style={{ ['--d' as string]: '0s' }}>
        <line x1="0" y1="42" x2="760" y2="42" stroke="#0F172A" strokeWidth="1.5" />
        {['Berkas sumber', 'Teks', 'Potongan', 'Basis data', 'RAM mode langsung', 'RAM bertingkat'].map((h, i) => (
          <text key={h} x={i === 0 ? 0 : kol[i - 1] + 76} y={34}
            textAnchor={i === 0 ? 'start' : 'end'} className="sc-k">{h}</text>
        ))}
      </g>

      {skala.map((s, i) => {
        const y = 62 + i * 34;
        const a = hitung(s.b, 0.02);
        const c = hitung(s.b, 0.03);
        return (
          <g key={s.t} className="an-in" style={{ ['--d' as string]: `${0.2 + i * 0.18}s` }}>
            <line x1="0" y1={y + 12} x2="760" y2={y + 12} stroke="#EEF2F7" />
            <text x="0" y={y + 4} className="sc-t">{s.t}</text>
            {s.n && <text x="0" y={y + 15} className="sc-m" style={{ fontSize: 7.5 }}>{s.n}</text>}
            {[
              [sz(s.b * 0.02), sz(s.b * 0.03)],
              [pot(a.potongan), pot(c.potongan)],
              [sz(a.db), sz(c.db)],
              [sz(a.ramDatar), sz(c.ramDatar)],
              [sz(a.ramTingkat), sz(c.ramTingkat)],
            ].map(([v2, v3], j) => (
              <g key={j}>
                <text x={kol[j] + 76} y={y + 4} textAnchor="end" className="sc-t">{v2}</text>
                <text x={kol[j] + 76} y={y + 15} textAnchor="end" className="sc-m"
                  style={{ fontSize: 8 }} fill={ABU}>{v3}</text>
              </g>
            ))}
          </g>
        );
      })}

      <g className="an-in" style={{ ['--d' as string]: '1.2s' }}>
        <rect x="0" y="204" width="374" height="42" rx="6" fill="#EFF6FF" stroke={BIRU} strokeWidth="1.5" />
        <text x="14" y="222" className="sc-t">Korpus 1 TB: 46–69 GB RAM mode langsung.</text>
        <text x="14" y="237" className="sc-s">Melewati atap Neon — inilah yang menuntut server sendiri.</text>
      </g>
      <g className="an-in" style={{ ['--d' as string]: '1.4s' }}>
        <rect x="386" y="204" width="374" height="42" rx="6" fill="#ECFDF5" stroke={HIJAU} strokeWidth="1.5" />
        <text x="400" y="222" className="sc-t">Mode bertingkat: 4,6–6,9 GB.</text>
        <text x="400" y="237" className="sc-s">Korpus yang sama, memori sepersepuluhnya.</text>
      </g>
    </svg>
  );
}
