'use client';

import { useState } from 'react';
import { FORMAT_DIDUKUNG } from '@/modules/knowledge/format';
import { PLAN_LIMITS } from '@/modules/core/limits';

/**
 * PANDUAN PENGGUNA.
 *
 * Angka kuota dan daftar format DIBACA DARI KODE (PLAN_LIMITS,
 * FORMAT_DIDUKUNG), tidak diketik ulang. Panduan yang menyalin angka dengan
 * tangan berhenti benar begitu angkanya diubah — tanpa ada yang gagal, tanpa
 * ada yang tahu, dan pengguna yang membacanya justru yang paling percaya.
 *
 * Isinya sengaja memuat hal-hal yang MENGECEWAKAN kalau baru diketahui
 * belakangan: PDF hasil pindai tak berisi teks, bot menolak menjawab di luar
 * dokumen, dan kuota paket gratis memang kecil. Panduan yang hanya memuat
 * jalan mulus membuat orang menyalahkan dirinya sendiri saat menemui yang
 * tidak mulus.
 */

const rupiahAngka = (n: number) => (Number.isFinite(n) ? n.toLocaleString('id-ID') : 'Tanpa batas');

interface Bagian { id: string; judul: string; isi: React.ReactNode }

export default function BantuanPage() {
  const [buka, setBuka] = useState<string | null>('mulai');
  const bagian = daftarBagian();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Panduan</h1>
          <p className="sub">
            Cara memakai Nalar, dan hal-hal yang lebih baik diketahui sekarang daripada nanti.
          </p>
        </div>
      </div>

      <div className="grid g2">
        <div className="stack gap-3">
          {bagian.map((b) => (
            <div key={b.id} className="card">
              <button
                type="button"
                className="panel-head"
                aria-expanded={buka === b.id}
                aria-controls={`isi-${b.id}`}
                onClick={() => setBuka(buka === b.id ? null : b.id)}
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <span className="t">{b.judul}</span>
                <span className="microlabel">{buka === b.id ? 'TUTUP' : 'BUKA'}</span>
              </button>
              {buka === b.id && (
                <div id={`isi-${b.id}`} className="card-pad stack gap-3" style={{ fontSize: 14, lineHeight: 1.65 }}>
                  {b.isi}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="stack gap-3">
          <div className="card">
            <div className="panel-head"><span className="t">Batas per paket</span></div>
            <div className="card-pad table-wrap">
              {/* Angkanya dibaca dari PLAN_LIMITS — halaman ini tak menyimpan
                  salinannya sendiri, jadi ia tak bisa menyimpang. */}
              <table className="table"><thead><tr>
                <th>Paket</th><th className="num">Pesan/bulan</th><th className="num">Chatbot</th><th className="num">Potongan</th>
              </tr></thead><tbody>
                {(['free', 'pro', 'enterprise'] as const).map((p) => (
                  <tr key={p}>
                    <td style={{ textTransform: 'capitalize' }}>{p}</td>
                    <td className="num">{rupiahAngka(PLAN_LIMITS[p].messagesPerMonth)}</td>
                    <td className="num">{rupiahAngka(PLAN_LIMITS[p].maxChatbots)}</td>
                    <td className="num">{rupiahAngka(PLAN_LIMITS[p].maxChunks)}</td>
                  </tr>
                ))}
              </tbody></table>
              <p className="microlabel" style={{ marginTop: 'var(--sp-3)' }}>
                SATU POTONGAN ≈ SATU PARAGRAF PANJANG. SATU DOKUMEN BIASANYA MENJADI ±10 POTONGAN.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="panel-head"><span className="t">Masih tersangkut?</span></div>
            <div className="card-pad stack gap-3" style={{ fontSize: 14, lineHeight: 1.65 }}>
              <p style={{ margin: 0 }}>
                Halaman <a href="/observability">Observability</a> menunjukkan keadaan sistem, dan{' '}
                <a href="/conversations">Conversations</a> menyimpan tiap percakapan lengkap dengan
                sumber yang dipakai menjawab — di sanalah biasanya terlihat kenapa satu jawaban
                meleset.
              </p>
              <p style={{ margin: 0 }}>
                Kontrak API lengkap ada di <a href="/api/openapi" target="_blank" rel="noreferrer">OpenAPI ↗</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function daftarBagian(): Bagian[] {
  return [
    {
      id: 'mulai',
      judul: '1 · Empat langkah pertama',
      isi: (
        <>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li><b>Buat chatbot</b> di <a href="/chatbots">Chatbots</a>. Satu chatbot = satu
              kepribadian dan satu himpunan pengetahuan.</li>
            <li><b>Isi pengetahuannya</b> di <a href="/knowledge">Knowledge Base</a> — unggah berkas,
              atau sambungkan Google Drive/OneDrive lalu pilih foldernya.</li>
            <li><b>Uji di <a href="/chat">Chat</a></b> sebelum dipasang ke mana pun. Tiap jawaban
              menampilkan potongan dokumen yang dipakainya, jadi kelirunya terlihat asalnya.</li>
            <li><b>Pasang ke situs</b> lewat cuplikan embed di halaman Chatbots.</li>
          </ol>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            Langkah 3 sering dilewati, dan itu selalu terasa belakangan: chatbot yang
            pengetahuannya belum diperiksa akan menolak menjawab pertanyaan yang justru paling
            sering ditanya pengunjung.
          </p>
        </>
      ),
    },
    {
      id: 'dokumen',
      judul: '2 · Dokumen: format & yang tak terbaca',
      isi: (
        <>
          <p style={{ margin: 0 }}>Format yang bisa dibaca:</p>
          <p className="mono" style={{ margin: 0, fontSize: 13 }}>{FORMAT_DIDUKUNG.join('  ')}</p>
          <p style={{ margin: 0 }}>
            Google Docs, Sheets, dan Slides ikut terbaca saat disinkronkan dari Drive — keduanya
            diekspor lebih dulu jadi teks.
          </p>
          <p style={{ margin: 0 }}>
            <b>Markdown memberi jawaban paling tepat.</b> Judul, daftar, dan tabelnya ikut terbaca,
            jadi dokumen dipotong di batas bagian — bukan di tengah kalimat — dan sitasinya menunjuk
            tepat ke bagian yang benar.
          </p>
          <p style={{ margin: 0, color: 'var(--warn)' }}>
            <b>PDF hasil pindai tidak berisi teks sama sekali.</b> Berkasnya terunggah dan terlihat
            berhasil, tapi tak ada satu kata pun yang bisa dibaca darinya, jadi bot tak akan tahu
            isinya. Kalau dokumenmu foto halaman, jalankan OCR dulu atau salin isinya ke teks.
          </p>
          <p style={{ margin: 0 }}>
            Sinkronisasi bersifat <b>inkremental</b>: hanya berkas baru dan yang berubah yang
            diunduh ulang. Berkas yang hilang dari folder asal ikut dikeluarkan dari basis
            pengetahuan, tapi tidak dihapus permanen — bisa dipulihkan.
          </p>
        </>
      ),
    },
    {
      id: 'menolak',
      judul: '3 · Kenapa bot menjawab "tidak ada di dokumen"',
      isi: (
        <>
          <p style={{ margin: 0 }}>
            Itu <b>disengaja</b>, dan biasanya bukan kerusakan. Nalar hanya menjawab dari dokumenmu.
            Kalau jawabannya tak ada di sana, ia menolak menjawab alih-alih mengarang — karena
            karangan yang terdengar meyakinkan jauh lebih mahal daripada penolakan yang jujur.
          </p>
          <p style={{ margin: 0 }}>Kalau penolakannya terasa salah, tiga hal yang biasanya jadi sebab:</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Dokumennya <b>belum terhubung</b> ke chatbot itu. Satu basis pengetahuan harus
              di-<i>assign</i> ke chatbotnya di halaman Knowledge Base.</li>
            <li>Dokumennya <b>PDF hasil pindai</b> — lihat bagian sebelumnya.</li>
            <li>Jawabannya memang <b>tak tertulis</b> di dokumen mana pun, hanya diketahui orang.</li>
          </ul>
          <p style={{ margin: 0 }}>
            Halaman <a href="/documents">Dokumen</a> bisa dicari langsung: kalau kata kuncinya tak
            ditemukan di sana, bot juga tak akan menemukannya.
          </p>
        </>
      ),
    },
    {
      id: 'embed',
      judul: '4 · Memasang di situsmu',
      isi: (
        <>
          <p style={{ margin: 0 }}>Dua mode, dipilih lewat <code>data-mode</code>:</p>
          <p style={{ margin: 0 }}>
            <b>Gelembung</b> (bawaan) — melayang di sudut halaman, cocok untuk situs perusahaan
            atau halaman produk.
          </p>
          <pre className="mono" style={{
            margin: 0, fontSize: 12, overflowX: 'auto', background: 'var(--card-2)',
            padding: 'var(--sp-3)', borderRadius: 'var(--rad-xs)',
          }}>{'<script src="https://rag.sainskerta.net/embed.js"\n  data-key="cb_live_…"></script>'}</pre>
          <p style={{ margin: 0 }}>
            <b>Inline</b> — chat memenuhi satu elemen di halaman, lengkap dengan daftar sesi di
            sampingnya. Cocok untuk halaman bantuan atau portal internal.
          </p>
          <pre className="mono" style={{
            margin: 0, fontSize: 12, overflowX: 'auto', background: 'var(--card-2)',
            padding: 'var(--sp-3)', borderRadius: 'var(--rad-xs)',
          }}>{'<div id="chat" style="height:600px"></div>\n<script src="https://rag.sainskerta.net/embed.js"\n  data-key="cb_live_…" data-mode="inline" data-target="#chat"></script>'}</pre>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            Kunci <code>cb_live_…</code> memang boleh terlihat di halaman — ia hanya mengizinkan
            bertanya, tak pernah mengubah apa pun. Yang menjaga penyalahgunaan adalah daftar domain
            yang diizinkan, diatur di halaman Chatbots.
          </p>
        </>
      ),
    },
    {
      id: 'kuota',
      judul: '5 · Kuota, dan apa yang terjadi saat habis',
      isi: (
        <>
          <p style={{ margin: 0 }}>
            Kuota dihitung per <b>bulan kalender</b> dan disetel ulang tiap tanggal 1. Satu
            pertanyaan pengunjung = satu pesan.
          </p>
          <p style={{ margin: 0 }}>
            Saat kuota habis, chatbot berhenti menjawab sampai bulan berikutnya atau sampai
            paketnya dinaikkan. Percakapan lama tetap tersimpan dan tetap bisa dibaca.
          </p>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            Yang dilihat pengunjung saat ini masih pesan umum &quot;batas permintaan tercapai, coba
            lagi sebentar&quot; — itu keliru untuk kuota bulanan, yang tak akan pulih sebentar lagi.
            Perbaikannya sudah tercatat; sampai itu selesai, pantau sisa kuotamu di{' '}
            <a href="/usage">Usage</a> supaya tak kehabisan tanpa sadar.
          </p>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            Paket gratis sengaja kecil ({rupiahAngka(PLAN_LIMITS.free.messagesPerMonth)} pesan):
            cukup untuk melihat produknya bekerja dengan dokumen sungguhan, tak cukup untuk
            dipasang di situs yang ramai. Itu batas yang disebutkan di muka, bukan jebakan yang
            ditemukan belakangan.
          </p>
          <p style={{ margin: 0 }}>
            Pemakaian berjalan terlihat di <a href="/usage">Usage</a>, dan tren hariannya di{' '}
            <a href="/dashboard">Dashboard</a>.
          </p>
        </>
      ),
    },
    {
      id: 'aman',
      judul: '6 · Keamanan data',
      isi: (
        <>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Dokumen tiap organisasi <b>terpisah di tingkat basis data</b>, bukan hanya
              disaring di kode. Kueri yang salah tulis pun tak bisa menembusnya.</li>
            <li>Kunci API penyedia model <b>tak pernah dikirim ke peramban</b> — tersimpan
              terenkripsi dan hanya dipakai di server.</li>
            <li>Akun bisa dikunci dengan <b>dua faktor (TOTP)</b> di <a href="/settings">Settings</a>.
              Sangat dianjurkan untuk akun yang memegang kunci API.</li>
            <li>Setiap jawaban dicatat beserta dokumen yang dipakainya, jadi tiap kalimat bisa
              ditelusuri asalnya di <a href="/conversations">Conversations</a>.</li>
          </ul>
        </>
      ),
    },
  ];
}
