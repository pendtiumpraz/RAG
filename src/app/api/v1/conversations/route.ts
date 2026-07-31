import { NextResponse } from 'next/server';
import { withTenant } from '@/modules/core/db/tenant-context';
import { bangunKueriDaftar, batasiAmbil, halaman, tafsirSejak } from '@/modules/chat/ekspor';
import { apiRoute } from '../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/conversations — daftar percakapan tenant, untuk ditarik SERVER
 * pelanggan ke sistem mereka sendiri (CRM, gudang data, arsip).
 *
 * KENAPA INI PERLU ADA, padahal /api/chat/{publicKey}/history sudah lama ada.
 * Endpoint publik itu menuntut `visitorId` milik peramban DAN origin yang
 * diizinkan — dirancang untuk widget memulihkan percakapan yang sedang
 * berjalan, bukan untuk mesin. Server pelanggan tak punya keduanya, jadi
 * sampai sekarang tak ada satu pun jalan bagi mereka mengambil transkripnya
 * sendiri, meskipun datanya memang tinggal di server kita.
 *
 * PAGINASI BERBASIS WAKTU, bukan offset. Percakapan baru lahir terus-menerus,
 * dan dengan offset baris akan bergeser di antara dua permintaan: penarik
 * berkala melewatkan sebagian dan menggandakan sebagian lain, tanpa pernah
 * tahu. Kursor `sejak` bergerak maju dan tak bisa melompat.
 *
 * LINTAS DIVISI DENGAN SENGAJA. Kunci API milik TENANT, bukan orang, dan
 * setaranya adalah admin tenant — yang menurut keputusan pemilik produk
 * memang melihat seluruh divisi (lihat chatbot/divisi.ts). Menyaringnya per
 * divisi di sini berarti kunci API punya pandangan yang lebih sempit dari
 * pemiliknya, dan arsip pelanggan jadi bolong tanpa penjelasan.
 *
 * Kuerinya sendiri dibangun di `chat/ekspor.ts` supaya SQL yang dihasilkan
 * bisa diperiksa uji tanpa basis data — lihat catatan di sana soal subkueri
 * tak berkualifikasi yang membuat versi pertama selalu menjawab `pesan: 0`.
 */
export const GET = apiRoute('read', async (req, _ctx, caller) => {
  const q = new URL(req.url).searchParams;
  const batas = batasiAmbil(q.get('limit'));

  let sejak: Date | null;
  try {
    sejak = tafsirSejak(q.get('sejak') ?? q.get('since'));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const baris = await withTenant(caller.tenantId, (tx) =>
    bangunKueriDaftar(tx, { sejak, chatbotId: q.get('chatbotId'), batas }));

  const h = halaman(baris, batas);
  return NextResponse.json({
    conversations: h.items,
    adaLagi: h.adaLagi,
    berikutnya: h.berikutnya,
  });
});
