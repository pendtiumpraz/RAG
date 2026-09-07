/**
 * JALUR RELATIF BERKAS UNGGAHAN (mode unggah folder).
 *
 * Peramban menaruh subfolder di `File.webkitRelativePath`, dan bidang itu TIDAK
 * ikut terkirim dalam multipart — klien mengirimkannya terpisah. Karena itu
 * nilainya datang dari luar dan TIDAK boleh dipercaya: siapa pun bisa memanggil
 * endpoint yang sama dengan `../../etc/passwd`, jalur absolut, atau ribuan
 * segmen.
 *
 * Jalur ini bukan hiasan. Ia dipakai sebagai:
 *   • `externalId` — identitas dokumen. Tanpa jalur, `02-bahasan/ringkasan.docx`
 *     dan `03-penerapan/ringkasan.docx` dianggap dokumen yang SAMA dan yang
 *     kedua menimpa yang pertama tanpa satu pun galat.
 *   • sumber kolom `folder` — yang membuat penyaring folder di halaman Dokumen
 *     berguna.
 *   • bagian kunci objek di blob — dua berkas sejudul dari subfolder berbeda
 *     tak boleh saling menimpa di penyimpanan.
 */

/** Batas panjang jalur yang disimpan — jauh di atas jalur nyata mana pun. */
const MAKS = 300;

/**
 * Bersihkan jalur relatif dari klien.
 *
 * Yang dibuang: pemisah Windows (dinormalkan ke `/`), segmen kosong, `.`, `..`,
 * dan awalan absolut. Hasil kosong jatuh ke `namaBerkas` — sebab dokumen tanpa
 * identitas jauh lebih berbahaya daripada dokumen dengan identitas seadanya.
 */
export function bersihkanJalur(mentah: string | undefined | null, namaBerkas: string): string {
  const norm = (mentah ?? '').replace(/\\/g, '/');
  const bersih = norm
    .split('/')
    /* Segmen di-TRIM dulu, baru disaring. Tanpa itu jalur berisi spasi saja
       ("   ") lolos sebagai segmen yang sah dan menjadi externalId berupa
       spasi — identitas yang tak bisa dibaca siapa pun dan, lebih buruk,
       identitas yang SAMA untuk setiap berkas yang mengirimnya. Ditemukan
       oleh tes, bukan oleh pengguna. */
    .map((seg) => seg.trim())
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/')
    .slice(0, MAKS);
  return bersih || namaBerkas;
}
