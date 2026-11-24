import { BRANDS, FREE_EMAIL_PROVIDERS, OFFICIAL_DOMAINS, type Brand } from '@/data/brands';
import { classifyUaePhone, deLeet, extractEmail, extractPhones, extractUrls, levenshtein, registeredDomain } from './domain';
import { buildReport, finding } from './report';
import { T, type Finding, type Indicator, type L, type OfficialComparison, type Report } from './types';
import { checkUrl, urlRiskWeight } from './url';

/** Normalizes Arabic spelling variants so patterns match regardless of hamza/taa-marbuta/yaa forms. */
export function normAr(s: string): string {
  return s
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ً-ْـ]/g, '');
}

const has = (text: string, words: string[]) => words.filter((w) => text.includes(normAr(w)));

export const URGENCY = [
  'urgent', 'immediately', 'within 24 hours', 'within 48 hours', 'within 2 hours', 'act now', 'final notice', 'last warning', 'last reminder',
  'expire', 'suspended', 'will be closed', 'will be blocked', 'limited time', 'today only', 'asap', 'avoid penalty', 'before it is too late',
  'عاجل', 'فورا', 'فوراً', 'خلال 24 ساعة', 'خلال ٢٤ ساعة', 'إشعار نهائي', 'تحذير أخير', 'سيتم إيقاف', 'سيتم تعليق', 'سيتم إغلاق', 'سيتم حظر', 'لفترة محدودة', 'آخر فرصة', 'تجنب الغرامة', 'اليوم فقط',
];
export const CREDENTIALS = [
  'password', 'otp', 'one-time', 'one time password', 'verification code', 'pin code', 'your pin', 'cvv', 'card number', 'card details', 'login details',
  'confirm your account', 'verify your account', 'verify your identity', 'update your details', 'emirates id number', 'uae pass approval', 'approve the request',
  'كلمة المرور', 'كلمة السر', 'رمز التحقق', 'الرمز السري', 'الرقم السري', 'رقم البطاقة', 'بيانات البطاقة', 'بيانات الدخول', 'تحديث بياناتك', 'تحديث البيانات', 'تأكيد حسابك', 'رقم الهوية', 'رمز otp', 'كود التفعيل',
];
export const LURES = [
  'you have won', 'winner', 'prize', 'lottery', 'congratulations', 'refund', 'cashback', 'inheritance', 'reward', 'free gift', 'bonus', 'unclaimed',
  'compensation', 'customs fee', 'delivery fee', 'parcel is on hold', 'redelivery', 'points will expire',
  'ربحت', 'فزت', 'جائزة', 'مبروك', 'استرداد', 'مكافأة', 'هدية مجانية', 'ميراث', 'رسوم جمركية', 'رسوم التوصيل', 'شحنتك معلقة', 'نقاطك ستنتهي',
];
export const PAYMENT_CHANGE = [
  'new bank account', 'change of bank details', 'updated bank details', 'wire transfer', 'gift card', 'itunes card', 'bitcoin', 'usdt', 'crypto wallet',
  'iban', 'western union', 'transfer the amount', 'personal account',
  'حساب بنكي جديد', 'تغيير البيانات البنكية', 'تحويل بنكي', 'بطاقة هدايا', 'بيتكوين', 'محفظة', 'آيبان', 'حوّل المبلغ', 'حول المبلغ', 'حساب شخصي',
];
/** Generic payment demands (weaker signal than changed / unusual payment channels). */
export const PAY_DEMAND = ['pay now', 'pay the fee', 'send payment', 'pay immediately', 'settle now', 'ادفع الآن', 'ادفع الرسوم', 'سدد الآن', 'ادفع فوراً', 'ادفع فورا'];
export const THREATS = [
  'legal action', 'police case', 'arrest', 'court', 'penalty', 'pay a fine', 'blacklist', 'travel ban', 'account will be terminated',
  'إجراء قانوني', 'القبض', 'المحكمة', 'القائمة السوداء', 'منع من السفر', 'بلاغ جنائي',
];
export const GENERIC_GREETING = ['dear customer', 'dear user', 'dear client', 'dear account holder', 'valued customer', 'dear sir/madam', 'عزيزي العميل', 'عزيزي المستخدم', 'عميلنا العزيز', 'عزيزي المتعامل'];
const RISKY_ATTACHMENTS = ['.exe', '.scr', '.zip', '.rar', '.iso', '.html', '.htm', '.js', '.vbs', '.docm', '.xlsm', '.apk', 'enable macros', 'enable content', 'تفعيل وحدات الماكرو', 'حمّل التطبيق', 'download the app'];

/** UAE fraud scenarios: each requires ALL groups to match (EN or AR). */
export const SCENARIOS: { id: string; weight: number; title: L; detail: L; groups: string[][] }[] = [
  {
    id: 'fake-traffic-fine', weight: 25,
    title: T('Fake traffic fine pattern', 'نمط مخالفة مرورية مزيّفة'),
    detail: T('Unsolicited "pay your traffic fine" messages with a link are a common UAE scam. Fines are checked and paid only in the official police, MOI, TAMM or RTA apps.', 'رسائل "ادفع مخالفتك المرورية" غير المطلوبة مع رابط احتيال شائع في الإمارات. يتم الاستعلام عن المخالفات ودفعها فقط عبر تطبيقات الشرطة أو وزارة الداخلية أو تم أو هيئة الطرق الرسمية.'),
    groups: [['traffic fine', 'traffic violation', 'fine', 'violation', 'مخالفه', 'مخالفات', 'غرامه'], ['pay', 'payment', 'settle', 'link', 'ادفع', 'سداد', 'دفع', 'الرابط'], ['police', 'traffic', 'moi', 'rta', 'radar', 'شرطه', 'المرور', 'مروريه', 'رادار', 'الداخليه']],
  },
  {
    id: 'toll-fee', weight: 25,
    title: T('Fake toll (Salik / Darb) payment pattern', 'نمط دفع رسوم طرق مزيّف (سالك / درب)'),
    detail: T('Messages claiming unpaid Salik or Darb tolls with a payment link are a known scam. Check your balance only in the official app or website.', 'الرسائل التي تدّعي وجود رسوم سالك أو درب غير مدفوعة مع رابط دفع احتيال معروف. تحقق من رصيدك عبر التطبيق أو الموقع الرسمي فقط.'),
    groups: [['salik', 'darb', 'toll', 'سالك', 'درب', 'بوابات'], ['unpaid', 'balance', 'outstanding', 'overdue', 'top up', 'غير مدفوعه', 'رصيد', 'مستحقه', 'متاخره'], ['pay', 'link', 'click', 'ادفع', 'الرابط', 'اضغط', 'سداد']],
  },
  {
    id: 'delivery-fee', weight: 25,
    title: T('Fake delivery / customs fee pattern', 'نمط رسوم توصيل أو جمارك مزيّفة'),
    detail: T('"Your parcel is on hold, pay a small fee" messages impersonate Emirates Post, Aramex and other couriers to steal card details.', 'رسائل "شحنتك معلقة، ادفع رسوماً بسيطة" تنتحل بريد الإمارات وأرامكس وشركات الشحن لسرقة بيانات البطاقة.'),
    groups: [['parcel', 'package', 'shipment', 'delivery', 'courier', 'شحنه', 'طرد', 'الشحنه', 'التوصيل'], ['fee', 'customs', 'redeliver', 'on hold', 'unpaid', 'رسوم', 'جمركيه', 'معلقه', 'اعاده التوصيل']],
  },
  {
    id: 'bank-suspension', weight: 25,
    title: T('Bank account / card suspension pattern', 'نمط إيقاف الحساب أو البطاقة البنكية'),
    detail: T('Threats that your account or card is blocked unless you "verify" are a classic banking scam. Banks never ask for OTPs or card details by message.', 'التهديد بإيقاف حسابك أو بطاقتك ما لم "تتحقق" احتيال بنكي تقليدي. البنوك لا تطلب رموز التحقق أو بيانات البطاقة عبر الرسائل.'),
    groups: [['account', 'card', 'bank', 'حساب', 'بطاقه', 'البنك', 'بنك'], ['suspended', 'blocked', 'frozen', 'deactivated', 'locked', 'restricted', 'will be closed', 'موقوف', 'ايقاف', 'تجميد', 'حظر', 'تعليق', 'مقفل', 'مجمد']],
  },
  {
    id: 'gov-payment', weight: 20,
    title: T('Government service payment request', 'طلب دفع لخدمة حكومية'),
    detail: T('Messages asking you to pay for visas, Emirates ID, UAE PASS or other government services through a link are a common impersonation scam. Use only the official government apps.', 'الرسائل التي تطلب الدفع مقابل التأشيرة أو الهوية أو الهوية الرقمية أو خدمات حكومية أخرى عبر رابط انتحال شائع. استخدم التطبيقات الحكومية الرسمية فقط.'),
    groups: [['uae pass', 'uaepass', 'emirates id', 'visa', 'icp', 'tamm', 'government', 'ministry', 'الهويه', 'تاشيره', 'الاقامه', 'حكومي', 'وزاره', 'الهويه الرقميه'], ['pay', 'fee', 'payment', 'renew', 'ادفع', 'رسوم', 'سداد', 'تجديد']],
  },
  {
    id: 'vehicle-sale', weight: 25,
    title: T('Vehicle sale scam pattern', 'نمط احتيال بيع مركبة'),
    detail: T('Cheap cars with a story (owner abroad, urgent sale) and a deposit or shipping fee before viewing are a common vehicle scam. Never pay before inspecting the car and its ownership documents.', 'السيارات الرخيصة مع قصة (المالك مسافر، بيع مستعجل) وطلب عربون أو رسوم شحن قبل المعاينة احتيال شائع. لا تدفع قبل معاينة السيارة ووثائق ملكيتها.'),
    groups: [['car', 'vehicle', 'land cruiser', 'patrol', 'سياره', 'مركبه', 'سيارات'], ['deposit', 'booking fee', 'advance', 'shipping', 'transfer first', 'pay first', 'عربون', 'دفعه مقدمه', 'رسوم شحن', 'رسوم الشحن', 'حول', 'حوّل']],
  },
  {
    id: 'plate-sale', weight: 25,
    title: T('Premium plate sale scam pattern', 'نمط احتيال بيع رقم مميز'),
    detail: T('Premium plate offers that ask for a deposit or transfer before an official ownership transfer are a known scam. Plate transfers happen through the licensing authority, never by advance payment to an individual.', 'عروض الأرقام المميزة التي تطلب عربوناً أو تحويلاً قبل نقل الملكية الرسمي احتيال معروف. يتم نقل الأرقام عبر جهة الترخيص، وليس بدفع مقدم لشخص.'),
    groups: [['plate', 'number plate', 'vip number', 'special number', 'لوحه', 'رقم مميز', 'ارقام مميزه', 'الرقم المميز'], ['deposit', 'transfer', 'advance', 'pay', 'عربون', 'تحويل', 'دفعه', 'ادفع', 'حول']],
  },
  {
    id: 'fake-payment-confirmation', weight: 25,
    title: T('Payment-confirmation pressure', 'ضغط بإثبات دفع'),
    detail: T('Screenshots or "transfer receipts" can be faked. Never hand over a vehicle, a plate or any item until the money is confirmed in your own bank account.', 'يمكن تزوير لقطات الشاشة أو "إيصالات التحويل". لا تسلّم مركبة أو رقماً أو أي غرض حتى يتأكد وصول المبلغ إلى حسابك البنكي.'),
    groups: [['payment confirmation', 'transfer receipt', 'proof of payment', 'screenshot', 'i have transferred', 'payment sent', 'ايصال', 'تم التحويل', 'اثبات الدفع', 'صوره التحويل', 'حولت المبلغ'], ['release', 'send', 'ship', 'hand over', 'deliver', 'transfer ownership', 'سلم', 'ارسل', 'اشحن', 'انقل الملكيه', 'تسليم']],
  },
  {
    id: 'investment', weight: 25,
    title: T('Investment / crypto pitch', 'عرض استثمار أو عملات رقمية'),
    detail: T('Promises of guaranteed or daily profit are the core of investment scams.', 'وعود الأرباح المضمونة أو اليومية هي جوهر احتيال الاستثمار.'),
    groups: [['guaranteed', 'daily profit', 'profit daily', 'double your', 'investment plan', 'trading signals', 'ارباح مضمونه', 'ربح يومي', 'ضاعف', 'استثمار مضمون'], ['invest', 'crypto', 'usdt', 'bitcoin', 'forex', 'deposit', 'استثمار', 'عملات رقميه', 'تداول', 'ايداع']],
  },
];

/** Advance payment before seeing the item (specific phrases only, so "salary deposit" does not match). */
const ADVANCE = ['booking fee', 'reservation fee', 'pay a deposit', 'pay deposit', 'deposit before', 'deposit first', 'advance payment', 'pay first', 'transfer first', 'shipping fee', 'will be shipped', 'pay the shipping', 'عربون', 'دفعة مقدمة', 'دفعه مقدمه', 'رسوم حجز', 'رسوم الحجز', 'رسوم شحن', 'رسوم الشحن', 'حول اولا', 'حوّل أولاً'];
/** The classic "absent / hurried seller" story used to justify skipping inspection. */
const STORY = ['travelling abroad', 'traveling abroad', 'owner abroad', 'leaving the country', 'relocating abroad', 'urgent sale', 'below market', 'half price', 'مسافر', 'مغادر الدوله', 'بيع مستعجل', 'نصف السعر', 'اقل من سعر السوق'];

const SERVICE_WORDS = ['customer service', 'customer care', 'support', 'hotline', 'helpline', 'call center', 'call us', 'contact us', 'call', 'whatsapp us', 'خدمه العملاء', 'الدعم', 'اتصل', 'تواصل', 'مركز الاتصال', 'الخط الساخن'];

export const EMAIL_UNAVAILABLE: L[] = [
  T('Attachment sandbox / antivirus scanning', 'فحص المرفقات في بيئة معزولة / مكافحة الفيروسات'),
  T('Carrier-level SMS sender verification', 'التحقق من مرسل الرسائل النصية لدى المشغّل'),
];
export const EMAIL_LIVE_CHECKS: L[] = [
  T('Sender domain SPF / DMARC DNS records', 'سجلات SPF / DMARC لنطاق المرسل'),
  T('Registration date of linked domains (RDAP)', 'تاريخ تسجيل النطاقات المرتبطة (RDAP)'),
  T('Public web research on phone numbers and domains', 'بحث علني عن أرقام الهواتف والنطاقات'),
];

function header(text: string, name: string): string | null {
  const m = text.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'));
  return m ? m[1].trim() : null;
}

/** Organization claimed in free text (names, keywords, Arabic names). Longest match wins. */
export function claimedBrandIn(text: string): Brand | undefined {
  const n = normAr(text);
  let best: { b: Brand; len: number } | undefined;
  for (const b of BRANDS) {
    const cands = [b.name.en.toLowerCase(), ...b.keywords, ...b.ar.map(normAr)];
    for (const c of cands) {
      if (c.length >= 4 && n.includes(normAr(c)) && (!best || c.length > best.len)) best = { b, len: c.length };
    }
    for (const t of b.tokens) {
      if (t.length >= 3 && new RegExp(`(^|[^a-z])${t}([^a-z]|$)`).test(n) && (!best || t.length > best.len)) best = { b, len: t.length };
    }
  }
  return best?.b;
}

export function detectScenarios(text: string): { id: string; weight: number; title: L; detail: L; matched: string[] }[] {
  const n = normAr(text);
  const out: { id: string; weight: number; title: L; detail: L; matched: string[] }[] = [];
  for (const s of SCENARIOS) {
    const matched: string[] = [];
    let all = true;
    for (const g of s.groups) {
      const hit = g.find((w) => n.includes(normAr(w)));
      if (!hit) { all = false; break; }
      matched.push(hit);
    }
    if (all) out.push({ id: s.id, weight: s.weight, title: s.title, detail: s.detail, matched });
  }
  return out;
}

/** Content checks shared by messages, ads/listings and social DMs. */
export function contentFindings(text: string): { findings: Finding[]; scenarios: string[]; brand?: Brand; phones: { raw: string; type: string }[] } {
  const n = normAr(text);
  const f: Finding[] = [];

  const urgency = has(n, URGENCY);
  if (urgency.length) f.push(finding('urgency', urgency.length > 1 ? 15 : 10, T('Pressure and urgency', 'ضغط واستعجال'), T('Scammers create time pressure so you act before thinking.', 'يخلق المحتالون ضغطاً زمنياً لتتصرف قبل التفكير.'), urgency.slice(0, 4).join(', ')));

  const creds = has(n, CREDENTIALS);
  if (creds.length) f.push(finding('credentials', 30, T('Requests sensitive credentials', 'يطلب بيانات حساسة'), T('Legitimate organizations never ask for passwords, OTP codes, card CVV or UAE PASS approvals by message.', 'الجهات الموثوقة لا تطلب كلمات المرور أو رموز التحقق أو رمز CVV أو موافقات الهوية الرقمية عبر الرسائل.'), creds.slice(0, 4).join(', ')));

  const lures = has(n, LURES);
  if (lures.length) f.push(finding('lure', 15, T('Financial lure', 'إغراء مالي'), T('Unexpected prizes, refunds or small fees to release a parcel are classic bait.', 'الجوائز أو المبالغ المستردة غير المتوقعة أو الرسوم الصغيرة للإفراج عن شحنة طُعم تقليدي.'), lures.slice(0, 4).join(', ')));

  const pay = has(n, PAYMENT_CHANGE);
  if (pay.length) f.push(finding('payment-change', 25, T('Unusual payment instructions', 'تعليمات دفع غير معتادة'), T('Requests to pay a new or personal account, via gift cards or crypto, are hallmarks of fraud.', 'طلبات الدفع إلى حساب جديد أو شخصي أو ببطاقات هدايا أو عملات رقمية من سمات الاحتيال.'), pay.slice(0, 4).join(', ')));

  const demand = has(n, PAY_DEMAND);
  if (demand.length && !pay.length) f.push(finding('payment-demand', 10, T('Demands immediate payment', 'يطالب بالدفع الفوري'), T('Pressure to pay immediately through a message is a common fraud tactic.', 'الضغط للدفع فوراً عبر رسالة أسلوب احتيال شائع.'), demand.slice(0, 3).join(', ')));

  const threats = has(n, THREATS);
  if (threats.length) f.push(finding('threats', 15, T('Threats or intimidation', 'تهديد أو تخويف'), T('Threats of legal action, arrest or travel bans are used to frighten victims.', 'تُستخدم التهديدات بالإجراءات القانونية أو القبض أو المنع من السفر لإخافة الضحايا.'), threats.slice(0, 4).join(', ')));

  const greet = has(n, GENERIC_GREETING);
  if (greet.length) f.push(finding('generic-greeting', 5, T('Generic greeting', 'تحية عامة'), T('Your bank or provider usually addresses you by name.', 'عادةً ما يخاطبك بنكك أو مزوّد الخدمة باسمك.'), greet[0]));

  const att = has(n, RISKY_ATTACHMENTS);
  if (att.length) f.push(finding('attachment', 25, T('Risky attachment or app download', 'مرفق خطير أو تنزيل تطبيق'), T('Executable, archive, APK or HTML files and "enable macros" prompts deliver malware.', 'الملفات التنفيذية أو المضغوطة أو APK أو HTML وطلبات "تفعيل الماكرو" تنشر البرمجيات الخبيثة.'), att.slice(0, 3).join(', ')));

  const adv = has(n, ADVANCE);
  if (adv.length) f.push(finding('advance-payment', 20, T('Asks for payment before you see the item', 'يطلب الدفع قبل معاينة السلعة'), T('Deposits, booking or shipping fees before inspection are the most common marketplace scam.', 'العربون أو رسوم الحجز أو الشحن قبل المعاينة أشهر احتيال في الأسواق الإلكترونية.'), adv.slice(0, 3).join(', ')));
  const story = has(n, STORY);
  if (story.length) f.push(finding('absent-seller', 15, T('"Urgent sale / owner abroad" story', 'قصة "بيع مستعجل / المالك مسافر"'), T('A hurried or absent seller with a price far below market is classic bait to skip inspection.', 'البائع المستعجل أو الغائب مع سعر أقل بكثير من السوق طُعم تقليدي لتجاوز المعاينة.'), story.slice(0, 3).join(', ')));

  const scen = detectScenarios(text);
  for (const s of scen) f.push(finding(`scenario-${s.id}`, s.weight, s.title, s.detail, s.matched.join(' + ')));

  const brand = claimedBrandIn(text);
  const phones = extractPhones(text).slice(0, 5).map((raw) => ({ raw, type: classifyUaePhone(raw).type }));
  const svc = has(n, SERVICE_WORDS);
  if (brand && svc.length && phones.some((p) => p.type === 'mobile' || p.type === 'international')) {
    const p = phones.find((x) => x.type === 'mobile' || x.type === 'international')!;
    f.push(finding('mobile-service-number', 25, T('"Customer service" on a personal mobile number', '"خدمة عملاء" على رقم هاتف متحرك شخصي'), T(`The message presents ${brand.name.en} customer service on a ${p.type === 'mobile' ? 'personal mobile' : 'foreign'} number. Official organizations publish landline or toll-free numbers on their official website.`, `تقدّم الرسالة خدمة عملاء ${brand.name.ar} على رقم ${p.type === 'mobile' ? 'متحرك شخصي' : 'أجنبي'}. الجهات الرسمية تنشر أرقاماً أرضية أو مجانية على موقعها الرسمي.`), p.raw));
    if (!scen.some((s) => s.id === 'fake-customer-service')) scen.push({ id: 'fake-customer-service', weight: 0, title: T('', ''), detail: T('', ''), matched: [] });
  }
  if (phones.some((p) => p.type === 'premium')) {
    f.push(finding('premium-number', 20, T('Premium-rate number', 'رقم بتعرفة مرتفعة'), T('Numbers starting with 900 are premium-rate. Calling them can be expensive.', 'الأرقام التي تبدأ بـ900 ذات تعرفة مرتفعة. الاتصال بها قد يكون مكلفاً.'), phones.find((p) => p.type === 'premium')!.raw));
  }

  return { findings: f, scenarios: scen.map((s) => s.id), brand, phones };
}

export function analyzeEmail(raw: string): Report {
  const text = raw.trim();
  const f: Finding[] = [];
  const indicators: Indicator[] = [];

  const fromH = header(text, 'From');
  const replyH = header(text, 'Reply-To');
  const returnH = header(text, 'Return-Path');
  const subject = header(text, 'Subject');
  const authH = [header(text, 'Authentication-Results'), header(text, 'Received-SPF')].filter(Boolean).join(' ').toLowerCase();

  const fromAddr = fromH ? extractEmail(fromH) : null;
  const fromDomain = fromAddr ? fromAddr.split('@')[1] : null;
  const displayName = fromH ? fromH.replace(/<[^>]*>/, '').replace(/["']/g, '').replace(fromAddr ?? '', '').trim() : '';

  if (fromH) indicators.push({ label: T('Sender', 'المرسل'), value: fromH });
  if (subject) indicators.push({ label: T('Subject', 'الموضوع'), value: subject });

  const content = contentFindings(text);
  f.push(...content.findings);
  const scenarios = [...content.scenarios];
  let official: OfficialComparison | undefined;
  if (content.brand) {
    indicators.push({ label: T('Claimed organization', 'الجهة المدّعاة'), value: content.brand.name.en });
  }

  // Sender checks (email headers)
  if (fromDomain) {
    const reg = registeredDomain(fromDomain);
    indicators.push({ label: T('Sender domain', 'نطاق المرسل'), value: reg });
    const claimed = claimedBrandIn(`${displayName} ${subject ?? ''}`) ?? content.brand;
    const regBrand = OFFICIAL_DOMAINS.get(reg);
    if (claimed) official = { brand: claimed.name, officialDomains: claimed.domains, submitted: reg, matches: claimed.domains.includes(reg) };
    if (claimed && !claimed.domains.includes(reg)) {
      f.push(finding('display-name-spoof', 35, T('Sender does not match the claimed organization', 'المرسل لا يطابق الجهة المدّعاة'), T(`The message claims to be from "${claimed.name.en}" but was sent from "${reg}" (official: ${claimed.domains.join(', ')}).`, `تدّعي الرسالة أنها من "${claimed.name.ar}" لكنها أُرسلت من "${reg}" (الرسمي: ${claimed.domains.join(', ')}).`), fromAddr ?? ''));
    }
    if (FREE_EMAIL_PROVIDERS.has(reg) && /(bank|police|support|service|security|team|official|ministry|customs|post|delivery|بنك|شرطة|دعم|خدمة|وزارة|بريد)/i.test(displayName + ' ' + (subject ?? ''))) {
      f.push(finding('free-provider', 20, T('Organization using a free email account', 'جهة تستخدم بريداً مجانياً'), T('Banks, government entities and companies do not send official notices from free webmail.', 'البنوك والجهات الحكومية والشركات لا ترسل إشعارات رسمية من بريد مجاني.'), reg));
    }
    if (!regBrand && !f.some((x) => x.id === 'display-name-spoof')) {
      const label = reg.split('.')[0];
      for (const b of BRANDS) {
        const hit = b.domains.find((d) => {
          const o = d.split('.')[0];
          return o.length >= 5 && label !== o && (deLeet(label) === o || levenshtein(label, o) <= (o.length >= 8 ? 2 : 1));
        }) ?? (b.keywords.some((k) => label.includes(k) || deLeet(label).includes(k)) ? b.domains[0] : undefined);
        if (hit) {
          f.push(finding('lookalike-sender', 35, T('Look-alike sender domain', 'نطاق مرسل مشابه'), T(`The sender domain imitates "${hit}".`, `نطاق المرسل يقلّد "${hit}".`), `${reg} ≈ ${hit}`));
          break;
        }
      }
    } else if (regBrand && !f.some((x) => x.id === 'display-name-spoof')) {
      f.push(finding('official-sender', -10, T('Sender domain is official', 'نطاق المرسل رسمي'), T('The From domain belongs to a verified organization. Headers can still be forged, so check the authentication results.', 'نطاق المرسل يعود لجهة موثّقة. يمكن تزوير الترويسات، لذا تحقق من نتائج المصادقة.'), reg));
    }
    if (replyH) {
      const replyAddr = extractEmail(replyH);
      if (replyAddr && registeredDomain(replyAddr.split('@')[1]) !== reg) {
        f.push(finding('reply-to-mismatch', 25, T('Reply-To goes elsewhere', 'الرد يذهب لعنوان مختلف'), T('Replies are redirected to a different domain than the sender, common in fraud and invoice scams.', 'يتم توجيه الردود إلى نطاق مختلف عن المرسل، وهو شائع في احتيال الفواتير.'), replyAddr));
      }
    }
    if (returnH) {
      const rp = extractEmail(returnH);
      if (rp && registeredDomain(rp.split('@')[1]) !== reg) {
        f.push(finding('return-path-mismatch', 10, T('Return-Path differs from sender', 'مسار الإرجاع يختلف عن المرسل'), T('The technical sending address differs from the visible sender.', 'عنوان الإرسال التقني يختلف عن المرسل الظاهر.'), rp));
      }
    }
  } else if (content.brand) {
    official = { brand: content.brand.name, officialDomains: content.brand.domains, submitted: '', matches: false };
  }

  if (authH) {
    const fails = ['spf=fail', 'spf=softfail', 'dkim=fail', 'dmarc=fail'].filter((k) => authH.includes(k));
    if (fails.length) {
      f.push(finding('auth-fail', 30, T('Email authentication failed', 'فشل مصادقة البريد'), T('SPF/DKIM/DMARC results in the headers report a failure: the sender is likely forged.', 'تشير نتائج SPF/DKIM/DMARC في الترويسات إلى فشل: المرسل غالباً مزوّر.'), fails[0]));
    } else if (/spf=pass/.test(authH) && /dkim=pass/.test(authH)) {
      f.push(finding('auth-pass', -10, T('Email authentication passed', 'نجحت مصادقة البريد'), T('SPF and DKIM passed for the sending domain.', 'نجح فحص SPF و DKIM لنطاق المرسل.')));
    }
  }

  // Anchor text mismatch: <a href="X">Y</a> where Y is a different domain
  const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(text))) {
    const shown = m[2].trim();
    if (/^(https?:\/\/|www\.)/i.test(shown)) {
      const a = checkUrl(m[1]);
      const b = checkUrl(shown);
      if (a && b && a.registered && b.registered && a.registered !== b.registered) {
        f.push(finding('link-mismatch', 35, T('Link text hides a different destination', 'نص الرابط يُخفي وجهة مختلفة'), T('The visible link text shows one website but actually opens another.', 'نص الرابط الظاهر يعرض موقعاً لكنه يفتح موقعاً آخر.'), `${b.registered} → ${a.registered}`));
        break;
      }
    }
  }

  // Links
  const urls = extractUrls(text);
  if (urls.length) {
    indicators.push({ label: T('Links found', 'الروابط المكتشفة'), value: urls.slice(0, 3).join(' · ') + (urls.length > 3 ? ` (+${urls.length - 3})` : '') });
    let worst: { url: string; score: number; reasons: string[]; official: boolean } | null = null;
    for (const u of urls.slice(0, 10)) {
      const r = checkUrl(u);
      if (!r) continue;
      const s = urlRiskWeight(r);
      if (!worst || s > worst.score) worst = { url: u, score: s, reasons: r.findings.filter((x) => x.weight > 0).map((x) => x.id), official: r.findings.some((x) => x.id === 'official-domain') };
      for (const sc of r.scenarios) if (!scenarios.includes(sc)) scenarios.push(sc);
      // Link to a domain that is not the claimed organization's official one
      if (content.brand && r.registered && !content.brand.domains.includes(r.registered) && !r.findings.some((x) => x.id === 'official-domain') && !f.some((x) => x.id === 'link-not-official')) {
        f.push(finding('link-not-official', 25, T('Link is not on the official domain', 'الرابط ليس على النطاق الرسمي'), T(`The message claims to be from ${content.brand.name.en}, but its link goes to "${r.registered}" instead of ${content.brand.domains.join(' / ')}.`, `تدّعي الرسالة أنها من ${content.brand.name.ar}، لكن رابطها يذهب إلى "${r.registered}" بدلاً من ${content.brand.domains.join(' / ')}.`), r.registered));
      }
    }
    if (worst && worst.score >= 40) {
      f.push(finding('malicious-link', 35, T('Dangerous link inside the message', 'رابط خطير داخل الرسالة'), T('At least one link shows strong phishing indicators.', 'رابط واحد على الأقل يُظهر مؤشرات تصيّد قوية.'), `${worst.url} [${worst.reasons.join(', ')}]`));
    } else if (worst && worst.score >= 15) {
      f.push(finding('suspicious-link', 15, T('Suspicious link inside the message', 'رابط مريب داخل الرسالة'), T('A link in the message has warning signs.', 'يحمل أحد الروابط في الرسالة علامات تحذير.'), `${worst.url} [${worst.reasons.join(', ')}]`));
    }
  }
  if (content.phones.length) indicators.push({ label: T('Phone numbers', 'أرقام الهواتف'), value: content.phones.map((p) => `${p.raw} (${p.type})`).join(' · ') });

  if (!f.some((x) => x.weight > 0)) {
    f.push(finding('no-red-flags', 0, T('No common fraud patterns detected', 'لم تُكتشف أنماط احتيال شائعة'), T('The text did not match known phishing or fraud patterns.', 'لم يطابق النص أنماط التصيّد أو الاحتيال المعروفة.')));
  }

  const recommendations: L[] = [
    T('Do not click links or open attachments; go to the official website or app directly.', 'لا تنقر على الروابط ولا تفتح المرفقات؛ اذهب مباشرة إلى الموقع أو التطبيق الرسمي.'),
    T('Never share OTP codes, passwords, card details or UAE PASS approvals. No legitimate organization will ask for them.', 'لا تشارك رموز التحقق أو كلمات المرور أو بيانات البطاقة أو موافقات الهوية الرقمية. لن تطلبها أي جهة موثوقة.'),
  ];
  if (official && !official.matches) {
    recommendations.unshift(T(`Contact ${official.brand.en} only through ${official.officialDomains.join(' / ')} or its official app.`, `تواصل مع ${official.brand.ar} فقط عبر ${official.officialDomains.join(' / ')} أو تطبيقها الرسمي.`));
  }
  if (f.some((x) => x.id === 'payment-change' || x.id === 'reply-to-mismatch')) {
    recommendations.unshift(T('Confirm any change in payment details by calling a known phone number, not one in the message.', 'أكّد أي تغيير في بيانات الدفع بالاتصال برقم معروف، وليس برقم وارد في الرسالة.'));
  }

  const report = buildReport({
    kind: 'email',
    target: subject ?? (fromAddr ?? text.replace(/\s+/g, ' ').slice(0, 70) + (text.length > 70 ? '…' : '')),
    findings: f,
    recommendations,
    unavailableChecks: [...EMAIL_LIVE_CHECKS, ...EMAIL_UNAVAILABLE],
    indicators,
    scenarios,
  });
  return { ...report, official };
}
