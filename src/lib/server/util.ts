import 'server-only';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Small TTL cache with a size cap (per server process). */
export class TtlCache<V> {
  private map = new Map<string, { v: V; exp: number }>();
  constructor(private ttlMs: number, private max = 500) {}
  get(k: string): V | undefined {
    const e = this.map.get(k);
    if (!e) return undefined;
    if (Date.now() > e.exp) {
      this.map.delete(k);
      return undefined;
    }
    return e.v;
  }
  set(k: string, v: V, ttlMs = this.ttlMs) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value as string);
    this.map.set(k, { v, exp: Date.now() + ttlMs });
  }
}

/** Sliding-window rate limiter keyed by client IP (per server process). */
export function createLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}

/** Only accept browser calls from this site's own pages. Requests without an Origin header (same-origin GET, curl) pass. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Reads a JSON body with a hard size cap. Returns undefined on oversize or invalid JSON. */
export async function readJson(req: Request, maxBytes: number): Promise<unknown | undefined> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > maxBytes) return undefined;
  const raw = await req.text();
  if (raw.length > maxBytes) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

// ---------- tiny JSON file store (atomic writes, serialized per file) ----------

const DATA_DIR = process.env.AMAN_DATA_DIR || path.join(process.cwd(), '.data');
const queues = new Map<string, Promise<unknown>>();

export async function readStore<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, name), 'utf8')) as T;
  } catch {
    return fallback;
  }
}

/** Read-modify-write under a per-file queue so concurrent requests cannot lose updates. */
export function updateStore<T, R>(name: string, fallback: T, fn: (data: T) => { data: T; result: R }): Promise<R> {
  const prev = queues.get(name) ?? Promise.resolve();
  const next = prev.then(async () => {
    const current = await readStore<T>(name, fallback);
    const { data, result } = fn(current);
    await mkdir(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, name);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(data), 'utf8');
    await rename(tmp, file);
    return result;
  });
  queues.set(name, next.catch(() => undefined));
  return next;
}
