import { BRANDS, FREE_HOSTING, GOVERNMENT_SUFFIXES, OFFICIAL_DOMAINS, SUSPICIOUS_TLDS, URL_SHORTENERS, type Brand } from '@/data/brands';
import { deLeet, domainLabel, hostTokens, isIpAddress, levenshtein, parseUrl, privateSplit, publicSuffix, registeredDomain, scriptsOf, subdomainOf, tld, toUnicodeHost } from './domain';
import { buildReport, finding } from './report';
import { T, type Finding, type L, type OfficialComparison, type Report } from './types';

const CREDENTIAL_WORDS = ['login', 'signin', 'sign-in', 'logon', 'verify', 'verification', 'validate', 'account', 'password', 'passcode', 'otp', 'kyc', 'unlock', 'suspend', 'reactivate', 'secure', 'update', 'auth', 'webscr', 'credential', 'wallet'];
const PAYMENT_WORDS = ['pay', 'payment', 'checkout', 'fine', 'fines', 'violation', 'toll', 'fee', 'fees', 'invoice', 'billing', 'refund', 'customs', 'parcel', 'delivery', 'redeliver', 'card', 'tracking', 'shipment', 'reward', 'prize', 'claim', 'gift', 'bonus'];
const RISKY_EXTENSIONS = ['.exe', '.apk', '.scr', '.msi', '.bat', '.cmd', '.js', '.vbs', '.jar', '.iso', '.zip', '.rar', '.7z', '.html', '.htm', '.lnk', '.dmg'];
const TAG_PARAMS = /[?&](e?mail|email_address|user|username|uid|acct|account|token|session|sid|card|otp|phone|mobile|msisdn)=([^&#]{3,})/i;

export const URL_UNAVAILABLE: L[] = [
  T('Threat-intelligence blocklists (e.g. Google Safe Browsing) are not connected', 'قوائم حظر استخبارات التهديدات (مثل Google Safe Browsing) غير متصلة'),
  T('Page content and screenshot analysis (suspicious pages are never rendered or executed)', 'تحليل محتوى الصفحة ولقطة الشاشة (لا يتم عرض الصفحات المشبوهة أو تنفيذها)'),
];

export const URL_LIVE_CHECKS: L[] = [
  T('Domain registration date (RDAP)', 'تاريخ تسجيل النطاق (RDAP)'),
  T('DNS records and hosting', 'سجلات DNS والاستضافة'),
  T('Safe redirect and HTTPS certificate check', 'فحص آمن لإعادة التوجيه وشهادة HTTPS'),
  T('Public web research (scam reports, official sources)', 'بحث علني على الإنترنت (بلاغات احتيال ومصادر رسمية)'),
];

export interface UrlCheckResult {
  findings: Finding[];
  host: string;
  unicodeHost: string;
  registered: string;
  brand?: Brand;
  official?: OfficialComparison;
  scenarios: string[];
}

type BrandHit = { brand: Brand; how: 'label' | 'subdomain' | 'typosquat' | 'homograph' | 'path'; detail: string };

/** Finds a brand referenced by the hostname (not counting its own official domains). */
function brandInHost(host: string, unicodeHost: string, reg: string, label: string, sub: string): BrandHit | undefined {
  const skeleton = deLeet(toUnicodeHost(label));
  const labelTokens = hostTokens(label);
  const subTokens = hostTokens(sub);
  let best: { hit: BrandHit; strength: number } | undefined;
  const consider = (hit: BrandHit, strength: number) => {
    if (!best || strength > best.strength) best = { hit, strength };
  };
  for (const b of BRANDS) {
    if (b.domains.includes(reg)) continue;
    const officialLabels = b.domains.map((d) => domainLabel(d));
    for (const k of b.keywords) {
      if (label.includes(k)) consider({ brand: b, how: 'label', detail: k }, k.length + 10);
      else if (sub.includes(k)) consider({ brand: b, how: 'subdomain', detail: k }, k.length + 5);
      else if (k.length >= 5 && skeleton.includes(k) && skeleton !== label) consider({ brand: b, how: 'typosquat', detail: k }, k.length + 8);
    }
    for (const t of b.tokens) {
      if (labelTokens.includes(t)) consider({ brand: b, how: 'label', detail: t }, t.length + 10);
      else if (subTokens.includes(t)) consider({ brand: b, how: 'subdomain', detail: t }, t.length + 5);
    }
    // Official domain used as a subdomain prefix: "emiratesnbd.com.secure-update.xyz"
    for (const d of b.domains) {
      if (sub && (sub === d || sub.endsWith('.' + d) || sub.includes(d + '.') || sub.startsWith(d))) consider({ brand: b, how: 'subdomain', detail: d }, 40);
    }
    // Look-alike of an official label (character substitution or 1–2 edits).
    for (const o of officialLabels) {
      if (o.length < 4 || label === o) continue;
      if (skeleton === o && label !== o) consider({ brand: b, how: unicodeHost !== host ? 'homograph' : 'typosquat', detail: `${reg} ≈ ${o}` }, 30);
      else {
        const dist = levenshtein(label, o);
        // Short official labels (<= 4 chars) only match via character substitution, never via edit distance.
        if (dist > 0 && dist <= (o.length >= 8 ? 2 : o.length >= 5 ? 1 : 0) && Math.abs(label.length - o.length) <= 2) consider({ brand: b, how: 'typosquat', detail: `${reg} ≈ ${b.domains[0]}` }, 25);
      }
    }
  }
  return best?.hit;
}

/** Core URL checks, reusable by the message, business and social analyzers. */
export function checkUrl(input: string): UrlCheckResult | null {
  const parsed = parseUrl(input);
  if (!parsed) return null;
  const { url, schemeProvided } = parsed;
  const f: Finding[] = [];
  const scenarios: string[] = [];

  if (url.protocol === 'javascript:' || url.protocol === 'data:') {
    f.push(finding('script-scheme', 60, T('Script / data URL', 'رابط برمجي أو بيانات'), T('The link executes code or embeds content directly instead of opening a website.', 'الرابط ينفّذ شيفرة أو يضمّن محتوى مباشرة بدلاً من فتح موقع.'), url.protocol));
    return { findings: f, host: '', unicodeHost: '', registered: '', scenarios };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const unicodeHost = toUnicodeHost(host);
  const pathQuery = (url.pathname + url.search).toLowerCase();
  const freeHost = [...FREE_HOSTING].find((h) => host === h || host.endsWith('.' + h));
  // On free-hosting platforms each subdomain is a separate customer's site, so use the PSL private section.
  const site = freeHost ? privateSplit(host) : { domain: registeredDomain(host), label: domainLabel(host), sub: subdomainOf(host) };
  const reg = site.domain;
  const label = site.label;
  const officialBrand = !freeHost ? OFFICIAL_DOMAINS.get(reg) : undefined;
  const suffix = publicSuffix(host);
  const govSuffix = !officialBrand && GOVERNMENT_SUFFIXES.some((s) => suffix === s || suffix.endsWith('.' + s));
  let official: OfficialComparison | undefined;

  if (officialBrand) {
    f.push(finding('official-domain', -35, T('Matches a verified official domain', 'يطابق نطاقاً رسمياً موثّقاً'), T(`The registered domain belongs to ${officialBrand.name.en} (verified official domain).`, `النطاق المسجّل يعود إلى ${officialBrand.name.ar} (نطاق رسمي موثّق).`), reg));
    official = { brand: officialBrand.name, officialDomains: officialBrand.domains, submitted: reg, matches: true };
  } else if (govSuffix) {
    f.push(finding('gov-suffix', -20, T('UAE government domain suffix', 'امتداد نطاق حكومي إماراتي'), T(`".${suffix}" registrations are restricted to UAE government entities.`, `التسجيل تحت ".${suffix}" مقتصر على الجهات الحكومية الإماراتية.`), reg));
  }

  if (schemeProvided && url.protocol === 'http:') {
    f.push(finding('no-https', 15, T('No encryption (HTTP)', 'اتصال غير مشفّر (HTTP)'), T('Data sent to this page is not encrypted. Legitimate login or payment pages always use HTTPS.', 'البيانات المرسلة إلى هذه الصفحة غير مشفّرة. صفحات الدخول والدفع الموثوقة تستخدم HTTPS دائماً.')));
  }

  if (isIpAddress(host)) {
    f.push(finding('ip-host', 30, T('Raw IP address instead of a domain', 'عنوان IP بدلاً من اسم نطاق'), T('Legitimate services rarely ask users to visit a bare IP address.', 'نادراً ما تطلب الخدمات الموثوقة زيارة عنوان IP مباشرة.'), host));
  }

  if (host.split('.').some((p) => p.startsWith('xn--'))) {
    const scripts = scriptsOf(domainLabel(unicodeHost));
    const mixed = scripts.size > 1 || scripts.has('cyrillic') || scripts.has('greek') || scripts.has('latin-ext');
    f.push(
      mixed
        ? finding('homograph', 35, T('Look-alike Unicode characters (homograph)', 'أحرف يونيكود مشابهة (هجوم الأحرف المتشابهة)'), T(`The domain displays as "${unicodeHost}" but uses non-Latin characters that imitate Latin letters.`, `يظهر النطاق كـ"${unicodeHost}" لكنه يستخدم أحرفاً غير لاتينية تقلّد الأحرف اللاتينية.`), `${host} → ${unicodeHost}`)
        : finding('punycode', 10, T('Internationalized (punycode) domain', 'نطاق بأحرف دولية (Punycode)'), T(`The domain is written in non-Latin script ("${unicodeHost}"). This is legitimate for Arabic domains, but check the spelling carefully.`, `النطاق مكتوب بأحرف غير لاتينية ("${unicodeHost}"). هذا مشروع للنطاقات العربية، لكن تحقق من التهجئة بعناية.`), `${host} → ${unicodeHost}`),
    );
  }

  if (url.username || /https?:\/\/[^/]*@/i.test(input)) {
    f.push(finding('at-symbol', 25, T('"@" trick in the address', 'خدعة "@" في العنوان'), T('Everything before "@" is ignored by the browser; this is used to disguise the real destination.', 'يتجاهل المتصفح كل ما قبل "@"؛ وتُستخدم هذه الخدعة لإخفاء الوجهة الحقيقية.')));
  }

  let brand: Brand | undefined = officialBrand;
  if (!officialBrand && !isIpAddress(host)) {
    const hit = brandInHost(host, unicodeHost, reg, label, site.sub);
    if (hit) {
      brand = hit.brand;
      official = { brand: hit.brand.name, officialDomains: hit.brand.domains, submitted: reg, matches: false };
      const offi = hit.brand.domains.join(', ');
      if (hit.how === 'label') {
        f.push(finding('brand-impersonation', 40, T('Brand impersonation', 'انتحال علامة تجارية'), T(`The domain uses the name "${hit.brand.name.en}" but is not its official domain (${offi}).`, `يستخدم النطاق اسم "${hit.brand.name.ar}" لكنه ليس نطاقها الرسمي (${offi}).`), `${reg} ≠ ${offi}`));
      } else if (hit.how === 'subdomain') {
        f.push(finding('brand-subdomain', 40, T('Deceptive subdomain', 'نطاق فرعي مضلّل'), T(`"${hit.brand.name.en}" appears only in the subdomain. The real owner of this site is "${reg}", not ${offi}.`, `يظهر "${hit.brand.name.ar}" في النطاق الفرعي فقط. المالك الحقيقي لهذا الموقع هو "${reg}" وليس ${offi}.`), host));
      } else if (hit.how === 'homograph') {
        f.push(finding('typosquat', 55, T('Look-alike domain (homograph of an official site)', 'نطاق مشابه (تقليد بصري لموقع رسمي)'), T(`"${unicodeHost}" is visually designed to look like ${offi}.`, `"${unicodeHost}" مصمَّم ليبدو مثل ${offi}.`), hit.detail));
      } else {
        // A look-alike of a verified organization's domain has no legitimate use: High on its own.
        f.push(finding('typosquat', 50, T('Look-alike domain (typosquatting)', 'نطاق مشابه (انتحال بالأخطاء الإملائية)'), T(`"${reg}" closely resembles the official ${offi}.`, `"${reg}" يشبه كثيراً النطاق الرسمي ${offi}.`), hit.detail));
      }
    } else {
      const pathBrand = BRANDS.find((b) => b.keywords.some((k) => k.length >= 5 && pathQuery.includes(k)));
      if (pathBrand) {
        brand = pathBrand;
        official = { brand: pathBrand.name, officialDomains: pathBrand.domains, submitted: reg, matches: false };
        f.push(finding('brand-in-path', 20, T('Brand name used in the link path', 'اسم علامة تجارية في مسار الرابط'), T(`"${pathBrand.name.en}" appears in the path of an unrelated domain (${reg}).`, `يظهر "${pathBrand.name.ar}" في مسار نطاق غير مرتبط بها (${reg}).`), reg));
      }
    }
  }

  if (URL_SHORTENERS.has(reg) || URL_SHORTENERS.has(host)) {
    f.push(finding('shortener', 20, T('URL shortener hides the destination', 'رابط مختصر يُخفي الوجهة'), T('Shortened links conceal where you will actually land. Banks and government entities do not send shortened payment links.', 'الروابط المختصرة تُخفي المكان الذي ستصل إليه فعلياً. البنوك والجهات الحكومية لا ترسل روابط دفع مختصرة.'), host));
  }

  if (freeHost) {
    f.push(finding('free-hosting', 15, T('Free hosting / site-builder domain', 'نطاق استضافة مجانية / منشئ مواقع'), T(`The page is hosted on "${freeHost}", a free platform that anyone can publish on. Official organizations use their own domains.`, `الصفحة مستضافة على "${freeHost}"، وهي منصة مجانية يمكن لأي شخص النشر عليها. الجهات الرسمية تستخدم نطاقاتها الخاصة.`), host));
  }

  const t = tld(host);
  if (!officialBrand && SUSPICIOUS_TLDS.has(t)) {
    f.push(finding('suspicious-tld', 15, T('High-abuse domain extension', 'امتداد نطاق شائع في الاحتيال'), T(`The ".${t}" extension is disproportionately used in scam campaigns (not proof on its own).`, `يُستخدم الامتداد ".${t}" بشكل كبير في حملات الاحتيال (وليس دليلاً بمفرده).`), '.' + t));
  }

  const subCount = site.sub ? site.sub.split('.').length : 0;
  if (subCount >= 3) {
    f.push(finding('many-subdomains', 15, T('Excessive subdomains', 'نطاقات فرعية مفرطة'), T('Long chains of subdomains are used to push the real domain out of view.', 'تُستخدم سلاسل النطاقات الفرعية الطويلة لإخفاء النطاق الحقيقي.'), host));
  }

  const hyphens = (label.match(/-/g) || []).length;
  if (hyphens >= 2) {
    f.push(finding('hyphens', 10, T('Many hyphens in domain', 'عدد كبير من الشرطات في النطاق'), T('Domains like "secure-login-update" are typical of phishing kits.', 'نطاقات مثل "secure-login-update" نموذجية في أدوات التصيّد.'), reg));
  }

  if (/\d{4,}/.test(label) || (label.length >= 12 && !/[aeiou]/.test(label.slice(0, 8)))) {
    f.push(finding('random-domain', 10, T('Random-looking domain', 'نطاق عشوائي المظهر'), T('Auto-generated domain names are common in throwaway scam sites.', 'أسماء النطاقات المولّدة آلياً شائعة في مواقع الاحتيال المؤقتة.'), reg));
  }

  if (!officialBrand && !govSuffix) {
    const hostAndPath = host + ' ' + pathQuery;
    const cred = CREDENTIAL_WORDS.filter((k) => hostAndPath.includes(k));
    const pay = PAYMENT_WORDS.filter((k) => new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(hostAndPath));
    if (cred.length) {
      f.push(finding('credential-words', cred.length >= 2 ? 15 : 8, T('Account / credential wording', 'صياغة تخص الحساب أو بيانات الدخول'), T('The link uses words typical of credential-harvesting pages (login, verify, update…).', 'يستخدم الرابط كلمات نموذجية لصفحات سرقة بيانات الدخول (دخول، تحقق، تحديث…).'), cred.slice(0, 5).join(', ')));
    }
    if (pay.length) {
      f.push(finding('payment-words', brand ? 20 : 10, T('Payment / fee wording', 'صياغة تخص الدفع أو الرسوم'), T('The link points to a payment, fine, toll or delivery-fee page.', 'يشير الرابط إلى صفحة دفع أو مخالفة أو رسوم طريق أو رسوم توصيل.'), pay.slice(0, 5).join(', ')));
      if (brand && !officialBrand) scenarios.push('fake-payment-link');
    }
    if (brand && !officialBrand && cred.length) scenarios.push('credential-phishing');
  }

  const tag = url.search.match(TAG_PARAMS);
  if (tag && !officialBrand) {
    f.push(finding('victim-tag', 10, T('Personalized tracking parameter', 'معامل تتبّع مخصّص'), T('The link carries an identifier for the recipient (email, phone or token), typical of targeted phishing campaigns.', 'يحمل الرابط معرّفاً خاصاً بالمستلم (بريد أو هاتف أو رمز)، وهو نموذجي في حملات التصيّد الموجّهة.'), tag[1]));
  }

  if (url.port && !['80', '443'].includes(url.port)) {
    f.push(finding('port', 15, T('Non-standard port', 'منفذ غير قياسي'), T('Legitimate websites rarely use custom ports.', 'نادراً ما تستخدم المواقع الموثوقة منافذ مخصصة.'), ':' + url.port));
  }

  const path = url.pathname.toLowerCase();
  const ext = RISKY_EXTENSIONS.find((e) => path.endsWith(e));
  if (ext) {
    f.push(finding('risky-download', 30, T('Direct download of a risky file', 'تنزيل مباشر لملف خطير'), T('The link points to a file type commonly used to deliver malware (for example a fake app .apk).', 'يشير الرابط إلى نوع ملف يُستخدم عادةً لنشر البرمجيات الخبيثة (مثل تطبيق مزيّف ‎.apk).'), ext));
  }

  if (/[?&](url|redirect|redirect_uri|next|target|dest|destination|continue|goto|return|returnurl)=(https?|%68%74%74%70|\/\/)/i.test(url.search) || /https?:\/\/.+https?:\/\//i.test(input) || /https?%3a%2f%2f/i.test(url.search)) {
    f.push(finding('redirect', 15, T('Embedded redirect', 'إعادة توجيه مضمّنة'), T('The link forwards to another website, a common way to bypass filters.', 'يعيد الرابط التوجيه إلى موقع آخر، وهي طريقة شائعة لتجاوز أنظمة الحماية.')));
  }

  if (input.length > 150) {
    f.push(finding('long-url', 8, T('Unusually long link', 'رابط طويل بشكل غير معتاد'), T('Very long links are often used to hide the real domain.', 'غالباً ما تُستخدم الروابط الطويلة جداً لإخفاء النطاق الحقيقي.'), `${input.length} chars`));
  }

  return { findings: f, host, unicodeHost, registered: reg, brand, official, scenarios };
}

export function urlRiskWeight(r: UrlCheckResult): number {
  return r.findings.reduce((a, x) => a + x.weight, 0);
}

export function analyzeUrl(input: string): Report | null {
  const res = checkUrl(input);
  if (!res) return null;
  const findings = [...res.findings];
  if (!findings.some((x) => x.weight > 0)) {
    findings.push(finding('no-red-flags', 0, T('No structural red flags', 'لا توجد علامات تحذير هيكلية'), T('The address passed all structural checks. That alone does not prove the site is safe.', 'اجتاز العنوان جميع الفحوصات الهيكلية. هذا وحده لا يثبت أن الموقع آمن.')));
  }
  const recommendations: L[] = [
    T('Type the official website address yourself (or use the official app) instead of clicking links in messages.', 'اكتب عنوان الموقع الرسمي بنفسك (أو استخدم التطبيق الرسمي) بدلاً من النقر على الروابط في الرسائل.'),
    T('Never enter OTP codes, card details or UAE PASS approvals on a page you reached from a link.', 'لا تُدخل رموز التحقق أو بيانات البطاقة أو موافقات الهوية الرقمية في صفحة وصلت إليها عبر رابط.'),
  ];
  if (res.official && !res.official.matches) {
    recommendations.unshift(T(`The official website of ${res.official.brand.en} is ${res.official.officialDomains.join(' / ')}. Go there directly.`, `الموقع الرسمي لـ${res.official.brand.ar} هو ${res.official.officialDomains.join(' / ')}. اذهب إليه مباشرة.`));
  }
  const report = buildReport({
    kind: 'url',
    target: input.trim(),
    findings,
    recommendations,
    unavailableChecks: [...URL_LIVE_CHECKS, ...URL_UNAVAILABLE],
    scenarios: res.scenarios,
    indicators: [
      { label: T('Host', 'المضيف'), value: res.unicodeHost && res.unicodeHost !== res.host ? `${res.host} (${res.unicodeHost})` : res.host || '—' },
      { label: T('Registered domain', 'النطاق المسجّل'), value: res.registered || '—' },
      ...(res.brand ? [{ label: T('Referenced organization', 'الجهة المُشار إليها'), value: res.brand.name.en }] : []),
    ],
  });
  return { ...report, official: res.official };
}
