import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * PENJAGA: graf memory padat tak boleh menciut jadi satu bola.
 *
 * DILAPORKAN 20 Sep 2026 — graf chatbot "Asisten PDP" menumpuk di tengah dan
 * tak terbaca. Diukur di produksi, dan angkanya menunjuk sebabnya:
 *
 *     Asisten PDP   225 catatan · 2.165 sisi  → derajat rata-rata 19,2
 *     hr            115 catatan ·   270 sisi  → 4,7
 *     Kepatuhan      42 catatan ·   108 sisi  → 5,1
 *
 * Hanya yang padat yang runtuh. Tes di sini MENJALANKAN simulasinya pada graf
 * sepadat PDP lalu mengukur sebarannya — bukan memeriksa ada-tidaknya sebuah
 * konstanta. Itu sebabnya fisikanya dipindah keluar dari komponen kanvas:
 * perilaku yang hanya bisa dinilai dengan mata tak bisa dijaga.
 */

/**
 * Graf sintetis yang BERBENTUK seperti graf memory sungguhan, bukan cincin
 * beraturan.
 *
 * Versi pertama tes ini memakai kisi cincin — tiap node ke tetangga
 * terdekatnya — dan itu keliru dengan cara yang berbahaya: cincin melebar jadi
 * cincin dengan fisika LAMA sekalipun (terukur 29,6 px), jadi tesnya lulus di
 * kode yang rusak dan tak menjaga apa pun. Graf memory sungguhan punya dua
 * ciri yang justru menyebabkan keruntuhan: HUB (catatan MOC yang ditunjuk
 * puluhan catatan) dan KLIK kemiripan (sekelompok catatan bertopik dekat yang
 * tiap anggotanya tersambung ke tiap anggota lain).
 *
 * Dengan bentuk itu, pada 225 node · 1.974 sisi (derajat 17,5 — PDP nyata
 * 19,2), terukur:
 *
 *     fisika LAMA  median jarak tetangga 21,6 px · jari-jari 490 px
 *     fisika BARU  median jarak tetangga 72,2 px · jari-jari 1.193 px
 *
 * Node berjari-jari sampai 14 px, jadi 21,6 px antar-pusat berarti saling
 * bersentuhan — dan di situlah 225 label ikut bertumpuk. Ambang 45 px di bawah
 * dipilih tepat di antara kedua angka itu: ia GAGAL pada kode lama dan lulus
 * pada yang baru.
 */
function grafMemory(jumlahCatatan = 190, jumlahMoc = 35, klik = 17) {
  const total = jumlahCatatan + jumlahMoc;
  const ids = Array.from({ length: total }, (_, i) => `n${i}`);
  const sisi: Array<{ from: string; to: string; kind: string; weight: number }> = [];
  // Wikilink: tiap catatan menunjuk 2–3 MOC — itulah yang agen memory tulis.
  for (let i = 0; i < jumlahCatatan; i++) {
    for (let m = 0; m < 2 + (i % 2); m++) {
      sisi.push({
        from: ids[i], to: ids[jumlahCatatan + ((i * 7 + m * 11) % jumlahMoc)],
        kind: 'wikilink', weight: 1,
      });
    }
  }
  // Kemiripan: klik bertopik — inilah 1.655 sisi yang membuat PDP jadi bubur.
  for (let g = 0; g * klik < jumlahCatatan; g++) {
    const anggota = ids.slice(g * klik, Math.min((g + 1) * klik, jumlahCatatan));
    for (let a = 0; a < anggota.length; a++) {
      for (let b = a + 1; b < anggota.length; b++) {
        sisi.push({ from: anggota[a], to: anggota[b], kind: 'similarity', weight: 0.7 + ((a + b) % 5) / 20 });
      }
    }
  }
  return { ids, sisi };
}

/** Susun node+link simulasi persis seperti komponen kanvas menyusunnya. */
async function bangun(ids: string[], sisi: Array<{ from: string; to: string; kind: string; weight: number }>) {
  const { hitungDerajat } = await import('../src/modules/memory/graf-tata');
  const deg = hitungDerajat(sisi);
  const nodes = ids.map((id, i) => ({
    id, x: Math.cos((i / ids.length) * Math.PI * 2) * (60 + (i % 5) * 28),
    y: Math.sin((i / ids.length) * Math.PI * 2) * (60 + (i % 5) * 28),
    vx: 0, vy: 0, deg: deg.get(id) ?? 0,
    r: Math.min(4 + Math.sqrt(deg.get(id) ?? 0) * 2.4, 14),
    seed: (i * 2.399963) % (Math.PI * 2),
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = sisi
    .map((e) => ({ a: byId.get(e.from)!, b: byId.get(e.to)!, wiki: e.kind === 'wikilink' }))
    .filter((l) => l.a && l.b);
  return { nodes, links };
}

/** Jarak ke tetangga terdekat, diambil mediannya — ukuran "bisa dibaca". */
function medianJarakTerdekat(nodes: Array<{ x: number; y: number }>): number {
  const d: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    let min = Infinity;
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      min = Math.min(min, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y));
    }
    d.push(min);
  }
  d.sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

test('graf sepadat PDP melebar, bukan menciut — simulasinya dijalankan, bukan dibaca', async () => {
  const { langkah, parameterFisika, derajatRataRata } = await import('../src/modules/memory/graf-tata');

  const { ids, sisi } = grafMemory();
  // Sepadat aslinya: PDP 19,2 · graf uji ini 17,5.
  assert.ok(derajatRataRata(ids.length, sisi.length) > 15, 'graf uji tak sepadat PDP');

  const { nodes, links } = await bangun(ids, sisi);
  const P = parameterFisika(nodes.length);
  let alpha = 1;
  for (let f = 0; f < 900; f++) alpha = langkah(nodes, links, P, alpha, f * 16);

  const jarak = medianJarakTerdekat(nodes);
  assert.ok(jarak > 45,
    `median jarak antar-node ${jarak.toFixed(1)}px — fisika lama menghasilkan 21,6px; graf menciut lagi`);

  // Dan tak boleh meledak: yang kabur ke tak-berhingga juga tak terbaca.
  const jauh = Math.max(...nodes.map((n) => Math.hypot(n.x, n.y)));
  assert.ok(Number.isFinite(jauh) && jauh < 20_000, `graf meledak (${jauh.toFixed(0)}px dari pusat)`);
});

test('hub berderajat puluhan tak terkubur di pusat — itu normalisasi pegasnya', async () => {
  const { langkah, parameterFisika } = await import('../src/modules/memory/graf-tata');

  const { ids, sisi } = grafMemory();
  const { nodes, links } = await bangun(ids, sisi);
  const P = parameterFisika(nodes.length);
  let a = 1;
  for (let f = 0; f < 900; f++) a = langkah(nodes, links, P, a, f * 16);

  /* INI bukti paling tajam bahwa normalisasi derajat bekerja, dan angkanya
     diukur pada graf ini persis:

         fisika LAMA  hub (derajat 38) berjarak 4,5 px dari tetangga terdekat
         fisika BARU  hub yang sama berjarak 45 px

     Node berjari-jari sampai 14 px, jadi 4,5 px berarti hub TERTIMBUN penuh di
     bawah tetangganya — dan hub adalah catatan MOC, bagian graf yang paling
     ingin dilihat orang. Penyebabnya: 38 pegas menarik penuh melawan repulsi
     yang bertutup 3,5.

     Yang TIDAK diuji di sini: rasio hub terhadap node sepi. Hub memang PANTAS
     duduk lebih rapat — ia pusat gugusnya, sementara node sepi terlempar ke
     tepi yang lapang (45 px vs 238 px pada fisika baru). Menuntut rasio
     tertentu berarti memaksakan asumsi yang tak punya dasar; yang benar-benar
     menentukan keterbacaan adalah jarak absolutnya terhadap jari-jari node. */
  const urut = [...nodes].sort((x, y) => y.deg - x.deg);
  const hub = urut.slice(0, 10);
  const jarakKe = (kumpulan: typeof nodes) => {
    const d = kumpulan.map((n) => Math.min(...nodes.filter((m) => m !== n)
      .map((m) => Math.hypot(n.x - m.x, n.y - m.y))));
    return d.reduce((s, x) => s + x, 0) / d.length;
  };
  const jHub = jarakKe(hub);
  assert.ok(jHub > 25,
    `hub berjarak ${jHub.toFixed(1)}px dari tetangganya — fisika lama 4,5px, hub tertimbun lagi`);
  // Jari-jari node maksimum 14px: jarak harus melebihi diameternya, bukan cuma
  // "tidak nol".
  assert.ok(jHub > 2 * Math.max(...hub.map((n) => n.r)), 'hub masih saling tindih');
});
test('parameter fisika tumbuh bersama jumlah node, dan 40 node tetap seperti dulu', async () => {
  const { parameterFisika } = await import('../src/modules/memory/graf-tata');

  // 40 node = titik kalibrasi: nilai lama yang sudah terbukti enak dilihat.
  const p40 = parameterFisika(40);
  assert.equal(p40.panjangWiki, 62);
  assert.equal(p40.repulsi, 2400);
  assert.equal(p40.maksKecepatan, 7);

  const p225 = parameterFisika(225);
  assert.ok(p225.panjangWiki > p40.panjangWiki, 'jarak tak tumbuh — ruangnya memang tak ada');
  assert.ok(p225.repulsi > p40.repulsi, 'repulsi tak tumbuh');
  assert.ok(p225.gravitasi < p40.gravitasi,
    'gravitasi tak melemah — ia akan meniadakan seluruh pelebaran');
  assert.ok(p225.pegasMirip < p225.pegasWiki,
    'sisi kemiripan harus lebih lunak daripada wikilink');

  // Dibatasi supaya graf raksasa tak melesat keluar layar.
  const p5000 = parameterFisika(5000);
  assert.ok(p5000.panjangWiki <= 62 * 3 + 0.001, 'skala tak dibatasi');
});

test('batasiKemiripan: wikilink utuh, kemiripan diambil terkuat, node tak jadi yatim', async () => {
  const { batasiKemiripan } = await import('../src/modules/memory/graf-tata');

  const sisi = [
    { from: 'a', to: 'b', kind: 'wikilink', weight: 1 },
    { from: 'a', to: 'c', kind: 'similarity', weight: 0.9 },
    { from: 'a', to: 'd', kind: 'similarity', weight: 0.8 },
    { from: 'a', to: 'e', kind: 'similarity', weight: 0.7 },
    { from: 'f', to: 'a', kind: 'similarity', weight: 0.6 },
  ];
  const { sisi: hasil, dibuang } = batasiKemiripan(sisi, 2);

  // Wikilink adalah struktur yang DITULIS agen — ia tak pernah dipangkas.
  assert.ok(hasil.some((e) => e.kind === 'wikilink'), 'wikilink ikut terbuang');
  // Dua terkuat milik `a` lolos.
  assert.ok(hasil.some((e) => e.to === 'c') && hasil.some((e) => e.to === 'd'));
  /* UNION, bukan irisan: `f` hanya punya satu sisi, jadi sisi itu masuk
     2-terkuat MILIKNYA sendiri dan harus lolos — kalau tidak, `f` menggantung
     sebagai titik lepas, yang justru lebih membingungkan daripada padat. */
  assert.ok(hasil.some((e) => e.from === 'f'), 'node sepi kehilangan satu-satunya sisinya');
  assert.equal(dibuang, sisi.length - hasil.length);

  // Tanpa batas = tak ada yang hilang.
  assert.equal(batasiKemiripan(sisi, Infinity).dibuang, 0);
});

test('batasOtomatis tak memangkas graf yang memang sepi', async () => {
  const { batasOtomatis, derajatRataRata } = await import('../src/modules/memory/graf-tata');

  // Angka nyata dari produksi 20 Sep 2026.
  assert.equal(batasOtomatis(derajatRataRata(42, 108)), Infinity);   // Kepatuhan 5,1
  assert.equal(batasOtomatis(derajatRataRata(115, 270)), Infinity);  // hr 4,7
  assert.ok(Number.isFinite(batasOtomatis(derajatRataRata(225, 2165)))); // PDP 19,2
});

test('ambangLabel membatasi label yang tergambar sekaligus', async () => {
  const { ambangLabel } = await import('../src/modules/memory/graf-tata');

  /* Aturan lama `deg >= 6` MUTLAK: di graf berderajat rata-rata 19 ia berlaku
     untuk hampir semua node, jadi 225 label tergambar bertumpuk — sebab kedua
     "tak terbaca", terpisah dari fisikanya. */
  const padat = Array.from({ length: 225 }, (_, i) => 6 + (i % 30));
  const ambang = ambangLabel(padat, 14);
  assert.ok(padat.filter((d) => d >= ambang).length <= 14,
    'label yang tergambar masih lebih dari 14 — tetap bertumpuk');
  assert.ok(ambang > 6, 'ambang tak lebih ketat dari aturan lama');

  // Graf kecil: semua label boleh tampil, jangan disembunyikan tanpa alasan.
  assert.equal(ambangLabel([1, 2, 3], 14), 0);
});

test('saringTumpang membuang label yang saling menimpa, yang duluan menang', async () => {
  const { saringTumpang } = await import('../src/modules/memory/graf-tata');

  /* Membatasi JUMLAH label saja tak cukup: hub berkumpul di pusat gugusnya,
     jadi 11 label pun masih bisa bertumpuk di satu tempat sementara tepi graf
     kosong. Terlihat langsung pada graf PDP setelah fisikanya dibetulkan. */
  const kandidat = [
    { id: 'hub', x: 0, y: 0, lebar: 100, tinggi: 12 },
    { id: 'tabrakan', x: 50, y: 4, lebar: 100, tinggi: 12 },   // menimpa 'hub'
    { id: 'jauh', x: 300, y: 300, lebar: 100, tinggi: 12 },
    { id: 'sentuh-tepi', x: 100, y: 0, lebar: 40, tinggi: 12 }, // bersebelahan, tak menimpa
  ];
  const hasil = saringTumpang(kandidat).map((k) => k.id);

  assert.deepEqual(hasil, ['hub', 'jauh', 'sentuh-tepi']);
  // Urutan masukan = prioritas: yang pertama tak boleh kalah oleh yang menimpanya.
  assert.equal(hasil[0], 'hub');
  // Tak ada yang hilang kalau memang tak ada yang bertabrakan.
  assert.equal(saringTumpang([kandidat[0], kandidat[2]]).length, 2);
});

test('pasKeLayar memuat seluruh graf ke dalam viewport', async () => {
  const { pasKeLayar } = await import('../src/modules/memory/graf-tata');

  const nodes = [
    { x: -1000, y: -400, r: 8 }, { x: 1000, y: 400, r: 8 }, { x: 0, y: 0, r: 8 },
  ];
  const W = 800, H = 460, tepi = 28;
  const v = pasKeLayar(nodes, W, H, tepi);
  for (const n of nodes) {
    const sx = n.x * v.scale + v.tx, sy = n.y * v.scale + v.ty;
    assert.ok(sx >= 0 && sx <= W, `node keluar layar horizontal (${sx.toFixed(0)})`);
    assert.ok(sy >= 0 && sy <= H, `node keluar layar vertikal (${sy.toFixed(0)})`);
  }
  // Graf kosong tak boleh membuat NaN yang membekukan kanvas.
  const kosong = pasKeLayar([], W, H);
  assert.ok(Number.isFinite(kosong.scale) && Number.isFinite(kosong.tx));
});

test('halaman memory memakai tata letak terukur ini, bukan salinannya sendiri', () => {
  const src = readFileSync('src/app/(app)/memory/page.tsx', 'utf8');

  assert.ok(/from '@\/modules\/memory\/graf-tata'/.test(src),
    'halaman tak memakai modul tata letak — fisikanya tak terjaga tes apa pun');
  assert.ok(/alpha = langkah\(nodes, links, P, alpha, now, drag\)/.test(src),
    'simulasi kanvas tak lagi memanggil langkah() bersama');
  /* Aturan label mutlak inilah yang membuat 225 label bertumpuk; ia tak boleh
     kembali diam-diam. */
  assert.ok(!/n\.deg >= 6/.test(src), 'ambang label mutlak `deg >= 6` kembali');
  assert.ok(/n\.deg >= ambangDeg/.test(src), 'ambang label tak lagi berdasar peringkat');
  assert.ok(/pasKeLayar\(nodes, W, H\)/.test(src), '"pas ke layar" hilang dari kanvas');
  assert.ok(/saringTumpang\(kotak\)/.test(src), 'label tak lagi disaring dari tumpang-tindih');
  /* Identitas sisiTampil adalah dependensi efek simulasi: tanpa memo, tata
     letaknya dibangun ulang pada tiap render. */
  assert.ok(/useMemo\(\(\) => \{[\s\S]*batasiKemiripan/.test(src),
    'sisi yang digambar tak di-memo — simulasi akan restart tiap render');
});
