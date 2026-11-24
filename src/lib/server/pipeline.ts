import 'server-only';
import { OFFICIAL_DOMAINS } from '@/data/brands';
import { analyzeBusiness, BUSINESS_LIVE_CHECKS, type BusinessInput } from '@/lib/analysis/business';
import { classifyUaePhone, extractPhones, extractUrls, normalizeDigits, normalizeName, parseUrl, registeredDomain } from '@/lib/analysis/domain';
import { analyzeEmail, EMAIL_LIVE_CHECKS, SCENARIOS } from '@/lib/analysis/email';
import { finding, rescore } from '@/lib/analysis/report';
import { analyzeSocial, SOCIAL_LIVE_CHECKS, type Platform, type SocialInput } from '@/lib/analysis/social';
import { T, type AnalysisKind, type CheckStatus, type Fact, type Finding, type Report, type WebSource } from '@/lib/analysis/types';
import { analyzeUrl, checkUrl, URL_LIVE_CHECKS, urlRiskWeight } from '@/lib/analysis/url';
import { URL_SHORTENERS } from '@/data/brands';
import { dnsLookup, hostingHint, rdapLookup, type DnsInfo, type RdapInfo } from './intel';
import { safeFetch, type SafeFetchResult } from './net';
import { researchConfigured, webSearch } from './research';
import { recordThreat } from './threats';

export interface AnalyzeRequest {
  kind: AnalysisKind;
  text?: string;
  business?: BusinessInput;
  social?: SocialInput;
  options: { live: boolean; research: boolean };
}

const PLATFORMS: Platform[] = ['instagram', 'x', 'facebook', 'tiktok', 'whatsapp', 'telegram', 'linkedin', 'snapchat'];
const s = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);

/** Strict server-side validation of the analysis request. */
export function parseAnalyzeRequest(body: unknown): AnalyzeRequest | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const kind = b.kind as AnalysisKind;
  if (!['url', 'email', 'business', 'social'].includes(kind)) return null;
  const o = (b.options ?? {}) as Record<string, unknown>;
  const options = { live: o.live !== false, research: o.research !== false };
  if (kind === 'url' || kind === 'email') {
    const text = s(b.text, kind === 'url' ? 2000 : 10000).trim();
    if (!text) return null;
    return { kind, text, options };
  }
  if (kind === 'business') {
    const x = (b.business ?? {}) as Record<string, unknown>;
    const business: BusinessInput = { name: s(x.name, 200), phone: s(x.phone, 40), website: s(x.website, 500), listingUrl: s(x.listingUrl, 500), adText: s(x.adText, 4000) };
    if (!business.name.trim() && !business.website && !business.phone && !business.adText && !business.listingUrl) return null;
    return { kind, business, options };
  }
  const x = (b.social ?? {}) as Record<string, unknown>;
  const platform = (PLATFORMS.includes(x.platform as Platform) ? x.platform : 'instagram') as Platform;
  const handle = s(x.handle, 80).trim();
  if (!handle) return null;
  return {
    kind,
    social: { platform, handle, displayName: s(x.displayName, 120), followers: n(x.followers), following: n(x.following), posts: n(x.posts), accountAgeMonths: n(x.accountAgeMonths), message: s(x.message, 4000) },
    options,
  };
}

export function baseReport(req: AnalyzeRequest): Report | null {
  if (req.kind === 'url') return analyzeUrl(req.text!);
  if (req.kind === 'email') return analyzeEmail(req.text!);
  if (req.kind === 'business') return analyzeBusiness(req.business!);
  return analyzeSocial(req.social!);
}

const fact = (id: string, en: string, ar: string, value: string, source: string, sourceUrl?: string, at?: string): Fact => ({
  id, label: T(en, ar), value, source, sourceUrl, checkedAt: at ?? new Date().toISOString(),
});

function rdapToEvidence(r: RdapInfo, facts: Fact[], findings: Finding[], primary: boolean) {
  if (r.error === 'not-found') {
    facts.push(fact(`rdap-status-${r.domain}`, `Registry status (${r.domain})`, `حالة السجل (${r.domain})`, 'Not registered / not found in the registry', r.source, r.sourceUrl, r.checkedAt));
    return;
  }
  if (!r.ok) return;
  if (r.registered) facts.push(fact(`rdap-created-${r.domain}`, `Registered (${r.domain})`, `تاريخ التسجيل (${r.domain})`, `${r.registered.slice(0, 10)} · ${r.ageDays} days ago`, r.source, r.sourceUrl, r.checkedAt));
  if (r.registrar) facts.push(fact(`rdap-registrar-${r.domain}`, `Registrar (${r.domain})`, `المسجِّل (${r.domain})`, r.registrar, r.source, r.sourceUrl, r.checkedAt));
  if (r.expires) facts.push(fact(`rdap-expires-${r.domain}`, `Registration expires`, `انتهاء التسجيل`, r.expires.slice(0, 10), r.source, r.sourceUrl, r.checkedAt));
  if (r.ageDays === undefined || !primary) return;
  if (r.ageDays < 30) {
    findings.push(finding('new-domain', 20, T('Newly registered domain', 'نطاق مسجّل حديثاً'), T(`${r.domain} was registered ${r.ageDays} days ago. Most phishing domains are used within weeks of registration. Newness alone does not prove fraud.`, `تم تسجيل ${r.domain} قبل ${r.ageDays} يوماً. تُستخدم معظم نطاقات التصيّد خلال أسابيع من تسجيلها. الحداثة وحدها لا تثبت الاحتيال.`), r.registered?.slice(0, 10), 'live'));
  } else if (r.ageDays < 180) {
    findings.push(finding('young-domain', 8, T('Recently registered domain', 'نطاق حديث التسجيل'), T(`${r.domain} is less than 6 months old.`, `عمر ${r.domain} أقل من 6 أشهر.`), r.registered?.slice(0, 10), 'live'));
  } else if (r.ageDays >= 730) {
    findings.push(finding('established-domain', -5, T('Long-established domain', 'نطاق قديم التسجيل'), T(`${r.domain} has been registered for more than 2 years (a weak trust signal).`, `${r.domain} مسجّل منذ أكثر من سنتين (مؤشر ثقة ضعيف).`), r.registered?.slice(0, 10), 'live'));
  }
}

function dnsToEvidence(d: DnsInfo, facts: Fact[], findings: Finding[], primary: boolean, senderCheck = false) {
  const src = 'DNS (public resolvers)';
  if (d.resolves) facts.push(fact(`dns-a-${d.domain}`, `IP addresses (${d.domain})`, `عناوين IP (${d.domain})`, [...d.a, ...d.aaaa].slice(0, 3).join(', '), src, undefined, d.checkedAt));
  if (d.ns.length) facts.push(fact(`dns-ns-${d.domain}`, `Name servers`, `خوادم الأسماء`, d.ns.slice(0, 2).join(', '), src, undefined, d.checkedAt));
  const host = hostingHint(d);
  if (host) facts.push(fact(`dns-host-${d.domain}`, `Hosting / DNS provider (inferred)`, `مزوّد الاستضافة / DNS (استنتاج)`, host, src, undefined, d.checkedAt));
  if (senderCheck) {
    facts.push(fact(`dns-spf-${d.domain}`, `SPF record (${d.domain})`, `سجل SPF (${d.domain})`, d.spf ?? 'none', src, undefined, d.checkedAt));
    facts.push(fact(`dns-dmarc-${d.domain}`, `DMARC record (${d.domain})`, `سجل DMARC (${d.domain})`, d.dmarc ?? 'none', src, undefined, d.checkedAt));
    if (!d.spf && !d.dmarc && !OFFICIAL_DOMAINS.has(d.domain)) {
      findings.push(finding('sender-no-auth', 10, T('Sender domain has no SPF or DMARC', 'نطاق المرسل بلا SPF أو DMARC'), T('Organizations that send real email publish SPF/DMARC records. Their absence makes spoofing easier and is common for throwaway domains.', 'الجهات التي ترسل بريداً حقيقياً تنشر سجلات SPF/DMARC. غيابها يسهّل التزوير وهو شائع في النطاقات المؤقتة.'), d.domain, 'live'));
    }
  }
  if (primary && !d.resolves && !d.mx.length) {
    findings.push(finding('no-dns', 5, T('Domain does not currently resolve', 'النطاق لا يعمل حالياً'), T('No web address records were found. The site may have been taken down, or never existed.', 'لم يتم العثور على سجلات عنوان. ربما أُزيل الموقع أو لم يكن موجوداً.'), d.domain, 'live'));
  }
}

function fetchToEvidence(fr: SafeFetchResult, startReg: string, facts: Fact[], findings: Finding[]) {
  const src = 'AMAN safe link inspection (server-side, no JavaScript executed)';
  const now = new Date().toISOString();
  if (fr.blocked) {
    findings.push(finding('blocked-fetch', 10, T('Link points to a private or disallowed address', 'الرابط يشير إلى عنوان خاص أو غير مسموح'), T(`The link was not opened: ${fr.blocked}. Public websites do not resolve to internal network addresses.`, `لم يتم فتح الرابط: ${fr.blocked}. المواقع العامة لا تشير إلى عناوين شبكات داخلية.`), fr.hops[0]?.url, 'live'));
    return;
  }
  if (fr.hops.length > 1) {
    facts.push(fact('redirect-chain', 'Redirect chain', 'سلسلة إعادة التوجيه', fr.hops.map((h) => `${h.status ?? ''} ${new URL(h.url).host}`.trim()).join(' → ') + (fr.finalUrl ? ` → ${new URL(fr.finalUrl).host}` : ''), src, undefined, now));
  }
  if (fr.finalUrl) {
    const finalReg = registeredDomain(new URL(fr.finalUrl).hostname);
    facts.push(fact('final-destination', 'Final destination', 'الوجهة النهائية', fr.finalUrl.slice(0, 200), src, undefined, now));
    if (finalReg !== startReg) {
      const r = checkUrl(fr.finalUrl);
      if (r) {
        const w = urlRiskWeight(r);
        if (r.findings.some((x) => x.id === 'official-domain')) {
          findings.push(finding('destination-official', -15, T('Redirects to a verified official domain', 'يعيد التوجيه إلى نطاق رسمي موثّق'), T(`The link ends on ${finalReg}, a verified official domain.`, `ينتهي الرابط على ${finalReg}، وهو نطاق رسمي موثّق.`), `${startReg} → ${finalReg}`, 'rule'));
        } else if (w >= 25) {
          findings.push(finding('destination-suspicious', Math.min(45, w), T('Hidden destination is suspicious', 'الوجهة المخفية مريبة'), T(`The link redirects to ${finalReg}, which itself shows phishing indicators: ${r.findings.filter((x) => x.weight > 0).map((x) => x.title.en).slice(0, 3).join(', ')}.`, `يعيد الرابط التوجيه إلى ${finalReg}، الذي يُظهر بدوره مؤشرات تصيّد: ${r.findings.filter((x) => x.weight > 0).map((x) => x.title.ar).slice(0, 3).join('، ')}.`), `${startReg} → ${finalReg}`, 'rule'));
        }
      }
    }
  }
  if (fr.status) facts.push(fact('http-status', 'HTTP status', 'حالة HTTP', String(fr.status) + (fr.server ? ` · server: ${fr.server}` : ''), src, undefined, now));
  if (fr.title) facts.push(fact('page-title', 'Page title (as served)', 'عنوان الصفحة (كما ورد)', fr.title.slice(0, 120), src, undefined, now));
  if (fr.cert) {
    if (fr.cert.valid) {
      facts.push(fact('tls-cert', 'HTTPS certificate', 'شهادة HTTPS', `${fr.cert.issuer ?? 'issuer unknown'} · valid ${fr.cert.validFrom?.slice(0, 10) ?? '?'} → ${fr.cert.validTo?.slice(0, 10) ?? '?'}`, src, undefined, now));
    } else {
      findings.push(finding('tls-invalid', 20, T('Invalid HTTPS certificate', 'شهادة HTTPS غير صالحة'), T('The site\'s certificate failed validation (expired, self-signed or issued for another name).', 'فشل التحقق من شهادة الموقع (منتهية أو موقّعة ذاتياً أو صادرة لاسم آخر).'), fr.cert.error, 'live'));
    }
  }
  const official = fr.finalUrl ? OFFICIAL_DOMAINS.has(registeredDomain(new URL(fr.finalUrl).hostname)) : false;
  if (!official && (fr.hasPasswordField || fr.hasCardField)) {
    findings.push(finding('collects-credentials', 20, T(fr.hasCardField ? 'Page asks for card details' : 'Page has a password field', fr.hasCardField ? 'الصفحة تطلب بيانات البطاقة' : 'الصفحة تحتوي حقل كلمة مرور'), T('The page served by this link contains a form that collects credentials or payment card data on a non-official domain.', 'الصفحة التي يقدّمها هذا الرابط تحتوي نموذجاً يجمع بيانات الدخول أو البطاقة على نطاق غير رسمي.'), fr.finalUrl?.slice(0, 120), 'live'));
  }
}

function researchFindings(sources: WebSource[], mentions: string[], findings: Finding[], label: string) {
  const ms = mentions.map((m) => m.toLowerCase()).filter((m) => m.length >= 4);
  const warnings = sources.filter((x) => x.kind === 'warning' && ms.some((m) => `${x.title} ${x.snippet} ${x.url}`.toLowerCase().includes(m)));
  if (warnings.length) {
    findings.push(finding('public-warnings', warnings.length >= 2 ? 30 : 20, T('Public scam reports mention this ' + label, 'بلاغات احتيال علنية تذكر هذا ' + (label === 'domain' ? 'النطاق' : label === 'number' ? 'الرقم' : 'الحساب')), T(`${warnings.length} public source(s) mention it together with scam or fraud wording. See the cited sources.`, `${warnings.length} مصدر/مصادر علنية تذكره مع كلمات احتيال أو نصب. راجع المصادر المذكورة.`), warnings.map((w) => w.domain).slice(0, 3).join(', '), 'research'));
  }
}

const label = (id: string, en: string, ar: string, state: CheckStatus['state'], noteEn?: string, noteAr?: string): CheckStatus => ({ id, label: T(en, ar), state, note: noteEn ? T(noteEn, noteAr ?? noteEn) : undefined });

export async function runPipeline(req: AnalyzeRequest): Promise<Report | null> {
  const base = baseReport(req);
  if (!base) return null;
  const facts: Fact[] = [];
  const findings: Finding[] = [...base.findings];
  const sources: WebSource[] = [];
  const checks: CheckStatus[] = [];
  const tasks: Promise<void>[] = [];

  // ---------- collect targets ----------
  const urls: string[] = [];
  let senderDomain: string | undefined;
  const phones: string[] = [];
  if (req.kind === 'url') urls.push(req.text!);
  if (req.kind === 'email') {
    const ranked = extractUrls(req.text!).map((u) => ({ u, r: checkUrl(u) })).filter((x) => x.r).sort((a, b) => urlRiskWeight(b.r!) - urlRiskWeight(a.r!));
    urls.push(...ranked.slice(0, 2).map((x) => x.u));
    const from = req.text!.match(/^From:.*?@([a-z0-9.-]+\.[a-z]{2,})/im)?.[1];
    if (from) senderDomain = registeredDomain(from.toLowerCase());
    phones.push(...extractPhones(req.text!).filter((p) => ['mobile', 'international', 'landline', 'tollfree'].includes(classifyUaePhone(p).type)).slice(0, 1));
  }
  if (req.kind === 'business') {
    if (req.business!.website) urls.push(req.business!.website);
    if (req.business!.phone) phones.push(req.business!.phone);
    else phones.push(...extractPhones(req.business!.adText ?? '').slice(0, 1));
  }
  if (req.kind === 'social' && req.social!.message) urls.push(...extractUrls(req.social!.message).slice(0, 1));

  const primaryUrl = urls[0] ? parseUrl(urls[0]) : null;
  const primaryReg = primaryUrl ? registeredDomain(primaryUrl.url.hostname) : undefined;
  const domains = [...new Set(urls.map((u) => parseUrl(u)).filter(Boolean).map((p) => registeredDomain(p!.url.hostname)).filter((d) => d && !URL_SHORTENERS.has(d) && /\./.test(d) && !/^\d+\./.test(d)))].slice(0, 2);

  // ---------- live technical checks ----------
  if (req.options.live && (domains.length || senderDomain || primaryUrl)) {
    if (domains.length) {
      tasks.push(
        Promise.all(domains.map((d) => rdapLookup(d))).then((rs) => {
          rs.forEach((r, i) => rdapToEvidence(r, facts, findings, i === 0));
          const answered = rs.filter((r) => r.ok || r.error === 'not-found').length;
          const unsupported = rs.every((r) => r.error === 'unsupported');
          const notFound = rs.some((r) => r.error === 'not-found');
          checks.push(
            label(
              'rdap', 'Domain registration (RDAP)', 'تسجيل النطاق (RDAP)',
              answered ? 'done' : unsupported ? 'unavailable' : 'failed',
              unsupported ? `The registry for ".${domains[0].split('.').pop()}" does not publish RDAP data.` : notFound ? 'The registry reports the domain is not registered.' : answered ? undefined : 'Registry lookup failed.',
              unsupported ? `سجل الامتداد ".${domains[0].split('.').pop()}" لا ينشر بيانات RDAP.` : notFound ? 'يفيد السجل بأن النطاق غير مسجّل.' : answered ? undefined : 'فشل الاستعلام من السجل.',
            ),
          );
        }),
      );
      tasks.push(
        Promise.all(domains.map((d) => dnsLookup(d))).then((ds) => {
          ds.forEach((d, i) => dnsToEvidence(d, facts, findings, i === 0));
          checks.push(label('dns', 'DNS records & hosting', 'سجلات DNS والاستضافة', 'done'));
        }),
      );
    }
    if (senderDomain) {
      tasks.push(
        dnsLookup(senderDomain).then((d) => {
          dnsToEvidence(d, facts, findings, false, true);
          checks.push(label('sender-dns', 'Sender SPF / DMARC', 'SPF / DMARC للمرسل', 'done'));
        }),
      );
    }
    if (primaryUrl && ['http:', 'https:'].includes(primaryUrl.url.protocol)) {
      // Fetch only the primary link (URL checks) or shortened links in messages (to reveal the destination).
      const isShort = URL_SHORTENERS.has(registeredDomain(primaryUrl.url.hostname)) || URL_SHORTENERS.has(primaryUrl.url.hostname);
      if (req.kind === 'url' || isShort || req.kind === 'business') {
        tasks.push(
          safeFetch(primaryUrl.url.href).then((fr) => {
            fetchToEvidence(fr, primaryReg ?? '', facts, findings);
            checks.push(label('fetch', 'Safe redirect & HTTPS inspection', 'فحص آمن لإعادة التوجيه وHTTPS', fr.ok ? 'done' : fr.blocked ? 'skipped' : 'failed', fr.blocked ? `Not opened for safety: ${fr.blocked}.` : fr.ok ? undefined : `Site could not be reached (${fr.error ?? 'error'}).`, fr.blocked ? `لم يُفتح حفاظاً على الأمان: ${fr.blocked}.` : fr.ok ? undefined : `تعذّر الوصول إلى الموقع (${fr.error ?? 'خطأ'}).`));
          }),
        );
      } else {
        checks.push(label('fetch', 'Safe redirect & HTTPS inspection', 'فحص آمن لإعادة التوجيه وHTTPS', 'skipped', 'Links inside messages are not opened unless they are shortened links.', 'لا تُفتح الروابط داخل الرسائل إلا إذا كانت مختصرة.'));
      }
    }
  } else if (!req.options.live) {
    checks.push(label('live', 'Live technical checks', 'الفحوصات التقنية المباشرة', 'skipped', 'Turned off by the user.', 'أوقفها المستخدم.'));
  }

  // ---------- internet research ----------
  if (req.options.research && researchConfigured()) {
    const queries: { q: string; mentions: string[]; label: string; include?: string[] }[] = [];
    const isOfficial = primaryReg ? OFFICIAL_DOMAINS.has(primaryReg) : false;
    if (primaryReg && !isOfficial && !URL_SHORTENERS.has(primaryReg)) queries.push({ q: `"${primaryReg}" scam OR phishing OR fraud`, mentions: [primaryReg], label: 'domain' });
    const ph = phones[0] ? normalizeDigits(phones[0]).replace(/[^\d+]/g, '') : '';
    if (ph && ph.replace(/\D/g, '').length >= 8) {
      const digits = ph.replace(/\D/g, '');
      queries.push({ q: `"${ph}" scam OR fraud UAE`, mentions: [digits.slice(-8), ph], label: 'number' });
    }
    if (req.kind === 'social') queries.push({ q: `"${req.social!.handle.replace(/^@/, '')}" ${req.social!.platform} scam`, mentions: [req.social!.handle.replace(/^@/, '')], label: 'account' });
    if (req.kind === 'business' && req.business!.name.trim() && !base.official?.matches) queries.push({ q: `${req.business!.name.trim()} UAE official website`, mentions: [], label: 'business' });
    // Authority warnings about the detected UAE scam scenario (corroboration with official sources).
    const scen = base.scenarios.find((x) => SCENARIOS.some((y) => y.id === x));
    if (scen && queries.length < 2) {
      const topic: Record<string, string> = {
        'fake-traffic-fine': 'fake traffic fine SMS scam warning UAE police', 'toll-fee': 'fake Salik Darb toll payment SMS scam warning', 'delivery-fee': 'fake delivery fee SMS scam warning UAE Emirates Post',
        'bank-suspension': 'UAE bank account suspended SMS scam warning OTP', 'gov-payment': 'UAE government service payment scam warning', 'vehicle-sale': 'used car deposit scam warning UAE',
        'plate-sale': 'premium number plate sale scam warning UAE', 'fake-payment-confirmation': 'fake payment receipt screenshot scam warning UAE', investment: 'investment scam warning UAE police',
      };
      if (topic[scen]) queries.push({ q: topic[scen], mentions: [], label: 'scenario' });
    }
    const picked = queries.slice(0, 2);
    if (picked.length) {
      tasks.push(
        Promise.all(picked.map((q) => webSearch(q.q, { maxResults: 5, mentions: q.mentions }).then((r) => ({ q, r })))).then((rs) => {
          let ok = 0;
          for (const { q, r } of rs) {
            if (!r.ok) continue;
            ok++;
            // Only keep sources that are relevant: scenario warnings, or results that actually mention the exact target.
            const mentionsTarget = (x: WebSource) => q.mentions.some((m) => m.length >= 4 && `${x.title} ${x.snippet} ${x.url}`.toLowerCase().includes(m.toLowerCase()));
            const add =
              q.label === 'scenario' ? r.results.filter((x) => x.kind !== 'reference' || /scam|fraud|احتيال|warning|تحذير/i.test(x.title + x.snippet)).slice(0, 3)
              : q.label === 'business' ? r.results.slice(0, 4)
              : r.results.filter((x) => x.kind === 'official' || mentionsTarget(x));
            for (const x of add) if (!sources.some((y) => y.url === x.url)) sources.push(x);
            if (q.label === 'domain' || q.label === 'number' || q.label === 'account') researchFindings(r.results, q.mentions, findings, q.label);
            if (q.label === 'scenario' && add.some((x) => x.kind === 'official' || /police|gov|ministry|bank|شرطة/i.test(x.domain + x.title))) {
              findings.push(finding('authority-warning', 5, T('Authorities or banks have warned about this scam type', 'حذّرت جهات رسمية أو بنوك من هذا النوع من الاحتيال'), T('Public warnings describing this exact scam pattern were found. See the cited sources.', 'تم العثور على تحذيرات علنية تصف هذا النمط من الاحتيال. راجع المصادر المذكورة.'), add.map((x) => x.domain).slice(0, 2).join(', '), 'research'));
            }
            if (q.label === 'business') {
              const nameKey = normalizeName(req.business!.name).replace(/\s+/g, '');
              const site = r.results.find((x) => nameKey.length >= 4 && x.domain.replace(/[-.]/g, '').includes(nameKey.slice(0, Math.min(8, nameKey.length))));
              const given = req.business!.website ? registeredDomain(parseUrl(req.business!.website)?.url.hostname ?? '') : '';
              if (site && given && site.domain !== given) {
                findings.push(finding('search-site-differs', 15, T('Search results point to a different website', 'نتائج البحث تشير إلى موقع مختلف'), T(`Public search results associate "${req.business!.name}" with ${site.domain}, not ${given}. Confirm which one is genuine.`, `تربط نتائج البحث "${req.business!.name}" بالموقع ${site.domain} وليس ${given}. تأكد أيهما الحقيقي.`), `${given} vs ${site.domain}`, 'research'));
              } else if (site && given && site.domain === given) {
                findings.push(finding('search-site-matches', -10, T('Website matches public search results', 'الموقع يطابق نتائج البحث العلنية'), T(`Public search results associate this business with ${given}.`, `تربط نتائج البحث العلنية هذا النشاط بالموقع ${given}.`), given, 'research'));
              }
            }
            if (q.label === 'number' && phones[0]) {
              const digits = normalizeDigits(phones[0]).replace(/\D/g, '').slice(-8);
              const onOfficial = r.results.find((x) => x.kind === 'official' && `${x.snippet} ${x.title}`.replace(/\D/g, '').includes(digits));
              if (onOfficial) findings.push(finding('phone-on-official', -15, T('Number appears on an official website', 'الرقم يظهر على موقع رسمي'), T(`This number appears on ${onOfficial.domain}.`, `يظهر هذا الرقم على ${onOfficial.domain}.`), onOfficial.url, 'research'));
            }
          }
          checks.push(
            label(
              'research', 'Internet research (Tavily)', 'البحث على الإنترنت (Tavily)', ok ? 'done' : 'failed',
              ok ? (sources.length ? `${sources.length} relevant public source(s) found.` : 'No public reports mention this target yet (this does not prove it is safe).') : 'Search provider did not respond.',
              ok ? (sources.length ? `تم العثور على ${sources.length} مصدر/مصادر علنية ذات صلة.` : 'لا توجد بلاغات علنية تذكر هذا الهدف بعد (هذا لا يثبت أنه آمن).') : 'لم يستجب مزوّد البحث.',
            ),
          );
        }),
      );
    } else {
      checks.push(label('research', 'Internet research (Tavily)', 'البحث على الإنترنت (Tavily)', 'skipped', isOfficial ? 'Not needed: the domain is a verified official domain.' : 'Nothing specific to research.', isOfficial ? 'غير ضروري: النطاق رسمي موثّق.' : 'لا يوجد عنصر محدد للبحث.'));
    }
  } else {
    checks.push(label('research', 'Internet research (Tavily)', 'البحث على الإنترنت (Tavily)', req.options.research ? 'unavailable' : 'skipped', req.options.research ? 'No research provider is configured on this server.' : 'Turned off by the user.', req.options.research ? 'لا يوجد مزوّد بحث مُعدّ على هذا الخادم.' : 'أوقفه المستخدم.'));
  }

  // Overall deadline so one slow source cannot block the report.
  await Promise.race([Promise.allSettled(tasks), new Promise((r) => setTimeout(r, 14_000))]);

  const liveLabels = new Set([...URL_LIVE_CHECKS, ...EMAIL_LIVE_CHECKS, ...BUSINESS_LIVE_CHECKS, ...SOCIAL_LIVE_CHECKS].map((x) => x.en));
  const ranAny = checks.some((c) => c.state === 'done');
  const report: Report = {
    ...base,
    findings: dedupe(findings),
    facts,
    sources: sources.slice(0, 8),
    checks: [...checks].sort((a, b) => a.id.localeCompare(b.id)),
    unavailableChecks: ranAny ? base.unavailableChecks.filter((u) => !liveLabels.has(u.en)) : base.unavailableChecks,
    live: true,
  };
  const out = rescore(report);
  recordThreat(out).catch(() => undefined);
  return out;
}

function dedupe(f: Finding[]): Finding[] {
  const seen = new Set<string>();
  return f.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}
