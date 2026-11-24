import 'server-only';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import type { TLSSocket } from 'node:tls';

/**
 * SSRF-safe HTTP client for inspecting suspicious links from the server.
 *
 *  - Only http/https on ports 80/443; no credentials in URLs.
 *  - Every hostname is resolved first and EVERY resolved address must be public (no private, loopback,
 *    link-local, CGNAT, multicast, reserved, documentation or cloud-metadata ranges, incl. IPv4-mapped IPv6).
 *  - The connection is pinned to the validated IP (custom `lookup`) so a second DNS answer cannot
 *    redirect it to an internal address (DNS-rebinding protection). TLS still validates the real hostname.
 *  - Redirects are followed manually; each hop is re-validated. Hop count, bytes read and time are capped.
 *  - The body is read as text only (max N bytes) and is never executed or rendered.
 */

const toNum = (ip: string) => ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
const inV4 = (ip: string, cidr: string) => {
  const [base, bits] = cidr.split('/');
  const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
  return (toNum(ip) & mask) === (toNum(base) & mask);
};
const BLOCKED_V4 = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24',
  '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
];

function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0];
  let tailV4: number[] = [];
  const v4m = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4m) {
    const n = toNum(v4m[1]);
    tailV4 = [(n >>> 16) & 0xffff, n & 0xffff];
    s = s.slice(0, -v4m[1].length) + '0:0';
  }
  const [head, tail] = s.split('::');
  const h = head ? head.split(':').filter(Boolean) : [];
  const t = tail !== undefined ? (tail ? tail.split(':').filter(Boolean) : []) : [];
  if (tail === undefined && h.length !== 8) return null;
  const fill = 8 - h.length - t.length;
  if (fill < 0) return null;
  const parts = [...h, ...Array(tail !== undefined ? fill : 0).fill('0'), ...t].map((x) => parseInt(x, 16));
  if (parts.length !== 8 || parts.some((x) => Number.isNaN(x))) return null;
  if (tailV4.length) parts.splice(6, 2, ...tailV4);
  return parts;
}

export function isPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return !BLOCKED_V4.some((c) => inV4(ip, c));
  if (v !== 6) return false;
  const p = expandV6(ip);
  if (!p) return false;
  const embeddedV4 = () => `${p[6] >> 8}.${p[6] & 0xff}.${p[7] >> 8}.${p[7] & 0xff}`;
  if (p.every((x) => x === 0)) return false; // ::
  if (p.slice(0, 7).every((x) => x === 0) && p[7] === 1) return false; // ::1
  if (p.slice(0, 5).every((x) => x === 0) && p[5] === 0xffff) return isPublicIp(embeddedV4()); // ::ffff:a.b.c.d
  if (p[0] === 0x64 && p[1] === 0xff9b) return isPublicIp(embeddedV4()); // NAT64
  if ((p[0] & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((p[0] & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((p[0] & 0xff00) === 0xff00) return false; // multicast
  if (p[0] === 0x2001 && p[1] === 0x0db8) return false; // documentation
  if (p[0] === 0x2001 && p[1] === 0) return false; // Teredo
  if (p[0] === 0x2002) return false; // 6to4 (can embed private v4)
  if (p[0] === 0x0100 && p[1] === 0 && p[2] === 0 && p[3] === 0) return false; // discard
  return true;
}

export interface ResolvedHost {
  ok: boolean;
  addresses: { address: string; family: number }[];
  reason?: 'nxdomain' | 'private' | 'invalid';
}

export async function resolvePublic(hostname: string): Promise<ResolvedHost> {
  const h = hostname.replace(/^\[|\]$/g, '');
  if (isIP(h)) return isPublicIp(h) ? { ok: true, addresses: [{ address: h, family: isIP(h) }] } : { ok: false, addresses: [], reason: 'private' };
  if (!/^[a-z0-9.-]+$/i.test(h) || h.length > 253) return { ok: false, addresses: [], reason: 'invalid' };
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/i.test(h)) return { ok: false, addresses: [], reason: 'private' };
  try {
    const addrs = await Promise.race([
      lookup(h, { all: true, verbatim: true }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('dns timeout')), 3000)),
    ]);
    if (!addrs.length) return { ok: false, addresses: [], reason: 'nxdomain' };
    if (addrs.some((a) => !isPublicIp(a.address))) return { ok: false, addresses: addrs, reason: 'private' };
    return { ok: true, addresses: addrs };
  } catch {
    return { ok: false, addresses: [], reason: 'nxdomain' };
  }
}

export interface Hop {
  url: string;
  status?: number;
  ip?: string;
  location?: string;
}

export interface CertInfo {
  valid: boolean;
  error?: string;
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
}

export interface SafeFetchResult {
  ok: boolean;
  blocked?: string;
  error?: string;
  hops: Hop[];
  finalUrl?: string;
  status?: number;
  contentType?: string;
  server?: string;
  title?: string;
  hasPasswordField?: boolean;
  hasCardField?: boolean;
  metaRefresh?: string;
  cert?: CertInfo;
  bytes?: number;
}

const ALLOWED_PORTS = new Set(['', '80', '443']);

function requestOnce(u: URL, ip: string, family: number, timeoutMs: number, maxBytes: number) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string; cert?: CertInfo }>((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'GET',
        servername: isIP(u.hostname) ? undefined : u.hostname,
        // Pin the connection to the validated address (DNS-rebinding protection).
        lookup: ((_h: string, opts: { all?: boolean }, cb: (...args: unknown[]) => void) => {
          if (opts?.all) cb(null, [{ address: ip, family }]);
          else cb(null, ip, family);
        }) as unknown as typeof import('node:dns').lookup,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AMAN-AI-LinkSafetyCheck/1.0)',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Encoding': 'identity',
        },
        timeout: timeoutMs,
        agent: false,
      },
      (res) => {
        let cert: CertInfo | undefined;
        if (u.protocol === 'https:') {
          const sock = res.socket as TLSSocket;
          const c = sock.getPeerCertificate?.();
          if (c && Object.keys(c).length) {
            cert = {
              valid: sock.authorized !== false,
              issuer: [c.issuer?.O, c.issuer?.CN].filter(Boolean).join(' · '),
              subject: Array.isArray(c.subject?.CN) ? c.subject.CN[0] : c.subject?.CN,
              validFrom: c.valid_from ? new Date(c.valid_from).toISOString() : undefined,
              validTo: c.valid_to ? new Date(c.valid_to).toISOString() : undefined,
            };
          }
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (d: Buffer) => {
          size += d.length;
          if (size <= maxBytes) chunks.push(d);
          else res.destroy();
        });
        const done = () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8'), cert });
        res.on('end', done);
        res.on('close', done);
        res.on('error', done);
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

export async function safeFetch(input: string, opts: { maxRedirects?: number; timeoutMs?: number; maxBytes?: number; totalMs?: number } = {}): Promise<SafeFetchResult> {
  const maxRedirects = opts.maxRedirects ?? 4;
  const timeoutMs = opts.timeoutMs ?? 5000;
  const maxBytes = opts.maxBytes ?? 150_000;
  const deadline = Date.now() + (opts.totalMs ?? 9000);
  const hops: Hop[] = [];
  let current: URL;
  try {
    current = new URL(/^[a-z]+:\/\//i.test(input) ? input : `http://${input}`);
  } catch {
    return { ok: false, blocked: 'invalid-url', hops };
  }

  for (let i = 0; i <= maxRedirects; i++) {
    if (Date.now() > deadline) return { ok: false, error: 'time limit reached', hops };
    if (!['http:', 'https:'].includes(current.protocol)) return { ok: false, blocked: `scheme ${current.protocol}`, hops };
    if (!ALLOWED_PORTS.has(current.port)) return { ok: false, blocked: `port ${current.port}`, hops };
    if (current.username || current.password) return { ok: false, blocked: 'credentials in URL', hops };
    const resolved = await resolvePublic(current.hostname);
    if (!resolved.ok) {
      hops.push({ url: current.href });
      return { ok: false, blocked: resolved.reason === 'private' ? 'resolves to a private / reserved address' : undefined, error: resolved.reason === 'nxdomain' ? 'domain does not resolve' : undefined, hops };
    }
    const { address, family } = resolved.addresses[0];
    const hop: Hop = { url: current.href, ip: address };
    hops.push(hop);
    let res;
    try {
      res = await requestOnce(current, address, family, Math.min(timeoutMs, Math.max(500, deadline - Date.now())), maxBytes);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = (e as { code?: string }).code ?? '';
      if (/CERT|SSL|TLS|self.signed|altname/i.test(code + msg)) {
        return { ok: false, error: 'tls', hops, cert: { valid: false, error: code || msg.slice(0, 80) } };
      }
      return { ok: false, error: msg.slice(0, 80), hops };
    }
    hop.status = res.status;
    const loc = res.headers.location;
    if (res.status >= 300 && res.status < 400 && loc) {
      hop.location = String(loc);
      try {
        current = new URL(String(loc), current);
      } catch {
        return { ok: false, error: 'bad redirect', hops };
      }
      continue;
    }
    const html = res.body;
    const title = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim();
    const metaRefresh = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^"']*url=([^"'>\s]+)/i)?.[1];
    return {
      ok: true,
      hops,
      finalUrl: current.href,
      status: res.status,
      contentType: String(res.headers['content-type'] ?? ''),
      server: res.headers.server ? String(res.headers.server).slice(0, 60) : undefined,
      title,
      hasPasswordField: /<input[^>]+type=["']?password/i.test(html),
      hasCardField: /<input[^>]+(name|id|autocomplete)=["']?[^"'>]*(cc-number|cardnumber|card_number|cvv|cvc)/i.test(html),
      metaRefresh,
      cert: res.cert,
      bytes: html.length,
    };
  }
  return { ok: false, error: 'too many redirects', hops };
}
