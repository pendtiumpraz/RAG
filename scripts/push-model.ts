/**
 * Unggah bobot model embedding ke Vercel Blob (model host superadmin).
 *
 *   npm run models:push -- --status              lihat isi blob + kuota
 *   npm run models:push -- all-MiniLM-L6-v2      unggah satu model (~23MB)
 *   npm run models:push -- bge-m3                unggah model besar (~2.2GB)
 *   npm run models:push -- --all                 semua model lokal di registry
 *   npm run models:push -- <id> --force          timpa berkas yang sudah ada
 *
 * Dijalankan superadmin dari mesinnya sendiri — BUKAN lewat serverless
 * function. Alasannya: body request fungsi Vercel dibatasi ~4.5MB, jadi
 * berkas 2GB mustahil lewat sana. Dari CLI, berkas dialirkan langsung ke
 * Blob API dengan multipart upload sehingga ukuran bukan lagi masalah.
 *
 * Butuh BLOB_READ_WRITE_TOKEN (Vercel → Storage → blob store → .env.local,
 * atau `vercel env pull`). Token ini rahasia: hanya untuk menulis. Sisi
 * baca aplikasi memakai URL publik, tanpa token.
 */
import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { put, head, list, BlobNotFoundError } from '@vercel/blob';
import { EMBEDDING_MODELS, type EmbeddingModel } from '../src/modules/core/registry';
import { modelBlobPath, modelFileManifest, blobBaseUrl } from '../src/modules/knowledge/storage/blob-host';

const HF = 'https://huggingface.co';
const CACHE = process.env.MODEL_CACHE_DIR || './.model-cache';
/** Di atas ini pakai multipart upload (potongan paralel, tahan berkas besar). */
const MULTIPART_THRESHOLD = 50 * 1024 * 1024;

const token = process.env.BLOB_READ_WRITE_TOKEN;

function mb(bytes: number) { return (bytes / 1024 / 1024).toFixed(1) + ' MB'; }
function gb(bytes: number) { return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'; }

function contentType(file: string): string {
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

/* ── status: apa yang sudah ada di blob ───────────────────────────── */

async function showStatus() {
  const all: Array<{ pathname: string; size: number }> = [];
  let cursor: string | undefined;
  do {
    const page = await list({ token, prefix: 'models/', cursor, limit: 1000 });
    all.push(...page.blobs.map((b) => ({ pathname: b.pathname, size: b.size })));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const total = all.reduce((s, b) => s + b.size, 0);
  console.log(`\nModel host: ${blobBaseUrl() ?? '(EMBEDDING_MODEL_BLOB_URL belum diisi)'}`);
  console.log(`Terpakai  : ${gb(total)} dari 10 GB · ${all.length} berkas\n`);

  for (const m of EMBEDDING_MODELS.filter((x) => x.kind === 'local')) {
    const repo = m.hfRepo ?? m.id;
    const mine = all.filter((b) => b.pathname.startsWith(`models/${repo}/`));
    const manifest = modelFileManifest(m);
    const hasOnnx = mine.some((b) => b.pathname.endsWith(manifest.onnx));
    const hasCore = manifest.required.every((f) => mine.some((b) => b.pathname.endsWith(`/${f}`)));
    const size = mine.reduce((s, b) => s + b.size, 0);
    const state = hasOnnx && hasCore ? 'SIAP  ' : mine.length ? 'SEBAGIAN' : 'kosong';
    console.log(`  [${state}] ${m.id.padEnd(24)} ${mine.length ? mb(size).padStart(10) : '         —'}  ${repo}`);
  }
  console.log('\nModel "kosong" bisa diunggah: npm run models:push -- <id>\n');
}

/* ── unggah satu berkas ───────────────────────────────────────────── */

async function uploadFile(repo: string, file: string, force: boolean): Promise<number | null> {
  const dest = modelBlobPath(repo, file);

  if (!force) {
    try {
      const existing = await head(dest, { token });
      console.log(`  = ${file.padEnd(34)} sudah ada (${mb(existing.size)})`);
      return existing.size;
    } catch (e) {
      // HANYA "tidak ditemukan" yang berarti perlu diunggah. Galat lain
      // (token kedaluwarsa, store salah) tak boleh menyamar jadi berkas
      // hilang lalu memicu unggah ulang 2GB yang pasti gagal juga.
      if (!(e instanceof BlobNotFoundError)) throw e;
    }
  }

  // Prioritaskan salinan lokal (mis. hasil pemakaian sebelumnya) agar tidak
  // menarik ulang gigabyte dari Hugging Face.
  const localPath = path.join(CACHE, repo, file);
  let body: import('node:stream').Readable | ReadableStream;
  let size = 0;
  let asal = 'lokal';

  try {
    const stat = await fs.stat(localPath);
    size = stat.size;
    body = createReadStream(localPath);
  } catch {
    const url = `${HF}/${repo}/resolve/main/${file}`;
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      if (res.status === 404) return null;            // berkas opsional tak ada
      throw new Error(`unduh ${file} gagal: HTTP ${res.status}`);
    }
    size = Number(res.headers.get('content-length') ?? 0);
    body = res.body;
    asal = 'huggingface';
  }

  const multipart = size > MULTIPART_THRESHOLD || size === 0;
  process.stdout.write(`  ↑ ${file.padEnd(34)} ${size ? mb(size).padStart(10) : '  (stream)'} dari ${asal}${multipart ? ' [multipart]' : ''} … `);

  const t0 = Date.now();
  const result = await put(dest, body as never, {
    token, access: 'public', contentType: contentType(file),
    addRandomSuffix: false, allowOverwrite: true, multipart,
  });
  const secs = (Date.now() - t0) / 1000;
  console.log(`OK (${secs.toFixed(1)}s)`);
  if (!result.url.includes('/' + dest)) console.log(`    ! path tak terduga: ${result.url}`);
  return size;
}

/* ── unggah satu model ────────────────────────────────────────────── */

async function pushModel(m: EmbeddingModel, force: boolean) {
  const repo = m.hfRepo ?? m.id;
  const manifest = modelFileManifest(m);
  console.log(`\n▸ ${m.id}  (${m.label})`);
  console.log(`  repo ${repo} · onnx ${manifest.onnx}${m.quantized === false ? ' (presisi penuh)' : ''}`);

  let total = 0;

  for (const f of manifest.required) {
    const n = await uploadFile(repo, f, force);
    if (n === null) throw new Error(`berkas wajib ${f} tidak ada di ${repo} — model tak akan bisa dimuat`);
    total += n;
  }
  for (const f of manifest.optional) {
    const n = await uploadFile(repo, f, force);
    if (n !== null) total += n;
  }
  const onnx = await uploadFile(repo, manifest.onnx, force);
  if (onnx === null) {
    throw new Error(
      `${manifest.onnx} tidak ada di ${repo}. ` +
      (m.quantized === false
        ? 'Repo ini mungkin hanya menyediakan varian terkuantisasi — hapus `quantized: false` di registry.'
        : 'Coba set `quantized: false` di registry untuk memakai onnx/model.onnx.'),
    );
  }
  total += onnx;

  // Bobot eksternal (model >2GB memecah bobot ke .onnx_data). Ikut di-mirror
  // bila repo menyediakannya — multipart menangani ukurannya.
  const sidecar = await uploadFile(repo, manifest.onnxData, force);
  if (sidecar !== null) {
    total += sidecar;
    console.log('    ! model ini memakai bobot EKSTERNAL — transformers.js v2 tak bisa memuatnya '
      + '(lihat docs/MODEL-HOSTING.md)');
  }

  console.log(`  ✓ ${m.id} siap di model host · total ${mb(total)}`);
  return total;
}

/* ── main ─────────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const force = args.includes('--force');
  const ids = args.filter((a) => !a.startsWith('--'));

  if (!token) {
    console.error(
      '\nBLOB_READ_WRITE_TOKEN belum diset.\n' +
      'Ambil dari Vercel → Storage → (blob store) → Tokens, lalu tambahkan ke .env:\n' +
      '  BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxx\n' +
      'Atau: vercel env pull .env.local\n',
    );
    process.exit(1);
  }

  if (args.includes('--status')) { await showStatus(); return; }

  const local = EMBEDDING_MODELS.filter((m) => m.kind === 'local');
  const targets = args.includes('--all')
    ? local
    : ids.map((id) => {
        const m = local.find((x) => x.id === id);
        if (!m) {
          console.error(`Model lokal "${id}" tak dikenal. Pilihan: ${local.map((x) => x.id).join(', ')}`);
          process.exit(1);
        }
        return m;
      });

  if (targets.length === 0) {
    console.error('Sebutkan model, atau --all / --status.\n' +
      `Model lokal: ${local.map((m) => m.id).join(', ')}`);
    process.exit(1);
  }

  let grand = 0;
  for (const m of targets) grand += await pushModel(m, force);
  console.log(`\nSelesai · ${targets.length} model · ${mb(grand)} diunggah/diverifikasi`);

  if (!blobBaseUrl()) {
    console.log(
      '\nLangkah terakhir: set base URL publik agar aplikasi membaca dari blob —\n' +
      '  EMBEDDING_MODEL_SOURCE=blob\n' +
      '  EMBEDDING_MODEL_BLOB_URL=https://<store-id>.public.blob.vercel-storage.com\n',
    );
  }
}

main().catch((e) => { console.error('\nGAGAL:', e.message); process.exit(1); });

// Readable diimpor hanya untuk tipe body; jaga agar bundler tak membuangnya.
void Readable;
