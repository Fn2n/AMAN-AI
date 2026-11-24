import 'server-only';
import type { EvidencePayload } from '@/lib/ai/contract';
import { applyAction, createDeal, EMIRATE_LABEL, EXAMPLE_INPUTS, RULES, uploadDocument, validateDealInput, type Action, type Deal, type Role } from '@/lib/deal/engine';
import { redact } from '@/lib/redact';
import type { L } from '@/lib/analysis/types';
import { readStore, updateStore } from './util';

const FILE = 'deals.json';
const ROLES: Role[] = ['buyer', 'seller', 'reviewer'];

export async function listDeals(): Promise<Deal[]> {
  const all = await readStore<Deal[]>(FILE, []);
  // Legacy records from unsupported categories are kept on disk but not served as active deals.
  return all.filter((d) => d.category === 'vehicle' || d.category === 'plate');
}

export async function getDeal(id: string): Promise<Deal | undefined> {
  return (await listDeals()).find((d) => d.id === id);
}

type Out = { ok: true; deal: Deal } | { ok: false; status: number; error: L };
const err = (status: number, en: string, ar: string): Out => ({ ok: false, status, error: { en, ar } });

export function createDealServer(body: unknown, idempotencyKey?: string, seeded = false): Promise<Out> {
  const v = validateDealInput(body);
  if (!v.ok) return Promise.resolve({ ok: false, status: 400, error: v.error });
  return updateStore<Deal[], Out>(FILE, [], (all) => {
    if (idempotencyKey) {
      const existing = all.find((d) => d.idempotencyKey === idempotencyKey);
      if (existing) return { data: all, result: { ok: true, deal: existing } };
    }
    const deal = createDeal(v.input, { idempotencyKey, seeded });
    return { data: [deal, ...all], result: { ok: true, deal } };
  });
}

export function seedExamples(): Promise<Deal[]> {
  return updateStore<Deal[], Deal[]>(FILE, [], (all) => {
    const created = (Object.keys(EXAMPLE_INPUTS) as (keyof typeof EXAMPLE_INPUTS)[]).map((k) => createDeal(EXAMPLE_INPUTS[k], { seeded: true }));
    return { data: [...created, ...all], result: created };
  });
}

/** Applies an action or document upload with optimistic version check (prevents double submission / stale UI). */
export function mutateDeal(id: string, body: unknown): Promise<Out> {
  const b = (body ?? {}) as Record<string, unknown>;
  const role = b.role as Role;
  if (!ROLES.includes(role)) return Promise.resolve(err(400, 'Invalid role.', 'دور غير صالح.'));
  const version = Number(b.version);
  return updateStore<Deal[], Out>(FILE, [], (all) => {
    const i = all.findIndex((d) => d.id === id);
    if (i < 0) return { data: all, result: err(404, 'Transaction not found.', 'المعاملة غير موجودة.') };
    const deal = all[i];
    if (deal.category !== 'vehicle' && deal.category !== 'plate') return { data: all, result: err(409, 'Legacy transaction in an unsupported category is read-only.', 'معاملة قديمة بفئة غير مدعومة للقراءة فقط.') };
    if (version !== deal.version) return { data: all, result: err(409, 'This transaction was updated elsewhere. Refresh and try again.', 'تم تحديث هذه المعاملة في مكان آخر. حدّث الصفحة وحاول مجدداً.') };
    let res;
    if (b.op === 'document') {
      const f = (b.file ?? {}) as Record<string, unknown>;
      res = uploadDocument(deal, String(b.key ?? ''), { name: String(f.name ?? ''), size: Number(f.size), type: String(f.type ?? ''), sha256: String(f.sha256 ?? '') }, role);
    } else if (b.op === 'action') {
      const action = b.action as Action;
      if (!(action in RULES)) return { data: all, result: err(400, 'Unknown action.', 'إجراء غير معروف.') };
      const checklist = Array.isArray(b.checklist) ? b.checklist.map((x) => x === true) : undefined;
      res = applyAction(deal, action, role, { note: typeof b.note === 'string' ? b.note : undefined, checklist, others: all.filter((d) => d.id !== id) });
    } else {
      return { data: all, result: err(400, 'Unknown operation.', 'عملية غير معروفة.') };
    }
    if (!res.ok) return { data: all, result: { ok: false, status: 422, error: res.error } };
    const next = [...all];
    next[i] = res.deal;
    return { data: next, result: { ok: true, deal: res.deal } };
  });
}

/**
 * Evidence for an AI explanation of a deal's risk assessment. Only non-sensitive data is included:
 * no names, phone numbers, IBANs or document contents; the VIN is reduced to its manufacturer prefix.
 */
export function dealEvidence(d: Deal): EvidencePayload | null {
  if (!d.risk) return null;
  const asset = d.vehicle
    ? `${d.vehicle.year} ${d.vehicle.make} ${d.vehicle.model} (VIN prefix ${d.vehicle.vin.slice(0, 3)}…, ${EMIRATE_LABEL[d.vehicle.emirate].en})`
    : d.plate
      ? `${EMIRATE_LABEL[d.plate.emirate].en} plate, code ${d.plate.code}, ${d.plate.number.length}-digit number (${d.plate.plateType})`
      : d.category;
  // Names, beneficiaries and IDs always appear in quotes in finding details: drop them before sending.
  const strip = (s?: string) => (s ? redact(s).replace(/"[^"]*"/g, '"[redacted]"') : s);
  return {
    kind: 'deal',
    target: `${d.category === 'vehicle' ? 'Vehicle' : 'Premium plate'} sale: ${asset}; price band ${d.price >= 1_000_000 ? '1M+' : d.price >= 100_000 ? '100k-1M' : 'under 100k'} AED; payment method ${d.payment.method}`,
    score: d.risk.score,
    level: d.risk.level,
    findings: d.risk.findings.slice(0, 14).map((f) => ({ id: f.id, severity: f.severity, weight: f.weight, title: f.title.en, detail: strip(f.detail.en) ?? '', evidence: undefined, source: 'rule' })),
    facts: [],
    sources: [],
    unavailableChecks: ['Official ownership verification with RTA / ITC / MOI registries', 'Document authenticity (documents are not read)', 'Market valuation'],
    scenarios: [],
  };
}
