/**
 * LAPORAN KONTRAS token desain — `npm run a11y:kontras`.
 *
 * Menghitung ulang setiap pasangan depan/belakang yang benar-benar dipakai
 * antarmuka, di kedua tema. Dipakai untuk memutuskan warna mana yang perlu
 * diubah; penjagaannya sendiri ada di tests/kontras.test.ts supaya perubahan
 * warna berikutnya tak bisa lolos diam-diam.
 */
import { readFileSync } from 'node:fs';
import { AA_BESAR, AA_TEKS, bacaToken, bulat, rasioWarna, resolusi } from '@/modules/core/kontras';
import { PASANGAN } from '@/modules/core/kontras-pasangan';

const css = readFileSync('src/app/nalar-ds.css', 'utf8');

for (const [tema, pemilih] of [['TERANG', ':root'], ['GELAP', '[data-theme="dark"]']] as const) {
  const dasar = bacaToken(css, ':root');
  const token = tema === 'GELAP' ? { ...dasar, ...bacaToken(css, pemilih) } : dasar;

  console.log(`\n── ${tema} ${'─'.repeat(56)}`);
  for (const p of PASANGAN) {
    const depan = resolusi(token, p.depan);
    const belakang = resolusi(token, p.belakang);
    if (!depan || !belakang) {
      console.log(`  ?  ${p.depan} / ${p.belakang}  — tak bisa dihitung (color-mix / bukan warna)`);
      continue;
    }
    const r = bulat(rasioWarna(depan, belakang));
    const ambang = p.besar ? AA_BESAR : AA_TEKS;
    const lulus = r >= ambang;
    console.log(`  ${lulus ? '✓' : '✗'}  ${(p.depan + ' / ' + p.belakang).padEnd(34)} ${String(r).padStart(5)}:1  (min ${ambang})  ${p.pakai}`);
  }
}
console.log('');
