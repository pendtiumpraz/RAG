/**
 * Buat (atau reset) akun demo dengan peran superadmin.
 *
 *   npm run demo:account                          # buat, email default
 *   npm run demo:account -- demo@domainmu.com     # email lain
 *   npm run demo:account -- --reset               # setel ulang password akun yg ada
 *
 * Kenapa perlu skrip: `authService.signup()` selalu memberi peran `admin`
 * (satu signup = satu tenant terisolasi). Peran `superadmin` tak pernah
 * diberikan lewat jalur pendaftaran publik — sengaja, karena peran itu bisa
 * mengelola infrastruktur platform (server embedding VPS). Jadi promosinya
 * dilakukan di sini, oleh orang yang sudah memegang akses database.
 *
 * Password di-generate acak dan HANYA ditampilkan sekali di layar; yang
 * tersimpan di DB adalah hash scrypt.
 */
import { randomInt } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, users, tenants, client } from '../src/modules/core/db';
import { withTenant } from '../src/modules/core/db/tenant-context';
import { authService } from '../src/modules/auth/auth.service';
import { hashPassword } from '../src/modules/auth/password';

const DEFAULT_EMAIL = 'demo@sainskerta.net';

/** Alfabet tanpa karakter yang mudah tertukar (0/O, 1/l/I). */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePassword(len = 20): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * `users` ber-FORCE RLS: UPDATE di luar konteks tenant TIDAK mengenai baris
 * apa pun — dan diam saja, tanpa error. Jadi promosi WAJIB lewat withTenant().
 * (Ini pernah menggigit: skrip tampak sukses padahal peran tak berubah.)
 */
async function promote(tenantId: string, userId: string): Promise<string> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.update(users).set({ role: 'superadmin', updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ role: users.role }));
  if (!rows[0]) throw new Error('promosi peran tidak mengenai baris mana pun (RLS?)');

  // Tandai workspace-nya sebagai milik operator platform. Tanpa langkah ini
  // superadmin baru akan mendapat semua FITUR terbuka tapi kuota `free` —
  // ketidakcocokan yang membingungkan dan pernah benar-benar terjadi.
  // `tenants` tabel akar tanpa RLS, jadi update biasa sudah cukup.
  await db.update(tenants).set({ isPlatform: true, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  return rows[0].role;
}

/**
 * Lookup lintas-tenant hanya boleh lewat policy `users_auth_lookup`
 * (migrations/0002_auth.sql) yang dibuka GUC app.auth_context. Tanpa itu,
 * pencarian by-email selalu kosong dan `--reset` akan mengira akunnya tak ada.
 */
async function findByEmail(email: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.auth_context', 'credential_login', true)`);
    const rows = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0] ?? null;
  });
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const reset = args.includes('--reset');
  const email = (args.find((a) => !a.startsWith('--')) ?? DEFAULT_EMAIL).trim().toLowerCase();
  const password = generatePassword();

  const existing = await findByEmail(email);

  if (existing && !reset) {
    const role = await promote(existing.tenantId, existing.id);
    console.log(
      `\nAkun ${email} SUDAH ADA — peran dipastikan "${role}".\n` +
      'Jalankan dengan --reset bila ingin password baru.\n',
    );
    return;
  }

  let userId: string;
  let tenantId: string;

  if (existing) {
    const hash = await hashPassword(password);
    const rows = await withTenant(existing.tenantId, (tx) =>
      tx.update(users).set({ passwordHash: hash, updatedAt: new Date() })
        .where(eq(users.id, existing.id)).returning({ id: users.id }));
    if (!rows[0]) throw new Error('reset password tidak mengenai baris mana pun (RLS?)');
    userId = existing.id; tenantId = existing.tenantId;
    console.log(`\nPassword akun ${email} disetel ulang.`);
  } else {
    const u = await authService.signup({
      orgName: 'Demo Nalar', name: 'Demo Superadmin', email, password,
    });
    userId = u.id; tenantId = u.tenantId;
    console.log(`\nAkun dibuat — tenant baru ${tenantId.slice(0, 8)}… terisolasi dari tenant lain.`);
  }

  const role = await promote(tenantId, userId);

  console.log('\n' + '─'.repeat(58));
  console.log('  AKUN DEMO (superadmin)');
  console.log('─'.repeat(58));
  console.log(`  URL       : ${process.env.NEXTAUTH_URL ?? 'https://nalar.sainskerta.net'}/auth`);
  console.log(`  Email     : ${email}`);
  console.log(`  Password  : ${password}`);
  console.log(`  Peran     : ${role}`);   // dibaca ULANG dari DB, bukan diasumsikan
  console.log('─'.repeat(58));
  console.log('  Password ini TIDAK disimpan di mana pun dalam bentuk terbaca —');
  console.log('  hanya hash scrypt-nya. Catat sekarang; kalau hilang, jalankan');
  console.log('  ulang dengan --reset untuk membuat yang baru.\n');
}

main()
  .catch((e) => { console.error('GAGAL:', e.message); process.exitCode = 1; })
  .finally(() => client.end());
