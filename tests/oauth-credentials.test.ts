import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * SATU SUMBER KREDENSIAL OAUTH — invarian yang pernah jebol dan memakan
 * SELURUH koneksi Google sekaligus.
 *
 * Sejak D10, kredensial aplikasi OAuth hidup di tabel `oauth_apps` dan
 * `process.env` hanya cadangan; oauthAppService.get() yang memutuskan mana
 * yang dipakai. Tapi perpindahan itu hanya dikerjakan di jalur CONNECT.
 * refresh() dan userDrive() tertinggal membaca env langsung.
 *
 * Akibatnya bukan kerapian kode. Pada pemasangan yang kredensialnya hanya di
 * database — dan itu keadaan bawaan sekarang, `.env` tak memuatnya sama
 * sekali — menyambungkan akun BERHASIL (pakai kredensial database), lalu satu
 * jam kemudian refresh mengirim `client_id=undefined`, Google membalas
 * invalid_client, dan semua koneksi mati serentak. UI menyuruh menyambung
 * ulang, yang mustahil menolong: menyambung ulang memakai jalur yang memang
 * masih benar, jadi kegagalannya berulang persis setiap jam.
 *
 * Bentuk kegagalan itulah yang dijaga tes ini: bukan "apakah refresh bekerja"
 * (butuh Google sungguhan), melainkan "apakah masih ada jalur yang membaca
 * kredensial dari tempat berbeda".
 */

const SRC = 'src';
const IZIN = new Set([
  // SATU-SATUNYA yang boleh membaca env: di sinilah cadangannya diputuskan.
  path.join('src', 'modules', 'auth', 'oauth-app.service.ts'),
  // Jalur app-only (client credentials) untuk Drive superadmin peninggalan
  // hosting model — kredensial JENIS LAIN, tak pernah dipakai token pengguna.
  path.join('src', 'modules', 'knowledge', 'storage', 'sharepoint.ts'),
]);

function berkasTs(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return berkasTs(p);
    return /\.tsx?$/.test(n) ? [p] : [];
  });
}

test('kredensial OAuth hanya dibaca lewat oauthAppService', () => {
  const pelanggar: string[] = [];
  for (const f of berkasTs(SRC)) {
    if (IZIN.has(f)) continue;
    const isi = readFileSync(f, 'utf8');
    const m = isi.match(/process\.env\.(GOOGLE_CLIENT_\w+|MS_CLIENT_\w+|MS_TENANT_ID)/g);
    if (m) pelanggar.push(`${f} → ${[...new Set(m)].join(', ')}`);
  }
  assert.deepEqual(pelanggar, [],
    `kredensial OAuth dibaca langsung dari env, bukan lewat oauthAppService:\n  ${pelanggar.join('\n  ')}\n` +
    'Jalur connect memakai database; jalur yang membaca env akan gagal satu jam kemudian.');
});

test('refresh membaca kredensial dari sumber yang sama dengan connect', () => {
  const svc = readFileSync('src/modules/connections/connection.service.ts', 'utf8');
  assert.ok(/oauthAppService\.get\(provider\)/.test(svc),
    'refresh() tak lagi mengambil kredensial lewat oauthAppService');
  assert.ok(!/process\.env\.GOOGLE_CLIENT/.test(svc),
    'refresh() kembali membaca env — bug yang sama akan terulang');
});

test('kegagalan konfigurasi TIDAK dilaporkan sebagai token tercabut', () => {
  // Ini yang membuat bugnya bertahan: pesannya menyuruh menyambung ulang,
  // orang menyambung ulang, berhasil, lalu gagal lagi sejam kemudian —
  // dan tak seorang pun curiga pada kredensial aplikasinya.
  const svc = readFileSync('src/modules/connections/connection.service.ts', 'utf8');
  const rute = readFileSync('src/app/api/connections/test/route.ts', 'utf8');

  assert.ok(/'config'/.test(svc) && /'revoked'/.test(svc),
    'sebab kegagalan refresh tak lagi dibedakan');
  assert.ok(/failure === 'config'/.test(rute),
    'endpoint test tak membedakan kegagalan konfigurasi dari token tercabut');
  assert.ok(/TIDAK akan menolong/.test(rute),
    'pesan konfigurasi tak lagi menyatakan bahwa menyambung ulang percuma');
});

test('badan galat penyedia dibaca, tidak dibuang', () => {
  // `if (!res.ok) return null` membuang satu-satunya keterangan yang bisa
  // membedakan invalid_client dari invalid_grant. Tanpa itu, diagnosis hanya
  // bisa dilakukan dengan membaca kode — persis yang baru saja terjadi.
  const svc = readFileSync('src/modules/connections/connection.service.ts', 'utf8');
  assert.ok(/invalid_client/.test(svc), 'invalid_client tak dikenali sebagai kegagalan konfigurasi');
  assert.ok(/console\.error\(`\[oauth-refresh\]/.test(svc),
    'kegagalan refresh tak dicatat — di produksi ia akan tak terlihat sama sekali');
});
