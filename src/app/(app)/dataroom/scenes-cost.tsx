/**
 * ADEGAN BIAYA untuk dek HLA.
 *
 * Dipisah dari `scenes.tsx` karena keduanya menarik angka dari `decks.ts`
 * (tabel harga) — dan adegan arsitektur tidak perlu ikut membawa
 * ketergantungan itu.
 *
 * SEMUA ANGKA DIAMBIL dari tabel harga yang sama dengan dek Technical dan
 * Proposal, bukan diketik ulang. Kalau harganya diperbarui, adegan ini ikut,
 * dan dua slide dalam satu presentasi tak pernah menyebut angka berbeda.
 */
import { per1kUsd, usdFmt } from './decks';

const BIRU = '#2563EB';
const AMBER = '#F59E0B';
const NAVY = '#0F172A';
const ABU = '#94A3B8';

/** Panah lurus yang menggambar dirinya (salinan ringan dari scenes.tsx). */
function Arrow({ x1, y1, x2, y2, d = 0 }: { x1: number; y1: number; x2: number; y2: number; d?: number }) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  return (
    <>
      <line x1={x1} y1={y1} x2={x2} y2={y2} className="sc-line an-draw"
        style={{ ['--len' as string]: len, ['--d' as string]: `${d}s`, stroke: BIRU }} />
      <polygon points={`${x2},${y2} ${x2 - 6},${y2 - 3.5} ${x2 - 6},${y2 + 3.5}`}
        className="an-in" style={{ ['--d' as string]: `${d + 0.4}s`, fill: BIRU }} />
      <rect width="7" height="9" rx="1.5" fill={BIRU} className="an-pkt"
        style={{
          ['--path' as string]: `path("M ${x1} ${y1} L ${x2} ${y2}")`,
          ['--dur' as string]: '2.4s', ['--d' as string]: `${d + 0.5}s`,
        }} />
    </>
  );
}

/* ══ ANATOMI TOKEN SATU PERTANYAAN ══════════════════════════════════ */

/**
 * Ke mana token pergi dalam satu giliran.
 *
 * Adegan ini menjawab kesalahpahaman yang paling mahal: banyak orang mengira
 * seluruh korpus "dibaca" model tiap kali ditanya, lalu menyimpulkan korpus
 * 1 TB berarti tagihan raksasa. Yang benar — pencarian TIDAK memakai token
 * model sama sekali; yang ditagih hanya potongan terpilih yang masuk konteks.
 */
export function SceneTokens() {
  const bagian = [
    { t: 'Enam potongan dokumen', v: '±1.800 token', w: 300, c: BIRU },
    { t: 'Riwayat percakapan', v: '±700 token', w: 118, c: NAVY },
    { t: 'Aturan sistem & kebijakan', v: '±450 token', w: 76, c: ABU },
    { t: 'Pertanyaan pengguna', v: '±50 token', w: 18, c: AMBER },
  ];
  return (
    <svg viewBox="0 0 760 240" role="img"
      aria-label="Ke mana token pergi dalam satu pertanyaan: pencarian tidak memakai token, hanya potongan terpilih yang ditagih">
      <text x="0" y="16" className="sc-k">satu giliran · ±3.000 token masuk, ±500 keluar</text>

      {/* Yang TIDAK ditagih digambar lebih dulu — inilah salah paham yang
          paling mahal bagi calon pelanggan, jadi ia mendapat tempat pertama. */}
      <g className="an-in" style={{ ['--d' as string]: '0s' }}>
        <rect x="0" y="34" width="326" height="80" rx="6" fill="#F8FAFC"
          stroke="#D8E0EA" strokeDasharray="4 3" />
        <text x="14" y="54" className="sc-k">tidak memakai token model</text>
        <text x="14" y="74" className="sc-t">Pencarian di seluruh korpus</text>
        <text x="14" y="90" className="sc-s">Vektor, leksikal, dan memory berjalan di basis data.</text>
        <text x="14" y="104" className="sc-s">Korpus 1 TB maupun 1 GB — biayanya sama: nol token.</text>
      </g>

      <Arrow x1={330} y1={74} x2={366} y2={74} d={0.5} />

      <g className="an-in" style={{ ['--d' as string]: '0.7s' }}>
        <text x={370} y="30" className="sc-k">yang masuk ke model</text>
      </g>
      {bagian.map((b, i) => (
        <g key={b.t}>
          <rect x={370} y={40 + i * 34} width={b.w} height={18} rx="3" fill={b.c} opacity={0.85}
            className="an-bar" style={{ ['--d' as string]: `${0.9 + i * 0.18}s` }} />
          <g className="an-in" style={{ ['--d' as string]: `${1.2 + i * 0.18}s` }}>
            <text x={370} y={36 + i * 34} className="sc-s">{b.t}</text>
            <text x={370 + b.w + 8} y={54 + i * 34} className="sc-m">{b.v}</text>
          </g>
        </g>
      ))}

      <g className="an-in" style={{ ['--d' as string]: '2.0s' }}>
        <line x1={370} y1="182" x2={740} y2="182" className="sc-line" />
        <text x={370} y="200" className="sc-t">≈ 3.000 token masuk</text>
        <text x={370} y="216" className="sc-s">
          Jawaban keluar ±500 token — tarif token keluar biasanya beberapa kali lipat token masuk.
        </text>
      </g>

      <g className="an-in" style={{ ['--d' as string]: '2.3s' }}>
        <text x="0" y="146" className="sc-t">Besar korpus tidak menaikkan</text>
        <text x="0" y="162" className="sc-t">tagihan per pertanyaan.</text>
        <text x="0" y="184" className="sc-s">Yang naik hanya kebutuhan penyimpanan</text>
        <text x="0" y="198" className="sc-s">dan memori server — dibayar sekali,</text>
        <text x="0" y="212" className="sc-s">bukan tiap kali ada yang bertanya.</text>
      </g>
    </svg>
  );
}

/* ══ BIAYA SEKALI vs BIAYA BERULANG ═════════════════════════════════ */

export function SceneCosts() {
  const model: Array<[string, string]> = [
    ['DeepSeek V4 Flash', 'DeepSeek'],
    ['GPT-5.6 Terra', 'OpenAI'],
    ['Claude Haiku 4.5', 'Anthropic'],
    ['Claude Sonnet 5', 'Anthropic'],
  ];
  const nilai = model.map(([m]) => per1kUsd(m));
  const maks = Math.max(...nilai);

  return (
    <svg viewBox="0 0 760 250" role="img"
      aria-label="Dua jenis biaya: sekali bayar saat dokumen masuk, dan biaya berulang per pertanyaan">
      <text x="0" y="16" className="sc-k">dua jenis biaya · sering tercampur, padahal jauh berbeda</text>

      {/* SEKALI */}
      <g className="an-in" style={{ ['--d' as string]: '0s' }}>
        <rect x="0" y="32" width="352" height="200" rx="8" className="sc-box" />
        <rect x="0" y="32" width="352" height="4" rx="2" fill={AMBER} />
        <text x="18" y="60" className="sc-k">sekali per dokumen</text>
        <text x="18" y="84" className="sc-t">Saat dokumen masuk</text>
      </g>
      {[
        ['Embedding potongan', 'jauh lebih murah dari model bahasa'],
        ['Ringkasan Memory', 'satu panggilan model per dokumen'],
        ['Penyimpanan', 'disk + memori server, tidak berulang'],
      ].map(([t, s], i) => (
        <g key={t} className="an-in" style={{ ['--d' as string]: `${0.3 + i * 0.2}s` }}>
          <circle cx={26} cy={104 + i * 38} r="3.5" fill={AMBER} />
          <text x={40} y={108 + i * 38} className="sc-t">{t}</text>
          <text x={40} y={122 + i * 38} className="sc-s">{s}</text>
        </g>
      ))}
      <g className="an-in" style={{ ['--d' as string]: '1.0s' }}>
        <text x="18" y="212" className="sc-s">Dibayar sekali. Sync berikutnya hanya menyentuh berkas</text>
        <text x="18" y="225" className="sc-s">yang berubah — sisanya tak disentuh sama sekali.</text>
      </g>

      {/* BERULANG */}
      <g className="an-in" style={{ ['--d' as string]: '1.1s' }}>
        <rect x="376" y="32" width="384" height="200" rx="8" className="sc-box hi" />
        <rect x="376" y="32" width="384" height="4" rx="2" fill={BIRU} />
        <text x="394" y="60" className="sc-k">tiap pertanyaan</text>
        <text x="394" y="84" className="sc-t">Biaya model per 1.000 pertanyaan</text>
      </g>
      {model.map(([m, p], i) => {
        const v = nilai[i];
        const w = Math.max(6, (v / maks) * 176);
        return (
          <g key={m}>
            <g className="an-in" style={{ ['--d' as string]: `${1.4 + i * 0.18}s` }}>
              <text x={394} y={110 + i * 30} className="sc-s">{m}</text>
              <text x={394} y={122 + i * 30} className="sc-m">{p}</text>
            </g>
            <rect x={540} y={100 + i * 30} width={w} height={15} rx="3" fill={BIRU}
              opacity={0.4 + i * 0.18} className="an-bar"
              style={{ ['--d' as string]: `${1.5 + i * 0.18}s` }} />
            <text x={540 + w + 8} y={112 + i * 30} className="sc-t an-in"
              style={{ ['--d' as string]: `${2.0 + i * 0.18}s` }}>{usdFmt(v)}</text>
          </g>
        );
      })}
      <g className="an-in" style={{ ['--d' as string]: '2.5s' }}>
        <text x="394" y="212" className="sc-s">Model bisa diganti kapan saja tanpa mengulang apa pun —</text>
        <text x="394" y="225" className="sc-s">dokumen dan vektornya tetap di tempatnya.</text>
      </g>
    </svg>
  );
}
