'use client';

import type { Report } from '@/lib/analysis/types';
import { toEvidence, type AiResponse } from './contract';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
/** True for a static export, which has no server: AI, research and Secure Deal storage are unavailable. */
export const IS_STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === '1';

export interface ServerStatus {
  state: 'checking' | 'ready' | 'offline';
  ai: boolean;
  research: boolean;
  providers: { provider: string; configured: boolean }[];
}

export async function getServerStatus(): Promise<ServerStatus> {
  if (IS_STATIC) return { state: 'offline', ai: false, research: false, providers: [] };
  try {
    const r = await fetch(`${BASE}/api/ai/status`, { cache: 'no-store' });
    const j = (await r.json()) as { enabled?: boolean; research?: boolean; providers?: { provider: string; configured: boolean }[] };
    return { state: 'ready', ai: !!j.enabled, research: !!j.research, providers: j.providers ?? [] };
  } catch {
    return { state: 'offline', ai: false, research: false, providers: [] };
  }
}

const cache = new Map<string, Promise<AiResponse>>();

/** One request per report (also de-duplicates React StrictMode double effects). Failures are not cached. */
export function requestAiExplanation(report: Report, force = false): Promise<AiResponse> {
  const key = report.id;
  if (!force && cache.has(key)) return cache.get(key)!;
  const p = (async (): Promise<AiResponse> => {
    if (IS_STATIC) return { ok: false, reason: 'static_deployment' };
    try {
      const r = await fetch(`${BASE}/api/ai/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report: toEvidence(report) }),
        signal: AbortSignal.timeout(50_000),
      });
      const j = (await r.json()) as AiResponse;
      return j && typeof j.ok === 'boolean' ? j : { ok: false, reason: 'all_providers_failed' };
    } catch (e) {
      return { ok: false, reason: e instanceof DOMException && e.name === 'TimeoutError' ? 'timeout' : 'network' };
    }
  })();
  cache.set(key, p);
  p.then((r) => {
    if (!r.ok) cache.delete(key);
  });
  return p;
}

export async function requestDealAi(id: string): Promise<AiResponse> {
  try {
    const r = await fetch(`${BASE}/api/deals/${encodeURIComponent(id)}/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true }),
      signal: AbortSignal.timeout(50_000),
    });
    return (await r.json()) as AiResponse;
  } catch (e) {
    return { ok: false, reason: e instanceof DOMException && e.name === 'TimeoutError' ? 'timeout' : 'network' };
  }
}

export { BASE };
