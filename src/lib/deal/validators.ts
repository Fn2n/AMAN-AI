/**
 * Local consistency validators for Secure Deal. Format/consistency checks ONLY:
 * none of these consult an official registry (RTA, ITC, MOI, banks).
 */

const VIN_CHARS = /^[A-HJ-NPR-Z0-9]{17}$/;
const TRANSLIT: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
/** Model-year code (VIN position 10), repeating every 30 years. */
const YEAR_CODES = 'ABCDEFGHJKLMNPRSTVWXY123456789';

export function vinFormatValid(vin: string): boolean {
  return VIN_CHARS.test(vin.toUpperCase());
}

/** ISO 3779 check digit (position 9). Mandatory for North-American-market VINs only. */
export function vinCheckDigitValid(vin: string): boolean {
  const v = vin.toUpperCase();
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = v[i];
    const val = /\d/.test(c) ? Number(c) : TRANSLIT[c] ?? 0;
    sum += val * WEIGHTS[i];
  }
  const r = sum % 11;
  return v[8] === (r === 10 ? 'X' : String(r));
}

export function isNorthAmericanVin(vin: string): boolean {
  return /^[1-5]/.test(vin);
}

/** Possible model years encoded at VIN position 10 (e.g. 'M' → 1991 or 2021). */
export function vinModelYears(vin: string): number[] {
  const i = YEAR_CODES.indexOf(vin.toUpperCase()[9]);
  if (i < 0) return [];
  return [1980 + i, 2010 + i, 2040 + i];
}

/** Well-known World Manufacturer Identifiers (first 2–3 VIN characters). */
const WMI: [string, string[]][] = [
  ['JT', ['toyota', 'lexus']], ['JTH', ['lexus']], ['JN', ['nissan', 'infiniti']], ['JHM', ['honda']], ['JH4', ['acura']], ['JM', ['mazda']], ['JS', ['suzuki']], ['JF', ['subaru']], ['JA', ['mitsubishi', 'isuzu']], ['ML', ['mitsubishi']],
  ['WBA', ['bmw']], ['WBS', ['bmw']], ['WBY', ['bmw']], ['WDB', ['mercedes', 'mercedes-benz']], ['WDD', ['mercedes', 'mercedes-benz']], ['W1K', ['mercedes', 'mercedes-benz']], ['W1N', ['mercedes', 'mercedes-benz']], ['WDC', ['mercedes', 'mercedes-benz']],
  ['WAU', ['audi']], ['WUA', ['audi']], ['WVW', ['volkswagen', 'vw']], ['WV1', ['volkswagen', 'vw']], ['WV2', ['volkswagen', 'vw']], ['WP0', ['porsche']], ['WP1', ['porsche']],
  ['ZFF', ['ferrari']], ['ZHW', ['lamborghini']], ['ZAR', ['alfa romeo']], ['SAL', ['land rover', 'range rover']], ['SAJ', ['jaguar']], ['SCB', ['bentley']], ['SCA', ['rolls-royce', 'rolls royce']], ['SCF', ['aston martin']],
  ['KMH', ['hyundai']], ['KNA', ['kia']], ['KND', ['kia']], ['5YJ', ['tesla']], ['7SA', ['tesla']], ['1FA', ['ford']], ['1FT', ['ford']], ['1FM', ['ford']], ['3FA', ['ford']],
  ['1G1', ['chevrolet']], ['1GC', ['chevrolet']], ['1GN', ['chevrolet']], ['2G1', ['chevrolet']], ['1GT', ['gmc']], ['1GK', ['gmc']], ['1C4', ['jeep', 'chrysler', 'dodge']], ['1C6', ['ram', 'dodge']], ['2C3', ['dodge', 'chrysler']], ['1J4', ['jeep']],
  ['LVS', ['ford']], ['LSG', ['chevrolet', 'gm']], ['LGX', ['byd']], ['LB3', ['geely']], ['LVV', ['chery']], ['LJD', ['jetour']], ['L6T', ['geely']], ['LRW', ['tesla']],
];

/** Manufacturer names implied by the VIN prefix, or undefined if the prefix is not in the table. */
export function vinMakes(vin: string): string[] | undefined {
  const v = vin.toUpperCase();
  const hit = WMI.filter(([p]) => v.startsWith(p)).sort((a, b) => b[0].length - a[0].length)[0];
  return hit?.[1];
}

/** IBAN structure + ISO 13616 mod-97 check. UAE IBANs: AE + 2 check digits + 3-digit bank code + 16-digit account (23 chars). */
export function ibanValid(iban: string): boolean {
  const s = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  if (s.startsWith('AE') && !/^AE\d{21}$/.test(s)) return false;
  const re = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of re) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of v) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}

export const EMIRATES = ['abu_dhabi', 'dubai', 'sharjah', 'ajman', 'umm_al_quwain', 'ras_al_khaimah', 'fujairah'] as const;
export type Emirate = (typeof EMIRATES)[number];

/** Plate code / number FORMAT check (not an ownership or registry check). */
export function plateFormatValid(code: string, number: string): boolean {
  const c = code.trim().toUpperCase();
  const n = number.trim();
  const codeOk = /^[A-Z]{1,2}$/.test(c) || /^\d{1,2}$/.test(c) || /^(WHITE|RED|BLUE|GREEN|CLASSIC|ابيض|أحمر)$/i.test(c);
  const numOk = /^[1-9]\d{0,4}$/.test(n);
  return codeOk && numOk;
}

/** Premium-number pattern (short or repeating digits). Informational only. */
export function premiumPattern(number: string): string | undefined {
  const n = number.trim();
  if (/^\d{1,2}$/.test(n)) return `${n.length}-digit number`;
  if (/^\d{3}$/.test(n)) return '3-digit number';
  if (/^(\d)\1+$/.test(n)) return 'repeating digits';
  if (/^(\d\d)\1+$/.test(n) || /^(\d)(\d)\2\1$/.test(n)) return 'pattern number';
  return undefined;
}

/** Name similarity tolerant of order, case and Arabic/Latin spacing. */
export function nameSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^a-z0-9؀-ۿ ]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !['al', 'bin', 'bint', 'llc', 'fze', 'demo', 'example'].includes(w));
  const A = new Set(norm(a));
  const B = new Set(norm(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}
