/**
 * JOB RUNNER — antrean in-process minimal (tanpa Redis; ramah on-prem).
 * Untuk SaaS multi-instance nanti tinggal tukar ke BullMQ/pg-boss
 * (interface enqueueJob/registerJobHandler dipertahankan).
 */

/**
 * Handler boleh MENGEMBALIKAN ringkasan hasilnya.
 *
 * Sebelumnya `Promise<void>`, sehingga satu-satunya kabar dari sebuah job
 * adalah "done" — yang terlihat persis sama entah pekerjaannya berhasil
 * seluruhnya atau gagal pada tiap dokumen. Nilai kembaliannya disimpan di
 * status dan bisa dibaca pemanggil lewat getJobStatus, jadi kegagalan
 * sebagian punya tempat untuk muncul.
 */
type Handler = (payload: unknown) => Promise<unknown>;

interface Job { name: string; key: string; payload: unknown; attempts: number; }
export interface JobStatus {
  state: 'queued' | 'running' | 'done' | 'failed';
  attempts: number;
  error?: string;
  updatedAt: number;
  /**
   * Ringkasan yang dikembalikan handler saat selesai.
   *
   * "done" saja tak cukup: sebuah run yang seluruh distill-nya gagal berakhir
   * "done" persis seperti run yang mulus. Di sinilah kegagalan SEBAGIAN
   * punya tempat untuk terlihat.
   */
  hasil?: unknown;
}

const handlers = new Map<string, Handler>();
const queue: Job[] = [];
const statuses = new Map<string, JobStatus>();
let running = false;
let pumpPromise: Promise<void> = Promise.resolve();

const MAX_ATTEMPTS = 3;

export function registerJobHandler(name: string, fn: Handler): void {
  handlers.set(name, fn);
}

/** key = identitas unik job (dedup: job sama yang masih queued tak digandakan). */
export function enqueueJob(name: string, key: string, payload: unknown): JobStatus {
  const id = `${name}:${key}`;
  const existing = statuses.get(id);
  if (existing && (existing.state === 'queued' || existing.state === 'running')) return existing;

  const status: JobStatus = { state: 'queued', attempts: 0, updatedAt: Date.now() };
  statuses.set(id, status);
  queue.push({ name, key, payload, attempts: 0 });
  // pump() no-op bila loop sudah jalan — jangan menimpa promise loop asli
  // dengan promise yang selesai seketika, nanti jobsSettled() bohong.
  const wasIdle = !running;
  const p = pump();
  if (wasIdle) pumpPromise = p;
  return status;
}

/**
 * Selesainya SELURUH antrean saat ini — untuk serverless.
 *
 * Di Vercel, lambda DIBEKUKAN begitu respons terkirim; job yang masih jalan
 * mati diam-diam di tengah (kejadian nyata: sumber gdrive macet di status
 * 'syncing' selamanya, KB kosong, chatbot menjawab "I don't know"). Route
 * yang meng-enqueue wajib memanggil `after(jobsSettled)` (next/server) agar
 * lambda dijaga hidup sampai antrean kosong — respons tetap terkirim cepat.
 */
export function jobsSettled(): Promise<void> {
  return pumpPromise;
}

export function getJobStatus(name: string, key: string): JobStatus | null {
  return statuses.get(`${name}:${key}`) ?? null;
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      const id = `${job.name}:${job.key}`;
      const handler = handlers.get(job.name);
      const status = statuses.get(id)!;
      if (!handler) { status.state = 'failed'; status.error = 'handler tidak terdaftar'; continue; }

      status.state = 'running'; status.attempts = ++job.attempts; status.updatedAt = Date.now();
      try {
        const hasil = await handler(job.payload);
        status.state = 'done'; status.updatedAt = Date.now();
        if (hasil !== undefined) status.hasil = hasil;
      } catch (err) {
        status.error = (err as Error).message; status.updatedAt = Date.now();
        if (job.attempts < MAX_ATTEMPTS) {
          status.state = 'queued';
          // backoff sederhana sebelum requeue
          await new Promise((r) => setTimeout(r, 1000 * job.attempts));
          queue.push(job);
        } else {
          status.state = 'failed';
          // Job yang gagal permanen (sync Drive, memory agent) selama ini hanya
          // muncul di stdout. Dicatat juga ke audit_logs supaya terlihat di
          // halaman Observability — kegagalan diam-diam itu yang paling mahal.
          const tenantId = (job.payload as { tenantId?: string })?.tenantId ?? null;
          const { recordError } = await import('./observability');
          await recordError(tenantId, 'system', err, { job: job.name, key: job.key, attempts: job.attempts });
        }
      }
    }
  } finally {
    running = false;
  }
}
