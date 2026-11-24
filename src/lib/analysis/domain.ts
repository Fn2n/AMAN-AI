/** Domain / string utilities used by the deterministic analyzers. */
import { parse } from 'tldts';

/** RFC 3492 punycode label decoder (decode only; used to reveal homograph domains). */
function decodePunycodeLabel(input: string): string {
  const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
  const output: number[] = [];
  let n = 128, i = 0, bias = 72;
  const basic = input.lastIndexOf('-');
  for (let j = 0; j < Math.max(basic, 0); j++) output.push(input.charCodeAt(j));
  const adapt = (delta: number, numPoints: number, first: boolean) => {
    delta = first ? Math.floor(delta / damp) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    let k = 0;
    while (delta > ((base - tMin) * tMax) >> 1) {
      delta = Math.floor(delta / (base - tMin));
      k += base;
    }
    return k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
  };
  for (let idx = basic > 0 ? basic + 1 : 0; idx < input.length; ) {
    const oldi = i;
    for (let w = 1, k = base; ; k += base) {
      if (idx >= input.length) throw new Error('bad input');
      const c = input.charCodeAt(idx++);
      const digit = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base;
      if (digit >= base) throw new Error('bad digit');
      i += digit * w;
      const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
      if (digit < t) break;
      w *= base - t;
    }
    bias = adapt(i - oldi, output.length + 1, oldi === 0);
    n += Math.floor(i / (output.length + 1));
    i %= output.length + 1;
    output.splice(i++, 0, n);
  }
  return String.fromCodePoint(...output);
}

export interface ParsedUrl {
  url: URL;
  schemeProvided: boolean;
}

export function parseUrl(input: string): ParsedUrl | null {
  let s = input.trim();
  if (!s || s.length > 4000) return null;
  const schemeProvided = /^[a-z][a-z0-9+.-]*:/i.test(s);
  if (!schemeProvided) s = 'http://' + s;
  try {
    const url = new URL(s);
    if (!['http:', 'https:', 'ftp:', 'data:', 'javascript:'].includes(url.protocol)) return null;
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !url.hostname.includes('.') && url.hostname !== 'localhost' && !url.hostname.startsWith('[')) {
      return null;
    }
    return { url, schemeProvided };
  } catch {
    return null;
  }
}

export function isIpAddress(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  if (host.startsWith('[') && host.endsWith(']')) return true; // IPv6
  if (/^0x[0-9a-f]+$/i.test(host) || /^\d{8,10}$/.test(host)) return true; // hex / decimal encoded
  return false;
}

/**
 * Registrable domain using the Public Suffix List (ICANN section), e.g.
 * "a.b.tamm.abudhabi" → "tamm.abudhabi", "login.dubaipolice.gov.ae" → "dubaipolice.gov.ae".
 */
export function registeredDomain(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (isIpAddress(h)) return h;
  const p = parse(h, { allowPrivateDomains: false });
  return p.domain ?? h;
}

/**
 * Site-level split using the PSL PRIVATE section too (e.g. "x.web.app" → domain "x.web.app", label "x").
 * Used for free-hosting platforms where each subdomain is a separate customer's site.
 */
export function privateSplit(host: string): { domain: string; label: string; sub: string } {
  const p = parse(host.toLowerCase(), { allowPrivateDomains: true });
  return { domain: p.domain ?? host, label: p.domainWithoutSuffix ?? '', sub: p.subdomain ?? '' };
}

export function publicSuffix(host: string): string {
  return parse(host.toLowerCase(), { allowPrivateDomains: false }).publicSuffix ?? tld(host);
}

/** Second-level label without the public suffix, e.g. "paypal" for "login.paypal.com". */
export function domainLabel(host: string): string {
  const p = parse(host.toLowerCase(), { allowPrivateDomains: false });
  return p.domainWithoutSuffix ?? registeredDomain(host).split('.')[0] ?? '';
}

export function subdomainOf(host: string): string {
  return parse(host.toLowerCase(), { allowPrivateDomains: false }).subdomain ?? '';
}

export function tld(host: string): string {
  const parts = host.toLowerCase().split('.');
  return parts[parts.length - 1] ?? '';
}

/** ASCII (punycode) hostname → Unicode for display and homograph analysis. */
export function toUnicodeHost(host: string): string {
  return host
    .split('.')
    .map((label) => {
      if (!label.toLowerCase().startsWith('xn--')) return label;
      try {
        return decodePunycodeLabel(label.slice(4).toLowerCase());
      } catch {
        return label;
      }
    })
    .join('.');
}

/** Unicode script buckets present in a label (Latin, Cyrillic, Greek, Arabic, other). */
export function scriptsOf(s: string): Set<string> {
  const out = new Set<string>();
  for (const ch of s) {
    if (/[a-z0-9-]/i.test(ch)) out.add('latin');
    else if (/[Ѐ-ӿ]/.test(ch)) out.add('cyrillic');
    else if (/[Ͱ-Ͽ]/.test(ch)) out.add('greek');
    else if (/[؀-ۿ]/.test(ch)) out.add('arabic');
    else if (/[À-ɏ]/.test(ch)) out.add('latin-ext');
    else if (ch !== '.') out.add('other');
  }
  return out;
}

/** Visually confusable non-Latin characters → Latin look-alike (subset of Unicode TR39). */
const CONFUSABLES: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ԁ: 'd', ɡ: 'g', ӏ: 'l', һ: 'h', ѕ: 's', ԛ: 'q', ԝ: 'w', ү: 'y', к: 'k', м: 'm', т: 't', в: 'b', н: 'h',
  α: 'a', ο: 'o', ρ: 'p', ν: 'v', τ: 't', κ: 'k', ι: 'i', υ: 'u', χ: 'x', ε: 'e', β: 'b', η: 'n', μ: 'u',
  á: 'a', à: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', í: 'i', ì: 'i', î: 'i', ï: 'i', ó: 'o', ò: 'o', ô: 'o', ö: 'o', õ: 'o', ú: 'u', ù: 'u', û: 'u', ü: 'u', ñ: 'n', ç: 'c', ı: 'i',
};

/** Reverse common character substitutions used in look-alike domains and handles. */
export function deLeet(s: string): string {
  let out = '';
  for (const ch of s.toLowerCase()) out += CONFUSABLES[ch] ?? ch;
  return out
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/0/g, 'o')
    .replace(/1/g, 'l')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/\$/g, 's')
    .replace(/@/g, 'a');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Similarity ratio 0..1 */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  return 1 - levenshtein(a, b) / max;
}

export function extractUrls(text: string): string[] {
  const re = /\b((?:https?:\/\/|www\.)[^\s<>"'`)\]]+|(?<![@\w.-])(?:[a-z0-9-]+\.)+(?:com|net|org|ae|xyz|top|info|online|site|live|shop|link|click|vip|cc|me|co|io|ly|gl|abudhabi)(?:\/[^\s<>"'`)\]]*)?)/gi;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    found.add(m[1].replace(/[.,;:!?،]+$/, ''));
  }
  return [...found];
}

export function extractEmail(s: string): string | null {
  const m = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}

/** Phone-number-like strings (7–15 digits, optional + and separators). Arabic-Indic digits are normalized. */
export function extractPhones(text: string): string[] {
  const t = normalizeDigits(text);
  const re = /(?:\+|00)?\d[\d\s-]{6,16}\d/g;
  const out = new Set<string>();
  for (const m of t.match(re) ?? []) {
    const d = m.replace(/[^\d+]/g, '');
    const digits = d.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) out.add(m.trim());
  }
  return [...out];
}

export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(l\.?l\.?c|fze|fzco|fz-llc|est|establishment|co|company|ltd|limited|group|trading|general)\b/g, ' ')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePhone(s: string): string {
  let d = normalizeDigits(s).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '971' + d.slice(1);
  return d;
}

export type UaePhoneType = 'mobile' | 'landline' | 'tollfree' | 'premium' | 'shortcode' | 'international' | 'invalid';

/** Classifies a phone number by UAE numbering plan (format only — ownership is never inferred). */
export function classifyUaePhone(s: string): { type: UaePhoneType; normalized: string } {
  const raw = normalizeDigits(s).replace(/[^\d+]/g, '');
  const digits = raw.replace(/\D/g, '');
  if (/^(800|600)\d{4,7}$/.test(digits)) return { type: 'tollfree', normalized: digits };
  if (/^900\d{4,7}$/.test(digits)) return { type: 'premium', normalized: digits };
  if (/^\d{3,5}$/.test(digits)) return { type: 'shortcode', normalized: digits };
  const n = normalizePhone(raw);
  if (n.startsWith('971')) {
    const rest = n.slice(3);
    if (/^5[0-9]\d{7}$/.test(rest)) return { type: 'mobile', normalized: n };
    if (/^[2-4679]\d{7}$/.test(rest)) return { type: 'landline', normalized: n };
    if (/^(800|600)\d{3,7}$/.test(rest)) return { type: 'tollfree', normalized: n };
    return { type: 'invalid', normalized: n };
  }
  if (raw.startsWith('+') || digits.startsWith('00')) return { type: 'international', normalized: n };
  return { type: 'invalid', normalized: n };
}

export function containsAny(text: string, words: string[]): string[] {
  const lower = text.toLowerCase();
  return words.filter((w) => lower.includes(w.toLowerCase()));
}

/** Hostname split into tokens on dots and hyphens (for exact short-name brand matching). */
export function hostTokens(host: string): string[] {
  return host.toLowerCase().split(/[.-]/).filter(Boolean);
}
