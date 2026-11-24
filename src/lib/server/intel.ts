import 'server-only';
import { Resolver } from 'node:dns/promises';
import { TtlCache } from './util';

export interface RdapInfo {
  ok: boolean;
  /** 'unsupported' = registry does not publish RDAP for this TLD */
  error?: 'not-found' | 'unsupported' | 'failed';
  domain: string;
  registered?: string;
  expires?: string;
  lastChanged?: string;
  registrar?: string;
  status?: string[];
  ageDays?: number;
  source: string;
  sourceUrl: string;
  checkedAt: string;
}

export interface DnsInfo {
  ok: boolean;
  domain: string;
  a: string[];
  aaaa: string[];
  mx: string[];
  ns: string[];
  spf?: string;
  dmarc?: string;
  ptr?: string;
  resolves: boolean;
  checkedAt: string;
}

const rdapCache = new TtlCache<RdapInfo>(6 * 60 * 60 * 1000);
const dnsCache = new TtlCache<DnsInfo>(30 * 60 * 1000);

let bootstrap: { at: number; services: [string[], string[]][] } | null = null;

/** IANA RDAP bootstrap registry: maps each TLD to its authoritative RDAP server (cached 24h). */
async function rdapBase(tld: string): Promise<string | null | undefined> {
  if (!bootstrap || Date.now() - bootstrap.at > 24 * 3600_000) {
    try {
      const r = await fetch('https://data.iana.org/rdap/dns.json', { signal: AbortSignal.timeout(6000) });
      const j = (await r.json()) as { services: [string[], string[]][] };
      bootstrap = { at: Date.now(), services: j.services };
    } catch {
      return undefined; // bootstrap unavailable
    }
  }
  const svc = bootstrap.services.find((s) => s[0].includes(tld));
  return svc ? (svc[1].find((u) => u.startsWith('https://')) ?? svc[1][0]) : null; // null = TLD has no RDAP
}

/** RDAP lookup against the TLD's authoritative registry (public data, no key). */
export async function rdapLookup(domain: string): Promise<RdapInfo> {
  const cached = rdapCache.get(domain);
  if (cached) return cached;
  const tld = domain.split('.').pop() ?? '';
  const baseUrl = await rdapBase(tld);
  const sourceUrl = baseUrl ? `${baseUrl.replace(/\/?$/, '/')}domain/${encodeURIComponent(domain)}` : 'https://data.iana.org/rdap/dns.json';
  const base = { domain, source: 'RDAP (domain registry)', sourceUrl, checkedAt: new Date().toISOString() };
  let info: RdapInfo;
  if (baseUrl === null) {
    info = { ...base, ok: false, error: 'unsupported' };
    rdapCache.set(domain, info);
    return info;
  }
  if (baseUrl === undefined) return { ...base, ok: false, error: 'failed' };
  try {
    const r = await fetch(sourceUrl, { headers: { Accept: 'application/rdap+json' }, redirect: 'follow', signal: AbortSignal.timeout(7000) });
    if (r.status === 404) info = { ...base, ok: false, error: 'not-found' };
    else if (!r.ok) info = { ...base, ok: false, error: 'failed' };
    else {
      const j = (await r.json()) as {
        events?: { eventAction: string; eventDate: string }[];
        entities?: { roles?: string[]; vcardArray?: [string, [string, unknown, string, string][]] }[];
        status?: string[];
      };
      const ev = (a: string) => j.events?.find((e) => e.eventAction === a)?.eventDate;
      const registrarEntity = j.entities?.find((e) => e.roles?.includes('registrar'));
      const fn = registrarEntity?.vcardArray?.[1]?.find((x) => x[0] === 'fn')?.[3];
      const registered = ev('registration');
      info = {
        ...base,
        ok: true,
        sourceUrl: r.url || sourceUrl,
        registered,
        expires: ev('expiration'),
        lastChanged: ev('last changed'),
        registrar: typeof fn === 'string' ? fn.slice(0, 80) : undefined,
        status: j.status?.slice(0, 5),
        ageDays: registered ? Math.floor((Date.now() - new Date(registered).getTime()) / 86_400_000) : undefined,
      };
    }
  } catch {
    info = { ...base, ok: false, error: 'failed' };
  }
  rdapCache.set(domain, info, info.ok ? undefined : 10 * 60 * 1000);
  return info;
}

export async function dnsLookup(domain: string): Promise<DnsInfo> {
  const cached = dnsCache.get(domain);
  if (cached) return cached;
  const r = new Resolver({ timeout: 2500, tries: 1 });
  const safe = async <T>(p: Promise<T>, d: T): Promise<T> => p.catch(() => d);
  const [a, aaaa, mx, ns, txt, dmarcTxt] = await Promise.all([
    safe(r.resolve4(domain), [] as string[]),
    safe(r.resolve6(domain), [] as string[]),
    safe(r.resolveMx(domain), [] as { exchange: string; priority: number }[]),
    safe(r.resolveNs(domain), [] as string[]),
    safe(r.resolveTxt(domain), [] as string[][]),
    safe(r.resolveTxt(`_dmarc.${domain}`), [] as string[][]),
  ]);
  const ptr = a[0] ? await safe(r.reverse(a[0]).then((x) => x[0]), undefined as string | undefined) : undefined;
  const info: DnsInfo = {
    ok: true,
    domain,
    a: a.slice(0, 4),
    aaaa: aaaa.slice(0, 2),
    mx: mx.sort((x, y) => x.priority - y.priority).map((x) => x.exchange).slice(0, 3),
    ns: ns.slice(0, 4),
    spf: txt.map((t) => t.join('')).find((t) => t.toLowerCase().startsWith('v=spf1'))?.slice(0, 200),
    dmarc: dmarcTxt.map((t) => t.join('')).find((t) => t.toLowerCase().startsWith('v=dmarc1'))?.slice(0, 200),
    ptr,
    resolves: a.length > 0 || aaaa.length > 0,
    checkedAt: new Date().toISOString(),
  };
  info.ok = info.resolves || info.ns.length > 0 || info.mx.length > 0;
  dnsCache.set(domain, info);
  return info;
}

/** Hosting / DNS provider hint derived from nameservers and reverse DNS (public data only). */
export function hostingHint(d: DnsInfo): string | undefined {
  const s = `${d.ns.join(' ')} ${d.ptr ?? ''}`.toLowerCase();
  const known: [RegExp, string][] = [
    [/cloudflare/, 'Cloudflare'], [/awsdns|amazonaws|aws/, 'Amazon Web Services'], [/azure|microsoft/, 'Microsoft Azure'], [/google|googledomains|1e100/, 'Google'],
    [/godaddy|domaincontrol|secureserver/, 'GoDaddy'], [/hostinger/, 'Hostinger'], [/namecheap|registrar-servers/, 'Namecheap'], [/akam/, 'Akamai'],
    [/hetzner/, 'Hetzner'], [/digitalocean/, 'DigitalOcean'], [/ovh/, 'OVH'], [/vercel/, 'Vercel'], [/netlify/, 'Netlify'], [/etisalat|emirates|\.ae\b/, 'UAE-based provider'],
  ];
  return known.find(([re]) => re.test(s))?.[1];
}
