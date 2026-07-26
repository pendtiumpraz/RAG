/**
 * Server embedding mandiri (untuk VPS).
 *
 * KENAPA ADA: model besar tak masuk akal di lambda serverless — `/tmp` ~512 MB,
 * memori terbatas, filesystem sementara sehingga bobot ditarik ulang tiap cold
 * start (terukur 377 detik untuk varian 543 MB). Di VPS, bobot dimuat SEKALI
 * saat start lalu tinggal di memori; tiap permintaan hitungan milidetik.
 *
 * Ini juga satu-satunya jalan memakai BGE-M3 PRESISI PENUH (~2,16 GB): bobotnya
 * eksternal (`model.onnx_data`) dan transformers.js v2 di app utama tak bisa
 * memuatnya. Paket ini memakai transformers v3 yang mendukungnya — sengaja
 * dipisah agar app Next.js tak ikut menanggung dependensinya.
 *
 * API: kompatibel OpenAI (`POST /v1/embeddings`), jadi bisa juga ditukar dengan
 * HF Text Embeddings Inference / vLLM tanpa mengubah app.
 *
 * Jalankan:
 *   npm install
 *   EMBEDDING_TOKEN=rahasia MODELS=bge-m3 npm start
 *
 * WAJIB dipasangi TLS di depannya (Caddy/nginx) bila diakses dari internet —
 * yang melintas adalah isi dokumen tenant.
 */
import http from 'node:http';
import { pipeline, env } from '@huggingface/transformers';

const PORT = Number(process.env.PORT || 8081);
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN = process.env.EMBEDDING_TOKEN || '';
const MAX_BATCH = Number(process.env.MAX_BATCH || 64);
const MAX_BODY = Number(process.env.MAX_BODY_BYTES || 8 * 1024 * 1024);
const WARM_ONLY = process.argv.includes('--warm-only');

if (process.env.MODEL_CACHE_DIR) env.cacheDir = process.env.MODEL_CACHE_DIR;

/**
 * Katalog model yang dilayani.
 *
 * `dtype`  — bobot mana yang dimuat:
 *              fp32 → onnx/model.onnx (paling akurat)
 *              q8   → onnx/model_quantized.onnx (jauh lebih ringan)
 * `external` — WAJIB true untuk model yang bobotnya dipecah ke berkas
 *              `model.onnx_data` (ONNX >2GB, mis. BGE-M3 fp32 = graf 0,6MB +
 *              data 2,16GB). Flag ini opt-in di transformers v3; tanpa itu
 *              pemuatan gagal karena graf-nya saja tak berisi bobot.
 *              Inilah kemampuan yang TIDAK ada di transformers v2 — alasan
 *              service ini dipisah dari app utama.
 * `dimensions` — dipakai memotong keluaran; harus sama dengan registry app.
 */
const CATALOG = {
  'bge-m3': {
    repo: 'Xenova/bge-m3',
    dtype: process.env.BGE_M3_DTYPE || 'fp32',
    dimensions: 1024,
    // fp32 repo ini memakai bobot eksternal; varian q8 tidak.
    get external() { return this.dtype === 'fp32'; },
  },
  'all-MiniLM-L6-v2': { repo: 'Xenova/all-MiniLM-L6-v2', dtype: 'q8', dimensions: 384, external: false },
  'nomic-embed-text-v1.5': { repo: 'nomic-ai/nomic-embed-text-v1.5', dtype: 'q8', dimensions: 768, external: false },
};

/** Model mana yang dimuat saat start (koma-pisah); default semua di CATALOG. */
const ENABLED = (process.env.MODELS || Object.keys(CATALOG).join(','))
  .split(',').map((s) => s.trim()).filter(Boolean);

const pipes = new Map();

async function load(name) {
  const spec = CATALOG[name];
  if (!spec) throw new Error(`model tak dikenal: ${name}`);
  if (pipes.has(name)) return pipes.get(name);
  const t0 = Date.now();
  console.log(`[load] ${name} (${spec.repo}, dtype=${spec.dtype}${spec.external ? ', bobot eksternal' : ''}) …`);
  const p = pipeline('feature-extraction', spec.repo, {
    dtype: spec.dtype,
    ...(spec.external ? { use_external_data_format: true } : {}),
  });
  pipes.set(name, p);
  await p;
  console.log(`[load] ${name} siap dalam ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return p;
}

async function embed(name, texts) {
  const spec = CATALOG[name];
  const pipe = await load(name);
  const out = await pipe(texts, { pooling: 'mean', normalize: true });
  const flat = Array.from(out.data);
  const dim = spec.dimensions;
  const vectors = [];
  for (let i = 0; i < texts.length; i++) vectors.push(flat.slice(i * dim, (i + 1) * dim));
  return vectors;
}

/* ── HTTP ─────────────────────────────────────────────────────────── */

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('badan permintaan terlalu besar')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Bandingkan token tanpa membocorkan panjang lewat waktu perbandingan. */
function tokenOk(header) {
  if (!TOKEN) return false;
  const given = (header || '').replace(/^Bearer\s+/i, '');
  if (given.length !== TOKEN.length) return false;
  let diff = 0;
  for (let i = 0; i < TOKEN.length; i++) diff |= given.charCodeAt(i) ^ TOKEN.charCodeAt(i);
  return diff === 0;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, { ok: true, models: ENABLED, loaded: [...pipes.keys()] });
  }

  if (req.method !== 'POST' || url.pathname !== '/v1/embeddings') {
    return send(res, 404, { error: { message: 'tak ada rute ini' } });
  }

  // Tanpa token, siapa pun yang menemukan port ini bisa mengirim teks.
  if (!tokenOk(req.headers.authorization)) {
    return send(res, 401, { error: { message: 'token tidak valid' } });
  }

  let payload;
  try { payload = JSON.parse(await readBody(req)); }
  catch (e) { return send(res, 400, { error: { message: 'JSON tak valid: ' + e.message } }); }

  const name = payload.model;
  const input = Array.isArray(payload.input) ? payload.input : [payload.input];
  if (!CATALOG[name]) return send(res, 400, { error: { message: `model tak dilayani: ${name}` } });
  if (!input.length || input.some((t) => typeof t !== 'string')) {
    return send(res, 400, { error: { message: '`input` harus string atau array string' } });
  }
  if (input.length > MAX_BATCH) {
    return send(res, 413, { error: { message: `batch maksimum ${MAX_BATCH}, diminta ${input.length}` } });
  }

  try {
    const t0 = Date.now();
    const vectors = await embed(name, input);
    console.log(`[embed] ${name} · ${input.length} teks · ${Date.now() - t0}ms`);
    return send(res, 200, {
      object: 'list',
      model: name,
      data: vectors.map((embedding, index) => ({ object: 'embedding', index, embedding })),
      usage: { prompt_tokens: 0, total_tokens: 0 },
    });
  } catch (e) {
    console.error('[embed] gagal:', e);
    return send(res, 500, { error: { message: e.message } });
  }
});

async function main() {
  // Muat di muka supaya permintaan pertama tidak menunggu unduhan bobot.
  for (const name of ENABLED) {
    try { await load(name); }
    catch (e) { console.error(`[load] ${name} GAGAL: ${e.message}`); if (WARM_ONLY) process.exitCode = 1; }
  }
  if (WARM_ONLY) { console.log('warm-only selesai'); return; }

  if (!TOKEN) {
    console.error('\nEMBEDDING_TOKEN belum diset — server menolak SEMUA permintaan.');
    console.error('Set token yang sama dengan EMBEDDING_SELFHOSTED_TOKEN di app.\n');
  }
  server.listen(PORT, HOST, () => {
    console.log(`embedding server: http://${HOST}:${PORT} · model ${ENABLED.join(', ')}`);
    console.log('Pasang TLS di depannya bila diakses dari internet.');
  });
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
