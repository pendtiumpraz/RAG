import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { irisBlok } from './_iris';
import { blokKeMarkdown, judulHalaman, teksKaya } from '../src/modules/knowledge/storage/notion';
import { susunTranskrip } from '../src/modules/knowledge/storage/slack';
import { KONEKTOR, konektorBoleh } from '../src/modules/knowledge/konektor';

/**
 * KONEKTOR NOTION & SLACK.
 *
 * ANGGAPAN YANG MEMBUKA KARTU INI. Kartu a-connectors menyatakan keduanya
 * "menunggu KITA mendaftarkan aplikasi OAuth serta memegang client id/
 * secret-nya — itu kredensial pihak ketiga, bukan pekerjaan yang bisa
 * diselesaikan dari repo". Itu hanya benar untuk integrasi MARKETPLACE.
 * Keduanya punya jalur token per-ruang-kerja yang dibuat pelanggan sendiri —
 * Notion internal integration, Slack bot token — persis pola S3 yang sudah
 * selesai lebih dulu di kartu yang sama. Tak ada yang perlu ditunggu.
 */

/* ── Notion: mengubah blok jadi teks ──────────────────────────────────── */

test('judul diambil dari properti bertipe title, apa pun NAMANYA', () => {
  /* Nama properti judul ditentukan pemilik database Notion dan sering bukan
     "Name" — bisa "Judul", "Perkara", apa saja. Mencarinya lewat nama berarti
     seluruh database berbahasa Indonesia mendarat sebagai "Tanpa judul". */
  assert.equal(judulHalaman({
    Perkara: { type: 'title', title: [{ plain_text: 'SOP Pengadaan' }] },
    Status: { type: 'select' },
  }), 'SOP Pengadaan');
  assert.equal(judulHalaman({ Status: { type: 'select' } }), 'Tanpa judul');
  assert.equal(judulHalaman(undefined), 'Tanpa judul');
});

test('judul dipecah beberapa penggal tetap tersambung utuh', () => {
  /* Notion memecah rich_text tiap kali gayanya berubah — satu kata dicetak
     tebal sudah cukup. Mengambil penggal pertama saja memotong judul di
     tempat yang tampak acak. */
  assert.equal(teksKaya([{ plain_text: 'Kebijakan ' }, { plain_text: 'Cuti' }, { plain_text: ' 2026' }]),
    'Kebijakan Cuti 2026');
  assert.equal(teksKaya(null), '');
});

test('struktur dipertahankan sebagai Markdown, bukan diratakan', () => {
  /* Penanda judul & daftar adalah SINYAL yang ikut dipakai pemotong dokumen
     dan kaki leksikal. Membuangnya membuat satu halaman panjang jadi satu
     gumpalan tanpa batas alami — dan potongan yang batasnya sembarang
     menjawab lebih buruk daripada potongan yang batasnya mengikuti bab. */
  const b = (type: string, teks: string) => ({ id: 'x', type, [type]: { rich_text: [{ plain_text: teks }] } });
  assert.equal(blokKeMarkdown(b('heading_1', 'Bab 1')), '# Bab 1');
  assert.equal(blokKeMarkdown(b('heading_3', 'Rincian')), '### Rincian');
  assert.equal(blokKeMarkdown(b('bulleted_list_item', 'satu')), '- satu');
  assert.equal(blokKeMarkdown(b('to_do', 'kerjakan')), '- [ ] kerjakan');
  assert.equal(blokKeMarkdown(b('quote', 'kutipan')), '> kutipan');
  assert.equal(blokKeMarkdown(b('paragraph', 'biasa')), 'biasa');
});

test('blok yang tak dikenal jatuh ke teksnya, bukan hilang', () => {
  /* Notion menambah jenis blok tanpa memberi tahu siapa pun. Jenis tak
     dikenal yang dibuang berarti isi halaman berkurang diam-diam, dan
     pemiliknya tak punya cara menduga bagian mana yang tak terbaca. */
  const aneh = { id: 'x', type: 'jenis_baru_2027', jenis_baru_2027: { rich_text: [{ plain_text: 'tetap terbaca' }] } };
  assert.equal(blokKeMarkdown(aneh), 'tetap terbaca');
});

/* ── Slack: menyusun transkrip ────────────────────────────────────────── */

const pesan = (ts: string, user: string, text: string, subtype?: string) => ({ ts, user, text, subtype });

test('urutan DIBALIK jadi kronologis', () => {
  /* Slack menjawab dari yang terbaru. Percakapan yang dibaca mundur
     kehilangan justru hal yang membuatnya berarti: pertanyaan muncul setelah
     jawabannya, dan LLM membacanya sebagai urutan sebab-akibat terbalik. */
  const out = susunTranskrip([
    pesan('1700000200', 'U2', 'jawabannya 14 hari'),
    pesan('1700000100', 'U1', 'berapa lama cuti tahunan?'),
  ], 'umum');
  assert.ok(out.indexOf('berapa lama') < out.indexOf('jawabannya'), 'transkrip masih terbalik');
});

test('pesan gabung/keluar kanal DIBUANG', () => {
  /* Pada kanal ramai jumlahnya bisa melampaui pesan sungguhan — dan tiap
     baris "X has joined the channel" memakan kuota potongan pelanggan tanpa
     membawa satu pun jawaban. */
  const out = susunTranskrip([
    pesan('1700000100', 'U1', 'has joined the channel', 'channel_join'),
    pesan('1700000200', 'U2', 'isi sungguhan'),
  ], 'umum');
  assert.ok(!/joined/.test(out));
  assert.ok(/isi sungguhan/.test(out));
});

test('kanal yang isinya HANYA derau menghasilkan kosong, bukan judul telanjang', () => {
  /* Dokumen berisi judul saja tetap memakan satu potongan dan tetap bisa
     terambil sebagai "sumber" — sitasi yang menunjuk ke kekosongan lebih
     buruk daripada tidak ada sitasi. */
  assert.equal(susunTranskrip([pesan('1700000100', 'U1', '', 'channel_join')], 'umum'), '');
  assert.equal(susunTranskrip([], 'umum'), '');
});

test('nama kanal ikut di badan dokumen', () => {
  /* Tanpa ini, potongan dari #keuangan dan #teknik terbaca identik begitu
     lepas dari judul berkasnya — dan kaki leksikal kehilangan satu-satunya
     petunjuk asalnya. */
  assert.ok(susunTranskrip([pesan('1700000100', 'U1', 'halo')], 'keuangan').startsWith('# #keuangan'));
});

/* ── saklar & rahasia ─────────────────────────────────────────────────── */

test('keduanya TERSEDIA dan tak menunggu aplikasi OAuth kita', () => {
  for (const jenis of ['notion', 'slack']) {
    const k = KONEKTOR.find((x) => x.jenis === jenis)!;
    assert.equal(k.tersedia, true, `${jenis} masih ditandai belum tersedia`);
    assert.equal(k.butuhAplikasiKita, false,
      `${jenis} masih mengaku butuh aplikasi OAuth kita — itu hanya berlaku untuk marketplace`);
  }
});

test('saklar administrator tetap menahan keduanya', () => {
  /* Tersedia bukan berarti wajib nyala. Superadmin harus tetap bisa menutup
     jalur ini untuk seluruh platform. */
  assert.equal(konektorBoleh('notion', { notion: false }), false);
  assert.equal(konektorBoleh('slack', { slack: false }), false);
  assert.equal(konektorBoleh('notion', {}), true, 'bawaannya tak lagi menyala');
});

const RUTE = readFileSync('src/app/api/sources/route.ts', 'utf8');

test('token DIENKRIPSI di titik masuk, tak pernah polos di jsonb', () => {
  /* `data_sources.config` ikut di setiap SELECT, di layar daftar sumber, dan
     di setiap cadangan basis data. Token Notion/Slack berumur panjang dan tak
     kedaluwarsa sendiri — persis seperti kunci S3. */
  const blok = irisBlok(RUTE, 'function amankanRahasia(');
  assert.ok(/kind === 'notion' \|\| kind === 'slack'/.test(blok), 'token kedua konektor tak disentuh');
  assert.ok(/tokenEnc: encryptSecret\(token\)/.test(blok), 'token tak dienkripsi');
  /* Yang menentukan bukan "kata token tak muncul" — ia MEMANG harus muncul,
     justru untuk dibuang dari sisanya. Yang dijaga: token dipisahkan lewat
     rest-destructuring, dan yang dikembalikan adalah SISANYA. Versi pertama
     asersi ini menuduh `const { token, ...sisa }` — yaitu baris yang justru
     melakukan hal yang benar. */
  assert.ok(/const \{ token, \.\.\.sisa \} = config/.test(blok),
    'token tak dipisahkan dari config — ia akan ikut tersimpan polos');
  assert.ok(/return \{ \.\.\.sisa, tokenEnc/.test(blok),
    'yang dikembalikan bukan sisanya — token polos bisa ikut');
});

test('sumbernya benar-benar ikut disinkronkan, bukan cuma tersimpan', () => {
  /* Sumber yang tersimpan tapi tak pernah masuk antrean sync adalah baris
     basis data yang tampak berhasil dan tak pernah menghasilkan satu dokumen
     pun — kegagalan yang paling membingungkan bagi yang memasangnya. */
  assert.ok(/'s3', 'notion', 'slack'\]\.includes\(parsed\.data\.kind\)/.test(RUTE),
    'notion/slack tak masuk daftar yang di-enqueue');
});

const SYNC = readFileSync('src/modules/knowledge/sync.service.ts', 'utf8');

test('listing terpotong TIDAK boleh memicu penghapusan', () => {
  /* Invarian paling mahal di seluruh sync: halaman/kanal yang berada di luar
     jendela pendaftaran BUKAN halaman yang hilang. Melaporkan terpotong=false
     saat sebenarnya terpotong akan menghapus dokumen hidup pelanggan. */
  for (const jenis of ['notion', 'slack']) {
    const blok = irisBlok(SYNC, `if (kind === '${jenis}') {`);
    assert.ok(/truncated: terpotong/.test(blok),
      `${jenis} tak meneruskan penanda terpotong — planDelta bisa menghapus dokumen hidup`);
  }
});
