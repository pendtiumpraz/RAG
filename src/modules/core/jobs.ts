/**
 * JOB RUNNER — antrean in-process minimal (tanpa Redis; ramah on-prem).
 * Untuk SaaS multi-instance nanti tinggal tukar ke BullMQ/pg-boss
 * (interface enqueueJob/registerJobHandler dipertahankan).
 */

type Handler = (payload: unknown) => Promise<void>;

interface Job { name: string; key: string; payload: unknown; attempts: number; }
export interface JobStatus {
  state: 'queued' | 'running' | 'done' | 'failed';
  attempts: number;
  error?: string;
  updatedAt: number;
}

const handlers = new Map<string, Handler>();
const queue: Job[] = [];
const statuses = new Map<string, JobStatus>();
let running = false;

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
  void pump();
  return status;
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
        await handler(job.payload);
        status.state = 'done'; status.updatedAt = Date.now();
      } catch (err) {
        status.error = (err as Error).message; status.updatedAt = Date.now();
        if (job.attempts < MAX_ATTEMPTS) {
          status.state = 'queued';
          // backoff sederhana sebelum requeue
          await new Promise((r) => setTimeout(r, 1000 * job.attempts));
          queue.push(job);
        } else {
          status.state = 'failed';
          console.error(`[jobs] ${id} gagal permanen:`, err);
        }
      }
    }
  } finally {
    running = false;
  }
}
