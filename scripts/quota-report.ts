/**
 * LAPORAN PENOLAKAN KUOTA — bahan untuk memutuskan apakah kuota perlu diubah.
 *
 *   npm run quota:report
 *   npm run quota:report -- --hari=30
 *
 * Menjawab tiga pertanyaan yang ditulis kartu a-plan-quota-eval, dan tak
 * lebih dari itu:
 *
 *   1. Berapa akun yang MENABRAK kuota, dan pada paket apa?
 *   2. Berapa lama setelah mendaftar mereka menabraknya?
 *   3. Setelah menabrak — mereka NAIK PAKET, atau HILANG?
 *
 * Pertanyaan ketiga yang paling menentukan dan paling sering dilupakan.
 * Akun yang menabrak kuota lalu naik paket membuktikan batasnya bekerja
 * sebagai pendorong; akun yang menabrak lalu tak pernah kembali membuktikan
 * batasnya mengusir orang sebelum mereka sempat melihat produknya bekerja.
 * Dua-duanya terlihat sama di angka "jumlah penolakan".
 *
 * ANGKA NOL ADALAH JAWABAN YANG SAH. Bila belum ada penolakan sama sekali,
 * laporan ini mengatakannya apa adanya — bukan menyusun kesimpulan dari
 * kekosongan. Kuota tak boleh disetel ulang atas dasar tebakan yang dibungkus
 * tabel.
 */
import { sql } from 'drizzle-orm';
import { db, client } from '@/modules/core/db';
import { tenants } from '@/modules/core/db/schema';
import { withTenant } from '@/modules/core/db/tenant-context';
import { AKSI_TOLAK_KUOTA } from '@/modules/knowledge/knowledge.service';

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const hari = Math.max(1, Number(arg('hari') ?? 90));

interface Baris {
  tenantId: string; nama: string; plan: string;
  tolak: number; pertamaTolak: string; terakhirTolak: string;
  daftar: string; jamKeTolak: number | null;
  chatSesudah: number; planSekarang: string;
}

async function main() {
  /* SATU KUERI PER TENANT lewat withTenant, bukan satu kueri lintas tenant.
     Versi pertama menjalankan agregasi tunggal atas seluruh audit_logs dan
     mengembalikan NOL baris walau datanya ada — karena aplikasi menyambung
     sebagai peran NOBYPASSRLS, dan RLS memang melakukan tugasnya. Yang
     menyesatkan: kueri itu tidak GAGAL, ia hanya kosong, dan laporan yang
     kosong terbaca persis seperti "belum ada kejadian".

     Jalan pintas lintas-tenant memang ada — sebuah GUC konteks admin — tapi
     ia dibuka hanya di jalur superadmin di balik requireRole. Sebuah skrip
     CLI tak boleh memakainya sambil lalu: begitu satu tempat memakainya
     tanpa penjagaan, kebiasaannya menyebar. */
  const daftarTenant = await db.select({
    id: tenants.id, nama: tenants.name, plan: tenants.plan, daftar: tenants.createdAt,
  }).from(tenants);

  const rows: Baris[] = [];
  for (const t of daftarTenant) {
    const r = (await withTenant(t.id, (tx) => tx.execute(sql`
      with tolak as (
        select count(*)::int as tolak,
               min(created_at) as pertama,
               max(created_at) as terakhir,
               (array_agg(meta->>'plan' order by created_at))[1] as plan_saat_tolak
          from audit_logs
         where action = ${AKSI_TOLAK_KUOTA}
           and created_at >= now() - make_interval(days => ${hari})
           and deleted_at is null
      )
      select k.tolak, k.pertama, k.terakhir, k.plan_saat_tolak,
             -- Aktivitas SESUDAH tabrakan pertama: inilah yang membedakan
             -- "batasnya mendorong" dari "batasnya mengusir".
             (select count(*)::int from audit_logs a
               where a.action = 'chat.turn' and a.created_at > k.pertama) as chat_sesudah
        from tolak k where k.tolak > 0
    `))) as unknown as Array<{
      tolak: number; pertama: string; terakhir: string;
      plan_saat_tolak: string | null; chat_sesudah: number;
    }>;
    if (!r[0]) continue;

    const jam = (new Date(r[0].pertama).getTime() - new Date(t.daftar).getTime()) / 3_600_000;
    rows.push({
      tenantId: t.id, nama: t.nama, plan: r[0].plan_saat_tolak ?? t.plan,
      planSekarang: t.plan, tolak: r[0].tolak,
      pertamaTolak: r[0].pertama, terakhirTolak: r[0].terakhir,
      daftar: String(t.daftar), jamKeTolak: Number.isFinite(jam) ? jam : null,
      chatSesudah: r[0].chat_sesudah,
    });
  }
  rows.sort((a, b) => b.tolak - a.tolak);

  console.log(`\nPENOLAKAN KUOTA — ${hari} hari terakhir\n`);
  if (!rows.length) {
    console.log('  Belum ada satu pun penolakan kuota tercatat.');
    console.log('  Itu jawaban yang SAH, bukan data yang hilang: instrumentasinya');
    console.log('  terpasang sejak 31 Jul 2026, jadi nol berarti memang belum ada');
    console.log('  yang menabrak batas — bukan berarti kejadiannya tak terekam.\n');
    console.log('  Kuota TIDAK boleh disetel ulang atas dasar ini.');
    return;
  }

  console.log('  TENANT                    PAKET  TOLAK  JAM-KE-1  CHAT-SESUDAH  PAKET-KINI');
  for (const r of rows) {
    const jam = r.jamKeTolak == null ? '   —' : r.jamKeTolak.toFixed(0).padStart(6);
    console.log(
      `  ${r.nama.slice(0, 24).padEnd(24)} ${r.plan.padEnd(6)} ${String(r.tolak).padStart(5)}`
      + ` ${jam}   ${String(r.chatSesudah).padStart(10)}  ${r.planSekarang}`);
  }

  const naik = rows.filter((r) => r.plan !== r.planSekarang).length;
  const hilang = rows.filter((r) => r.chatSesudah === 0).length;
  const hariPertama = rows.filter((r) => (r.jamKeTolak ?? Infinity) <= 24).length;

  console.log(`\n  ${rows.length} tenant menabrak kuota.`);
  console.log(`  ${hariPertama} di antaranya menabraknya dalam 24 JAM PERTAMA sejak mendaftar.`);
  console.log(`  ${naik} naik paket sesudahnya.`);
  console.log(`  ${hilang} tak melakukan apa pun lagi sesudahnya.`);
  console.log('\n  Yang menentukan keputusan adalah dua angka TERAKHIR, bukan jumlah');
  console.log('  penolakannya: naik-paket berarti batasnya mendorong, diam berarti');
  console.log('  batasnya mengusir sebelum orang sempat melihat produknya bekerja.');
}

main().catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
