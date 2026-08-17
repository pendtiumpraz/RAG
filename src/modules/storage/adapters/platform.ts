/**
 * ADAPTER PLATFORM BLOB (Vercel Blob) — bawaan SUPERADMIN.
 *
 * WAKTU INI TIDAK PERNAH TERSIMPAN di tabel storage_connections. Ia bawaan
 * dari env (BLOB_STORE_ID/BLOB_READ_WRITE_TOKEN) dan tetap dipakai untuk
 * siapa pun yang BELUM menghubungkan penyimpanannya sendiri. Keberadaannya
 * di registry menjaga UI selalu melihat opsi "Blob platform" tanpa perlu baris
 * basis data.
 */
import {
  daftarkanPenyedia, type KredensialStorage, type StorageAdapter,
} from '../adapter';

export const platformAdapter: StorageAdapter = {
  provider: 'platform',
  label: 'Blob platform (Vercel)',
  wajib: [],
  scopingDari() {
    /* Store id tak pernah di-kirim utuh ke peramban — cukup penanda ada/tidaknya. */
    return { terpasang: Boolean(process.env.BLOB_STORE_ID && process.env.BLOB_READ_WRITE_TOKEN) };
  },
  validasi(_kred: KredensialStorage) {
    if (!process.env.BLOB_STORE_ID || !process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error('Blob platform belum dikonfigurasi (BLOB_STORE_ID/BLOB_READ_WRITE_TOKEN).');
    }
  },
  async uji(kred: KredensialStorage) {
    this.validasi(kred);
    return { ok: true, detail: 'Blob platform aktif — dipakai sebagai bawaan.' };
  },
  async simpan(_kred, c) {
    this.validasi(_kred);
    const { put } = await import('@vercel/blob');
    const hasil = await put(c.key, c.bytes, {
      access: 'private',
      contentType: c.mime || 'application/octet-stream',
      addRandomSuffix: false,
    });
    /* Path objek di dalam blob diturunkan dari URL publik — blob memakai
       akhiran acak saat unggah supaya tumbukan nama tak menimpa isi. */
    const url = new URL(hasil.url);
    const pathBerkas = url.pathname.replace(/^\/+/, '');
    return { path: pathBerkas, url: hasil.url };
  },
};

daftarkanPenyedia(platformAdapter);
