#!/usr/bin/env node
/**
 * Verifies candidate official domains before they are added to the trusted list.
 * For each organization: (1) live DNS resolution of the domain, (2) a Tavily web search for the
 * organization's official website, recording whether the candidate domain appears in the results.
 * Writes docs/official-domains-verification.json (sources + timestamps). Never prints API keys.
 *
 * Usage: node scripts/verify-official-domains.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve4, resolveNs } from 'node:dns/promises';
import { parse } from 'tldts';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^\w+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);

const CANDIDATES = [
  ['UAE PASS', 'uaepass.ae'],
  ['TAMM Abu Dhabi government services', 'tamm.abudhabi'],
  ['Abu Dhabi Police', 'adpolice.gov.ae'],
  ['Abu Dhabi Police', 'abudhabipolice.gov.ae'],
  ['Dubai Police', 'dubaipolice.gov.ae'],
  ['UAE Government official portal', 'u.ae'],
  ['UAE Ministry of Interior', 'moi.gov.ae'],
  ['ICP Federal Authority for Identity Citizenship', 'icp.gov.ae'],
  ['Emirates NBD', 'emiratesnbd.com'],
  ['First Abu Dhabi Bank FAB', 'bankfab.com'],
  ['ADCB Abu Dhabi Commercial Bank', 'adcb.com'],
  ['ADIB Abu Dhabi Islamic Bank', 'adib.ae'],
  ['Mashreq bank', 'mashreq.com'],
  ['Dubai Islamic Bank', 'dib.ae'],
  ['Emirates Post', 'emiratespost.ae'],
  ['Salik Dubai toll', 'salik.ae'],
  ['Darb Abu Dhabi toll ITC', 'itc.gov.ae'],
  ['e& etisalat UAE', 'etisalat.ae'],
  ['e& group', 'eand.com'],
  ['du telecom UAE', 'du.ae'],
  ['RTA Dubai Roads and Transport Authority', 'rta.ae'],
  ['DEWA Dubai Electricity and Water', 'dewa.gov.ae'],
  ['Central Bank of the UAE', 'centralbank.ae'],
  ['Dubai Police eCrime reporting platform', 'ecrime.ae'],
  ['Emirates Auction license plates', 'emiratesauction.com'],
  ['dubizzle UAE', 'dubizzle.com'],
  ['Aramex', 'aramex.com'],
  ['noon UAE', 'noon.com'],
  ['Careem', 'careem.com'],
  ['Emirates airline', 'emirates.com'],
  ['Etihad Airways', 'etihad.com'],
  ['Amazon UAE', 'amazon.ae'],
  ['Amazon', 'amazon.com'],
  ['PayPal', 'paypal.com'],
  ['Apple', 'apple.com'],
  ['Microsoft', 'microsoft.com'],
  ['Google', 'google.com'],
  ['Netflix', 'netflix.com'],
  ['WhatsApp', 'whatsapp.com'],
  ['DHL', 'dhl.com'],
  ['FedEx', 'fedex.com'],
  ['Binance', 'binance.com'],
];

async function dnsOk(domain) {
  try {
    const a = await resolve4(domain);
    return { resolves: true, a: a.slice(0, 3) };
  } catch {
    try {
      const ns = await resolveNs(domain);
      return { resolves: true, ns: ns.slice(0, 2) };
    } catch (e) {
      return { resolves: false, error: e.code };
    }
  }
}

async function search(q, includeDomains) {
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.TAVILY_API_KEY}` },
    body: JSON.stringify({ query: q, max_results: 6, search_depth: 'basic', ...(includeDomains ? { include_domains: includeDomains } : {}) }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) return { error: `HTTP ${r.status}`, results: [] };
  const b = await r.json();
  return { results: (b.results ?? []).map((x) => ({ url: x.url, title: x.title })) };
}

const out = [];
for (const [org, domain] of CANDIDATES) {
  const [dns, s1] = await Promise.all([dnsOk(domain), search(`${org} official website`)]);
  const match = (res) => res.results.find((r) => parse(r.url).domain === domain || (parse(r.url).hostname ?? '').endsWith('.' + domain));
  let s = s1;
  let hit = match(s1);
  if (!hit) {
    // Second, more specific query (organization name + "UAE official site").
    s = await search(`${org} UAE official site`);
    hit = match(s);
  }
  if (!hit) {
    // Third pass: search within the candidate domain; accept only if a page there names the organization.
    s = await search(org, [domain]);
    const word = org.split(' ')[0].toLowerCase();
    hit = s.results.find((r) => parse(r.url).domain === domain && `${r.title ?? ''} ${r.url}`.toLowerCase().includes(word));
  }
  const verified = dns.resolves && !!hit;
  out.push({ org, domain, verified, dns, searchMatch: hit?.url ?? null, sources: s.results.slice(0, 4), checkedAt: new Date().toISOString() });
  console.log(`${verified ? 'VERIFIED ' : 'UNVERIFIED'} ${domain.padEnd(22)} dns=${dns.resolves} search=${hit ? hit.url : 'no match'}`);
}
writeFileSync(new URL('../docs/official-domains-verification.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), method: 'Live DNS resolution + Tavily web search for the organization\'s official website', results: out }, null, 2));
