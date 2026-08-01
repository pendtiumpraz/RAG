/**
 * AUDIT KONEKSI — cari apa pun yang MENGAMBIL KONEKSI KEDUA di dalam transaksi.
 *
 *   npm run audit:koneksi
 *
 * KENAPA ADA. Di Vercel kolam koneksi dipatok `max: 1` (db/index.ts). Selama
 * sebuah transaksi terbuka, ia MEMEGANG satu-satunya koneksi. Apa pun di
 * dalamnya yang meminta koneksi lagi — dan DITUNGGU — menunggu koneksi yang
 * takkan pernah dilepas sampai dirinya sendiri selesai. Permintaannya
 * MENGGANTUNG tanpa ujung: bukan galat, bukan lambat, tapi diam selamanya.
 *
 * Dua kejadian nyata, dua bentuk berbeda:
 *   1 Agu 2026 — "tambah chatbot muter2 terus": dispatch() di dalam
 *   withTenant(); handlernya memanggil fanout() yang membuka transaksi kedua.
 *   2 Agu 2026 — audit() di dalam withTenant() pada ubah-peran, keluarkan
 *   anggota, buat koneksi SSO, dan dua tulis backlog. audit() membuka
 *   withTenant sendiri (guardrails.ts L5).
 *
 * TAK TERLIHAT DI MESIN PENGEMBANGAN: di sana `max: 10`, jadi koneksi kedua
 * selalu tersedia dan semuanya tampak baik-baik saja.
 *
 * KENAPA MEMAKAI COMPILER, BUKAN PENCARIAN TEKS. Dua kali pencarian teks
 * memberi jawaban yang salah dengan penuh percaya diri: sekali melewatkan
 * memory.service.ts, sekali lagi melewatkan KELIMA panggilan audit() karena
 * `audit` diimpor — dan simbol di titik panggil adalah ALIAS yang
 * deklarasinya cuma baris `import`, bukan badan fungsinya. Resolusi alias
 * (getAliasedSymbol) itulah yang membuka seluruh temuan kedua.
 *
 * YANG MASIH BUTA. `await import(...)` memutus call-graph statis — jalur
 * embedding dan ekstraksi memakainya. Karena itu ada modus INVENTARIS yang
 * mencetak SELURUH kosakata panggilan di dalam setiap badan transaksi untuk
 * dibaca manusia:  INVENTARIS=1 npm run audit:koneksi
 */
import ts from 'typescript';
import path from 'node:path';

const METODE_DB = new Set(['select', 'insert', 'update', 'delete', 'execute', 'transaction', 'query']);

/** Panggilan ini SENDIRI meminta koneksi baru? */
function membukaKoneksi(node) {
  if (ts.isTaggedTemplateExpression(node) && node.tag.getText() === 'client') return 'client``';
  if (!ts.isCallExpression(node)) return null;
  const ex = node.expression;
  const teks = ex.getText();
  if (teks === 'withTenant') return 'withTenant';
  if (teks === 'db.transaction') return 'db.transaction';
  if (teks === 'client.begin') return 'client.begin';
  /* dispatch: handlernya didaftarkan SAAT JALAN (core/events.ts memakai peta),
     jadi call-graph compiler tak pernah sampai ke fanout(). Diperlakukan
     sebagai pembuka koneksi tanpa syarat — dan memang harus, karena
     WEBHOOK_EVENTS adalah DATA yang bisa bertambah tanpa satu baris pun di
     sini berubah. */
  if (teks === 'dispatch') return 'dispatch → handler runtime → fanout → withTenant';
  if (ts.isPropertyAccessExpression(ex) && ex.expression.getText() === 'db'
      && METODE_DB.has(ex.name.text)) return `db.${ex.name.text}`;
  if (ts.isPropertyAccessExpression(ex) && ex.expression.getText().startsWith('db.query.')) return 'db.query';
  return null;
}

/** Pembuka TRANSAKSI — yang memegang koneksi selama callback-nya berjalan. */
function membukaTransaksi(node) {
  if (!ts.isCallExpression(node)) return null;
  const teks = node.expression.getText();
  if (teks === 'withTenant' || teks === 'db.transaction' || teks === 'client.begin') return teks;
  return null;
}

/** I/O eksternal: tak membuntukan, tapi MENAHAN koneksi selama perjalanan HTTP. */
function ioLuar(node) {
  if (!ts.isCallExpression(node)) return null;
  const t = node.expression.getText();
  return (t === 'fetch' || t.endsWith('.fetch')) ? 'fetch' : null;
}

/** Sumber kontrol positif — dipasang sebagai berkas VIRTUAL di dalam src/. */
export const KONTROL = {
  /* Bentuk yang persis jadi bug 1 Agu. */
  dispatch: `
    import { withTenant } from './db/tenant-context';
    import { dispatch } from './events';
    export async function buruk(t: string) {
      return withTenant(t, async (tx) => {
        await dispatch('chatbot.created', { tenantId: t, chatbotId: 'x', ownerId: 'y' });
        return !!tx;
      });
    }`,
  /* Bentuk yang persis jadi bug 2 Agu: fungsi DIIMPOR yang membuka transaksi
     sendiri. Inilah yang lolos sampai resolusi alias dipasang. */
  lintasModul: `
    import { withTenant } from './db/tenant-context';
    import { audit } from './guardrails';
    export async function buruk(t: string) {
      return withTenant(t, async (tx) => {
        await audit(t, 'a', 'b');
        return !!tx;
      });
    }`,
  /* I/O eksternal menahan satu-satunya koneksi. */
  fetch: `
    import { withTenant } from './db/tenant-context';
    export async function buruk(t: string) {
      return withTenant(t, async (tx) => {
        const r = await fetch('https://contoh.invalid/');
        return { tx: !!tx, ok: r.ok };
      });
    }`,
  /* KONTROL NEGATIF: bentuk yang BENAR tak boleh ditandai. Pemindai yang
     menandai kode benar akan dimatikan orang dalam seminggu — permanen. */
  benar: `
    import { withTenant } from './db/tenant-context';
    import { audit } from './guardrails';
    export async function baik(t: string) {
      const hasil = await withTenant(t, async (tx) => !!tx);
      await audit(t, 'a', 'b');
      return hasil;
    }`,
};

/* Membangun program TypeScript penuh memakan ±8 detik, dan tesnya memindai
   lima kali (sekali nyata + empat kontrol). Dua cache di bawah menurunkannya
   ke sekali-bayar: hasil per-kontrol, dan SourceFile yang sudah diurai —
   yang terakhir dipakai bersama antar program karena hanya SATU berkas yang
   berbeda di tiap kontrol. */
const cacheHasil = new Map();
const cacheBerkas = new Map();

/**
 * @param {{ root?: string, kontrol?: keyof typeof KONTROL }} opsi
 * @returns {{ buntu: any[], tertunda: any[], io: any[], situs: any[], jumlahFungsi: number }}
 */
export function pindai(opsi = {}) {
  const kunci = `${opsi.root ?? ''}|${opsi.kontrol ?? ''}`;
  if (cacheHasil.has(kunci)) return cacheHasil.get(kunci);
  const hasil = pindaiSekali(opsi);
  cacheHasil.set(kunci, hasil);
  return hasil;
}

function pindaiSekali(opsi = {}) {
  const ROOT = (opsi.root ?? process.cwd()).replace(/\\/g, '/');
  const cfgPath = ts.findConfigFile(ROOT, ts.sys.fileExists, 'tsconfig.json');
  const cfg = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);

  /* Berkas kontrol dipasang VIRTUAL di dalam src/modules/core supaya impor
     relatifnya teresolusi persis seperti berkas asli — tanpa satu pun berkas
     cacat tertinggal di repo kalau proses ini mati di tengah. */
  const jalanKontrol = `${ROOT}/src/modules/core/__kontrol-virtual.ts`;
  const daftarBerkas = opsi.kontrol ? [...parsed.fileNames, jalanKontrol] : parsed.fileNames;
  const host = ts.createCompilerHost(parsed.options);
  /* Berkas yang sudah diurai dipakai ulang antar program. Aman di sini karena
     berkasnya tak berubah selama proses hidup — satu-satunya yang berbeda
     antar pemindaian adalah berkas kontrol virtual, yang tak pernah masuk
     cache ini. */
  const bacaAsli = host.getSourceFile.bind(host);
  host.getSourceFile = (f, v, ...sisa) => {
    const k = `${f}|${v}`;
    if (!cacheBerkas.has(k)) cacheBerkas.set(k, bacaAsli(f, v, ...sisa));
    return cacheBerkas.get(k);
  };
  if (opsi.kontrol) {
    const isi = KONTROL[opsi.kontrol];
    const asliGet = host.getSourceFile.bind(host);
    const asliAda = host.fileExists.bind(host);
    const asliBaca = host.readFile.bind(host);
    const samaDengan = (f) => f.replace(/\\/g, '/') === jalanKontrol;
    host.getSourceFile = (f, v, ...sisa) =>
      samaDengan(f) ? ts.createSourceFile(f, isi, v, true, ts.ScriptKind.TS) : asliGet(f, v, ...sisa);
    host.fileExists = (f) => samaDengan(f) || asliAda(f);
    host.readFile = (f) => (samaDengan(f) ? isi : asliBaca(f));
  }

  const program = ts.createProgram(daftarBerkas, parsed.options, host);
  const checker = program.getTypeChecker();

  const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
  const pos = (n) => {
    const sf = n.getSourceFile();
    const { line } = sf.getLineAndCharacterOfPosition(n.getStart());
    return `${rel(sf.fileName)}:${line + 1}`;
  };

  const berkas = program.getSourceFiles()
    .filter((sf) => !sf.isDeclarationFile && rel(sf.fileName).startsWith('src/'));

  /** SEMUA fungsi pembungkus, bukan yang terdekat saja — `xs.map(x =>
   *  withTenant(...))` hanya menandai si arrow kalau cuma yang terdekat
   *  diambil, dan fungsi LUARNYA lolos padahal ia yang dipanggil orang. */
  function semuaPembungkus(node) {
    const out = [];
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)
          || ts.isFunctionExpression(p) || ts.isArrowFunction(p)) out.push(p);
    }
    return out;
  }
  function namaFungsi(decl) {
    if (decl.name) return decl.name.getText();
    const p = decl.parent;
    if (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) return p.name.getText();
    return '(anonim)';
  }

  const fungsi = new Map();
  const daftar = (decl) => {
    if (!fungsi.has(decl)) {
      fungsi.set(decl, { nama: namaFungsi(decl), lokasi: pos(decl), langsung: null, io: null, panggilan: new Set() });
    }
    return fungsi.get(decl);
  };

  function targetPanggilan(node) {
    let sym = checker.getSymbolAtLocation(node.expression);
    /* Untuk fungsi yang DIIMPOR, simbol di titik panggil adalah ALIAS, dan
       deklarasinya cuma baris `import { audit } from ...` — bukan badan
       fungsinya. Tanpa langkah ini SELURUH panggilan lintas-modul tak
       terlihat, yang persis membuat kelima audit() lolos. */
    if (sym && (sym.flags & ts.SymbolFlags.Alias)) {
      try { sym = checker.getAliasedSymbol(sym); } catch { /* bukan alias sejati */ }
    }
    const d = sym?.declarations?.find((x) =>
      ts.isFunctionDeclaration(x) || ts.isMethodDeclaration(x)
      || ((ts.isVariableDeclaration(x) || ts.isPropertyAssignment(x)) && x.initializer
          && (ts.isArrowFunction(x.initializer) || ts.isFunctionExpression(x.initializer))));
    if (!d) return null;
    return (ts.isVariableDeclaration(d) || ts.isPropertyAssignment(d)) ? d.initializer : d;
  }

  for (const sf of berkas) {
    const jalan = (node) => {
      const buka = membukaKoneksi(node);
      if (buka) for (const f of semuaPembungkus(node)) daftar(f).langsung ??= buka;
      const io = ioLuar(node);
      if (io) for (const f of semuaPembungkus(node)) daftar(f).io ??= io;
      if (ts.isCallExpression(node)) {
        const f = semuaPembungkus(node)[0];
        const t = targetPanggilan(node);
        if (f && t) { daftar(f).panggilan.add(t); daftar(t); }
      }
      ts.forEachChild(node, jalan);
    };
    ts.forEachChild(sf, jalan);
  }

  /** Rambatkan sifat `kunci` lewat call-graph sampai tak ada yang berubah. */
  const rambat = (kunci) => {
    const peta = new Map();
    for (const [d, e] of fungsi) if (e[kunci]) peta.set(d, [`${e.nama} → ${e[kunci]}`]);
    let berubah = true;
    while (berubah) {
      berubah = false;
      for (const [d, e] of fungsi) {
        if (peta.has(d)) continue;
        for (const t of e.panggilan) {
          if (peta.has(t)) { peta.set(d, [`${e.nama} → ${fungsi.get(t).nama}()`, ...peta.get(t)]); berubah = true; break; }
        }
      }
    }
    return peta;
  };
  const membuka = rambat('langsung');
  const membukaIo = rambat('io');

  /** Ditunggu (await), atau dilepas begitu saja? Yang dilepas tidak membuntukan. */
  const ditunggu = (node) => {
    for (let q = node.parent; q; q = q.parent) {
      if (ts.isAwaitExpression(q)) return true;
      if (ts.isArrowFunction(q) || ts.isFunctionExpression(q) || ts.isFunctionDeclaration(q)) break;
    }
    return false;
  };

  const temuan = []; const ioTemuan = []; const situs = [];
  for (const sf of berkas) {
    const jalan = (node) => {
      const luar = membukaTransaksi(node);
      if (luar && node.arguments.length) {
        const cb = node.arguments[node.arguments.length - 1];
        if (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) {
          const dipanggil = new Set();
          const dalam = (n) => {
            if (n !== cb) {
              const b2 = membukaKoneksi(n);
              if (b2) temuan.push({ di: pos(n), luar, dalam: b2, jalur: ['langsung'], tunggu: ditunggu(n) });
              else if (ts.isCallExpression(n)) {
                const t = targetPanggilan(n);
                if (t && membuka.has(t)) {
                  temuan.push({ di: pos(n), luar, dalam: `${n.expression.getText()}()`, jalur: membuka.get(t), tunggu: ditunggu(n) });
                }
              }
              const io = ioLuar(n);
              if (io) ioTemuan.push({ di: pos(n), luar, dalam: 'fetch', jalur: ['langsung'] });
              else if (ts.isCallExpression(n)) {
                const t2 = targetPanggilan(n);
                if (t2 && membukaIo.has(t2)) {
                  ioTemuan.push({ di: pos(n), luar, dalam: `${n.expression.getText()}()`, jalur: membukaIo.get(t2) });
                }
              }
              if (ts.isCallExpression(n)) dipanggil.add(n.expression.getText().split('\n')[0]);
              if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) dipanggil.add('IMPORT-DINAMIS');
            }
            ts.forEachChild(n, dalam);
          };
          ts.forEachChild(cb, dalam);
          situs.push({ di: pos(node), luar, dipanggil: [...dipanggil] });
        }
      }
      ts.forEachChild(node, jalan);
    };
    ts.forEachChild(sf, jalan);
  }

  const rapikan = (xs) => {
    const m = new Map();
    for (const t of xs) if (!m.has(t.di + t.dalam)) m.set(t.di + t.dalam, t);
    return [...m.values()].sort((a, b) => a.di.localeCompare(b.di));
  };
  const semua = rapikan(temuan);
  return {
    buntu: semua.filter((t) => t.tunggu),
    tertunda: semua.filter((t) => !t.tunggu),
    io: rapikan(ioTemuan),
    situs,
    jumlahFungsi: fungsi.size,
  };
}

/* ── CLI ──────────────────────────────────────────────────────────────── */
if (process.argv[1] && process.argv[1].endsWith('audit-koneksi.mjs')) {
  const h = pindai();
  const cetak = (judul, xs) => {
    console.log(`\n### ${xs.length} ${judul} ###\n`);
    for (const t of xs) console.log(`${t.di}\n  dalam ${t.luar}() -> ${t.dalam}\n  jalur: ${t.jalur.join('  =>  ')}\n`);
  };
  console.log(`${h.situs.length} badan transaksi · ${h.jumlahFungsi} fungsi terdaftar`);
  cetak('BUNTU (di-await di dalam transaksi)', h.buntu);
  cetak('TERTUNDA (tidak di-await — antre, tidak buntu)', h.tertunda);
  cetak('I/O EKSTERNAL DI DALAM TRANSAKSI (menahan koneksi)', h.io);

  if (process.env.INVENTARIS) {
    /* Analisis statis PUTUS di `await import(...)`, yang justru dipakai jalur
       embedding & ekstraksi. Daftar mentah ini satu-satunya cara memastikan
       tak ada yang luput karena pemindainya buta di titik itu. */
    const abai = /^(tx\.|repo\.|sql|and|eq|or|isNull|isNotNull|desc|asc|count|sum|inArray|gte|lte|lt|gt|ne|not|exists|max|min|avg|coalesce|like|ilike|between|arrayContains)/;
    const kosakata = new Map();
    for (const s of h.situs) for (const c of s.dipanggil) {
      if (abai.test(c)) continue;
      if (!kosakata.has(c)) kosakata.set(c, []);
      kosakata.get(c).push(s.di);
    }
    console.log(`### INVENTARIS — ${kosakata.size} panggilan berbeda di dalam transaksi ###\n`);
    for (const [c, di] of [...kosakata].sort()) console.log(`  ${c}  ×${di.length}   ${di[0]}`);
  }

  const gagal = h.buntu.length + h.io.length;
  if (gagal) console.error(`\n${gagal} temuan yang MEMBUAT PERMINTAAN MENGGANTUNG.`);
  process.exit(gagal ? 1 : 0);
}
