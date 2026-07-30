/**
 * ADEGAN BERANIMASI untuk dek HLA — SVG + CSS murni, tanpa pustaka.
 *
 * Aturan yang dipegang di sini:
 *  • Animasinya BEKERJA, bukan menghias. Titik yang bergerak menyusuri jalur
 *    menandakan DATA yang mengalir; penyingkapan bertahap menandakan URUTAN
 *    kejadian. Tak ada yang berputar tanpa alasan.
 *  • Warna mengikuti sistem desain: biru = jalur utama, amber = sitasi/sumber,
 *    hijau = hasil yang sah, navy = simpan/keputusan. Tanpa gradien, tanpa
 *    glow (D4v3, anti "AI-slop").
 *  • Bentuk & label selalu ikut membawa arti — warna tak pernah jadi
 *    satu-satunya penanda, sama seperti graf Memory.
 *  • Seluruh gerak mati di `prefers-reduced-motion` dan saat dicetak, tapi
 *    ISINYA tetap tampil penuh (lihat dataroom.css).
 */

const BIRU = '#2563EB';
const AMBER = '#F59E0B';
const HIJAU = '#059669';
const NAVY = '#0F172A';
const ABU = '#94A3B8';

/** Kotak berlabel — satuan dasar semua adegan. */
function Box({ x, y, w = 96, h = 42, t, s, cls = '', d = 0 }: {
  x: number; y: number; w?: number; h?: number; t: string; s?: string; cls?: string; d?: number;
}) {
  return (
    <g className="an-in" style={{ ['--d' as string]: `${d}s` }}>
      <rect x={x} y={y} width={w} height={h} rx="6" className={`sc-box ${cls}`} />
      <text x={x + w / 2} y={s ? y + h / 2 - 2 : y + h / 2 + 4} textAnchor="middle"
        className={`sc-t ${cls.includes('ink') ? 'sc-w' : ''}`}>{t}</text>
      {s && <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" className="sc-s">{s}</text>}
    </g>
  );
}

/** Panah lurus yang menggambar dirinya, lalu dialiri paket data. */
function Arrow({ x1, y1, x2, y2, d = 0, dur, color = BIRU, pkt = true }: {
  x1: number; y1: number; x2: number; y2: number; d?: number; dur?: number; color?: string; pkt?: boolean;
}) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const path = `path("M ${x1} ${y1} L ${x2} ${y2}")`;
  return (
    <>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="sc-line an-draw"
        style={{ ['--len' as string]: len, ['--d' as string]: `${d}s`, stroke: color }} />
      <polygon points={`${x2},${y2} ${x2 - 6},${y2 - 3.5} ${x2 - 6},${y2 + 3.5}`}
        className="an-in" style={{ ['--d' as string]: `${d + 0.4}s`, fill: color }} />
      {pkt && (
        <rect width="7" height="9" rx="1.5" fill={color} className="an-pkt"
          style={{ ['--path' as string]: path, ['--dur' as string]: `${dur ?? 2.4}s`, ['--d' as string]: `${d + 0.5}s` }} />
      )}
    </>
  );
}

/* ══ 1 · MASUKNYA DOKUMEN ═══════════════════════════════════════════ */

export function SceneIngest() {
  const y = 96;
  return (
    <svg viewBox="0 0 760 220" role="img"
      aria-label="Alur masuk dokumen: listing, unduh, ekstrak teks, saring kembar, potong, embed, simpan">
      <text x="0" y="20" className="sc-k">jalur masuk · sekali per berkas</text>

      <Box x={0} y={y} w={92} t="Listing" s="metadata saja" d={0} />
      <Arrow x1={94} y1={y + 21} x2={128} y2={y + 21} d={0.3} />
      <Box x={130} y={y} w={92} t="Unduh" s="ke RAM" d={0.5} />
      <Arrow x1={224} y1={y + 21} x2={258} y2={y + 21} d={0.8} />
      <Box x={260} y={y} w={100} t="Ekstrak teks" s="PDF · DOCX" d={1.0} />
      <Arrow x1={362} y1={y + 21} x2={396} y2={y + 21} d={1.3} />
      <Box x={398} y={y} w={92} t="Potong" s="±800 karakter" d={1.5} />
      <Arrow x1={492} y1={y + 21} x2={526} y2={y + 21} d={1.8} />
      <Box x={528} y={y} w={92} cls="hi" t="Embed" s="→ vektor" d={2.0} />
      <Arrow x1={622} y1={y + 21} x2={656} y2={y + 21} d={2.3} />
      <Box x={658} y={y} w={100} cls="ink" t="Postgres" s="teks + vektor" d={2.5} />

      {/* Berkas asli DILEPAS — ini klaim yang paling sering ditanyakan klien,
          jadi ia digambar, bukan cuma ditulis di catatan kaki. */}
      <g className="an-in" style={{ ['--d' as string]: '1.2s' }}>
        <line x1={176} y1={y + 44} x2={176} y2={y + 70} className="sc-line"
          strokeDasharray="3 3" stroke={ABU} />
        <text x={176} y={y + 84} textAnchor="middle" className="sc-s">buffer dilepas</text>
        <text x={176} y={y + 95} textAnchor="middle" className="sc-m">tak pernah ke disk</text>
      </g>

      <g className="an-in" style={{ ['--d' as string]: '2.9s' }}>
        <line x1={708} y1={y - 12} x2={708} y2={y - 34} className="sc-line" stroke={ABU} />
        <text x={708} y={y - 40} textAnchor="middle" className="sc-s">berkas asli tetap di sumbernya</text>
      </g>
    </svg>
  );
}

/* ══ 2 · PENCEGAHAN REDUNDANSI ══════════════════════════════════════ */

export function SceneDedupe() {
  return (
    <svg viewBox="0 0 760 240" role="img"
      aria-label="Dedup dua lapis: nama dan ukuran sebelum unduh, sidik jari isi setelah ekstraksi">
      <text x="0" y="18" className="sc-k">dua lapis · lingkup satu knowledge base</text>

      <Box x={0} y={52} w={104} t="Berkas baru" s="dari listing" d={0} />

      {/* LAPIS 1 */}
      <Arrow x1={106} y1={73} x2={150} y2={73} d={0.3} />
      <Box x={152} y={46} w={130} h={54} cls="src" t="Lapis 1" s="nama + ukuran" d={0.5} />
      <g className="an-in" style={{ ['--d' as string]: '0.9s' }}>
        <text x={217} y={116} textAnchor="middle" className="sc-m">sebelum unduh</text>
      </g>

      {/* keluaran lapis 1: kembar → berhenti */}
      <Arrow x1={284} y1={60} x2={330} y2={44} d={1.0} pkt={false} color={ABU} />
      <g className="an-in" style={{ ['--d' as string]: '1.2s' }}>
        <circle cx={348} cy={40} r="13" fill="none" stroke={ABU} strokeWidth="1.5" />
        <path d="M 343 35 L 353 45 M 353 35 L 343 45" stroke={ABU} strokeWidth="2"
          className="an-mark" style={{ ['--d' as string]: '1.4s' }} />
        <text x={368} y={38} className="sc-t">kembar</text>
        <text x={368} y={50} className="sc-s">dilewati — unduhan dihemat</text>
      </g>

      {/* lolos lapis 1 → unduh → lapis 2 */}
      <Arrow x1={284} y1={88} x2={330} y2={104} d={1.4} />
      <Box x={332} y={84} w={82} t="Unduh" d={1.6} />
      <Arrow x1={416} y1={105} x2={452} y2={105} d={1.9} />
      <Box x={454} y={78} w={140} h={54} cls="hi" t="Lapis 2" s="sidik jari isi · sha256" d={2.1} />
      <g className="an-in" style={{ ['--d' as string]: '2.5s' }}>
        <text x={524} y={148} textAnchor="middle" className="sc-m">menangkap salinan yang di-rename</text>
      </g>

      <Arrow x1={596} y1={92} x2={646} y2={72} d={2.6} pkt={false} color={ABU} />
      <g className="an-in" style={{ ['--d' as string]: '2.8s' }}>
        <circle cx={664} cy={68} r="13" fill="none" stroke={ABU} strokeWidth="1.5" />
        <path d="M 659 68 L 663 73 L 670 63" fill="none" stroke={ABU} strokeWidth="2"
          className="an-mark" style={{ ['--d' as string]: '3.0s' }} />
        <text x={684} y={66} className="sc-s">kembar</text>
        <text x={684} y={77} className="sc-s">dicatat</text>
      </g>

      <Arrow x1={596} y1={118} x2={646} y2={138} d={2.9} color={HIJAU} />
      <g className="an-in" style={{ ['--d' as string]: '3.1s' }}>
        <circle cx={664} cy={142} r="13" fill="none" stroke={HIJAU} strokeWidth="1.5" />
        <path d="M 659 142 L 663 147 L 670 137" fill="none" stroke={HIJAU} strokeWidth="2"
          className="an-mark" style={{ ['--d' as string]: '3.3s' }} />
        <text x={684} y={140} className="sc-t">baru</text>
        <text x={684} y={152} className="sc-s">masuk penuh</text>
      </g>

      <g className="an-in" style={{ ['--d' as string]: '3.5s' }}>
        <text x={0} y={210} className="sc-s">
          Lapis 1 murah tapi luput pada salinan yang di-rename. Lapis 2 tepat, dan ia yang menghemat
        </text>
        <text x={0} y={224} className="sc-s">
          bagian termahal: embedding dan penyimpanan vektor — bukan unduhannya.
        </text>
      </g>
    </svg>
  );
}

/* ══ 3 · TIGA KAKI PENCARIAN ════════════════════════════════════════ */

export function SceneLegs() {
  const kaki = [
    { y: 40, t: 'Kaki vektor', s: 'kemiripan makna', c: BIRU },
    { y: 100, t: 'Kaki leksikal', s: 'kata & nomor persis', c: NAVY },
    { y: 160, t: 'Kaki memory', s: 'ringkasan & graf', c: AMBER },
  ];
  return (
    <svg viewBox="0 0 760 240" role="img"
      aria-label="Tiga kaki pencarian: vektor, leksikal, memory — digabung dengan RRF lalu disaring">
      <text x="0" y="16" className="sc-k">satu perjalanan database · tiga kaki paralel</text>

      <Box x={0} y={90} w={92} h={44} cls="ink" t="Pertanyaan" d={0} />

      {kaki.map((k, i) => (
        <g key={k.t}>
          <path d={`M 94 112 C 130 112, 130 ${k.y + 21}, 166 ${k.y + 21}`}
            className="sc-line an-draw" fill="none"
            style={{ ['--len' as string]: 110, ['--d' as string]: `${0.3 + i * 0.15}s`, stroke: k.c }} />
          <rect width="7" height="9" rx="1.5" fill={k.c} className="an-pkt"
            style={{
              ['--path' as string]: `path("M 94 112 C 130 112, 130 ${k.y + 21}, 166 ${k.y + 21}")`,
              ['--dur' as string]: '2.2s', ['--d' as string]: `${0.8 + i * 0.2}s`,
            }} />
          <Box x={168} y={k.y} w={146} t={k.t} s={k.s} d={0.6 + i * 0.15} />
          <path d={`M 316 ${k.y + 21} C 352 ${k.y + 21}, 352 112, 386 112`}
            className="sc-line an-draw" fill="none"
            style={{ ['--len' as string]: 110, ['--d' as string]: `${1.1 + i * 0.15}s`, stroke: k.c }} />
        </g>
      ))}

      <Box x={388} y={90} w={104} h={44} cls="hi" t="RRF" s="gabung peringkat" d={1.6} />
      <Arrow x1={494} y1={112} x2={528} y2={112} d={1.9} />
      <Box x={530} y={90} w={104} h={44} t="Saring" s="kembar · MMR" d={2.1} />
      <Arrow x1={636} y1={112} x2={670} y2={112} d={2.4} color={HIJAU} />
      <Box x={672} y={90} w={88} h={44} t="6 potongan" d={2.6} />

      {/* Klaim yang paling sering ditanya: apakah mode hemat bisa menyembunyikan
          dokumen. Jawabannya digambar, bukan disembunyikan di catatan kaki. */}
      <g className="an-in" style={{ ['--d' as string]: '2.9s' }}>
        <rect x="0" y="196" width="760" height="40" rx="6" fill="#F8FAFC" stroke="#D8E0EA" />
        <text x="14" y="214" className="sc-t">Kaki leksikal tak pernah ikut disaring mode hemat.</text>
        <text x="14" y="228" className="sc-s">
          Pencarian nomor kontrak, nama, atau kode pasal selalu menyapu seluruh korpus — apa pun modenya.
        </text>
      </g>
    </svg>
  );
}

/* ══ 4 · DUA MODE PENCARIAN ═════════════════════════════════════════ */

export function SceneTiers() {
  return (
    <svg viewBox="0 0 760 250" role="img"
      aria-label="Perbandingan mode datar dan mode bertingkat beserta kebutuhan memorinya">
      <text x="0" y="16" className="sc-k">menyala sendiri menurut besar korpus · tak ada yang perlu dipilih</text>

      {/* MODE DATAR */}
      <g className="an-in" style={{ ['--d' as string]: '0s' }}>
        <text x="0" y="44" className="sc-t">Mode langsung — korpus kecil</text>
      </g>
      {Array.from({ length: 24 }).map((_, i) => (
        <rect key={i} x={4 + (i % 12) * 15} y={54 + Math.floor(i / 12) * 15} width="11" height="11" rx="2"
          fill={BIRU} opacity="0.75" className="an-pop"
          style={{ ['--d' as string]: `${0.2 + i * 0.02}s` }} />
      ))}
      <g className="an-in" style={{ ['--d' as string]: '0.9s' }}>
        <text x="0" y="104" className="sc-s">Seluruh potongan berada dalam satu indeks — cara paling teliti.</text>
        <text x="0" y="118" className="sc-m">RAM tumbuh mengikuti korpus</text>
      </g>

      {/* pemisah */}
      <line x1="0" y1="136" x2="360" y2="136" className="sc-line" strokeDasharray="4 4" />

      {/* MODE BERTINGKAT */}
      <g className="an-in" style={{ ['--d' as string]: '1.2s' }}>
        <text x="0" y="162" className="sc-t">Mode bertingkat — korpus besar</text>
      </g>
      <g>
        {/* lapisan pertama: sedikit, residen */}
        {Array.from({ length: 5 }).map((_, i) => (
          <rect key={i} x={4 + i * 15} y={172} width="11" height="11" rx="2"
            fill={BIRU} className="an-pop" style={{ ['--d' as string]: `${1.4 + i * 0.06}s` }} />
        ))}
        <text x={88} y={181} className="sc-m an-in" style={{ ['--d' as string]: '1.7s' }}>
          vektor dokumen · residen
        </text>
        {/* lapisan kedua: banyak, di disk, dibaca sesuai kebutuhan */}
        {Array.from({ length: 24 }).map((_, i) => (
          <rect key={i} x={4 + (i % 12) * 15} y={196 + Math.floor(i / 12) * 15} width="11" height="11" rx="2"
            fill={ABU} opacity={i === 3 || i === 14 ? 1 : 0.3}
            className="an-pop" style={{ ['--d' as string]: `${1.9 + i * 0.015}s` }} />
        ))}
        <text x={188} y={205} className="sc-m an-in" style={{ ['--d' as string]: '2.3s' }}>
          potongan · dibaca sesuai kebutuhan
        </text>
      </g>

      {/* Perbandingan RAM — batang tumbuh, angkanya terukur */}
      <g className="an-in" style={{ ['--d' as string]: '2.5s' }}>
        <line x1="400" y1="30" x2="400" y2="236" className="sc-line" />
        <text x="424" y="48" className="sc-k">kebutuhan memori · korpus 1 TB</text>
      </g>

      <g className="an-in" style={{ ['--d' as string]: '2.7s' }}>
        <text x="424" y="76" className="sc-s">Datar, vektor berpadding</text>
      </g>
      <rect x="424" y="84" width="300" height="16" rx="3" fill={NAVY} opacity="0.15"
        className="an-bar" style={{ ['--d' as string]: '2.8s' }} />
      <text x="732" y="96" textAnchor="end" className="sc-t an-in" style={{ ['--d' as string]: '3.3s' }}>282 GB</text>

      <g className="an-in" style={{ ['--d' as string]: '3.0s' }}>
        <text x="424" y="126" className="sc-s">Datar, dimensi asli — terpasang</text>
      </g>
      <rect x="424" y="134" width="74" height="16" rx="3" fill={BIRU} opacity="0.75"
        className="an-bar" style={{ ['--d' as string]: '3.1s' }} />
      <text x="508" y="146" className="sc-t an-in" style={{ ['--d' as string]: '3.6s' }}>69 GB</text>

      <g className="an-in" style={{ ['--d' as string]: '3.3s' }}>
        <text x="424" y="176" className="sc-s">Bertingkat — terpasang</text>
      </g>
      <rect x="424" y="184" width="5" height="16" rx="2" fill={HIJAU}
        className="an-bar" style={{ ['--d' as string]: '3.4s' }} />
      <text x="438" y="196" className="sc-t an-in" style={{ ['--d' as string]: '3.9s' }}>1–3 GB</text>

      <g className="an-in" style={{ ['--d' as string]: '4.1s' }}>
        <text x="424" y="224" className="sc-s">Angka bertingkat berasal dari rancangan;</text>
        <text x="424" y="236" className="sc-s">pengukurannya pada korpus sebesar milik Anda menyusul.</text>
      </g>
    </svg>
  );
}

/* ══ 5 · KEBIJAKAN JAWABAN ══════════════════════════════════════════ */

export function ScenePolicy() {
  return (
    <svg viewBox="0 0 760 230" role="img"
      aria-label="Kebijakan jawaban per chatbot: bahasa, kepatuhan sumber, nada, dan kreativitas model">
      <text x="0" y="16" className="sc-k">disetel per chatbot · divisi legal ≠ divisi marketing</text>

      <Box x={0} y={84} w={96} h={44} cls="ink" t="Pertanyaan" d={0} />
      <Arrow x1={98} y1={106} x2={140} y2={106} d={0.3} />

      {/* empat tuas berlapis */}
      {[
        { t: 'Bahasa', s: 'ikut penanya · id · en', c: BIRU, d: 0.5 },
        { t: 'Kepatuhan sumber', s: 'ketat · seimbang · terbuka', c: HIJAU, d: 0.7 },
        { t: 'Nada', s: 'formal · ramah · ringkas · teknis', c: NAVY, d: 0.9 },
        { t: 'Kreativitas', s: 'dijepit maksimum 1,0', c: AMBER, d: 1.1 },
      ].map((k, i) => (
        <g key={k.t} className="an-in" style={{ ['--d' as string]: `${k.d}s` }}>
          <rect x={142} y={28 + i * 42} width={230} height={34} rx="6" className="sc-box" stroke={k.c} />
          <rect x={142} y={28 + i * 42} width={4} height={34} rx="2" fill={k.c} />
          <text x={156} y={44 + i * 42} className="sc-t">{k.t}</text>
          <text x={156} y={56 + i * 42} className="sc-s">{k.s}</text>
        </g>
      ))}

      <Arrow x1={374} y1={106} x2={414} y2={106} d={1.4} />
      <Box x={416} y={84} w={110} h={44} cls="hi" t="Model bahasa" d={1.6} />
      <Arrow x1={528} y1={106} x2={566} y2={106} d={1.9} color={HIJAU} />
      <Box x={568} y={84} w={110} h={44} t="Jawaban" s="dengan sitasi" d={2.1} />

      {/* Angka yang paling menentukan, dan sebabnya. */}
      <g className="an-in" style={{ ['--d' as string]: '2.4s' }}>
        <rect x="0" y="176" width="760" height="52" rx="6" fill="#FFFBEB" stroke={AMBER} strokeWidth="1.5" />
        <text x="14" y="196" className="sc-t">Sebelumnya tak satu pun penyedia dikirimi nilai kreativitas.</text>
        <text x="14" y="210" className="sc-s">
          Artinya semua berjalan pada bawaannya sendiri — dan bawaan OpenAI maupun Anthropic adalah 1,0:
        </text>
        <text x="14" y="223" className="sc-s">
          nilai untuk menulis prosa, dipakai mesin yang tugasnya menyebut nomor pasal. Kini 0,2, dijepit di dua lapis.
        </text>
      </g>
    </svg>
  );
}

/* ══ 6 · LIMA LAPIS PENJAGA ═════════════════════════════════════════ */

export function SceneGuardrails() {
  const lapis = [
    { t: 'Sanitasi masukan', s: 'pertanyaan dibersihkan' },
    { t: 'Anti penyusupan', s: 'dokumen = data, bukan perintah' },
    { t: 'Batas eksekusi', s: 'waktu & panjang jawaban' },
    { t: 'Redaksi rahasia', s: 'kunci & token disensor' },
    { t: 'Jejak audit', s: 'setiap giliran tercatat' },
  ];
  return (
    <svg viewBox="0 0 760 210" role="img" aria-label="Lima lapis penjaga yang dilewati setiap pertanyaan">
      <text x="0" y="16" className="sc-k">setiap pertanyaan melewati kelimanya · tak ada jalur pintas</text>

      <Box x={0} y={70} w={86} h={44} cls="ink" t="Masuk" d={0} />

      {lapis.map((l, i) => {
        const x = 100 + i * 122;
        return (
          <g key={l.t}>
            <g className="an-in" style={{ ['--d' as string]: `${0.3 + i * 0.22}s` }}>
              <rect x={x} y={56} width={110} height={72} rx="6" className="sc-box" />
              <rect x={x} y={56} width={110} height={4} rx="2" fill={BIRU} opacity={0.35 + i * 0.13} />
              <text x={x + 55} y={78} textAnchor="middle" className="sc-m">L{i + 1}</text>
              <text x={x + 55} y={96} textAnchor="middle" className="sc-t">{l.t}</text>
              <text x={x + 55} y={110} textAnchor="middle" className="sc-s">{l.s}</text>
            </g>
            {i < lapis.length - 1 && (
              <Arrow x1={x + 112} y1={92} x2={x + 120} y2={92} d={0.5 + i * 0.22} pkt={false} />
            )}
          </g>
        );
      })}
      <Arrow x1={88} y1={92} x2={98} y2={92} d={0.25} pkt={false} />

      <g className="an-in" style={{ ['--d' as string]: '1.7s' }}>
        <text x="0" y="164" className="sc-s">
          Lapis 2 yang membuat dokumen tak bisa memerintah model: teks dari berkas pelanggan
        </text>
        <text x="0" y="178" className="sc-s">
          selalu dibungkus sebagai DATA, sehingga kalimat &ldquo;abaikan aturan sebelumnya&rdquo; di dalam sebuah PDF
        </text>
        <text x="0" y="192" className="sc-s">tetap dibaca sebagai isi dokumen, bukan sebagai instruksi.</text>
      </g>
    </svg>
  );
}

/* ══ 7 · ISOLASI ANTAR PELANGGAN ════════════════════════════════════ */

export function SceneRls() {
  return (
    <svg viewBox="0 0 760 220" role="img"
      aria-label="Isolasi antar pelanggan ditegakkan database, bukan oleh kode aplikasi">
      <text x="0" y="16" className="sc-k">ditegakkan database · bukan oleh kode aplikasi</text>

      {[0, 1].map((i) => (
        <g key={i}>
          <Box x={0} y={48 + i * 84} w={112} h={50}
            t={`Pelanggan ${i === 0 ? 'A' : 'B'}`} s="sesi & pertanyaan" d={i * 0.2} />
          <Arrow x1={114} y1={73 + i * 84} x2={182} y2={73 + i * 84} d={0.3 + i * 0.2}
            color={i === 0 ? BIRU : NAVY} />
        </g>
      ))}

      <g className="an-in" style={{ ['--d' as string]: '0.8s' }}>
        <rect x={184} y={40} width={170} height={142} rx="8" className="sc-box hi" />
        <text x={269} y={70} textAnchor="middle" className="sc-t">Kunci tenant</text>
        <text x={269} y={86} textAnchor="middle" className="sc-s">dipasang di dalam</text>
        <text x={269} y={99} textAnchor="middle" className="sc-s">transaksi database</text>
        <rect x={204} y={116} width={130} height={44} rx="6" fill="#EFF6FF" stroke={BIRU} strokeWidth="1.5" />
        <text x={269} y={134} textAnchor="middle" className="sc-m">row level security</text>
        <text x={269} y={150} textAnchor="middle" className="sc-s">dipaksa, tanpa pengecualian</text>
        <rect x={184} y={40} width={170} height={142} rx="8" fill={BIRU} className="an-pulse"
          style={{ ['--d' as string]: '1.2s' }} opacity="0.06" />
      </g>

      <Arrow x1={356} y1={73} x2={430} y2={73} d={1.2} color={BIRU} />
      <Arrow x1={356} y1={157} x2={430} y2={157} d={1.4} color={NAVY} />

      <Box x={432} y={48} w={150} h={50} t="Data pelanggan A" s="hanya baris miliknya" d={1.5} />
      <Box x={432} y={132} w={150} h={50} t="Data pelanggan B" s="hanya baris miliknya" d={1.7} />

      {/* Percobaan silang — DITOLAK di lapisan database. */}
      <g className="an-in" style={{ ['--d' as string]: '2.0s' }}>
        <path d="M 356 90 C 400 118, 400 118, 430 140" className="sc-line" fill="none"
          stroke={ABU} strokeDasharray="4 4" />
        <circle cx={398} cy={118} r="13" fill="#fff" stroke={ABU} strokeWidth="1.5" />
        <path d="M 393 113 L 403 123 M 403 113 L 393 123" stroke={ABU} strokeWidth="2"
          className="an-mark" style={{ ['--d' as string]: '2.3s' }} />
      </g>

      <g className="an-in" style={{ ['--d' as string]: '2.5s' }}>
        <text x={598} y="106" className="sc-t">Kueri yang keliru</text>
        <text x={598} y="120" className="sc-s">pun tak bisa</text>
        <text x={598} y="132" className="sc-s">melintas.</text>
      </g>

      <g className="an-in" style={{ ['--d' as string]: '2.8s' }}>
        <text x="0" y="208" className="sc-s">
          Aplikasi menyambung sebagai peran yang TIDAK boleh melewati kebijakan ini — jadi kebocoran tetap mustahil sekalipun ada kueri yang salah tulis.
        </text>
      </g>
    </svg>
  );
}

/* ══ 8 · AGEN MEMORY ════════════════════════════════════════════════ */

export function SceneMemory() {
  const simpul = [
    { x: 596, y: 74, r: 9, c: BIRU }, { x: 648, y: 52, r: 7, c: AMBER },
    { x: 664, y: 104, r: 8, c: HIJAU }, { x: 610, y: 128, r: 6, c: NAVY },
    { x: 700, y: 76, r: 6, c: BIRU },
  ];
  return (
    <svg viewBox="0 0 760 220" role="img"
      aria-label="Agen memory: meringkas tiap dokumen, menautkannya, dan membentuk graf pengetahuan">
      <text x="0" y="16" className="sc-k">satu panggilan model per dokumen · hasilnya dipakai ulang</text>

      <Box x={0} y={78} w={96} h={46} t="Dokumen" s="teks utuh" d={0} />
      <Arrow x1={98} y1={101} x2={134} y2={101} d={0.3} />
      <Box x={136} y={78} w={116} h={46} cls="hi" t="Ringkas" s="+ kategori" d={0.5} />
      <Arrow x1={254} y1={101} x2={290} y2={101} d={0.8} />
      <Box x={292} y={78} w={116} h={46} t="Tautkan" s="antar topik" d={1.0} />
      <Arrow x1={410} y1={101} x2={446} y2={101} d={1.3} />

      {/* Gerbang persetujuan — mode opsional, digambar sebagai gerbang. */}
      <g className="an-in" style={{ ['--d' as string]: '1.5s' }}>
        <rect x={448} y={70} width={104} height={62} rx="6" className="sc-box src" />
        <text x={500} y={92} textAnchor="middle" className="sc-t">Tinjau</text>
        <text x={500} y={106} textAnchor="middle" className="sc-s">opsional</text>
        <text x={500} y={120} textAnchor="middle" className="sc-m">disetujui saja</text>
      </g>
      <Arrow x1={554} y1={101} x2={578} y2={101} d={1.9} color={HIJAU} />

      {/* graf */}
      <g className="an-in" style={{ ['--d' as string]: '2.1s' }}>
        {[[0, 1], [0, 2], [0, 3], [1, 4], [2, 4]].map(([a, b], i) => (
          <line key={i} x1={simpul[a].x} y1={simpul[a].y} x2={simpul[b].x} y2={simpul[b].y}
            stroke="#CBD5E1" strokeWidth="1.5" />
        ))}
      </g>
      {simpul.map((n, i) => (
        <circle key={i} cx={n.x} cy={n.y} r={n.r} fill={n.c} className="an-pop"
          style={{ ['--d' as string]: `${2.3 + i * 0.1}s` }} />
      ))}
      <text x={648} y={160} textAnchor="middle" className="sc-m an-in"
        style={{ ['--d' as string]: '2.9s' }}>graf pengetahuan</text>

      <g className="an-in" style={{ ['--d' as string]: '3.1s' }}>
        <text x="0" y="190" className="sc-t">Ringkasan menjawab yang tak bisa dijawab potongan mana pun.</text>
        <text x="0" y="205" className="sc-s">
          &ldquo;Dokumen ini isinya apa&rdquo; atau &ldquo;aturan cuti tersebar di mana saja&rdquo; — tak ada satu potongan 800 karakter yang memuat gambaran utuhnya.
        </text>
      </g>
    </svg>
  );
}

/* ══ pendaftaran ════════════════════════════════════════════════════ */

// SceneId & padanan teksnya hidup di scene-text.ts — dipakai juga oleh
// export.ts, yang tak boleh menarik JSX ke jalur ekspornya.
export type { SceneId } from './scene-text';
import type { SceneId } from './scene-text';
import { SceneTokens, SceneCosts } from './scenes-cost';
import { ScenePlans, SceneCapacity, SceneVercel } from './scenes-limits';
import { SceneStorage, SceneScale } from './scenes-storage';

export const SCENES: Record<SceneId, () => React.ReactElement> = {
  ingest: SceneIngest,
  dedupe: SceneDedupe,
  legs: SceneLegs,
  tiers: SceneTiers,
  policy: ScenePolicy,
  guardrails: SceneGuardrails,
  rls: SceneRls,
  memory: SceneMemory,
  tokens: SceneTokens,
  costs: SceneCosts,
  plans: ScenePlans,
  capacity: SceneCapacity,
  vercel: SceneVercel,
  storage: SceneStorage,
  scale: SceneScale,
};
