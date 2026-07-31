import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * PERINGATAN.
 *
 * Yang dijaga di sini bukan deteksinya — itu bagian yang mudah. Yang dijaga
 * adalah agar peringatannya tak jadi kebisingan: sistem peringatan yang
 * berisik lebih buruk daripada tak ada sistem peringatan sama sekali, karena
 * ia memberi rasa aman yang palsu sambil melatih orang mengabaikannya.
 */

const load = () => import('../src/modules/core/alerts');
const SYNC = readFileSync('src/modules/knowledge/sync.service.ts', 'utf8');
const WH = readFileSync('src/modules/integrations/webhook.service.ts', 'utf8');

test('kuota TANPA BATAS tak pernah memicu peringatan', async () => {
  /* Infinity tak selamat melewati JSON dan jadi null; tenant on-premise &
     platform memang tak dibatasi apa pun. Memaksakan angka persen di sana
     akan berbunyi SELAMANYA — dan peringatan yang selalu berbunyi adalah
     peringatan yang tak pernah dibaca. */
  const { periksaKuota } = await load();
  assert.equal(periksaKuota(1_000_000, null), null);
  assert.equal(periksaKuota(1_000_000, Infinity), null);
  assert.equal(periksaKuota(5, 0), null);
});

test('kuota: diam di bawah ambang, PERHATIAN di 80%, GAWAT saat habis', async () => {
  const { periksaKuota, AMBANG_KUOTA_PERHATIAN } = await load();
  assert.equal(AMBANG_KUOTA_PERHATIAN, 80);
  // Diam — tak ada tingkat "informasi", karena peringatan tingkat informasi
  // tak pernah ditindaklanjuti siapa pun dan hanya menambah kebisingan.
  assert.equal(periksaKuota(50, 100), null);
  assert.equal(periksaKuota(79, 100), null);

  const dekat = periksaKuota(80, 100)!;
  assert.equal(dekat.jenis, 'kuota.hampir-habis');
  assert.equal(dekat.tingkat, 'perhatian');

  const habis = periksaKuota(100, 100)!;
  assert.equal(habis.jenis, 'kuota.habis');
  assert.equal(habis.tingkat, 'gawat');
  // Melebihi batas tetap "habis", bukan diam.
  assert.equal(periksaKuota(140, 100)!.jenis, 'kuota.habis');
});

test('lonjakan galat butuh DUA syarat, bukan satu', async () => {
  const { periksaLonjakanGalat, MIN_GALAT_LONJAKAN, LIPAT_LONJAKAN } = await load();
  // LIPAT saja akan berbunyi untuk 1 → 3 galat, yang pada lalu lintas kecil
  // terjadi setiap hari tanpa ada yang rusak.
  assert.equal(periksaLonjakanGalat(3, 1), null, 'lonjakan kecil ikut berbunyi');
  // JUMLAH saja akan diam pada tenant besar yang galatnya memang selalu
  // tinggi, lalu tak pernah menyebut ketika ia berlipat.
  assert.equal(periksaLonjakanGalat(50, 40), null, 'jumlah besar tanpa lonjakan ikut berbunyi');
  // Keduanya terpenuhi → berbunyi.
  assert.ok(periksaLonjakanGalat(MIN_GALAT_LONJAKAN * LIPAT_LONJAKAN, MIN_GALAT_LONJAKAN));
  // Lonjakan dari NOL tetap terbaca sebagai lonjakan (pembagi dijaga ≥ 1).
  assert.ok(periksaLonjakanGalat(20, 0));
});

test('tiap jenis punya jendela redam sendiri, dan lamanya masuk akal', async () => {
  const { REDAM_MS } = await load();
  const jam = (n: number) => n * 60 * 60 * 1000;
  // Lonjakan galat justru yang ingin diketahui CEPAT, dan biasanya reda
  // sendiri — redaman panjang akan menyembunyikan gelombang kedua.
  assert.ok(REDAM_MS['galat.melonjak'] <= jam(2),
    'lonjakan galat diredam terlalu lama — gelombang kedua akan hilang');
  // Kuota hampir habis bertahan berhari-hari; mengingatkannya tiap jam tak
  // mempercepat apa pun.
  assert.ok(REDAM_MS['kuota.hampir-habis'] >= jam(12),
    'peringatan kuota akan berbunyi berkali-kali untuk keadaan yang sama');
  // Sync berjalan berkali-kali sehari.
  assert.ok(REDAM_MS['sync.gagal'] >= jam(3),
    'satu folder yang izinnya dicabut akan mengirim belasan peringatan/hari');
});

test('peredaman diperiksa SEBELUM mencatat, bukan sesudah', async () => {
  /* Kalau urutannya terbalik, audit_logs terisi baris peringatan setiap kali
     dipanggil dan peredamannya jadi hiasan — pemeriksaan berikutnya selalu
     menemukan baris barusan. */
  const SRC = readFileSync('src/modules/core/alerts.ts', 'utf8');
  const fn = SRC.slice(SRC.indexOf('export async function terbitkanPeringatan'));
  const iRedam = fn.indexOf('masihDiredam');
  const iAudit = fn.indexOf('await audit(');
  assert.ok(iRedam > 0 && iAudit > iRedam,
    'pencatatan mendahului pemeriksaan redaman — peredamannya jadi tak berfungsi');
});

test('gagal menerbitkan peringatan TIDAK menggagalkan alur pemicunya', async () => {
  /* Sync yang gagal lalu ikut meledak karena peringatannya gagal terkirim
     adalah kerusakan kedua yang menutupi kerusakan pertama — dan yang
     pertama itulah yang sebenarnya perlu dibaca orang. */
  const SRC = readFileSync('src/modules/core/alerts.ts', 'utf8');
  const fn = SRC.slice(SRC.indexOf('export async function terbitkanPeringatan'));
  assert.ok(/try \{/.test(fn) && /catch \(err\)/.test(fn),
    'penerbitan peringatan bisa melempar dan menjatuhkan alur pemicunya');
  // Galat DIKEMBALIKAN sebagai keadaan, bukan dilempar — dan keadaannya
  // 'gagal', bukan disamarkan jadi 'diredam'.
  assert.ok(/return 'gagal'/.test(fn));
  assert.ok(!/throw/.test(fn), 'masih melempar keluar dan bisa menjatuhkan pemicunya');
});

test('sync memperingatkan pada GAGAL dan pada KUOTA HABIS', async () => {
  // Status sumber hanya terbaca oleh yang kebetulan membuka halaman
  // Knowledge; akibatnya — dokumen berhenti masuk — baru terasa berhari-hari
  // kemudian saat jawaban mulai meleset.
  assert.ok(/periksaSync\(\{/.test(SYNC), 'kegagalan sync tak menerbitkan peringatan');
  assert.ok(/jenis: 'kuota\.habis'/.test(SYNC), 'sync yang berhenti karena kuota tak diperingatkan');
  // Peringatan gagal harus terbit SEBELUM melempar ulang; kalau tidak, tak
  // ada pemanggil yang tahu sumber mana yang gagal.
  const blokCatch = SYNC.slice(SYNC.lastIndexOf("await setStatus('error'"));
  const iTerbit = blokCatch.indexOf('terbitkanPeringatan');
  const iThrow = blokCatch.indexOf('throw err');
  assert.ok(iTerbit > 0 && iTerbit < iThrow,
    'peringatan diterbitkan setelah melempar — tak akan pernah terkirim');
});

test('alert.raised terdaftar sebagai event webhook & punya label manusia', async () => {
  // Tanpa ini peringatan hanya tercatat di audit dan tak pernah SAMPAI ke
  // siapa pun — yang persis keadaan sebelum kartu ini dikerjakan.
  assert.ok(/'alert\.raised',/.test(WH), 'alert.raised tak bisa dilanggan webhook');
  assert.ok(/'alert\.raised': '[^']{20,}'/.test(WH),
    'alert.raised tak punya label yang bisa dibaca manusia di UI langganan');
});

test('hasil penerbitan punya TIGA keadaan — gagal tak menyamar jadi diredam', async () => {
  /* Versi pertama mengembalikan boolean, dan `false` berarti "diredam" ATAU
     "gagal" sekaligus. Ketika kuerinya benar-benar gagal (objek Date dikirim
     sebagai parameter, ditolak jalur tx.execute), fungsinya mengembalikan
     false dan seluruh sistem peringatan TAMPAK bekerja normal — diam karena
     "sudah diredam". Ketahuan hanya karena dijalankan terhadap basis data
     sungguhan; tak satu pun tes unit bisa menangkapnya. */
  const SRC = readFileSync('src/modules/core/alerts.ts', 'utf8');
  assert.ok(/HasilPeringatan = 'terbit' \| 'diredam' \| 'gagal'/.test(SRC),
    'hasil penerbitan kembali jadi boolean — gagal akan menyamar jadi diredam');
  assert.ok(/return 'gagal'/.test(SRC) && /return 'diredam'/.test(SRC) && /return 'terbit'/.test(SRC));
});

test('jendela redam dihitung di sisi Postgres, bukan dikirim sebagai Date', async () => {
  /* Objek Date tak bisa jadi parameter di jalur tx.execute — postgres.js
     menolaknya dengan ERR_INVALID_ARG_TYPE. Kegagalannya tak terlihat saat
     menulis maupun saat typecheck; ia hanya muncul ketika kuerinya
     benar-benar dijalankan, dan tertelan try/catch. */
  const SRC = readFileSync('src/modules/core/alerts.ts', 'utf8');
  const fn = SRC.slice(SRC.indexOf('async function masihDiredam'), SRC.indexOf('export type HasilPeringatan'));
  assert.ok(/make_interval\(secs =>/.test(fn),
    'jendela redam tak dihitung di SQL — Date sebagai parameter akan gagal saat dijalankan');
  assert.ok(!/new Date\(/.test(fn), 'masih membuat objek Date untuk dikirim ke kueri');
});

test('kegagalan penerbitan DICATAT ke log, bukan ditelan diam-diam', async () => {
  // Kegagalan di sini berarti sistem peringatan itu sendiri yang rusak —
  // dan tak ada peringatan kedua yang akan memberi tahu soal itu.
  const SRC = readFileSync('src/modules/core/alerts.ts', 'utf8');
  assert.ok(/console\.error\(\s*`\[alerts\] GAGAL/.test(SRC),
    'kegagalan penerbitan tak berteriak di log — pemantauan bisa mati tanpa ada yang tahu');
});
