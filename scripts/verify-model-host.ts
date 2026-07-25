/**
 * Verifikasi jalur BACA model host tanpa menyentuh blob sungguhan.
 *
 *   npm run models:verify
 *
 * Menyajikan `.model-cache` lewat HTTP lokal dengan tata letak IDENTIK
 * blob (<base>/models/<hfRepo>/<berkas>), mengosongkan cache runtime, lalu
 * menjalankan embedding sungguhan. Kalau lulus, artinya konfigurasi
 * EMBEDDING_MODEL_SOURCE=blob benar-benar menarik bobot dari model host —
 * bukan diam-diam jatuh ke Hugging Face.
 *
 * Prasyarat: model sudah pernah dipakai sekali sehingga ada di
 * `.model-cache/<hfRepo>/` (atau salin manual ke sana).
 */
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getEmbeddingModel } from '../src/modules/core/registry';

const MODEL_ID = process.argv[2] ?? 'all-MiniLM-L6-v2';

async function main() {
  const model = getEmbeddingModel(MODEL_ID);
  if (!model || model.kind !== 'local') throw new Error(`bukan model lokal: ${MODEL_ID}`);
  const repo = model.hfRepo ?? model.id;

  const src = path.resolve(process.env.MODEL_CACHE_DIR || './.model-cache');
  try { await fs.access(path.join(src, repo)); }
  catch {
    throw new Error(
      `berkas model belum ada di ${path.join(src, repo)}.\n` +
      'Jalankan sekali dengan EMBEDDING_MODEL_SOURCE=local agar transformers.js mengunduhnya,\n' +
      'atau salin berkas repo HF ke sana lebih dulu.',
    );
  }

  // Model host tiruan: hanya melayani /models/** dari cache lokal.
  const hits: string[] = [];
  const server = http.createServer(async (req, res) => {
    const url = decodeURIComponent((req.url ?? '').split('?')[0]);
    const m = url.match(/^\/models\/(.+)$/);
    if (!m) { res.writeHead(404).end(); return; }
    hits.push(url);
    try {
      const buf = await fs.readFile(path.join(src, m[1]));
      res.writeHead(200, {
        'content-type': url.endsWith('.json') ? 'application/json' : 'application/octet-stream',
        'content-length': String(buf.length),
      }).end(buf);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  // Cache runtime KOSONG → pengambilan harus lewat model host.
  const tmpCache = await fs.mkdtemp(path.join(os.tmpdir(), 'nalar-model-'));
  process.env.EMBEDDING_MODEL_SOURCE = 'blob';
  process.env.EMBEDDING_MODEL_BLOB_URL = base;
  process.env.MODEL_CACHE_DIR = tmpCache;

  console.log(`model      : ${model.id} (${repo}), onnx ${model.quantized === false ? 'presisi penuh' : 'terkuantisasi'}`);
  console.log(`model host : ${base}/models/…`);
  console.log(`cache      : ${tmpCache} (kosong)\n`);

  // Import SETELAH env diset — local.ts membaca env saat modul dimuat.
  const { embedLocal } = await import('../src/modules/knowledge/embeddings/local');

  const t0 = Date.now();
  const vecs = await embedLocal(model, ['garansi produk pro 24 bulan', 'pengiriman 3-5 hari']);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  server.close();

  console.log('berkas ditarik dari model host:');
  for (const h of hits) console.log('  ' + h);

  const norm = Math.sqrt(vecs[0].reduce((s, x) => s + x * x, 0));
  console.log(`\nvektor : ${vecs.length} × ${vecs[0].length} dim · norma ${norm.toFixed(4)} · ${secs}s`);

  const onnx = model.quantized === false ? 'model.onnx' : 'model_quantized.onnx';
  const ok = hits.some((h) => h.includes(`${repo}/config.json`))
    && hits.some((h) => h.includes(onnx))
    && vecs.length === 2 && vecs[0].length === model.dimensions
    && Math.abs(norm - 1) < 1e-3;

  console.log(`\n${ok ? '✓ LULUS' : '✗ GAGAL'} — bobot dimuat dari model host & embedding valid`);
  if (!ok) process.exitCode = 1;
}

main().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
