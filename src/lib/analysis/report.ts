import { T, type AnalysisKind, type CheckStatus, type EvidenceSufficiency, type Finding, type Indicator, type L, type Lang, type Report, type RiskLevel } from './types';

export function levelFromScore(score: number): RiskLevel {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

export const LEVEL_LABEL: Record<RiskLevel, L> = {
  low: T('Low risk', 'خطورة منخفضة'),
  medium: T('Caution', 'توخَّ الحذر'),
  high: T('High risk', 'خطورة عالية'),
  critical: T('Dangerous', 'خطير'),
};

const SUMMARY: Record<AnalysisKind, Record<RiskLevel, L>> = {
  url: {
    low: T('No strong fraud indicators were found for this link. Stay alert and verify any request for payment or credentials.', 'لم يتم العثور على مؤشرات احتيال قوية لهذا الرابط. ابقَ يقظاً وتحقق من أي طلب دفع أو بيانات دخول.'),
    medium: T('This link shows some warning signs. Do not enter credentials or payment details until you verify it through an official channel.', 'يُظهر هذا الرابط بعض علامات التحذير. لا تُدخل بيانات الدخول أو الدفع قبل التحقق عبر قناة رسمية.'),
    high: T('This link has multiple phishing indicators. Avoid opening it.', 'يحتوي هذا الرابط على عدة مؤشرات تصيّد. تجنّب فتحه.'),
    critical: T('This link is very likely malicious (phishing or impersonation). Do not open it and report it.', 'هذا الرابط على الأرجح ضار (تصيّد أو انتحال). لا تفتحه وقم بالإبلاغ عنه.'),
  },
  email: {
    low: T('Few fraud indicators were found in this message. Still verify any request for money or data.', 'تم العثور على مؤشرات احتيال قليلة في هذه الرسالة. تحقق دائماً من أي طلب لأموال أو بيانات.'),
    medium: T('This message contains suspicious elements. Verify the sender through a known, official contact before acting.', 'تحتوي هذه الرسالة على عناصر مريبة. تحقق من المرسل عبر جهة اتصال رسمية معروفة قبل أي إجراء.'),
    high: T('This message has strong scam characteristics. Do not click links, pay, or reply.', 'تحمل هذه الرسالة خصائص احتيال قوية. لا تنقر على الروابط ولا تدفع ولا ترد.'),
    critical: T('This message is very likely a phishing or fraud attempt. Delete it and report it.', 'هذه الرسالة على الأرجح محاولة تصيّد أو احتيال. احذفها وأبلغ عنها.'),
  },
  business: {
    low: T('No strong fraud indicators were found in these business or listing details. Confirm contact details on the official website before paying.', 'لم يتم العثور على مؤشرات احتيال قوية في بيانات النشاط أو الإعلان. تأكد من بيانات التواصل عبر الموقع الرسمي قبل الدفع.'),
    medium: T('Some details are inconsistent or could not be confirmed. Verify through the official website or licensing authority before paying.', 'بعض التفاصيل غير متسقة أو تعذّر تأكيدها. تحقق عبر الموقع الرسمي أو جهة الترخيص قبل الدفع.'),
    high: T('Significant warning signs were found in this listing. Do not transfer money until verified officially.', 'تم العثور على علامات تحذير كبيرة في هذا الإعلان. لا تحوّل أي أموال قبل التحقق الرسمي.'),
    critical: T('This listing shows strong fraud indicators. Do not deal with it and report it.', 'يُظهر هذا الإعلان مؤشرات احتيال قوية. لا تتعامل معه وأبلغ عنه.'),
  },
  social: {
    low: T('No strong impersonation or scam signals were found for this account.', 'لم يتم العثور على مؤشرات انتحال أو احتيال قوية لهذا الحساب.'),
    medium: T('This account shows some warning signs. Be careful with any payment or personal-data request.', 'يُظهر هذا الحساب بعض علامات التحذير. احذر من أي طلب دفع أو بيانات شخصية.'),
    high: T('This account has multiple scam or impersonation indicators.', 'يحمل هذا الحساب عدة مؤشرات احتيال أو انتحال.'),
    critical: T('This account is very likely fraudulent or impersonating a legitimate entity. Block and report it.', 'هذا الحساب على الأرجح احتيالي أو ينتحل جهة موثوقة. قم بحظره والإبلاغ عنه.'),
  },
};

export const REPORT_CHANNELS: L = T(
  'Report fraud to the police through their official app, website or emergency number, and call your bank immediately using the number on your card.',
  'أبلغ الشرطة عن الاحتيال عبر تطبيقها أو موقعها الرسمي أو رقم الطوارئ، واتصل ببنكك فوراً على الرقم المدوّن على بطاقتك.',
);

export function newReportId(): string {
  const d = new Date();
  const date = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  const rnd = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 6).toUpperCase();
  return `AMN-${date}-${rnd}`;
}

/**
 * Score = sum of finding weights, clamped 0..100.
 * Guard: live/research findings alone (e.g. "domain is new", "no web presence") can raise the score to at most 45
 * ("Caution"). A High/Dangerous verdict requires at least one content-based rule finding of medium severity or above.
 */
export function scoreFindings(findings: Finding[]): number {
  const raw = findings.reduce((s, f) => s + f.weight, 0);
  let score = Math.max(0, Math.min(100, Math.round(raw)));
  const hasRuleEvidence = findings.some((f) => (f.source ?? 'rule') === 'rule' && f.weight >= 12);
  if (!hasRuleEvidence) score = Math.min(score, 45);
  return score;
}

export function sortFindings(findings: Finding[]): Finding[] {
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4, positive: 5 };
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity] || b.weight - a.weight);
}

export function sufficiencyOf(r: Pick<Report, 'checks' | 'sources' | 'findings' | 'live'>): EvidenceSufficiency {
  if (!r.live) return 'limited';
  const done = r.checks.filter((c) => c.state === 'done').length;
  const strongFinding = r.findings.some((f) => Math.abs(f.weight) >= 25);
  if (done >= 2 && (r.sources.length > 0 || strongFinding)) return 'strong';
  if (done >= 1 || r.sources.length > 0) return 'moderate';
  return 'limited';
}

export function buildReport(args: {
  kind: AnalysisKind;
  target: string;
  findings: Finding[];
  recommendations: L[];
  unavailableChecks: L[];
  indicators?: Indicator[];
  scenarios?: string[];
  checks?: CheckStatus[];
}): Report {
  const findings = sortFindings(args.findings.map((f) => ({ ...f, source: f.source ?? 'rule' })));
  const score = scoreFindings(findings);
  const level = levelFromScore(score);
  const recs = [...args.recommendations];
  if (level === 'high' || level === 'critical') recs.push(REPORT_CHANNELS);
  const report: Report = {
    id: newReportId(),
    kind: args.kind,
    target: args.target,
    score,
    level,
    summary: SUMMARY[args.kind][level],
    findings,
    recommendations: recs,
    unavailableChecks: args.unavailableChecks,
    indicators: args.indicators ?? [],
    generatedAt: new Date().toISOString(),
    facts: [],
    sources: [],
    checks: args.checks ?? [],
    sufficiency: 'limited',
    scenarios: args.scenarios ?? [],
    live: false,
  };
  return report;
}

/** Recomputes score/level/summary after live or research findings were added. */
export function rescore(r: Report): Report {
  const findings = sortFindings(r.findings);
  const score = scoreFindings(findings);
  const level = levelFromScore(score);
  const recs = r.recommendations.filter((x) => x.en !== REPORT_CHANNELS.en);
  if (level === 'high' || level === 'critical') recs.push(REPORT_CHANNELS);
  const next: Report = { ...r, findings, score, level, summary: SUMMARY[r.kind][level], recommendations: recs };
  return { ...next, sufficiency: sufficiencyOf(next) };
}

export function severityFromWeight(w: number): Finding['severity'] {
  if (w < 0) return 'positive';
  if (w >= 40) return 'critical';
  if (w >= 25) return 'high';
  if (w >= 12) return 'medium';
  if (w > 0) return 'low';
  return 'info';
}

/** Small helper to create a finding with severity derived from weight. */
export function finding(id: string, weight: number, title: L, detail: L, evidence?: string, source: Finding['source'] = 'rule'): Finding {
  return { id, weight, severity: severityFromWeight(weight), title, detail, evidence, source };
}

export const KIND_LABEL: Record<AnalysisKind, L> = {
  url: T('URL analysis', 'تحليل رابط'),
  email: T('Message analysis (email / SMS / WhatsApp)', 'تحليل رسالة (بريد / SMS / واتساب)'),
  business: T('Business, listing & phone check', 'فحص نشاط أو إعلان أو رقم هاتف'),
  social: T('Social account analysis', 'تحليل حساب تواصل اجتماعي'),
};

export const SUFFICIENCY_LABEL: Record<EvidenceSufficiency, L> = {
  strong: T('Evidence: strong', 'الأدلة: قوية'),
  moderate: T('Evidence: moderate', 'الأدلة: متوسطة'),
  limited: T('Evidence: limited', 'الأدلة: محدودة'),
};
