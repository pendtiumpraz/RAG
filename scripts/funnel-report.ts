/**
 * LAPORAN FUNNEL PRODUK — `npm run funnel:report`
 *
 * Menjawab pertanyaan yang selama ini tak bisa dijawab siapa pun: di titik
 * mana pendaftar berhenti — verifikasi email, antrean persetujuan kita,
 * membuat chatbot, mengisi pengetahuan, atau membayar.
 *
 * SATU KUERI PER TENANT lewat withTenant, bukan satu agregasi lintas tenant.
 * Pelajaran mahal dari scripts/quota-report.ts: agregasi tunggal atas seluruh
 * tabel mengembalikan NOL BARIS walau datanya ada, karena aplikasi menyambung
 * sebagai peran NOBYPASSRLS dan RLS memang melakukan tugasnya. Yang
 * menyesatkan, kueri itu tidak GAGAL — ia hanya kosong, dan laporan kosong
 * terbaca persis seperti "belum ada yang mendaftar".
 *
 * Jalan pintas lintas-tenant memang ada (GUC konteks admin), tapi ia dibuka
 * hanya di jalur superadmin di balik requireRole. Skrip CLI tak boleh
 * memakainya sambil lalu: begitu satu tempat memakainya tanpa penjagaan,
 * kebiasaannya menyebar.
 */
import { sql } from 'drizzle-orm';
import { db, client } from '@/modules/core/db';
import { tenants } from '@/modules/core/db/schema';
import { withTenant } from '@/modules/core/db/tenant-context';
import {
  type KeadaanTenant, MIN_UNTUK_PERSEN, bolehPersen, hitungFunnel, persen, tahapPalingBocor,
} from '@/modules/usage/funnel';

async function main() {
  const daftarTenant = await db.select({ id: tenants.id, nama: tenants.name })
    .from(tenants);

  if (daftarTenant.length === 0) {
    console.log('\nTidak ada satu tenant pun. Tak ada yang bisa dilaporkan.\n');
    return;
  }

  const keadaan: KeadaanTenant[] = [];
  for (const t of daftarTenant) {
    const r = (await withTenant(t.id, (tx) => tx.execute(sql`
      select
        /* Tenant selalu "mendaftar" — barisnya ada. Tahap ini jadi penyebut
           seluruh funnel, bukan sekadar formalitas. */
        true as daftar,
        exists (select 1 from users u
                where u.deleted_at is null and u.email_verified_at is not null) as terverifikasi,
        exists (select 1 from users u
                where u.deleted_at is null and u.status = 'active') as disetujui,
        exists (select 1 from chatbots c where c.deleted_at is null) as punya_chatbot,
        /* Pengetahuan diukur dari POTONGAN, bukan dari knowledge base. KB
           kosong yang dibuat lalu ditinggalkan adalah persis pola berhenti
           yang ingin dilihat laporan ini — menghitungnya sebagai "sudah
           mengisi" akan menyembunyikan kebocoran di tahap ini. */
        exists (select 1 from documents d where d.deleted_at is null) as punya_pengetahuan,
        exists (select 1 from conversations v where v.deleted_at is null) as punya_percakapan,
        exists (select 1 from payments p
                where p.deleted_at is null and p.status = 'paid') as membayar
    `)) as unknown as Array<Record<string, boolean>>)[0];

    keadaan.push({
      daftar: true,
      terverifikasi: Boolean(r?.terverifikasi),
      disetujui: Boolean(r?.disetujui),
      punyaChatbot: Boolean(r?.punya_chatbot),
      punyaPengetahuan: Boolean(r?.punya_pengetahuan),
      punyaPercakapan: Boolean(r?.punya_percakapan),
      membayar: Boolean(r?.membayar),
    });
  }

  const baris = hitungFunnel(keadaan);
  const total = baris[0].jumlah;
  const tampilkanPersen = bolehPersen(total);

  console.log(`\nFUNNEL PRODUK — ${total} tenant\n`);
  console.log('TAHAP                      JUMLAH   LANJUT   BERHENTI');
  for (const b of baris) {
    const lanjut = tampilkanPersen ? persen(b.lanjutDariSebelumnya).padStart(7) : '      —';
    console.log(`${b.label.padEnd(26)} ${String(b.jumlah).padStart(6)}  ${lanjut}  ${String(b.berhenti).padStart(9)}`);
  }

  const bocor = tahapPalingBocor(baris);
  console.log('');
  if (!tampilkanPersen) {
    /* Menolak menyimpulkan adalah bagian dari gunanya. Dengan tiga
       pendaftar, satu orang yang berhenti adalah "33% drop-off" — angka yang
       terlihat seperti temuan dan sebenarnya satu orang, lalu jadi dasar
       keputusan produk yang diambil dari derau. */
    console.log(`Persentase TIDAK ditampilkan: ${total} tenant di bawah ambang ${MIN_UNTUK_PERSEN}.`);
    console.log('Angka jumlahnya tetap benar dan tetap berguna untuk ditelusuri satu per satu.');
  } else if (bocor) {
    console.log(`Kebocoran terbesar: ${bocor.label} — ${bocor.berhenti} tenant berhenti di sini.`);
    console.log(`  ${bocor.arti}`);
  } else {
    console.log('Tak ada tahap yang kehilangan tenant. Seluruh pendaftar sampai ke ujung.');
  }

  console.log('\nCatatan yang menentukan cara membaca angka di atas:');
  console.log('  • "Email terverifikasi" hanya ditegakkan bila SMTP aktif. Tanpa SMTP,');
  console.log('    tahap itu lolos otomatis dan BUKAN tanda apa pun.');
  console.log('  • Tertahan di "Disetujui superadmin" berarti antrean KITA, bukan');
  console.log('    keraguan pengguna — dan itu satu-satunya tahap yang bisa kita');
  console.log('    perbaiki hari ini juga.\n');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
