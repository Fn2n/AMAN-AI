import 'server-only';
import { GOVERNMENT_SUFFIXES, OFFICIAL_DOMAINS } from '@/data/brands';
import { publicSuffix, registeredDomain } from '@/lib/analysis/domain';
import type { WebSource } from '@/lib/analysis/types';
import { TtlCache } from './util';

/**
 * Public internet research via Tavily (server-side, key never leaves the server).
 * Results are third-party, UNTRUSTED content: they are shown as cited sources with URLs and retrieval time,
 * passed to AI only inside an <untrusted> block, and only influence the score through narrow,
 * deterministic rules (exact target mentioned together with scam/fraud wording).
 */

const cache = new TtlCache<{ ok: boolean; results: WebSource[]; error?: string }>(6 * 60 * 60 * 1000, 300);

const SCAM_WORDS = ['scam', 'fraud', 'phishing', 'fake', 'warning', 'beware', 'impersonat', 'smishing', 'spoof', 'احتيال', 'نصب', 'تحذير', 'وهمي', 'مزيف', 'تصيد', 'انتحال'];
/** Reputable security / UAE sources surfaced first. */
const TRUSTED_HINTS = ['gov.ae', 'abudhabi', 'centralbank.ae', 'adpolice', 'dubaipolice', 'moi.gov.ae', 'tdra.gov.ae', 'csc.gov.ae', 'kaspersky', 'trendmicro', 'bleepingcomputer', 'malwarebytes', 'checkpoint', 'paloaltonetworks', 'thenationalnews.com', 'khaleejtimes.com', 'gulfnews.com', 'wam.ae'];

export function researchConfigured(): boolean {
  return !!process.env.TAVILY_API_KEY?.trim();
}

function classify(url: string): { domain: string; official: boolean; trusted: boolean } {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    /* ignore */
  }
  const domain = registeredDomain(host);
  const suffix = publicSuffix(host);
  const official = OFFICIAL_DOMAINS.has(domain) || GOVERNMENT_SUFFIXES.some((s) => suffix === s || suffix.endsWith('.' + s));
  const trusted = official || TRUSTED_HINTS.some((h) => host.includes(h));
  return { domain, official, trusted };
}

export async function webSearch(query: string, opts: { maxResults?: number; includeDomains?: string[]; mentions?: string[] } = {}): Promise<{ ok: boolean; results: WebSource[]; error?: string; query: string }> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) return { ok: false, results: [], error: 'not_configured', query };
  const ck = JSON.stringify([query, opts.maxResults, opts.includeDomains]);
  const hit = cache.get(ck);
  const mentions = (opts.mentions ?? []).map((m) => m.toLowerCase()).filter((m) => m.length >= 4);
  const finalize = (results: WebSource[]) =>
    results
      .map((r) => {
        const text = `${r.title} ${r.snippet}`.toLowerCase();
        const isWarning = SCAM_WORDS.some((w) => text.includes(w)) && (mentions.length === 0 || mentions.some((m) => text.includes(m) || r.url.toLowerCase().includes(m)));
        const c = classify(r.url);
        return { ...r, kind: (c.official ? 'official' : isWarning ? 'warning' : 'reference') as WebSource['kind'], _trusted: c.trusted };
      })
      .sort((a, b) => Number(b.kind === 'official') - Number(a.kind === 'official') || Number(b._trusted) - Number(a._trusted) || Number(b.kind === 'warning') - Number(a.kind === 'warning'))
      .map(({ _trusted, ...r }) => r);
  if (hit) return { ...hit, results: finalize(hit.results), query };
  try {
    const r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, max_results: opts.maxResults ?? 5, search_depth: 'basic', include_answer: false, ...(opts.includeDomains ? { include_domains: opts.includeDomains } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const out = { ok: false, results: [] as WebSource[], error: r.status === 429 ? 'rate_limited' : r.status === 432 || r.status === 433 ? 'quota' : `http_${r.status}` };
      cache.set(ck, out, 60_000);
      return { ...out, query };
    }
    const j = (await r.json()) as { results?: { url: string; title?: string; content?: string }[] };
    const now = new Date().toISOString();
    const results: WebSource[] = (j.results ?? []).slice(0, opts.maxResults ?? 5).map((x) => ({
      title: (x.title ?? '').replace(/\s+/g, ' ').slice(0, 160),
      url: x.url,
      domain: classify(x.url).domain,
      snippet: (x.content ?? '').replace(/\s+/g, ' ').slice(0, 320),
      retrievedAt: now,
      kind: 'reference',
    }));
    cache.set(ck, { ok: true, results });
    return { ok: true, results: finalize(results), query };
  } catch (e) {
    return { ok: false, results: [], error: e instanceof Error && /abort|timeout/i.test(e.message) ? 'timeout' : 'failed', query };
  }
}
