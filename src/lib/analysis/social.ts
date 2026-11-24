import { BRANDS } from '@/data/brands';
import { containsAny, deLeet, extractUrls, levenshtein } from './domain';
import { contentFindings } from './email';
import { buildReport, finding } from './report';
import { T, type Finding, type Indicator, type L, type Report } from './types';
import { checkUrl, urlRiskWeight } from './url';

export type Platform = 'instagram' | 'x' | 'facebook' | 'tiktok' | 'whatsapp' | 'telegram' | 'linkedin' | 'snapchat';

export interface SocialInput {
  platform: Platform;
  handle: string;
  displayName?: string;
  followers?: number;
  following?: number;
  posts?: number;
  accountAgeMonths?: number;
  message?: string;
}

export const SOCIAL_UNAVAILABLE: L[] = [
  T('Platform API verification of the account and its badge', 'التحقق من الحساب وشارته عبر واجهة المنصة'),
  T('Actual account creation date and name-change history', 'تاريخ إنشاء الحساب الفعلي وسجل تغيير الاسم'),
  T('Reverse image search of profile photos', 'البحث العكسي عن صور الملف الشخصي'),
];
export const SOCIAL_LIVE_CHECKS: L[] = [T('Public web research on the handle', 'بحث علني عن المعرّف')];

const IMPERSONATION_WORDS = ['support', 'help', 'care', 'official', 'service', 'giveaway', 'promo', 'offers', 'admin', 'refund', 'customer', 'helpdesk', 'team', 'verify', 'rewards'];
const OFF_PLATFORM = ['whatsapp', 'telegram', 'wa.me', 't.me', 'signal', 'dm me', 'inbox me', 'واتساب', 'تيليجرام', 'تواصل خاص', 'راسلني'];

export function analyzeSocial(input: SocialInput): Report {
  const f: Finding[] = [];
  const indicators: Indicator[] = [];
  const handle = input.handle.trim().replace(/^@/, '').toLowerCase();
  const display = input.displayName?.trim() ?? '';
  const msg = input.message?.trim() ?? '';
  const scenarios: string[] = [];

  indicators.push({ label: T('Platform', 'المنصة'), value: input.platform }, { label: T('Handle', 'المعرّف'), value: '@' + handle });

  const exact = BRANDS.find((b) => b.handles.includes(handle));
  if (exact) {
    f.push(finding('known-handle', -10, T('Matches the organization\'s commonly used handle', 'يطابق المعرّف المعتاد للجهة'), T(`This is the handle commonly used by "${exact.name.en}". Handles can be copied on other platforms, so confirm the platform's verified badge and the link from ${exact.domains[0]}.`, `هذا هو المعرّف المعتاد لـ"${exact.name.ar}". يمكن نسخ المعرّفات على منصات أخرى، لذا تأكد من شارة التوثيق والرابط من ${exact.domains[0]}.`), '@' + handle));
  } else {
    const clean = deLeet(handle.replace(/[._-]/g, ''));
    const tokens = handle.split(/[._-]/);
    let imp = BRANDS.find((b) => b.keywords.some((k) => k.length >= 5 && clean.includes(k.replace(/[._-]/g, ''))) || b.tokens.some((t) => t.length >= 3 && tokens.includes(t)));
    if (!imp) imp = BRANDS.find((b) => b.handles.some((h) => h.length >= 5 && levenshtein(clean, h.replace(/[._-]/g, '')) <= 2));
    if (!imp && display) {
      const dl = display.toLowerCase();
      imp = BRANDS.find((b) => dl.includes(b.name.en.toLowerCase()) || b.ar.some((a) => display.includes(a)));
    }
    if (imp) {
      f.push(finding('impersonation', 40, T('Possible impersonation', 'انتحال محتمل'), T(`Uses the name of "${imp.name.en}" but is not a handle it is known to use. Official accounts are linked from ${imp.domains[0]}.`, `يستخدم اسم "${imp.name.ar}" لكنه ليس معرّفاً معروفاً لها. الحسابات الرسمية مرتبطة من ${imp.domains[0]}.`), `@${handle}`));
    }
  }

  const words = IMPERSONATION_WORDS.filter((w) => handle.includes(w));
  if (words.length && !exact) {
    f.push(finding('support-words', 15, T('"Support / official" style handle', 'معرّف بأسلوب "دعم / رسمي"'), T('Fake accounts add words like support, help or official to look legitimate.', 'تضيف الحسابات المزيّفة كلمات مثل دعم أو مساعدة أو رسمي لتبدو موثوقة.'), words.join(', ')));
  }
  if (/\d{4,}/.test(handle)) {
    f.push(finding('digits', 10, T('Many digits in handle', 'أرقام كثيرة في المعرّف'), T('Auto-generated or replacement accounts often carry long number suffixes.', 'غالباً ما تحمل الحسابات المولّدة آلياً أو البديلة لاحقات رقمية طويلة.'), handle));
  }
  if (/[✔✓☑✅]/.test(display)) {
    f.push(finding('fake-badge', 25, T('Fake verification badge in name', 'شارة توثيق مزيّفة في الاسم'), T('A check-mark emoji in the display name is not a real platform badge.', 'رمز علامة الصح في اسم العرض ليس شارة توثيق حقيقية.'), display));
  }

  const { followers, following, posts, accountAgeMonths } = input;
  if (accountAgeMonths !== undefined && !Number.isNaN(accountAgeMonths)) {
    indicators.push({ label: T('Account age (as reported by you)', 'عمر الحساب (كما أدخلته)'), value: `${accountAgeMonths} mo` });
    if (accountAgeMonths < 3) f.push(finding('new-account', 20, T('Very new account', 'حساب جديد جداً'), T('Created less than 3 months ago, typical of scam accounts that get banned and recreated.', 'أُنشئ قبل أقل من 3 أشهر، وهو نموذجي لحسابات الاحتيال التي تُحظر ثم يُعاد إنشاؤها.')));
    else if (accountAgeMonths < 12) f.push(finding('young-account', 8, T('Young account', 'حساب حديث'), T('Less than a year old.', 'عمره أقل من سنة.')));
  }
  if (followers !== undefined && !Number.isNaN(followers)) {
    indicators.push({ label: T('Followers / following', 'المتابِعون / المتابَعون'), value: `${followers} / ${following ?? '—'}` });
    if (followers < 100) f.push(finding('few-followers', 10, T('Very few followers', 'عدد متابعين قليل جداً'), T('Established businesses usually have a real audience.', 'عادةً ما يكون للأنشطة الراسخة جمهور حقيقي.'), String(followers)));
    if (following !== undefined && followers < 1000 && following > followers * 5) f.push(finding('follow-ratio', 10, T('Follows many, followed by few', 'يتابع الكثير ويتابعه القليل'), T('Mass-following is a growth tactic of spam accounts.', 'المتابعة الجماعية أسلوب نمو لحسابات البريد العشوائي.'), `${following}:${followers}`));
    if (posts !== undefined && followers >= 5000 && posts < 10) f.push(finding('bought-followers', 15, T('Large audience, almost no posts', 'جمهور كبير دون منشورات تقريباً'), T('Many followers with very few posts suggests purchased followers.', 'كثرة المتابعين مع قلة المنشورات توحي بشراء متابعين.'), `${followers} / ${posts} posts`));
  }

  if (msg) {
    const c = contentFindings(msg);
    f.push(...c.findings);
    scenarios.push(...c.scenarios);
    const lower = msg.toLowerCase();
    const off = containsAny(lower, OFF_PLATFORM);
    if (off.length) f.push(finding('off-platform', 15, T('Moves conversation off-platform', 'ينقل المحادثة خارج المنصة'), T('Scammers move you to WhatsApp/Telegram to escape platform moderation.', 'ينقلك المحتالون إلى واتساب/تيليجرام للإفلات من رقابة المنصة.'), off.slice(0, 3).join(', ')));
    for (const u of extractUrls(msg).slice(0, 5)) {
      const r = checkUrl(u);
      if (r && urlRiskWeight(r) >= 30) {
        f.push(finding('bad-link', 30, T('Dangerous link in message', 'رابط خطير في الرسالة'), T('A link shared by this account shows phishing indicators.', 'رابط شاركه هذا الحساب يُظهر مؤشرات تصيّد.'), u));
        break;
      }
    }
  }

  if (!f.some((x) => x.weight > 0)) {
    f.push(finding('no-red-flags', 0, T('No strong red flags in the provided details', 'لا توجد علامات تحذير قوية في البيانات المقدّمة'), T('Add the message you received and account metrics for a deeper check.', 'أضف الرسالة التي وصلتك ومقاييس الحساب لفحص أعمق.')));
  }

  return buildReport({
    kind: 'social',
    target: `@${handle} (${input.platform})`,
    findings: f,
    recommendations: [
      T('Reach the organization through the link on its official website, not through search results or DMs.', 'تواصل مع الجهة عبر الرابط في موقعها الرسمي، وليس عبر نتائج البحث أو الرسائل الخاصة.'),
      T('Never pay deposits to individuals; use AMAN Secure Deal for vehicles and premium plates.', 'لا تدفع عربوناً لأفراد؛ استخدم أمان للصفقات الآمنة للمركبات والأرقام المميزة.'),
      T('Report and block impersonating accounts on the platform.', 'أبلغ عن الحسابات المنتحِلة واحظرها على المنصة.'),
    ],
    unavailableChecks: [...SOCIAL_LIVE_CHECKS, ...SOCIAL_UNAVAILABLE],
    indicators,
    scenarios: [...new Set(scenarios)],
  });
}
