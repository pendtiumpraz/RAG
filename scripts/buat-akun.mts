/**
 * BUAT AKUN OPERATOR — langsung ke basis data.
 *
 *   npm run akun:buat -- --email ops@contoh.id --nama "Operator" [--peran admin] [--tulis D:/x.txt]
 *
 * KENAPA ADA. Pendaftaran lewat aplikasi selalu melahirkan peran `admin`
 * berstatus `pending`, dan halaman Team hanya bisa menukar `admin`↔`member`.
 * Jadi ada dua kebutuhan yang tak punya jalur sama sekali di UI: membuat akun
 * operator tanpa menunggu email verifikasi, dan menaikkan seseorang jadi
 * `superadmin`. Sebelum berkas ini, keduanya dikerjakan dengan SQL yang
 * diketik tangan — tak berjejak, tak berulang, dan gampang salah tempel.
 *
 * TIGA PENJAGAAN, dan semuanya pernah jadi kerusakan nyata di produk lain:
 *
 *   1. MENOLAK email yang sudah ada. Menimpa akun yang sedang dipakai orang
 *      lain adalah kerusakan yang baru ketahuan saat orang itu gagal masuk —
 *      berhari-hari kemudian, tanpa satu pun yang menghubungkannya ke sini.
 *   2. HASH DIVERIFIKASI SEBELUM DITULIS. Hash yang tak bisa dibaca balik
 *      mengunci akunnya total, dan itu jauh lebih buruk daripada sandi salah.
 *   3. JEJAK AUDIT. Akun yang lahir di luar aplikasi tanpa catatan akan jadi
 *      teka-teki bagi siapa pun yang belakangan bertanya "ini siapa yang buat?".
 *
 * Sandinya dicetak SEKALI. Tak disimpan di mana pun kecuali bila `--tulis`
 * diberikan — dan berkas itu memuat sandi POLOS, jadi ia milik mesin yang
 * kamu percaya, bukan repositori.
 */
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import postgres from 'postgres';
import { hashPassword, verifyPassword } from '../src/modules/auth/password.js';

const argv = process.argv.slice(2);
const opsi = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

const email = (opsi('email') ?? '').trim().toLowerCase();
const nama = opsi('nama') ?? 'Operator';
const peran = opsi('peran') ?? 'admin';
const tulis = opsi('tulis');

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Wajib: --email alamat@yang.sah'); process.exit(1);
}
if (!['admin', 'member', 'superadmin'].includes(peran)) {
  console.error(`Peran tak dikenal: ${peran} (admin | member | superadmin)`); process.exit(1);
}

const url = process.env.DATABASE_URL_ADMIN;
if (!url) {
  console.error('DATABASE_URL_ADMIN kosong. Peran aplikasi `nalar_app` tak bisa menembus RLS '
    + 'tabel users, jadi pembuatan akun HARUS lewat peran pemilik.');
  process.exit(1);
}

const db = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

const ada = await db`select id, status, deleted_at from users where email = ${email}`;
if (ada.length) {
  console.error(`SUDAH ADA: ${email} (status=${ada[0].status}`
    + `${ada[0].deleted_at ? ', TERHAPUS' : ''}). Tidak ditimpa.`);
  await db.end(); process.exit(1);
}

/* Tenant platform: tempat yang benar untuk akun operator. Kalau tak ada
   (pemasangan baru), pemanggil harus menyebutnya sendiri — menebak tenant
   berarti akun mendarat di workspace pelanggan. */
const [tenant] = await db`select id, name from tenants
                           where is_platform = true and deleted_at is null limit 1`;
if (!tenant) { console.error('Tenant platform tak ditemukan.'); await db.end(); process.exit(1); }

/* 18 byte base64url = 24 karakter. Cukup panjang untuk tak bisa ditebak,
   cukup pendek untuk dibacakan lewat telepon tanpa salah ketik. */
const sandi = randomBytes(18).toString('base64url');
const hash = await hashPassword(sandi);
if (!(await verifyPassword(sandi, hash))) {
  console.error('Hash baru tak lolos verifikasi ulang — DIBATALKAN sebelum menulis apa pun.');
  await db.end(); process.exit(1);
}

/* status `active` + email_verified_at diisi: akun operator tak melewati
   antrean verifikasi, dan tanpa dua kolom ini ia akan ditolak login dengan
   pesan yang identik dengan sandi salah — buntu yang mahal ditelusuri. */
const [u] = await db`
  insert into users (tenant_id, email, name, role, password_hash, status, email_verified_at, approved_at)
  values (${tenant.id}::uuid, ${email}, ${nama}, ${peran}, ${hash}, 'active', now(), now())
  returning id`;

await db`insert into audit_logs (tenant_id, actor, action, subject, meta)
  values (${tenant.id}::uuid, ${String(u.id)}, 'auth.user_created_manual', ${String(u.id)},
    ${JSON.stringify({ email, peran, tenant: tenant.name, nama,
      catatan: 'dibuat lewat scripts/buat-akun.ts — baris ini satu-satunya jejaknya' })}::jsonb)`;
await db.end();

const blok = [
  '===========================================',
  `  URL       : ${process.env.NEXTAUTH_URL ?? 'https://rag.sainskerta.net'}/auth`,
  `  Email     : ${email}`,
  `  Password  : ${sandi}`,
  `  Peran     : ${peran}`,
  `  Tenant    : ${tenant.name}`,
  '===========================================',
].join('\n');
console.log(`\n${blok}\n`);

if (tulis) {
  writeFileSync(tulis, `${blok}\n\nDibuat ${new Date().toISOString()} oleh scripts/buat-akun.mts\n`
    + 'SANDI POLOS — jangan taruh di repositori atau berbagi drive.\n', 'utf8');
  console.log(`Ditulis ke ${tulis}`);
}
