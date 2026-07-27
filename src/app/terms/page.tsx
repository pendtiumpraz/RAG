import type { Metadata } from 'next';
import { LegalPage, CONTACT_EMAIL } from '../_components/legal';

export const metadata: Metadata = {
  // Layout sudah memakai template '%s · Nalar' — jangan diulang di sini.
  title: 'Ketentuan Layanan',
  description: 'Ketentuan pemakaian Nalar — akun, kuota per paket, kepemilikan konten, batasan jawaban AI, dan penghentian layanan.',
};

/**
 * Ketentuan Layanan — PUBLIK.
 *
 * Menggambarkan mekanisme yang MEMANG berjalan di sistem (verifikasi
 * pendaftaran, kuota per paket, plan kedaluwarsa turun ke free, soft delete),
 * bukan janji umum. Yang belum ada — SLA, ekspor mandiri, pembayaran otomatis —
 * disebut apa adanya.
 */
export default function TermsPage() {
  return (
    <LegalPage
      /* Nama aplikasi ikut di <h1> — alasan sama dengan halaman privasi. */
      title="Ketentuan Layanan Nalar"
      updated="27 Juli 2026"
      intro="Dengan membuat akun atau memakai Nalar, kamu menyetujui ketentuan di bawah ini. Kami menulisnya sependek mungkin dan menyebut apa adanya hal-hal yang belum tersedia."
      english={(
        <>
          <p>
            <b>Nalar</b> is a question-answering application for an organisation&apos;s own
            documents. The full terms below are in Indonesian; this summary states the same
            terms in English.
          </p>
          <ul>
            <li><b>Your content stays yours.</b> We claim no ownership of the documents or
              conversations you put in. You grant us a limited permission to process them
              solely to run the service — extract text, build vectors, store them, and send
              the relevant excerpts to the AI model provider you choose. That permission ends
              when you delete the content.</li>
            <li><b>We do not use your content to train any AI model.</b></li>
            <li><b>Accounts are approved manually.</b> A new sign-up stays pending until an
              administrator approves it, so registering does not by itself grant access.</li>
            <li><b>Provided as is, with no SLA at this stage.</b> Outages, maintenance, and
              feature changes can happen without prior notice, and we depend on third parties
              (hosting, database, model providers) whose failures are outside our control.</li>
            <li><b>AI answers can be wrong.</b> They are generated from your documents and
              must not be treated as legal, medical, or financial advice.</li>
          </ul>
          <p>
            Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            See also the <a href="/privacy">Privacy Policy</a>.
          </p>
        </>
      )}
    >
      <h2>1. Layanan</h2>
      <p>
        Nalar adalah platform Retrieval-Augmented Generation multi-organisasi: ia
        membaca dokumen yang kamu hubungkan, menyusunnya jadi basis pengetahuan, dan
        menyediakan chatbot yang bisa dipasang di situs mana pun untuk menjawab
        berdasarkan isi dokumen tersebut.
      </p>

      <h2>2. Akun dan verifikasi</h2>
      <ul>
        <li>Pendaftaran terbuka, tetapi akun baru <b>tidak langsung aktif</b>.</li>
        <li>
          Setiap pendaftaran menunggu verifikasi pengelola sebelum bisa masuk. Kami
          berhak menolak pendaftaran tanpa harus menyebutkan alasan.
        </li>
        <li>
          Kamu bertanggung jawab menjaga kerahasiaan kata sandi dan seluruh aktivitas
          di bawah akunmu.
        </li>
        <li>
          Satu pendaftaran membuat satu organisasi terpisah. Anggota lain bergabung
          lewat undangan yang berlaku 7 hari dan sekali pakai.
        </li>
      </ul>

      <h2>3. Paket dan kuota</h2>
      <p>Pemakaian dibatasi sesuai paket, dan batas itu ditegakkan sistem:</p>
      <table>
        <tbody>
          <tr><th>Paket</th><th>Pesan/bulan</th><th>Chatbot</th><th>Anggota</th></tr>
          <tr><td>Free</td><td>1.000</td><td>1</td><td>2</td></tr>
          <tr><td>Pro</td><td>50.000</td><td>10</td><td>15</td></tr>
          <tr><td>Enterprise</td><td>tanpa batas</td><td>tanpa batas</td><td>tanpa batas</td></tr>
        </tbody>
      </table>
      <p>
        Kuota tercapai berarti permintaan berikutnya ditolak sampai periode berikutnya
        atau paket dinaikkan. Batas laju juga berlaku untuk mencegah penyalahgunaan.
      </p>
      <div className="legal-note">
        <b>Paket berbayar punya masa berlaku</b>
        <p>
          Bila masa berlaku terlewat, paket <b>otomatis turun ke Free</b> dan kuota
          menyesuaikan — termasuk jumlah chatbot dan anggota. Data tidak dihapus, tetapi
          bisa jadi melebihi batas paket baru sampai kamu merapikannya atau
          memperpanjang.
        </p>
      </div>
      <p>
        Saat ini pembayaran <b>belum otomatis</b>. Kenaikan paket diproses manual:
        setelah pembayaran diterima, pengelola mengaktifkan paket sampai tanggal yang
        disepakati.
      </p>

      <h2>4. Kepemilikan konten</h2>
      <p>
        <b>Dokumen dan percakapanmu tetap milikmu.</b> Kami tidak mengklaim kepemilikan
        atas apa pun yang kamu masukkan.
      </p>
      <p>
        Kamu memberi kami izin terbatas untuk memproses konten itu semata-mata demi
        menjalankan layanan: mengekstrak teks, membuat vektor, menyimpannya, dan
        mengirim potongan yang relevan ke penyedia model yang kamu pilih. Izin ini
        berakhir ketika kamu menghapus kontennya.
      </p>
      <p>
        Kami tidak memakai kontenmu untuk melatih model AI apa pun. Rinciannya ada di{' '}
        <a href="/privacy">Kebijakan Privasi</a>.
      </p>

      <h2>5. Kewajibanmu</h2>
      <ul>
        <li>
          Pastikan kamu <b>berhak</b> memasukkan dokumen yang kamu hubungkan — termasuk
          bila di dalamnya ada data pribadi milik orang lain.
        </li>
        <li>
          Jangan memakai layanan untuk hal melanggar hukum, menyebarkan malware, atau
          melanggar hak orang lain.
        </li>
        <li>
          Jangan mencoba menembus pemisahan antar organisasi, membalikkan rekayasa
          sistem, atau membebani layanan secara tak wajar.
        </li>
        <li>
          Kamu bertanggung jawab atas kunci API penyedia model yang kamu masukkan,
          termasuk biaya yang timbul dari pemakaiannya.
        </li>
      </ul>

      <h2>6. Batasan jawaban AI</h2>
      <div className="legal-note">
        <b>Jawaban bisa salah — periksa yang penting</b>
        <p>
          Chatbot menjawab dengan model bahasa. Meski jawabannya dilandaskan pada
          dokumenmu dan disertai sitasi, model tetap bisa keliru menafsirkan,
          melewatkan konteks, atau menghasilkan pernyataan yang terdengar meyakinkan
          namun tidak benar. Sitasi disediakan supaya kamu bisa memeriksa sendiri.
        </p>
      </div>
      <p>
        Jangan menjadikan keluaran layanan ini sebagai satu-satunya dasar untuk nasihat
        medis, hukum, keuangan, atau keputusan berisiko tinggi lainnya. Kualitas
        jawaban juga bergantung pada kelengkapan dokumen yang kamu masukkan dan pada
        penyedia model yang kamu pilih.
      </p>

      <h2>7. Ketersediaan</h2>
      <p>
        Layanan disediakan <b>apa adanya</b>. Pada tahap ini <b>belum ada jaminan
        tingkat layanan (SLA)</b>: bisa terjadi gangguan, pemeliharaan, atau perubahan
        fitur tanpa pemberitahuan sebelumnya. Kami juga bergantung pada pihak ketiga
        (hosting, database, penyedia model) yang gangguannya di luar kendali kami.
      </p>

      <h2>8. Penghentian</h2>
      <ul>
        <li>Kamu bisa berhenti memakai layanan kapan saja.</li>
        <li>
          Kami dapat menangguhkan atau menghentikan akun yang melanggar ketentuan ini,
          menyalahgunakan sumber daya, atau membahayakan pengguna lain.
        </li>
        <li>
          Setelah penghentian, data tersimpan dalam keadaan terhapus lunak. Untuk
          penghapusan permanen, ajukan permintaan ke pengelola — saat ini dikerjakan
          manual.
        </li>
      </ul>

      <h2>9. Tanggung jawab</h2>
      <p>
        Sejauh diizinkan hukum yang berlaku, kami tidak bertanggung jawab atas kerugian
        tidak langsung, kehilangan keuntungan, atau kehilangan data yang timbul dari
        pemakaian layanan. Tanggung jawab kami dalam hal apa pun dibatasi pada jumlah
        yang kamu bayarkan untuk layanan dalam 12 bulan terakhir.
      </p>
      <p>
        Simpan salinan sendiri atas dokumen penting. Jangan menjadikan layanan ini
        satu-satunya tempat penyimpanan.
      </p>

      <h2>10. Perubahan ketentuan</h2>
      <p>
        Ketentuan dapat berubah. Perubahan berarti akan diberitahukan dan tanggal
        berlaku di atas diperbarui. Melanjutkan pemakaian setelah perubahan berarti
        menyetujuinya.
      </p>

      <h2>11. Hukum yang berlaku</h2>
      <p>
        Ketentuan ini tunduk pada hukum Republik Indonesia. Perselisihan diupayakan
        diselesaikan secara musyawarah lebih dahulu.
      </p>

      <h2>12. Kontak</h2>
      <p>
        Pertanyaan soal ketentuan ini bisa dikirim ke{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
