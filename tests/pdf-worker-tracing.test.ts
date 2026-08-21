import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

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

/** Rute yang benar-benar mengekstrak teks PDF (memanggil extractText). */
const RUTE_PDF = [
  '/api/knowledge-bases/[id]/upload',
  '/api/sources',
  '/api/sources/[id]/sync',
  '/api/sources/[id]/pratinjau',
];

test('next.config menyertakan pdf.worker.mjs untuk tiap rute pengekstrak PDF', async () => {
  const { default: config } = await import('../next.config.mjs');
  const includes = config.outputFileTracingIncludes as Record<string, string[]> | undefined;
  assert.ok(includes, 'outputFileTracingIncludes hilang — worker pdf.js tak akan ikut ke lambda');

  for (const rute of RUTE_PDF) {
    const daftar = includes![rute];
    assert.ok(daftar, `rute ${rute} mengekstrak PDF tapi tak menyertakan berkas apa pun`);
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
