import 'server-only';
import { redact } from '@/lib/redact';
import type { AnalysisKind, Report, RiskLevel } from '@/lib/analysis/types';
import { parseUrl, registeredDomain } from '@/lib/analysis/domain';
import { readStore, updateStore } from './util';

/**
 * Early-warning feed: a redacted, minimal record of every analysis run on THIS AMAN server.
 * It is not internet-wide monitoring. Only the redacted target, domain, matched organization,
 * score and top findings are stored; never the full message.
 */
export interface ThreatRecord {
  id: string;
  at: string;
  kind: AnalysisKind;
  target: string;
  domain?: string;
  brand?: string;
  level: RiskLevel;
  score: number;
  scenarios: string[];
  findings: { id: string; title: string; source: string }[];
  domainAgeDays?: number;
  sources: number;
  sufficiency: string;
}

const FILE = 'threats.json';
const MAX = 400;

export async function recordThreat(r: Report): Promise<void> {
  const p = r.kind === 'url' ? parseUrl(r.target) : null;
  const domain = p ? registeredDomain(p.url.hostname) : r.indicators.find((i) => /domain/i.test(i.label.en))?.value;
  const ageFact = r.facts.find((f) => f.id.startsWith('rdap-created-'));
  const rec: ThreatRecord = {
    id: r.id,
    at: r.generatedAt,
    kind: r.kind,
    target: redact(r.target).slice(0, 120),
    domain: domain?.slice(0, 80),
    brand: r.official?.brand.en,
    level: r.level,
    score: r.score,
    scenarios: r.scenarios.slice(0, 4),
    findings: r.findings.filter((f) => f.weight > 0).slice(0, 4).map((f) => ({ id: f.id, title: f.title.en, source: f.source ?? 'rule' })),
    domainAgeDays: ageFact ? Number(ageFact.value.match(/(\d+) days/)?.[1]) : undefined,
    sources: r.sources.length,
    sufficiency: r.sufficiency,
  };
  await updateStore<ThreatRecord[], void>(FILE, [], (all) => ({ data: [rec, ...all.filter((x) => x.id !== rec.id)].slice(0, MAX), result: undefined }));
}

export async function listThreats(): Promise<ThreatRecord[]> {
  return readStore<ThreatRecord[]>(FILE, []);
}

export function summarize(list: ThreatRecord[]) {
  const since = Date.now() - 7 * 86_400_000;
  const recent = list.filter((x) => new Date(x.at).getTime() >= since);
  const count = <K extends string>(arr: (K | undefined)[]) => {
    const m = new Map<K, number>();
    for (const k of arr) if (k) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const flagged = list.filter((x) => x.level === 'high' || x.level === 'critical');
  return {
    total: list.length,
    last7Days: recent.length,
    flagged: flagged.length,
    byLevel: { low: list.filter((x) => x.level === 'low').length, medium: list.filter((x) => x.level === 'medium').length, high: list.filter((x) => x.level === 'high').length, critical: list.filter((x) => x.level === 'critical').length },
    impersonatedBrands: count(flagged.map((x) => x.brand)).slice(0, 8),
    scenarios: count(flagged.flatMap((x) => x.scenarios)).slice(0, 8),
    newDomains: list.filter((x) => x.domainAgeDays !== undefined && x.domainAgeDays < 90 && x.score >= 25).slice(0, 10).map((x) => ({ domain: x.domain, ageDays: x.domainAgeDays, level: x.level, at: x.at })),
    suspiciousDomains: [...new Map(flagged.filter((x) => x.domain).map((x) => [x.domain, x])).values()].slice(0, 12).map((x) => ({ domain: x.domain, brand: x.brand, level: x.level, score: x.score, at: x.at })),
  };
}
