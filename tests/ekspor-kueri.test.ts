import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * SQL YANG BENAR-BENAR DIHASILKAN untuk ekspor percakapan.
 *
 * Ada karena satu cacat yang lolos utuh melewati seluruh gerbang: rute
 * /api/v1/conversations menghitung jumlah pesan lewat subkueri berkorelasi
 * yang ditulis di dalam template `sql`, dan Drizzle merender kolomnya TANPA
 * kualifikasi tabel —
 *
 *     where "conversation_id" = "id"
 *
 * — sehingga di dalam subkueri keduanya menunjuk kolom `messages` sendiri.
 * Yang dibandingkan `messages.conversation_id = messages.id`, praktis tak
 * pernah benar, dan endpoint-nya SELALU menjawab `pesan: 0`. Percakapan
 * dengan 12 pesan dilaporkan kosong.
 *
 * Kenapa tak ada yang menangkapnya: tsc tak memvalidasi SQL, lint tak
 * membacanya, build cuma mengompilasi, dan uji unit tak menyentuh basis data.
 * Empat gerbang hijau, satu endpoint yang selalu salah.
 *
 * `.toSQL()` menutup celah itu — ia memberi teks SQL persisnya TANPA koneksi,
 * jadi kesalahan rendering bisa dijaga di lapisan yang sama murahnya dengan
 * uji unit lain.
 */

const bangun = async () => {
  const { db } = await import('../src/modules/core/db');
  const { bangunKueriDaftar } = await import('../src/modules/chat/ekspor');
  return (opsi: Parameters<typeof bangunKueriDaftar>[1]) =>
    bangunKueriDaftar(db, opsi).toSQL().sql;
};

const DASAR = { sejak: null, chatbotId: null, batas: 50 };

test('perbandingan antar-tabel DIKUALIFIKASI nama tabelnya', () => {
  /* Inti cacatnya. Tanpa kualifikasi, perbandingan tetap SQL yang sah — jadi
     ia berjalan, tak melempar apa pun, dan hanya menjawab angka yang salah. */
  return bangun().then((sqlDari) => {
    const s = sqlDari(DASAR);
    assert.ok(s.includes('"messages"."conversation_id" = "conversations"."id"'),
      `perbandingan tak terkualifikasi — hitungannya akan selalu 0:\n${s}`);
    assert.ok(!/where "conversation_id" = "id"/.test(s));
  });
});

test('jumlah pesan dihitung dari kolom messages, bukan count(*)', async () => {
  /* Pada LEFT JOIN, count(*) menghitung baris — percakapan TANPA pesan akan
     dilaporkan punya 1, karena join menghasilkan satu baris berisi NULL.
     count(messages.id) mengabaikan NULL dan menjawab 0, yang benar. */
  const s = (await bangun())(DASAR);
  assert.ok(/count\("messages"\."id"\)/.test(s), `count salah bentuk:\n${s}`);
  assert.ok(!/count\(\*\)/.test(s), 'count(*) pada LEFT JOIN melaporkan 1 untuk percakapan kosong');
});

test('soft delete pesan ada di kondisi JOIN, bukan di WHERE', async () => {
  /* Di WHERE, percakapan yang SELURUH pesannya terhapus ikut lenyap dari
     daftar — percakapan yang nyata ada mendadak tak bisa diekspor sama
     sekali, dan tak ada yang menjelaskan kenapa. */
  const s = (await bangun())(DASAR);
  const join = s.slice(s.indexOf('left join'), s.indexOf('where'));
  assert.ok(/"messages"\."deleted_at" is null/.test(join),
    `syarat soft delete pesan tak ada di JOIN:\n${join}`);
  const where = s.slice(s.indexOf('where'), s.indexOf('group by'));
  assert.ok(!/"messages"\./.test(where), `kolom messages muncul di WHERE:\n${where}`);
});

test('GROUP BY memuat SELURUH kolom non-agregat', async () => {
  /* Postgres menolak yang kurang, dan Drizzle tak menambahkannya sendiri —
     jadi kolom yang ditambahkan ke SELECT belakangan akan meledak di runtime,
     bukan saat kompilasi. */
  const s = (await bangun())(DASAR);
  const group = s.slice(s.indexOf('group by'), s.indexOf('order by'));
  for (const k of ['id', 'chatbot_id', 'visitor_id', 'started_at', 'updated_at']) {
    assert.ok(group.includes(`"conversations"."${k}"`), `${k} tak ada di GROUP BY:\n${group}`);
  }
});

test('penyaring opsional benar-benar masuk SQL saat diisi', async () => {
  /* Penyaring yang diam-diam tak terpasang membuat penarik berkala mengunduh
     seluruh riwayat tiap kali — berhasil, dan salah. */
  const sqlDari = await bangun();
  const kosong = sqlDari(DASAR);
  assert.ok(!/updated_at" >/.test(kosong));
  assert.ok(!/chatbot_id" =/.test(kosong));

  const isi = sqlDari({ ...DASAR, sejak: new Date(0), chatbotId: '00000000-0000-0000-0000-000000000001' });
  assert.ok(/"conversations"\."updated_at" >/.test(isi), `penyaring sejak hilang:\n${isi}`);
  assert.ok(/"conversations"\."chatbot_id" =/.test(isi), `penyaring chatbot hilang:\n${isi}`);
});

test('urutan menaik + baris pengintip tetap terbawa ke SQL', async () => {
  /* Keduanya sudah dijaga di tingkat fungsi murni (ekspor-percakapan.test.ts),
     tapi yang menentukan adalah apakah ia sampai ke SQL — bukan apakah
     variabelnya benar. */
  const s = (await bangun())({ ...DASAR, batas: 7 });
  assert.ok(/order by "conversations"\."updated_at" asc/.test(s), `urutan salah:\n${s}`);
  assert.ok(/limit \$\d+/.test(s), 'limit tak terpasang');
});
