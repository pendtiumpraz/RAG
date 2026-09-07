import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * PENJAGA: worker pdf.js harus ikut ke lambda.
 *
 * Di Node, pdf.js mematikan worker sungguhan lalu memuat "fake worker"-nya
 * lewat import DINAMIS (`GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs"`
 * → `await import(this.workerSrc)`). Specifier itu dirakit saat runtime,
 * sehingga file-tracing Next/Vercel yang statis TAK PERNAH melihatnya: trace
 * rute hanya membawa `legacy/build/pdf.mjs`.
 *
 * Akibatnya khas dan menyesatkan: di laptop semua PDF terbaca (berkasnya ada
 * di node_modules), di produksi TIAP PDF gagal dengan "Setting up fake worker
 * failed" → extractText() null → berkas dilaporkan "teksnya belum bisa dibaca"
 * seolah-olah hasil pindai. Kejadian nyata 2026-08-21 di nalar.sainskerta.net.
 *
 * Karena itu `outputFileTracingIncludes` di next.config.mjs adalah bagian dari
 * jalur ekstraksi PDF, bukan sekadar penyetelan build — dan tes ini gagal bila
 * ada yang menghapusnya, atau bila pdfjs-dist memindahkan berkas workernya.
 */

const WORKER = './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';

/**
 * Rute pengekstrak PDF DIPINDAI, tidak dihafal.
 *
 * Versi pertama tes ini memegang daftar tulisan tangan berisi empat rute —
 * lalu rute kelima (/api/v1/knowledge-bases/{id}/upload) lahir dari sesi
 * lain, memanggil extractText, dan lolos tanpa satu pun tes menyala: PDF via
 * API v1 gagal senyap di produksi, persis pola kegagalan yang tes ini dibuat
 * untuk mencegah. Penjaga yang harus diberi tahu apa yang dijaganya bukan
 * penjaga. Kini: setiap route.ts di src/app yang mengimpor extractText WAJIB
 * punya baris outputFileTracingIncludes — otomatis, termasuk rute yang belum
 * ditulis.
 */
function rutePengekstrak(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) rutePengekstrak(p, out);
    /* Kriterianya IMPOR sync.service, bukan simbol extractText: rute sync/
       pratinjau tak menyebut extractText langsung — ekstraksinya berjalan di
       dalam runSync — tapi module graph mereka tetap menyeret pdf.mjs ke
       lambda, dan tanpa worker ia gagal dengan cara yang sama. */
    else if (e.name === 'route.ts' && /knowledge\/sync\.service/.test(readFileSync(p, 'utf8'))) {
      out.push('/' + p.replace(/\\/g, '/').replace(/^src\/app\//, '').replace(/\/route\.ts$/, ''));
    }
  }
  return out;
}

test('next.config menyertakan pdf.worker.mjs untuk tiap rute pengekstrak PDF', async () => {
  const { default: config } = await import('../next.config.mjs');
  const includes = config.outputFileTracingIncludes as Record<string, string[]> | undefined;
  assert.ok(includes, 'outputFileTracingIncludes hilang — worker pdf.js tak akan ikut ke lambda');

  const rutePdf = rutePengekstrak('src/app');
  assert.ok(rutePdf.length >= 5, `pemindaian rute pengekstrak mencurigakan (${rutePdf.length} — extractText pindah?)`);

  for (const rute of rutePdf) {
    const daftar = includes![rute];
    assert.ok(daftar, `rute ${rute} mengekstrak PDF tapi tak menyertakan berkas apa pun di next.config.mjs`);
    assert.ok(
      daftar.some((p) => p.endsWith('pdf.worker.mjs')),
      `rute ${rute} tak menyertakan pdf.worker.mjs — PDF-nya akan gagal HANYA di produksi`,
    );
  }
});

test('berkas worker yang dirujuk memang ada (pdfjs-dist belum memindahkannya)', () => {
  assert.ok(
    existsSync(WORKER),
    `${WORKER} tak ditemukan — periksa layout pdfjs-dist setelah upgrade, lalu perbarui next.config.mjs`,
  );
});
