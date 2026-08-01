import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  KONEKTOR, bersihkanPengaturan, daftarKonektor, konektor, konektorBoleh,
} from '../src/modules/knowledge/konektor';

/**
 * SAKLAR KONEKTOR.
 *
 * Yang dijaga di sini satu kalimat: MENYEMBUNYIKAN PILIHAN DI LAYAR BUKAN
 * PENEGAKAN. Kalau hanya UI yang menyaring, satu permintaan HTTP langsung
 * tetap bisa membuat sumber dari konektor yang sengaja dimatikan — dan
 * saklarnya akan terlihat bekerja sambil tak menahan apa pun.
 */

/* ── bawaan & keadaan awal ───────────────────────────────────────────── */

test('kunci yang HILANG berarti bawaan, bukan mati', () => {
  /* Kalau yang hilang berarti mati, migrasi 0045 akan mematikan SELURUH
     konektor pada detik ia dijalankan: setiap knowledge base berhenti bisa
     ditambah sumber, dan tak ada satu pun galat yang menjelaskan sebabnya. */
  assert.equal(konektorBoleh('gdrive', null), true);
  assert.equal(konektorBoleh('gdrive', {}), true);
  assert.equal(konektorBoleh('s3', undefined), true);
  // …tapi yang DISEBUT tetap menang atas bawaan.
  assert.equal(konektorBoleh('gdrive', { gdrive: false }), false);
});

test('yang BELUM TERSEDIA selalu tertutup, apa pun isi pengaturannya', () => {
  /* Baris pengaturan yang tertinggal dari percobaan lama tak boleh bisa
     menyalakan adaptor yang tak pernah ditulis — galatnya akan muncul jauh
     dari sebabnya, di tengah sinkronisasi milik pelanggan. */
  assert.equal(konektorBoleh('notion', { notion: true }), false);
  assert.equal(konektorBoleh('slack', { slack: true }), false);
  assert.equal(konektor('notion')?.tersedia, false);
});

test('jenis TAK DIKENAL tertutup', () => {
  /* `kind` datang dari badan permintaan HTTP. Daftar yang menjawab "boleh"
     untuk apa pun yang tak dikenalnya adalah daftar yang tak menjaga apa-apa. */
  for (const aneh of ['', 'ftp', 'gdrive; drop table', '__proto__', 'constructor']) {
    assert.equal(konektorBoleh(aneh, { [aneh]: true }), false, `lolos: ${aneh}`);
  }
});

/* ── membersihkan kiriman ────────────────────────────────────────────── */

test('kunci sampah dibuang, yang belum tersedia dipaksa mati saat DISIMPAN', () => {
  /* Dipaksa mati di sisi TULIS juga, bukan hanya saat dibaca: keadaan tak
     sah tak boleh sempat tersimpan sama sekali. */
  const out = bersihkanPengaturan({
    gdrive: false, s3: true, notion: true, entah: true, url: 'ya' as unknown as boolean,
  });
  assert.deepEqual(out, { gdrive: false, s3: true, notion: false });
  assert.ok(!('entah' in out), 'kunci tak dikenal ikut tersimpan');
  assert.ok(!('url' in out), 'nilai bukan boolean ikut tersimpan');
});

test('daftar lengkap membawa keadaan nyala tiap konektor', () => {
  const d = daftarKonektor({ gdrive: false });
  assert.equal(d.length, KONEKTOR.length);
  assert.equal(d.find((k) => k.jenis === 'gdrive')?.nyala, false);
  assert.equal(d.find((k) => k.jenis === 's3')?.nyala, true);
  assert.equal(d.find((k) => k.jenis === 'notion')?.nyala, false);
});

test('registri menyebut mana yang menuntut aplikasi OAuth KITA', () => {
  /* Inilah yang membedakan Notion/Slack dari S3: pada S3 pelanggan memasok
     kuncinya sendiri, jadi tak ada yang perlu ditunggu. Perbedaan itu yang
     memisahkan kartu ini dari a-connectors. */
  assert.equal(konektor('s3')?.butuhAplikasiKita, false);
  assert.equal(konektor('url')?.butuhAplikasiKita, false);
  assert.equal(konektor('upload')?.butuhAplikasiKita, false);
  assert.equal(konektor('notion')?.butuhAplikasiKita, true);
  assert.equal(konektor('slack')?.butuhAplikasiKita, true);
});

/* ── penegakan, bukan sekadar sembunyi ───────────────────────────────── */

test('SERVER menolak konektor yang dimatikan — bukan hanya UI', () => {
  const route = readFileSync('src/app/api/sources/route.ts', 'utf8');
  assert.ok(/konektorService\.boleh\(parsed\.data\.kind\)/.test(route),
    'jalur pembuatan sumber tak memeriksa saklar');
  const iCek = route.indexOf('konektorService.boleh');
  const iInsert = route.indexOf('tx.insert(dataSources)');
  assert.ok(iCek > 0 && iCek < iInsert, 'sumber tersimpan SEBELUM saklar diperiksa');
  assert.ok(/status: 422/.test(route.slice(iCek, iCek + 300)), 'penolakan saklar tak dijawab 422');
});

test('daftar jenis tidak lagi ditulis tetap di halaman Knowledge', () => {
  /* Sebelum ini jenis sumber tertulis tiga kali — zod route, connect(), dan
     dropdown — dan ketiganya harus diingat serentak. Daftar tercecer selalu
     berakhir sama: satu tempat ketinggalan, dan konektor yang "sudah
     dimatikan" masih bisa dipakai lewat jalan lain. */
  const page = readFileSync('src/app/(app)/knowledge/page.tsx', 'utf8');
  assert.ok(!/<option value="gdrive">/.test(page), 'dropdown masih ditulis tetap');
  assert.ok(/\/api\/connectors/.test(page), 'dropdown tak mengambil daftar dari server');
});

test('daftar untuk tenant hanya memuat yang MENYALA, tanpa keterangan internal', () => {
  /* Pilihan yang terlihat tapi tak bisa dipilih membuat orang mengira
     produknya rusak; yang bisa dipilih lalu ditolak lebih buruk lagi. Dan
     "butuhAplikasiKita" adalah bahan keputusan platform, bukan informasi
     yang berguna bagi pemilik knowledge base. */
  const route = readFileSync('src/app/api/connectors/route.ts', 'utf8');
  assert.ok(/filter\(\(k\) => k\.nyala\)/.test(route), 'yang dimatikan ikut terkirim');
  assert.ok(/map\(\(k\) => \(\{ jenis: k\.jenis, label: k\.label \}\)\)/.test(route),
    'keterangan internal ikut bocor ke tenant');
});

test('panel admin menampilkan berapa sumber MASIH memakai konektor itu', () => {
  /* Mematikan konektor tidak menghentikan sumber yang sudah ada — ia hanya
     menutup pembuatan yang baru. Tanpa angka itu, superadmin mengira
     mematikan Drive berarti Drive berhenti disinkronkan, dan salah paham itu
     baru ketahuan saat ada yang bertanya kenapa dokumennya masih diperbarui. */
  const admin = readFileSync('src/app/api/admin/connectors/route.ts', 'utf8');
  assert.ok(/sumberAktif/.test(admin), 'jumlah sumber aktif tak dihitung');
  assert.ok(/from\(dataSources\)/.test(admin));
  const page = readFileSync('src/app/(app)/settings/page.tsx', 'utf8');
  assert.ok(/SUMBER AKTIF/.test(page), 'panel tak menampilkan sumber yang masih berjalan');
  assert.ok(/HANYA MENUTUP PEMBUATAN SUMBER BARU/.test(page),
    'panel tak menjelaskan bahwa sumber lama tetap jalan');
});

test('cache dilupakan seketika saat saklar diubah', () => {
  /* Saklar yang sudah dimatikan tapi masih meloloskan sumber selama setengah
     menit adalah persis keadaan yang membuat orang mengira saklarnya tak
     bekerja — lalu mematikannya berkali-kali. */
  const svc = readFileSync('src/modules/knowledge/konektor.service.ts', 'utf8');
  const blok = svc.slice(svc.indexOf('async simpan('));
  assert.ok(/cache = null;/.test(blok), 'menyimpan saklar tak melupakan cache');
});

test('migrasi tidak mematikan apa pun saat dijalankan', () => {
  const m = readFileSync('migrations/0045_saklar_konektor.sql', 'utf8');
  assert.ok(/add column if not exists connectors_enabled jsonb;/.test(m));
  assert.ok(!/update platform_settings set connectors_enabled/i.test(m),
    'migrasi mengisi saklar — konektor bisa mati serentak saat migrasi berjalan');
  assert.ok(!/not null/i.test(m), 'kolom NOT NULL memaksa nilai awal yang harus ditebak');
});
