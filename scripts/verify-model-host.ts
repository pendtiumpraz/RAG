/**
 * Verifikasi jalur BACA model host: benarkah bobot ditarik dari sana dan
 * modelnya benar-benar bisa dimuat?
 *
 *   npm run models:verify                    tiruan lokal, model default
 *   npm run models:verify -- bge-m3          tiruan lokal, model tertentu
 *   npm run models:verify -- --live --all    BLOB SUNGGUHAN, semua model lokal
 *
 * Mode tiruan menyajikan `.model-cache` lewat HTTP lokal dengan tata letak
 * IDENTIK blob (<base>/models/<hfRepo>/<berkas>) — cepat, tanpa jaringan,
 * tapi butuh model sudah ada di cache.
 *
 * Mode `--live` memakai EMBEDDING_MODEL_BLOB_URL dari .env: cache runtime
 * dikosongkan sehingga bobot WAJIB ditarik dari blob. Ini bukti terkuat
 * bahwa hasil `models:push` benar-benar bisa dipakai.
 */
import http from 'node:http';
import { promises as fs } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { getEmbeddingModel, EMBEDDING_MODELS, type EmbeddingModel } from '../src/modules/core/registry';
import { blobBaseUrl } from '../src/modules/knowledge/storage/blob-host';

const args = process.argv.slice(2).filter((a) => a !== '--');
const LIVE = args.includes('--live');
const ALL = args.includes('--all');
const IDS = args.filter((a) => !a.startsWith('--'));

/** Sajikan cache lokal sebagai model host tiruan. */
async function mockHost(src: string, hits: string[]) {
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
  return { base, close: () => server.close() };
}

async function verify(model: EmbeddingModel): Promise<boolean> {
  const repo = model.hfRepo ?? model.id;
  const hits: string[] = [];
  let base: string;
  let close = () => {};

  if (LIVE) {
    const b = blobBaseUrl();
    if (!b) throw new Error('EMBEDDING_MODEL_BLOB_URL belum diisi — mode --live butuh blob nyata');
    base = b;
  } else {
    const src = path.resolve(process.env.MODEL_CACHE_DIR || './.model-cache');
    try { await fs.access(path.join(src, repo)); }
    catch { throw new Error(`berkas model belum ada di ${path.join(src, repo)} — pakai --live atau unduh dulu`); }
    ({ base, close } = await mockHost(src, hits));
  }

  // Cache runtime KOSONG → pengambilan HARUS lewat model host.
  const tmpCache = await fs.mkdtemp(path.join(os.tmpdir(), 'nalar-model-'));
  process.env.EMBEDDING_MODEL_SOURCE = 'blob';
  process.env.EMBEDDING_MODEL_BLOB_URL = base;
  process.env.MODEL_CACHE_DIR = tmpCache;

  console.log(`\n▸ ${model.id} (${repo}) · ${model.sizeMB ?? '?'}MB · ${model.dimensions} dim`);
  console.log(`  host  ${base}/models/…`);

  // Import SEGAR tiap model — local.ts & transformers membaca env saat dimuat.
  const { embedLocal } = await import(`../src/modules/knowledge/embeddings/local?v=${Date.now()}`);

  const t0 = Date.now();
  const vecs: number[][] = await embedLocal(model, ['garansi produk pro 24 bulan', 'pengiriman 3-5 hari']);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  close();

  const norm = Math.sqrt(vecs[0].reduce((s, x) => s + x * x, 0));
  const cached = (await fs.readdir(tmpCache, { recursive: true })) as string[];
  const pulled = cached.filter((f) => String(f).includes('.')).length;

  const ok = vecs.length === 2 && vecs[0].length === model.dimensions
    && Math.abs(norm - 1) < 1e-3 && pulled > 0;
  console.log(`  ${ok ? '✓' : '✗'} ${vecs[0].length} dim · norma ${norm.toFixed(4)} · ${pulled} berkas ditarik · ${secs}s`);
  if (!LIVE && hits.length) console.log(`    (${hits.length} permintaan ke host tiruan)`);
  return ok;
}

/**
 * `--all` menjalankan tiap model di PROSES TERPISAH. Sesi ONNX tidak pernah
 * dilepas selama proses hidup, jadi memuat MiniLM + nomic + BGE-M3 berurutan
 * dalam satu proses menumpuk >1 GB dan mati tanpa pesan. Satu proses per
 * model juga membuat kegagalan satu model tak menutupi hasil model lain.
 */
function runEachInOwnProcess(models: EmbeddingModel[]): number {
  const self = fileURLToPath(import.meta.url);
  let pass = 0;
  for (const m of models) {
    const r = spawnSync(
      process.execPath,
      [...process.execArgv, self, m.id, ...(LIVE ? ['--live'] : [])],
      { stdio: 'inherit' },
    );
    if (r.status === 0) pass++;
    else if (r.status === null) console.log(`  ✗ ${m.id} — proses mati (kemungkinan kehabisan memori)`);
  }
  return pass;
}

async function main() {
  const local = EMBEDDING_MODELS.filter((m) => m.kind === 'local');

  if (ALL) {
    console.log(LIVE ? 'MODE: blob sungguhan (--live) · satu proses per model' : 'MODE: host tiruan · satu proses per model');
    const pass = runEachInOwnProcess(local);
    console.log(`\n${pass === local.length ? '✓ LULUS' : '✗ GAGAL'} — ${pass}/${local.length} model dimuat dari model host & embedding valid`);
    if (pass !== local.length) process.exitCode = 1;
    return;
  }

  const targets = (IDS.length ? IDS : ['all-MiniLM-L6-v2']).map((id) => {
    const m = getEmbeddingModel(id);
    if (!m || m.kind !== 'local') throw new Error(`bukan model lokal: ${id}`);
    return m;
  });

  console.log(LIVE ? 'MODE: blob sungguhan (--live)' : 'MODE: host tiruan dari cache lokal');
  const results: boolean[] = [];
  for (const m of targets) results.push(await verify(m));

  const pass = results.filter(Boolean).length;
  console.log(`\n${pass === results.length ? '✓ LULUS' : '✗ GAGAL'} — ${pass}/${results.length} model dimuat dari model host & embedding valid`);
  if (pass !== results.length) process.exitCode = 1;
}

main().catch((e) => { console.error('GAGAL:', e.message); process.exit(1); });
