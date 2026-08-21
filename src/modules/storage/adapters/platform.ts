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
    /* Mode access HARUS match dengan konfigurasi store Vercel. Produk ini
       memakai STORE PUBLIK (lihat EMBEDDING_MODEL_BLOB_URL yang berdomain
       `*.public.blob.vercel-storage.com` dan store id yang sama). Kalau
       dipaksa `private` di store publik, Vercel menolak unggahan:
       "Cannot use private access on a public store". Untuk instalasi yang
       memakai STORE PRIVAT, akses ini wajib diganti `private` juga. */
    const hasil = await put(c.key, c.bytes, {
      access: 'public',
      contentType: c.mime || 'application/octet-stream',
      addRandomSuffix: false,
    });
    /* Path objek di dalam blob diturunkan dari URL publik — blob memakai
       akhiran acak saat unggah supaya tumbukan nama tak menimpa isi. */
    const url = new URL(hasil.url);
    const pathBerkas = url.pathname.replace(/^\/+/, '');
    return { path: pathBerkas, url: hasil.url };
  },
  async ambil(_kred, key) {
    this.validasi(_kred);
    /* Blob platform mengunduh lewat pathname (bukan URL penuh); `path` yang
       dicatat saat simpan adalah pathname — bersih tanpa query/host, jadi
       stabil utk re-sync. get() butuh access yang SAMA dengan store (public).
       Unduhan utk URI ini: statusCode 200 dengan `stream` ReadableStream,
       atau 304 (tak berubah) dengan stream null — 304 disetel lewat
       ifNoneMatch, yang tak kita pakai, jadi stream selalu ada di 200. */
    const { head, get } = await import('@vercel/blob');
    let mime: string | null = null;
    try {
      const meta = await head(key);
      mime = meta.contentType ?? null;
    } catch {
      // head opsional — kalau gagal (mis. 404), unduh saja; get menolak 404.
    }
    const hasil = await get(key, { access: 'public' });
    if (!hasil) throw new Error('Berkas tak ditemukan di blob platform (mungkin terhapus).');
    if (hasil.statusCode !== 200 || hasil.stream === null) {
      throw new Error('Berkas di blob platform tak dapat diunduh.');
    }
    const kumpulkan = async ()
      : Promise<Buffer> => Buffer.from(await new Response(hasil.stream).arrayBuffer());
    return { content: await kumpulkan(), mime };
  },
};

daftarkanPenyedia(platformAdapter);
