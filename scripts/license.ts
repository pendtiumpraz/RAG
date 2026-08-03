/**
 * PENERBIT LISENSI ON-PREMISE.
 *
 *   npm run license:keygen            → sepasang kunci Ed25519 (sekali seumur produk)
 *   npm run license:issue -- --untuk "PT Contoh" --bulan 12 --edisi enterprise
 *   npm run license:check -- <kunci>  → periksa kunci yang sudah terbit
 *
 * KUNCI PRIVAT TAK PERNAH MASUK REPO. Ia dibaca dari `LICENSE_PRIVATE_KEY`
 * (PEM, boleh berisi \n harfiah) dan hanya ada di mesin yang menerbitkan.
 * Yang dikirim ke pelanggan cuma kunci publiknya, dan kunci publik memang
 * boleh dilihat siapa pun — ia hanya bisa MEMERIKSA, tak bisa menerbitkan.
 *
 * Kenapa CLI dan bukan tombol di konsol: menerbitkan lisensi butuh kunci
 * privat, dan kunci privat yang hidup di server web adalah kunci privat yang
 * bocor bersama server web itu. Satu kompromi di sana = kemampuan menerbitkan
 * lisensi apa pun, untuk siapa pun, selamanya.
 */
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
import { periksaLisensi, uraiKunci, type IsiLisensi } from '../src/modules/core/lisensi';

const argv = process.argv.slice(2);
const perintah = argv[0] ?? '';

function opsi(nama: string): string | undefined {
  const i = argv.indexOf(`--${nama}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

function keygen(): void {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  console.log('\n=== SIMPAN DI TEMPAT RAHASIA — JANGAN COMMIT ===\n');
  console.log(priv);
  console.log('=== KUNCI PUBLIK — masuk ke .env pelanggan sebagai LICENSE_PUBLIC_KEY ===\n');
  console.log(pub);
  console.log('\nSatu pasang untuk seumur produk. Mengganti pasangannya membuat SELURUH');
  console.log('lisensi yang sudah terbit berhenti terbaca — dan pelanggan yang lisensinya');
  console.log('mendadak "tidak sah" akan menyimpulkan produknya rusak, bukan kuncinya diputar.\n');
}

function issue(): void {
  const untuk = opsi('untuk');
  if (!untuk) {
    console.error('Wajib: --untuk "Nama Organisasi"');
    process.exit(1);
  }
  const pem = (process.env.LICENSE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').trim();
  if (!pem) {
    console.error('LICENSE_PRIVATE_KEY kosong. Jalankan `npm run license:keygen` dulu, '
      + 'lalu pasang kunci privatnya sebagai env di mesin penerbit.');
    process.exit(1);
  }

  const bulan = Number(opsi('bulan') ?? '12');
  const isi: IsiLisensi = {
    untuk,
    ...(Number.isFinite(bulan) && bulan > 0
      ? { sampai: new Date(Date.now() + bulan * 30 * 86_400_000).toISOString().slice(0, 10) }
      : {}),
    ...(opsi('edisi') ? { edisi: opsi('edisi') } : {}),
    ...(opsi('maks-pengguna') ? { maksPengguna: Number(opsi('maks-pengguna')) } : {}),
    ...(opsi('maks-chatbot') ? { maksChatbot: Number(opsi('maks-chatbot')) } : {}),
    /* Seri diturunkan dari waktu terbit, bukan acak: dua lisensi untuk
       organisasi yang sama harus bisa diurutkan saat dukungan bertanya
       "yang mana yang kamu pasang?". */
    seri: `NL-${Date.now().toString(36).toUpperCase()}`,
  };

  const data = Buffer.from(JSON.stringify(isi), 'utf8');
  const sig = sign(null, data, createPrivateKey(pem));
  const kunci = `${data.toString('base64url')}.${sig.toString('base64url')}`;

  console.log('\n=== LICENSE_KEY (kirim ke pelanggan) ===\n');
  console.log(kunci);
  console.log('\nIsi:', JSON.stringify(isi, null, 2));
  console.log('\nPelanggan menempelkannya ke .env sebagai LICENSE_KEY, bersama');
  console.log('LICENSE_PUBLIC_KEY yang sama untuk semua pelanggan.\n');
}

function check(): void {
  const kunci = argv[1] ?? process.env.LICENSE_KEY ?? '';
  if (!kunci) { console.error('Pakai: npm run license:check -- <kunci>'); process.exit(1); }
  const urai = uraiKunci(kunci);
  console.log('\nTerbaca:', urai ? JSON.stringify(urai.isi, null, 2) : 'TIDAK — kunci rusak/terpotong');
  /* Diperiksa lewat jalur PRODUKSI yang sama, dengan mode dipaksa onprem —
     kalau tidak, `check` akan selalu menjawab "tak berlaku" di mesin
     pengembang dan tak membuktikan apa pun. */
  const h = periksaLisensi(
    { ...process.env, DEPLOYMENT_MODE: 'onprem', LICENSE_KEY: kunci } as NodeJS.ProcessEnv,
  );
  console.log(`\nStatus: ${h.status}\n${h.pesan}\n`);
  if (h.status !== 'aktif') process.exitCode = 1;
}

if (perintah === 'keygen') keygen();
else if (perintah === 'issue') issue();
else if (perintah === 'check') check();
else {
  console.log('Pakai: keygen | issue --untuk "Nama" [--bulan 12] [--edisi enterprise] | check <kunci>');
  process.exitCode = 1;
}
