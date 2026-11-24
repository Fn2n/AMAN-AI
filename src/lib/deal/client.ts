'use client';

import { useCallback, useEffect, useState } from 'react';
import type { L } from '@/lib/analysis/types';
import type { Action, Deal, Role } from './engine';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

type Res = { ok: true; deal: Deal } | { ok: false; error: L };

async function call(path: string, body?: unknown): Promise<Res> {
  try {
    const r = await fetch(`${BASE}${path}`, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json();
    return j.ok ? { ok: true, deal: j.deal } : { ok: false, error: j.error ?? { en: 'Request failed', ar: 'فشل الطلب' } };
  } catch {
    return { ok: false, error: { en: 'Could not reach the AMAN server.', ar: 'تعذّر الوصول إلى خادم أمان.' } };
  }
}

export function useDeals() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${BASE}/api/deals`, { cache: 'no-store' });
      const j = await r.json();
      setDeals(j.deals ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { deals, loaded, error, refresh };
}

export const fetchDeal = (id: string) => call(`/api/deals/${encodeURIComponent(id)}`);
export const createDealApi = (body: unknown) => call('/api/deals', body);
export const actionApi = (id: string, version: number, role: Role, action: Action, extra: { note?: string; checklist?: boolean[] } = {}) =>
  call(`/api/deals/${encodeURIComponent(id)}`, { op: 'action', version, role, action, ...extra });
export const documentApi = (id: string, version: number, role: Role, key: string, file: { name: string; size: number; type: string; sha256: string }) =>
  call(`/api/deals/${encodeURIComponent(id)}`, { op: 'document', version, role, key, file });

export async function seedApi(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/api/deals/seed`, { method: 'POST' });
    return r.ok;
  } catch {
    return false;
  }
}

/** SHA-256 fingerprint computed in the browser. The file itself is never uploaded. */
export async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Pre-upgrade transactions kept in this browser's localStorage (any category). Never deleted automatically. */
export const LEGACY_KEY = 'aman.deals.v1';
export function readLegacy(): { id: string; category: string; title: string; status: string }[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    const arr = raw ? (JSON.parse(raw) as { id: string; category: string; title: string; status: string }[]) : [];
    return Array.isArray(arr) ? arr.map((d) => ({ id: String(d.id), category: String(d.category), title: String(d.title), status: String(d.status) })) : [];
  } catch {
    return [];
  }
}
