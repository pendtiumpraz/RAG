import type { Metadata } from 'next';
import { LegalPage } from '../_components/legal';

export const metadata: Metadata = {
  title: 'Kebijakan Privasi · Nalar',
  description: 'Bagaimana Nalar mengumpulkan, memakai, menyimpan, dan membagikan data — termasuk dokumen Google Drive dan Microsoft OneDrive/SharePoint.',
};

/**
 * Kebijakan Privasi — PUBLIK.
 *
 * Ditulis dari apa yang sistem ini BENAR-BENAR lakukan (tabel, enkripsi,
 * aliran data ke penyedia model), bukan template generik. Bagian yang belum
 * ada disebut apa adanya, karena menjanjikan kendali yang belum dibangun
 * justru lebih berbahaya daripada mengakuinya.
 *
 * URL ini juga dipakai saat pengajuan verifikasi OAuth Google — scope Drive
 * termasuk kategori sensitive dan mensyaratkan kebijakan privasi publik.
 */
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Kebijakan Privasi"
      updated="27 Juli 2026"
      intro="Nalar adalah platform Retrieval-Augmented Generation: ia membaca dokumen milikmu, mengubahnya jadi basis pengetahuan, lalu menjawab pertanyaan berdasarkan isinya. Halaman ini menjelaskan data apa yang benar-benar kami simpan, ke mana ia mengalir, dan apa yang bisa kamu kendalikan."
    >
      <h2>1. Siapa yang bertanggung jawab</h2>
      <p>
        Layanan ini dioperasikan oleh <b>Sainskerta</b> melalui{' '}
        <code>rag.sainskerta.net</code>. Untuk pertanyaan terkait data pribadi,
        hubungi pengelola melalui kanal yang tercantum di beranda.
      </p>
      <p>
        Kalau kamu memakai Nalar sebagai <b>organisasi</b>, organisasimu adalah pihak
        yang menentukan dokumen apa yang dimasukkan dan siapa yang boleh mengaksesnya.
        Kami memproses data itu atas instruksi organisasi tersebut.
      </p>

      <h2>2. Data yang kami simpan</h2>

      <h3>2.1 Akun</h3>
      <ul>
        <li>Alamat email, nama, dan nama organisasi.</li>
        <li>
          Kata sandi <b>tidak pernah</b> disimpan dalam bentuk terbaca — yang tersimpan
          hanya hash <code>scrypt</code>.
        </li>
        <li>Peran (admin/member/superadmin) dan status verifikasi akun.</li>
      </ul>

      <h3>2.2 Dokumen dan basis pengetahuan</h3>
      <ul>
        <li>
          <b>Teks yang diekstrak</b> dari berkas yang kamu hubungkan (PDF, DOCX, teks,
          Google Docs/Sheets/Slides). Berkas aslinya tetap di penyimpananmu — kami
          tidak menyalin berkasnya, hanya teksnya.
        </li>
        <li>
          <b>Vektor embedding</b> dari teks itu, untuk pencarian makna.
        </li>
        <li>
          Nama berkas, penanda versi, dan waktu sinkronisasi.
        </li>
        <li>
          <b>Catatan memory</b> — ringkasan dan keterkaitan antar dokumen yang dihasilkan
          otomatis, bila fitur Memory Agent dijalankan.
        </li>
      </ul>

      <h3>2.3 Percakapan</h3>
      <ul>
        <li>Pertanyaan pengunjung dan jawaban chatbot, tersimpan lengkap.</li>
        <li>Sitasi: dokumen mana yang dipakai menjawab, beserta skor kemiripannya.</li>
        <li>
          Penanda pengunjung (<code>visitorId</code>) yang dibuat widget — bukan
          identitas nyata, hanya untuk merangkai satu percakapan.
        </li>
      </ul>

      <h3>2.4 Kredensial pihak ketiga</h3>
      <ul>
        <li>
          Token OAuth Google/Microsoft, dan kunci API penyedia model yang kamu masukkan.
          Semuanya dienkripsi <b>AES-256-GCM</b> sebelum disimpan dan{' '}
          <b>tidak pernah dikirim ke browser</b> — antarmuka hanya menampilkan
          ada/tidaknya kunci, bukan nilainya.
        </li>
      </ul>

      <h3>2.5 Operasional</h3>
      <ul>
        <li>Jumlah pesan dan token per bulan, untuk kuota dan penagihan.</li>
        <li>
          Catatan audit: tindakan admin, pelanggaran guardrail, dan galat sistem.
        </li>
      </ul>

      <div className="legal-note">
        <b>Yang TIDAK kami lakukan</b>
        <p>
          Kami tidak memasang iklan, tidak menjual data, dan tidak memakai dokumen atau
          percakapanmu untuk melatih model AI apa pun — baik milik kami maupun milik
          penyedia model. Kami juga tidak melacak berkas mana yang kamu buka; yang
          tercatat hanyalah dokumen mana yang dipakai chatbot untuk menjawab.
        </p>
      </div>

      <h2>3. Akses Google Drive dan Microsoft</h2>
      <p>
        Bila kamu menghubungkan akun penyimpanan, kami meminta izin seminimal yang
        dibutuhkan:
      </p>
      <table>
        <tbody>
          <tr>
            <th>Izin</th><th>Dipakai untuk</th>
          </tr>
          <tr>
            <td><code>drive.readonly</code></td>
            <td>Membaca berkas yang kamu pilih untuk dijadikan basis pengetahuan. Hanya baca — kami tidak bisa mengubah atau menghapus berkasmu.</td>
          </tr>
          <tr>
            <td><code>drive.file</code></td>
            <td>Menulis kembali catatan memory ke folder <code>_nalar-memory/</code>. Izin ini hanya menjangkau berkas yang dibuat aplikasi ini sendiri — bukan seluruh Drive.</td>
          </tr>
          <tr>
            <td><code>Files.Read</code> (Microsoft)</td>
            <td>Membaca berkas OneDrive/SharePoint. Hanya baca.</td>
          </tr>
        </tbody>
      </table>
      <p>
        Kamu bisa memutus koneksi kapan saja lewat halaman <b>Knowledge</b>, atau
        mencabut izinnya langsung dari setelan keamanan akun Google/Microsoft-mu.
        Memutus koneksi menghentikan sinkronisasi berikutnya; teks yang sudah masuk
        basis pengetahuan tetap ada sampai kamu menghapusnya.
      </p>

      <h2>4. Ke mana data mengalir</h2>
      <p>
        Untuk menjawab satu pertanyaan, sistem mengirim <b>pertanyaan itu beserta
        potongan dokumen yang relevan</b> ke penyedia model yang kamu pilih sendiri di
        halaman Models &amp; Keys. Penyedia yang tersedia antara lain Anthropic, OpenAI,
        Google, Mistral, DeepSeek, xAI, Groq, dan Cohere.
      </p>
      <div className="legal-note">
        <b>Ini keputusan yang kamu pegang</b>
        <p>
          Pemakaian data oleh penyedia model tunduk pada kebijakan mereka
          masing-masing, bukan kebijakan ini. Kalau dokumenmu sensitif,
          pertimbangkan penyedia dengan komitmen retensi nol, atau jalankan model
          embedding sendiri di servermu.
        </p>
      </div>
      <p>Pihak ketiga lain yang terlibat menjalankan layanan:</p>
      <table>
        <tbody>
          <tr><th>Pihak</th><th>Peran</th></tr>
          <tr><td>Vercel</td><td>Hosting aplikasi</td></tr>
          <tr><td>Neon</td><td>Database PostgreSQL</td></tr>
          <tr><td>Vercel Blob</td><td>Menyimpan berkas bobot model. Tidak berisi data pengguna.</td></tr>
        </tbody>
      </table>

      <h2>5. Pemisahan antar organisasi</h2>
      <p>
        Setiap organisasi punya ruang datanya sendiri, dan pemisahannya ditegakkan
        di <b>tingkat database</b> lewat PostgreSQL Row-Level Security — bukan sekadar
        pengecekan di kode aplikasi. Setiap kueri terikat pada organisasi pemanggilnya,
        sehingga kesalahan pemrograman sekalipun tidak membuat data satu organisasi
        terbaca oleh organisasi lain.
      </p>
      <p>
        Tiap chatbot juga punya basis pengetahuan terpisah: pencarian selalu dibatasi
        pada dokumen milik chatbot itu saja.
      </p>

      <h2>6. Keamanan</h2>
      <ul>
        <li>Seluruh lalu lintas memakai HTTPS.</li>
        <li>Kata sandi di-hash dengan <code>scrypt</code>.</li>
        <li>Token OAuth dan kunci API dienkripsi AES-256-GCM saat disimpan.</li>
        <li>
          Lima lapis guardrail pada alur chat, termasuk penyaringan upaya penyusupan
          perintah dan peredaksian rahasia sebelum jawaban dikirim.
        </li>
        <li>Pembatasan laju dan kuota untuk mencegah penyalahgunaan.</li>
      </ul>
      <p>
        Tidak ada sistem yang sepenuhnya kebal. Kami tidak menjanjikan keamanan mutlak,
        dan menyarankan kamu tidak memasukkan dokumen yang paling sensitif sebelum
        menilai sendiri kelayakannya.
      </p>

      <h2>7. Penyimpanan dan penghapusan</h2>
      <p>
        Penghapusan di aplikasi bersifat <b>soft delete</b>: data ditandai terhapus,
        disembunyikan dari pemakaian, dan bisa dipulihkan lewat menu Sampah. Ini
        disengaja agar penghapusan tak sengaja bisa dibatalkan.
      </p>
      <div className="legal-note">
        <b>Perlu kamu ketahui apa adanya</b>
        <p>
          Saat ini <b>belum ada</b> penghapusan permanen otomatis setelah jangka waktu
          tertentu, dan <b>belum ada</b> tombol mandiri untuk menghapus seluruh akun
          beserta isinya. Bila kamu ingin data dihapus permanen, hubungi pengelola —
          permintaan itu dikerjakan secara manual. Kami menyebutkan ini terus terang
          alih-alih menjanjikan kendali yang belum kami bangun.
        </p>
      </div>

      <h2>8. Hak kamu</h2>
      <ul>
        <li>Melihat data akun dan seluruh riwayat percakapan lewat dashboard.</li>
        <li>Memperbaiki data akun.</li>
        <li>Menghapus chatbot, dokumen, dan sumber data — dengan pemulihan tersedia.</li>
        <li>Memutus koneksi penyimpanan kapan saja.</li>
        <li>Meminta penghapusan permanen dengan menghubungi pengelola.</li>
      </ul>
      <p>
        Bila kamu berada di wilayah dengan hukum perlindungan data tertentu (misalnya
        UU PDP Indonesia atau GDPR), hak-hak tambahan menurut hukum tersebut tetap
        berlaku dan bisa kamu ajukan melalui kanal yang sama.
      </p>

      <h2>9. Anak-anak</h2>
      <p>
        Layanan ini ditujukan untuk penggunaan organisasi dan tidak diperuntukkan bagi
        anak di bawah 18 tahun.
      </p>

      <h2>10. Perubahan</h2>
      <p>
        Bila kebijakan ini berubah secara berarti, tanggal berlaku di atas diperbarui
        dan pengguna aktif diberi tahu. Versi terbaru selalu tersedia di halaman ini.
      </p>
    </LegalPage>
  );
}
