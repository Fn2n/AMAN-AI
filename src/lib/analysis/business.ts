import { classifyUaePhone, normalizeName, parseUrl, registeredDomain } from './domain';
import { contentFindings, claimedBrandIn } from './email';
import { buildReport, finding } from './report';
import { T, type Finding, type Indicator, type L, type OfficialComparison, type Report } from './types';
import { checkUrl } from './url';

/**
 * Business / listing / advertisement / phone-number check.
 * Deterministic checks only look at what the user submitted. Real-world confirmation comes from the
 * server pipeline (web research + DNS/RDAP on the website). No registry is simulated.
 */
export interface BusinessInput {
  name: string;
  phone?: string;
  website?: string;
  /** Google Maps / listing link (identified only, never fetched). */
  listingUrl?: string;
  /** Advertisement, search-result or listing text the user saw. */
  adText?: string;
  /** Kept for backward compatibility with older forms. */
  license?: string;
}

export const BUSINESS_UNAVAILABLE: L[] = [
  T('Official commercial registry lookup (no authorized registry API is connected)', 'الاستعلام من السجل التجاري الرسمي (لا توجد واجهة سجل رسمية مصرّح بها متصلة)'),
  T('Google Maps / ad-platform data (listing links are identified but not fetched)', 'بيانات خرائط Google ومنصات الإعلانات (يتم التعرّف على الروابط دون جلبها)'),
  T('Phone number ownership (no carrier or registry lookup)', 'ملكية رقم الهاتف (لا يوجد استعلام من المشغّل أو السجل)'),
];
export const BUSINESS_LIVE_CHECKS: L[] = [
  T('Public web research: official website and scam reports', 'بحث علني: الموقع الرسمي وبلاغات الاحتيال'),
  T('Website domain registration date and DNS (RDAP / DNS)', 'تاريخ تسجيل نطاق الموقع وسجلات DNS'),
];

const isMapLink = (u: string) => {
  const p = parseUrl(u);
  if (!p) return false;
  const h = p.url.hostname.toLowerCase();
  return h === 'maps.app.goo.gl' || h === 'g.page' || h === 'maps.google.com' || ((h.endsWith('google.com') || h === 'goo.gl') && p.url.pathname.startsWith('/maps'));
};

export function analyzeBusiness(input: BusinessInput): Report {
  const f: Finding[] = [];
  const indicators: Indicator[] = [];
  const name = input.name.trim();
  const website = input.website?.trim() ?? '';
  const phone = input.phone?.trim() ?? '';
  const listing = input.listingUrl?.trim() ?? '';
  const ad = input.adText?.trim() ?? '';
  const scenarios: string[] = [];
  let official: OfficialComparison | undefined;

  if (name) indicators.push({ label: T('Business name', 'اسم النشاط'), value: name });

  // Claimed identity: is this business name one of the verified organizations?
  const claimed = claimedBrandIn(`${name} ${ad}`);
  if (claimed) {
    indicators.push({ label: T('Claimed organization', 'الجهة المدّعاة'), value: `${claimed.name.en} (${claimed.domains.join(', ')})` });
  }

  // Website
  let webReg = '';
  if (website) {
    const r = checkUrl(website);
    if (!r) {
      f.push(finding('website-invalid', 10, T('Website address is not valid', 'عنوان الموقع غير صالح'), T('The website you were given is not a valid address.', 'عنوان الموقع المقدَّم غير صالح.'), website));
    } else {
      webReg = r.registered;
      indicators.push({ label: T('Website domain', 'نطاق الموقع'), value: webReg });
      const risky = r.findings.filter((x) => x.weight > 0);
      for (const x of risky) f.push({ ...x, id: `website-${x.id}`, title: T(`Website: ${x.title.en}`, `الموقع: ${x.title.ar}`) });
      const ok = r.findings.find((x) => x.id === 'official-domain' || x.id === 'gov-suffix');
      if (ok) f.push({ ...ok, id: `website-${ok.id}` });
      if (claimed) {
        official = { brand: claimed.name, officialDomains: claimed.domains, submitted: webReg, matches: claimed.domains.includes(webReg) };
        if (!official.matches && !risky.some((x) => ['brand-impersonation', 'typosquat', 'brand-subdomain'].includes(x.id))) {
          f.push(finding('website-not-official', 35, T('Website is not the official one', 'الموقع ليس الموقع الرسمي'), T(`${claimed.name.en}'s verified website is ${claimed.domains.join(' / ')}, not ${webReg}.`, `الموقع الموثّق لـ${claimed.name.ar} هو ${claimed.domains.join(' / ')} وليس ${webReg}.`), `${webReg} ≠ ${claimed.domains.join(' / ')}`));
        }
      } else if (name) {
        // Name vs. domain consistency (weak signal, informational).
        const n = normalizeName(name).replace(/\s+/g, '');
        const label = webReg.split('.')[0].replace(/-/g, '');
        if (n.length >= 4 && label.length >= 4 && !label.includes(n.slice(0, 4)) && !n.includes(label.slice(0, 4))) {
          f.push(finding('name-domain-mismatch', 8, T('Website name differs from business name', 'اسم الموقع يختلف عن اسم النشاط'), T('The website domain does not resemble the business name. Confirm it is really theirs.', 'نطاق الموقع لا يشبه اسم النشاط. تأكد أنه يعود إليه فعلاً.'), `${name} / ${webReg}`));
        }
      }
      scenarios.push(...r.scenarios);
    }
  }

  // Phone
  if (phone) {
    const c = classifyUaePhone(phone);
    indicators.push({ label: T('Phone (format)', 'الهاتف (الصيغة)'), value: `${phone} · ${c.type}` });
    if (c.type === 'invalid') {
      f.push(finding('phone-invalid', 10, T('Phone number format is not valid in the UAE', 'صيغة رقم الهاتف غير صالحة في الإمارات'), T('The number does not follow the UAE numbering plan.', 'الرقم لا يتبع خطة الترقيم الإماراتية.'), phone));
    } else if (c.type === 'premium') {
      f.push(finding('phone-premium', 20, T('Premium-rate number', 'رقم بتعرفة مرتفعة'), T('Numbers starting with 900 are premium-rate.', 'الأرقام التي تبدأ بـ900 ذات تعرفة مرتفعة.'), phone));
    } else if ((c.type === 'mobile' || c.type === 'international') && claimed && claimed.category !== 'marketplace') {
      f.push(finding('phone-mobile-official', 25, T('Personal mobile number for an official organization', 'رقم متحرك شخصي لجهة رسمية'), T(`${claimed.name.en} publishes its customer-service numbers on ${claimed.domains[0]}. A ${c.type === 'mobile' ? 'mobile' : 'foreign'} number presented as its hotline is a red flag.`, `تنشر ${claimed.name.ar} أرقام خدمة العملاء على ${claimed.domains[0]}. رقم ${c.type === 'mobile' ? 'متحرك' : 'أجنبي'} يُقدَّم كخط ساخن لها علامة تحذير.`), phone));
      scenarios.push('fake-customer-service');
    } else if (c.type === 'tollfree' || c.type === 'landline') {
      f.push(finding('phone-format-ok', 0, T('Phone format is a UAE landline / toll-free number', 'الرقم أرضي أو مجاني إماراتي'), T('Format only. AMAN cannot confirm who owns the number; compare it with the official website.', 'الصيغة فقط. لا يمكن لأمان تأكيد مالك الرقم؛ قارنه بالموقع الرسمي.'), phone));
    }
  }

  // Map / listing link
  if (listing) {
    if (isMapLink(listing)) {
      indicators.push({ label: T('Listing link', 'رابط الإعلان'), value: listing });
      f.push(finding('maps-listing', 0, T('Map listing identified (not fetched)', 'تم التعرّف على رابط خرائط (لم يُجلب)'), T('Map listings can be created or edited by anyone, and scammers replace phone numbers on them. Always compare the number with the official website.', 'يمكن لأي شخص إنشاء أو تعديل بيانات الخرائط، ويستبدل المحتالون أرقام الهواتف فيها. قارن الرقم دائماً بالموقع الرسمي.'), registeredDomain(parseUrl(listing)!.url.hostname)));
    } else {
      const r = checkUrl(listing);
      if (r) for (const x of r.findings.filter((y) => y.weight > 0)) f.push({ ...x, id: `listing-${x.id}`, title: T(`Listing link: ${x.title.en}`, `رابط الإعلان: ${x.title.ar}`) });
    }
  }

  // Advertisement / search result / listing text
  if (ad) {
    const c = contentFindings(ad);
    f.push(...c.findings.map((x) => ({ ...x, id: `ad-${x.id}` })));
    scenarios.push(...c.scenarios);
    for (const p of c.phones) if (!phone && p.type === 'mobile' && claimed && claimed.category !== 'marketplace') {
      f.push(finding('ad-mobile-official', 20, T('Ad lists a mobile number for an official organization', 'الإعلان يعرض رقماً متحركاً لجهة رسمية'), T('Official customer-service numbers are published on the organization\'s own website.', 'أرقام خدمة العملاء الرسمية منشورة على موقع الجهة نفسها.'), p.raw));
      break;
    }
    if (/sponsored|ad ·|إعلان|ممول/i.test(ad) && claimed) {
      f.push(finding('sponsored-brand', 10, T('Sponsored result using an official name', 'نتيجة ممولة تستخدم اسماً رسمياً'), T('Scammers buy search ads that imitate banks and government services. Prefer the organic result on the official domain.', 'يشتري المحتالون إعلانات بحث تقلّد البنوك والخدمات الحكومية. فضّل النتيجة غير الممولة على النطاق الرسمي.')));
    }
  }

  if (!website && !phone && !ad && !listing) {
    f.push(finding('few-details', 0, T('Only a name was provided', 'تم تقديم الاسم فقط'), T('Add the website, phone number or the ad text you saw for a stronger check.', 'أضف الموقع أو رقم الهاتف أو نص الإعلان الذي رأيته لفحص أقوى.')));
  }
  if (!f.some((x) => x.weight > 0)) {
    f.push(finding('no-red-flags', 0, T('No red flags in the submitted details', 'لا توجد علامات تحذير في البيانات المقدّمة'), T('This is not a confirmation that the business is legitimate.', 'هذا ليس تأكيداً على أن النشاط موثوق.')));
  }

  const recommendations: L[] = [
    T('Find the official website yourself and compare the phone number and payment details with it before paying.', 'ابحث عن الموقع الرسمي بنفسك وقارن رقم الهاتف وبيانات الدفع به قبل الدفع.'),
    T('Pay only to a bank account in the registered company name, never to a personal account.', 'ادفع فقط لحساب بنكي باسم الشركة المسجّلة، وليس لحساب شخصي.'),
    T('For vehicles and premium plates, use AMAN Secure Deal so payment is only released after verification.', 'للمركبات والأرقام المميزة، استخدم أمان للصفقات الآمنة ليتم الإفراج عن الدفع فقط بعد التحقق.'),
  ];
  if (official && !official.matches) recommendations.unshift(T(`${official.brand.en}'s official website is ${official.officialDomains.join(' / ')}.`, `الموقع الرسمي لـ${official.brand.ar} هو ${official.officialDomains.join(' / ')}.`));

  const report = buildReport({
    kind: 'business',
    target: name || website || phone || listing || ad.slice(0, 60),
    findings: f,
    recommendations,
    unavailableChecks: [...BUSINESS_LIVE_CHECKS, ...BUSINESS_UNAVAILABLE],
    indicators,
    scenarios: [...new Set(scenarios)],
  });
  return { ...report, official: official ?? (claimed ? { brand: claimed.name, officialDomains: claimed.domains, submitted: webReg, matches: !!webReg && claimed.domains.includes(webReg) } : undefined) };
}
