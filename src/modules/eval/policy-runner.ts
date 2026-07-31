import { chatTurn } from '@/modules/chat/chat.service';
import { blocksToPlainText, type AnswerBlock } from '@/modules/chat/blocks';
import { nilaiJawaban, periksaJawaban, type PelanggaranJawaban } from './policy-checks';
import { tanpaJawaban, type HimpunanBaku, type PertanyaanBaku } from './golden';

/**
 * PELARI EVAL KEBIJAKAN JAWABAN — menjalankan giliran chat SUNGGUHAN.
 *
 * Berbeda dari `runner.ts`, yang berhenti di pencarian dan karena itu tak
 * memakai token sama sekali. Yang diukur di sini menuntut jawaban model,
 * jadi ia memang berbiaya — dan itulah sebabnya ia dipisah ke berkas dan
 * perintah sendiri, bukan digabung supaya "sekalian".
 *
 * KENAPA LEWAT chatTurn, BUKAN MEMANGGIL LLM LANGSUNG: yang mau dibuktikan
 * adalah bahwa KEBIJAKAN benar-benar dituruti, dan kebijakan itu disusun di
 * dalam chatTurn (arahan sistem, kepatuhan sumber, bahasa, temperature).
 * Memanggil model langsung berarti menguji prompt yang ditulis pelari eval,
 * bukan prompt yang benar-benar dikirim produksi — dan eval semacam itu
 * paling berbahaya justru saat ia hijau.
 *
 * EFEK SAMPING YANG DISENGAJA: tiap pertanyaan membuat percakapan baru di
 * tabel `conversations` dan terhitung pada kuota bulanan tenant. Itu bukan
 * kelalaian melainkan konsekuensi dari menjalankan jalur yang sungguhan;
 * menyiasatinya berarti membangun jalur kedua yang tak pernah diuji.
 */

export interface HasilKebijakan {
  id: string;
  q: string;
  /** true = jawabannya memang tak ada di korpus. */
  harusMenolak: boolean;
  bahasaDiharapkan: 'id' | 'en' | null;
  jawaban: string;
  sitasi: number;
  menolak: boolean;
  bahasa: 'id' | 'en' | null;
  pelanggaran: PelanggaranJawaban[];
}

export interface RingkasanKebijakan {
  nama: string;
  n: number;
  /** Pertanyaan tanpa jawaban yang BENAR ditolak. */
  tolakBenar: number;
  tolakSeharusnya: number;
  /** Pertanyaan berjawab yang justru ditolak — jujur tapi tak berguna. */
  tolakBerlebih: number;
  /** Jawaban berklaim tanpa satu pun rujukan. */
  tanpaSitasi: number;
  bahasaCocok: number;
  /** Terdeteksi, tapi BUKAN bahasa yang diminta — pelanggaran sungguhan. */
  bahasaSalah: number;
  /**
   * Tak cukup kata fungsi untuk dinilai.
   *
   * DIPISAH dari `bahasaSalah` dengan sengaja. Jawaban faktual pendek yang
   * didominasi nama diri ("Direktur Utama ... adalah M. Rizal Karunia Haris")
   * memang tak bisa dinilai dari kata fungsi, dan memasukkannya ke angka
   * pelanggaran akan membuat produk tampak melanggar padahal yang terjadi
   * adalah pengukurnya tak bisa membaca. Angka yang mencampur "salah" dengan
   * "tak terbaca" akan menuntun orang memperbaiki hal yang tak rusak.
   */
  bahasaTakTerbaca: number;
  bahasaDinilai: number;
  pelanggaran: number;
  hasil: HasilKebijakan[];
}

/** Bahasa yang diharapkan untuk sebuah pertanyaan baku. */
function bahasaHarapan(p: PertanyaanBaku & { bahasa?: string }): 'id' | 'en' | null {
  return p.bahasa === 'en' ? 'en' : p.bahasa === 'id' ? 'id' : null;
}

export async function jalankanEvalKebijakan(
  tenantId: string,
  himpunan: HimpunanBaku,
  opts: { chatbotId: string },
): Promise<RingkasanKebijakan> {
  const hasil: HasilKebijakan[] = [];

  for (const p of himpunan.pertanyaan) {
    const blok: AnswerBlock[] = [];
    let sitasi = 0;

    await chatTurn(
      {
        tenantId, chatbotId: opts.chatbotId, question: p.q,
        /* visitorId ditandai jelas sebagai eval supaya percakapan yang lahir
           dari pengukuran bisa dibedakan dari percakapan pengguna sungguhan
           saat membaca analitik nanti. */
        visitorId: 'eval:answer-policy',
      },
      {
        onSources: (s) => { sitasi = s.length; },
        onBlock: (b) => { blok.push(b); },
      },
    );

    const jawaban = blocksToPlainText(blok);
    const harap = { harusMenolak: tanpaJawaban(p), bahasa: bahasaHarapan(p) };
    const periksa = periksaJawaban(jawaban, sitasi);

    hasil.push({
      id: p.id, q: p.q,
      harusMenolak: harap.harusMenolak,
      bahasaDiharapkan: harap.bahasa,
      jawaban, sitasi,
      menolak: periksa.menolak, bahasa: periksa.bahasa,
      pelanggaran: nilaiJawaban(periksa, harap),
    });
  }

  const harusTolak = hasil.filter((h) => h.harusMenolak);
  const dinilaiBahasa = hasil.filter((h) => h.bahasaDiharapkan !== null);

  return {
    nama: himpunan.nama,
    n: hasil.length,
    tolakSeharusnya: harusTolak.length,
    tolakBenar: harusTolak.filter((h) => h.menolak).length,
    tolakBerlebih: hasil.filter((h) => !h.harusMenolak && h.menolak).length,
    tanpaSitasi: hasil.filter((h) => h.pelanggaran.some((v) => v.jenis === 'tanpa-sitasi')).length,
    bahasaDinilai: dinilaiBahasa.length,
    bahasaCocok: dinilaiBahasa.filter((h) => h.bahasa === h.bahasaDiharapkan).length,
    bahasaSalah: dinilaiBahasa.filter((h) => h.bahasa !== null && h.bahasa !== h.bahasaDiharapkan).length,
    bahasaTakTerbaca: dinilaiBahasa.filter((h) => h.bahasa === null).length,
    pelanggaran: hasil.reduce((a, h) => a + h.pelanggaran.length, 0),
    hasil,
  };
}
