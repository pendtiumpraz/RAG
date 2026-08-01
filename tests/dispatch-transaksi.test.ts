import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';

/**
 * DISPATCH TIDAK BOLEH BERJALAN DI DALAM withTenant().
 *
 * KEJADIAN NYATA (1–2 Agu 2026, produksi). "Tambah chatbot muter2 terus" —
 * bukan galat, bukan lambat, tapi menggantung tanpa ujung.
 *
 * Mekanismenya: di Vercel kolam koneksi dipatok `max: 1`. Selama sebuah
 * transaksi terbuka, ia MEMEGANG satu-satunya koneksi. `dispatch()` memanggil
 * handler webhook, yang memanggil `fanout()`, yang membuka `withTenant`
 * KEDUA — dan permintaan koneksi kedua itu menunggu koneksi pertama dilepas,
 * sementara yang pertama menunggu dispatch selesai. Keduanya menunggu
 * selamanya.
 *
 * TAK TERLIHAT DI MESIN PENGEMBANGAN, dan itulah yang membuatnya bertahan
 * lama: di sana `max: 10`, jadi koneksi kedua selalu tersedia dan semuanya
 * tampak baik-baik saja. Saya sendiri menjalankan pembuatan chatbot dari
 * laptop dan ia BERHASIL — bukti yang menyesatkan, karena kolamnya berbeda.
 *
 * Peristiwa memang tak perlu ikut di dalam transaksi: ia memberitahu DUNIA
 * LUAR bahwa sesuatu SUDAH terjadi, dan sesuatu itu baru benar terjadi
 * setelah transaksinya commit.
 */

function berkasModul(dir = 'src/modules'): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = `${dir}/${f}`;
    if (statSync(p).isDirectory()) out.push(...berkasModul(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/**
 * Cari `dispatch(` yang berada di dalam jangkauan sebuah `withTenant(`.
 *
 * Jangkauan dihitung dengan MENCOCOKKAN KURUNG, bukan dengan jendela sekian
 * ratus karakter. Jendela tetap bergeser tiap kali ada komentar ditambahkan,
 * dan uji yang "lulus" karena jendelanya kependekan tak menjaga apa pun —
 * pelajaran yang sudah dibayar sekali di kartu ekspor percakapan.
 */
export function dispatchDalamTransaksi(sumber: string): number[] {
  const temuan: number[] = [];
  let i = -1;
  while ((i = sumber.indexOf('withTenant(', i + 1)) >= 0) {
    let depth = 0;
    let j = i + 'withTenant'.length;
    let mulai = -1;
    for (; j < sumber.length; j++) {
      const c = sumber[j];
      if (c === '(') { depth++; if (mulai < 0) mulai = j; continue; }
      if (c === ')') { depth--; if (depth === 0) break; }
    }
    if (depth !== 0 || mulai < 0) continue;          // kurung tak seimbang → lewati
    const isi = sumber.slice(mulai, j);
    const d = isi.indexOf('dispatch(');
    if (d >= 0) temuan.push(sumber.slice(0, mulai + d).split('\n').length);
  }
  return temuan;
}

/* ── kontrol positif: buktikan pemindainya menggigit ─────────────────── */

test('bentuk yang PERSIS jadi bug terdeteksi', () => {
  /* Tanpa kontrol positif, "nol temuan" tak membuktikan apa pun — pemindai
     yang rusak juga menjawab nol, dan menjawabnya selamanya. */
  const buruk = `
    return withTenant(tenantId, async (tx) => {
      const created = await repo.create(tx, values);
      await dispatch('chatbot.created', { tenantId });
      return created;
    });`;
  assert.equal(dispatchDalamTransaksi(buruk).length, 1);
});

test('dispatch SESUDAH transaksi tidak ditandai', () => {
  /* Pemindai yang menandai kode benar akan dimatikan orang dalam seminggu,
     dan matinya permanen. */
  const baik = `
    const created = await withTenant(tenantId, async (tx) => {
      return repo.create(tx, values);
    });
    await dispatch('chatbot.created', { tenantId });
    return created;`;
  assert.deepEqual(dispatchDalamTransaksi(baik), []);
});

test('withTenant BERSARANG tidak membingungkan pencocokan kurung', () => {
  const bersarang = `
    await withTenant(a, async (tx) => {
      await helper(withTenant(b, (t2) => t2.select()));
      await dispatch('x', {});
    });`;
  assert.equal(dispatchDalamTransaksi(bersarang).length, 1);
});

/* ── pemindaian repo: keadaan yang harus dipertahankan ───────────────── */

test('tak ada satu pun dispatch di dalam transaksi', () => {
  const semua = berkasModul().flatMap((p) =>
    dispatchDalamTransaksi(readFileSync(p, 'utf8')).map((baris) => `${p}:${baris}`));
  assert.deepEqual(semua, [],
    'dispatch() berjalan di dalam withTenant(). Di Vercel kolam koneksi max:1, '
    + 'jadi handler webhook yang membuka transaksi kedua akan menunggu koneksi '
    + 'yang sedang dipegang transaksi pertama — dan permintaannya MENGGANTUNG '
    + 'tanpa ujung. Pindahkan dispatch ke LUAR transaksi.\n' + semua.join('\n'));
});

test('pemindai benar-benar membaca berkas, bukan daftar kosong', () => {
  /* Kalau penelusuran direktorinya rusak, uji di atas lulus selamanya tanpa
     memeriksa apa pun — bentuk kegagalan yang paling sepi dari semuanya. */
  const berkas = berkasModul();
  assert.ok(berkas.length > 40, `hanya ${berkas.length} berkas terpindai`);
  assert.ok(berkas.includes('src/modules/chatbot/chatbot.service.ts'));
  const svc = readFileSync('src/modules/chatbot/chatbot.service.ts', 'utf8');
  assert.ok(/await dispatch\('chatbot\.created'/.test(svc), 'berkas terbaca tapi isinya bukan yang dimaksud');
});

/* ── sebab hulunya, supaya alasannya tak hilang ──────────────────────── */

test('fanout MEMANG membuka transaksi sendiri — itu sebab kebuntuannya', () => {
  /* Kalau suatu hari fanout berhenti menyentuh basis data, larangan di atas
     jadi kehilangan alasannya — dan aturan tanpa alasan adalah aturan yang
     dilanggar orang berikutnya. Uji ini menjaga alasannya tetap benar. */
  const wh = readFileSync('src/modules/integrations/webhook.service.ts', 'utf8');
  const blok = wh.slice(wh.indexOf('async fanout('), wh.indexOf('async fanout(') + 500);
  assert.ok(/withTenant\(/.test(blok),
    'fanout tak lagi membuka transaksi — periksa apakah larangan dispatch-dalam-transaksi masih perlu');
});

test('kolam koneksi memang 1 di Vercel — itu yang membuatnya buntu', () => {
  const db = readFileSync('src/modules/core/db/index.ts', 'utf8');
  assert.ok(/max: process\.env\.VERCEL \? 1 : 10/.test(db),
    'kolam koneksi berubah — periksa ulang apakah kebuntuan ini masih mungkin');
});
