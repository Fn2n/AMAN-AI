export type Lang = 'en' | 'ar';

/** A bilingual string. */
export interface L {
  en: string;
  ar: string;
}

export const T = (en: string, ar: string): L => ({ en, ar });

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'positive';

/**
 * Where a finding comes from:
 *  - rule:     deterministic rule over the submitted content (offline, reproducible)
 *  - live:     deterministic rule over a live technical check (RDAP, DNS, safe HTTP fetch)
 *  - research: deterministic rule over public web-search results (Tavily)
 */
export type FindingSource = 'rule' | 'live' | 'research';

export interface Finding {
  id: string;
  severity: Severity;
  /** Contribution to the risk score. Negative = reduces risk (positive evidence). */
  weight: number;
  title: L;
  detail: L;
  evidence?: string;
  source?: FindingSource;
}

/** url = link; email = email / SMS / WhatsApp message; business = business, listing, ad, phone; social = social account. */
export type AnalysisKind = 'url' | 'email' | 'business' | 'social';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Indicator {
  label: L;
  value: string;
}

/** A fact obtained from a live technical source (RDAP registry, DNS, HTTP headers, TLS). */
export interface Fact {
  id: string;
  label: L;
  value: string;
  source: string;
  sourceUrl?: string;
  checkedAt: string;
}

/** A public web source found by internet research. Content is untrusted third-party data. */
export interface WebSource {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  retrievedAt: string;
  /** official = on a verified official domain or a UAE government suffix; warning = scam/fraud report about the target */
  kind: 'official' | 'warning' | 'reference';
}

export type CheckState = 'done' | 'failed' | 'skipped' | 'unavailable';

export interface CheckStatus {
  id: string;
  label: L;
  state: CheckState;
  note?: L;
}

export type EvidenceSufficiency = 'strong' | 'moderate' | 'limited';

export interface OfficialComparison {
  brand: L;
  officialDomains: string[];
  submitted: string;
  matches: boolean;
}

export interface Report {
  id: string;
  kind: AnalysisKind;
  target: string;
  score: number;
  level: RiskLevel;
  summary: L;
  findings: Finding[];
  recommendations: L[];
  unavailableChecks: L[];
  indicators: Indicator[];
  generatedAt: string;
  /** Populated by the server pipeline; empty when only the offline engine ran. */
  facts: Fact[];
  sources: WebSource[];
  checks: CheckStatus[];
  sufficiency: EvidenceSufficiency;
  official?: OfficialComparison;
  /** Scenario ids detected (e.g. fake-traffic-fine, delivery-fee). */
  scenarios: string[];
  /** true when produced by the full server pipeline (live checks + research attempted). */
  live: boolean;
}
