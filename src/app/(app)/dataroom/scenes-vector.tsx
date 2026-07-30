/**
 * ADEGAN "APA ITU VEKTOR" — dimensi & presisi.
 *
 * Dua pertanyaan yang selalu muncul dari orang teknis di pihak klien, dan
 * keduanya pantas dijawab dengan gambar:
 *
 *   • angka 384 / 768 / 1024 / 1536 itu apa?
 *   • kenapa presisinya diturunkan, apa tidak merusak?
 *
 * Semua angka byte di sini DIUKUR pada basis data ini dengan pg_column_size,
 * dan angka ketelitiannya berasal dari perbandingan peringkat nyata — bukan
 * dari klaim vendor.
 */

const BIRU = '#2563EB';
const AMBER = '#F59E0B';
const HIJAU = '#059669';
const NAVY = '#0F172A';
const ABU = '#94A3B8';

/* ══ DIMENSI ════════════════════════════════════════════════════════ */

export function SceneDims() {
  const model = [
    { d: 384, n: 'MiniLM', k: 'kecil, jalan di server sendiri', c: HIJAU },
    { d: 768, n: 'kelas base', k: 'lebih peka nuansa', c: BIRU },
    { d: 1024, n: 'kelas large', k: 'lebih peka lagi', c: NAVY },
    { d: 1536, n: 'OpenAI', k: 'lewat API, berbayar', c: ABU },
  ];
  const maks = 1536;

  return (
    <svg viewBox="0 0 760 250" role="img"
      aria-label="Apa arti angka 384, 768, 1024, dan 1536 pada model embedding, dan berapa biayanya per potongan">
      <text x="0" y="14" className="sc-k">
        dimensi = berapa angka dipakai untuk menggambarkan satu potongan teks
      </text>

      {/* Vektor itu apa — digambar sebagai deretan angka, bukan dijelaskan. */}
      <g className="an-in" style={{ ['--d' as string]: '0s' }}>
        <rect x="0" y="28" width="216" height="58" rx="6" className="sc-box src" />
        <text x="12" y="46" className="sc-s">&ldquo;garansi produk 24 bulan&rdquo;</text>
        <text x="12" y="64" className="sc-m" style={{ fontSize: 7.5 }}>satu potongan teks</text>
        <text x="12" y="78" className="sc-m" style={{ fontSize: 7.5 }}>±680 karakter</text>
      </g>
      <g className="an-in" style={{ ['--d' as string]: '0.3s' }}>
        <path d="M 220 57 L 250 57" stroke={BIRU} strokeWidth="1.5" fill="none" />
        <polygon points="252,57 246,54 246,60" fill={BIRU} />
        <text x={236} y={48} textAnchor="middle" className="sc-k">embed</text>
      </g>
      <g className="an-in" style={{ ['--d' as string]: '0.5s' }}>
        <rect x="256" y="28" width="504" height="58" rx="6" className="sc-box hi" />
        <text x="270" y="48" className="sc-m" style={{ fontSize: 9 }}>
          [ 0,0421 · −0,1873 · 0,0055 · 0,2210 · −0,0094 · 0,1146 · … ]
        </text>
        <text x="270" y="66" className="sc-s">Deretan angka yang menyandikan MAKNANYA.</text>
        <text x="270" y="79" className="sc-m" style={{ fontSize: 7.5 }}>
          dua teks bermakna mirip menghasilkan deretan yang berdekatan — itulah dasar pencariannya
        </text>
      </g>

      {/* Tangga dimensi */}
      <g className="an-in" style={{ ['--d' as string]: '0.9s' }}>
        <text x="0" y="108" className="sc-k">berapa angkanya · dan berapa biayanya per potongan</text>
      </g>
      {model.map((m, i) => {
        const y = 118 + i * 30;
        const w = (m.d / maks) * 300;
        const byteLama = 8 + m.d * 4;    // vector fp32
        const byteBaru = 8 + m.d * 2;    // halfvec fp16
        return (
          <g key={m.d}>
            <g className="an-in" style={{ ['--d' as string]: `${1.1 + i * 0.15}s` }}>
              <text x="0" y={y + 12} className="sc-t">{m.d}</text>
              <text x={42} y={y + 12} className="sc-s">{m.n}</text>
              <text x={124} y={y + 12} className="sc-m" style={{ fontSize: 7.5 }}>{m.k}</text>
            </g>
            <rect x={286} y={y + 2} width={w} height={13} rx="3" fill={m.c} opacity="0.8"
              className="an-bar" style={{ ['--d' as string]: `${1.2 + i * 0.15}s` }} />
            <text x={598} y={y + 12} className="sc-m an-in"
              style={{ ['--d' as string]: `${1.5 + i * 0.15}s`, fontSize: 8 }}>
              {byteLama.toLocaleString('id-ID')} B → {byteBaru.toLocaleString('id-ID')} B
            </text>
          </g>
        );
      })}

      <g className="an-in" style={{ ['--d' as string]: '2.1s' }}>
        <rect x="0" y="240" width="760" height="0" />
        <text x="0" y="244" className="sc-s">
          Lebih banyak dimensi bukan selalu lebih baik: ia menangkap nuansa lebih halus, tapi memakan memori dan waktu lebih besar untuk selisih ketepatan yang sering tak terasa.
        </text>
      </g>
    </svg>
  );
}

/* ══ PRESISI — halfvec ══════════════════════════════════════════════ */

export function SceneHalfvec() {
  return (
    <svg viewBox="0 0 760 250" role="img"
      aria-label="Apa itu halfvec: presisi setengah, separuh ukuran, peringkat hasil pencarian identik">
      <text x="0" y="14" className="sc-k">
        halfvec = tiap angka disimpan 2 byte, bukan 4 · pgvector 0.8
      </text>

      {/* Perbandingan satu angka */}
      <g className="an-in" style={{ ['--d' as string]: '0s' }}>
        <rect x="0" y="28" width="366" height="76" rx="6" className="sc-box" />
        <text x="14" y="48" className="sc-k">sebelumnya · 4 byte per angka</text>
        <text x="14" y="72" className="sc-t" style={{ fontSize: 15 }}>−0,18734692</text>
        <text x="14" y="90" className="sc-m" style={{ fontSize: 8 }}>
          delapan digit di belakang koma
        </text>
      </g>
      <g className="an-in" style={{ ['--d' as string]: '0.4s' }}>
        <rect x="394" y="28" width="366" height="76" rx="6" className="sc-box hi" />
        <text x="408" y="48" className="sc-k">halfvec · 2 byte per angka</text>
        <text x="408" y="72" className="sc-t" style={{ fontSize: 15 }}>
          −0,1873<tspan fill={ABU}>4692</tspan>
        </text>
        <text x="408" y="90" className="sc-m" style={{ fontSize: 8 }}>
          digit abu-abu dibuang — di bawah derau modelnya sendiri
        </text>
      </g>
      <g className="an-in" style={{ ['--d' as string]: '0.7s' }}>
        <path d="M 370 66 L 390 66" stroke={BIRU} strokeWidth="1.5" fill="none" />
        <polygon points="392,66 386,63 386,69" fill={BIRU} />
      </g>

      {/* Yang diukur, bukan diklaim */}
      <g className="an-in" style={{ ['--d' as string]: '1.0s' }}>
        <rect x="0" y="120" width="366" height="86" rx="6" fill="#ECFDF5" stroke={HIJAU} strokeWidth="1.5" />
        <text x="14" y="142" className="sc-k">yang diukur, bukan diklaim</text>
        <text x="14" y="166" className="sc-t" style={{ fontSize: 19 }}>50 / 50</text>
        <text x="14" y="184" className="sc-s">posisi peringkat teratas IDENTIK</text>
        <text x="14" y="198" className="sc-m" style={{ fontSize: 7.5 }}>
          5 pertanyaan × 10 hasil, pada dokumen sungguhan
        </text>
      </g>

      <g className="an-in" style={{ ['--d' as string]: '1.3s' }}>
        <text x="394" y="140" className="sc-k">akibatnya pada penyimpanan</text>
      </g>
      {[
        { t: 'Kolom vektor', a: 6148, b: 776 },
        { t: 'Satu baris penuh', a: 8228, b: 2852 },
      ].map((r, i) => {
        const y = 150 + i * 32;
        return (
          <g key={r.t}>
            <g className="an-in" style={{ ['--d' as string]: `${1.5 + i * 0.2}s` }}>
              <text x={394} y={y + 10} className="sc-s">{r.t}</text>
            </g>
            <rect x={520} y={y} width={150} height={12} rx="3" fill={ABU} opacity="0.35"
              className="an-bar" style={{ ['--d' as string]: `${1.6 + i * 0.2}s` }} />
            <rect x={520} y={y} width={150 * (r.b / r.a)} height={12} rx="3" fill={HIJAU}
              className="an-bar" style={{ ['--d' as string]: `${1.8 + i * 0.2}s` }} />
            <text x={680} y={y + 10} className="sc-t an-in"
              style={{ ['--d' as string]: `${2.1 + i * 0.2}s`, fontSize: 10 }}>
              {(r.a / r.b).toFixed(1).replace('.', ',')}× kecil
            </text>
          </g>
        );
      })}

      <g className="an-in" style={{ ['--d' as string]: '2.4s' }}>
        <rect x="0" y="216" width="760" height="34" rx="6" fill="#FFFBEB" stroke={AMBER} strokeWidth="1.5" />
        <text x="14" y="232" className="sc-t">
          Penghematan terbesar justru bukan dari presisinya, melainkan dari berhenti memberi PADDING.
        </text>
        <text x="14" y="245" className="sc-s">
          Model 384 dimensi dulu dipaksa disimpan sebagai 1.536 — tiga perempatnya nol, dan nol itu tetap dibayar penuh di disk dan memori.
        </text>
      </g>
    </svg>
  );
}
