import { T, type Finding, type L, type RiskLevel } from '@/lib/analysis/types';
import { classifyUaePhone } from '@/lib/analysis/domain';
import { contentFindings } from '@/lib/analysis/email';
import { finding, levelFromScore, sortFindings } from '@/lib/analysis/report';
import { EMIRATES, ibanValid, isNorthAmericanVin, nameSimilarity, plateFormatValid, premiumPattern, vinCheckDigitValid, vinFormatValid, vinMakes, vinModelYears, type Emirate } from './validators';

/**
 * AMAN Secure Deal: fraud prevention for VEHICLE and PREMIUM PLATE transactions in the UAE.
 * Payment holding, ownership transfer and payment release are SIMULATED. No real money moves and no
 * government registry (RTA, ITC, MOI) or bank is contacted. Every transition below is enforced on the server.
 */

export const SUPPORTED_CATEGORIES = ['vehicle', 'plate'] as const;
export type Category = (typeof SUPPORTED_CATEGORIES)[number];
export type Role = 'buyer' | 'seller' | 'reviewer';

export type DealStatus =
  | 'details_submitted'
  | 'documents_submitted'
  | 'risk_assessed'
  | 'conditions_accepted'
  | 'payment_held'
  | 'transfer_simulated'
  | 'approved'
  | 'completed'
  | 'flagged'
  | 'needs_verification'
  | 'rejected'
  | 'cancelled';

export type Action =
  | 'submit_documents'
  | 'accept_conditions'
  | 'hold_payment'
  | 'confirm_transfer'
  | 'approve'
  | 'release_payment'
  | 'reject'
  | 'cancel'
  | 'flag'
  | 'clear_flag'
  | 'request_verification';

export type TimelineKind = Action | 'create' | 'submit_details' | 'upload' | 'risk_assessment' | 'refund' | 'complete';

export interface Party {
  name: string;
  phone: string;
  email?: string;
}

export interface VehicleDetails {
  make: string;
  model: string;
  year: number;
  vin: string;
  emirate: Emirate;
  /** Name of the registered owner as printed on the registration card (Mulkiya). */
  registeredOwner: string;
  registrationNo?: string;
  plate?: string;
  mileageKm?: number;
}

export interface PlateDetails {
  emirate: Emirate;
  code: string;
  number: string;
  plateType: 'private' | 'classic' | 'motorcycle' | 'commercial';
  /** Name of the registered owner as shown on the plate ownership document. */
  registeredOwner: string;
}

export type PaymentMethod = 'aman_hold' | 'bank_transfer_to_seller' | 'third_party_account' | 'cash';

export interface PaymentInstructions {
  method: PaymentMethod;
  beneficiaryName?: string;
  iban?: string;
}

export interface DocRef {
  fileName: string;
  size: number;
  type: string;
  sha256: string;
  uploadedAt: string;
  by: Role;
}

export interface TimelineEntry {
  at: string;
  kind: TimelineKind;
  actor: Role | 'system';
  note?: string;
}

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  findings: Finding[];
  assessedAt: string;
  disclosure: L;
}

export interface Deal {
  id: string;
  category: Category;
  title: string;
  price: number;
  currency: 'AED';
  fee: number;
  buyer: Party;
  seller: Party;
  vehicle?: VehicleDetails;
  plate?: PlateDetails;
  payment: PaymentInstructions;
  conditions: string;
  inspectionAgreed: boolean;
  documents: Record<string, DocRef>;
  status: DealStatus;
  flaggedFrom?: DealStatus;
  acceptedBy: Role[];
  risk?: RiskAssessment;
  reviewerNote?: string;
  timeline: TimelineEntry[];
  createdAt: string;
  updatedAt: string;
  version: number;
  seeded?: boolean;
  idempotencyKey?: string;
}

export interface DocDef {
  key: string;
  label: L;
  by: Role;
  required: boolean;
}

export const DOCS: Record<Category, DocDef[]> = {
  vehicle: [
    { key: 'ownership', label: T('Vehicle registration card (Mulkiya)', 'بطاقة ملكية المركبة (الملكية)'), by: 'seller', required: true },
    { key: 'seller_id', label: T('Seller Emirates ID', 'هوية البائع الإماراتية'), by: 'seller', required: true },
    { key: 'inspection', label: T('Inspection / test report', 'تقرير الفحص الفني'), by: 'seller', required: false },
    { key: 'buyer_id', label: T('Buyer Emirates ID', 'هوية المشتري الإماراتية'), by: 'buyer', required: true },
  ],
  plate: [
    { key: 'plate_ownership', label: T('Plate ownership document', 'وثيقة ملكية الرقم'), by: 'seller', required: true },
    { key: 'seller_id', label: T('Seller Emirates ID', 'هوية البائع الإماراتية'), by: 'seller', required: true },
    { key: 'buyer_id', label: T('Buyer Emirates ID', 'هوية المشتري الإماراتية'), by: 'buyer', required: true },
    { key: 'supporting', label: T('Supporting document (optional)', 'مستند داعم (اختياري)'), by: 'seller', required: false },
  ],
};

export const CATEGORY_LABEL: Record<Category, L> = { vehicle: T('Vehicle', 'مركبة'), plate: T('Premium plate', 'رقم مميز') };
export const EMIRATE_LABEL: Record<Emirate, L> = {
  abu_dhabi: T('Abu Dhabi', 'أبوظبي'), dubai: T('Dubai', 'دبي'), sharjah: T('Sharjah', 'الشارقة'), ajman: T('Ajman', 'عجمان'),
  umm_al_quwain: T('Umm Al Quwain', 'أم القيوين'), ras_al_khaimah: T('Ras Al Khaimah', 'رأس الخيمة'), fujairah: T('Fujairah', 'الفجيرة'),
};

export const FEE_RATE = 0.01;
export const MIN_FEE = 100;
export const calcFee = (price: number) => Math.max(MIN_FEE, Math.round(price * FEE_RATE));

export const ACTIVE: DealStatus[] = ['details_submitted', 'documents_submitted', 'risk_assessed', 'conditions_accepted', 'payment_held', 'transfer_simulated', 'approved', 'flagged', 'needs_verification'];
export const TERMINAL: DealStatus[] = ['completed', 'rejected', 'cancelled'];

// ---------- input validation (used by the server API; rejects unsupported categories) ----------

export interface DealInput {
  category: Category;
  price: number;
  buyer: Party;
  seller: Party;
  vehicle?: VehicleDetails;
  plate?: PlateDetails;
  payment: PaymentInstructions;
  conditions: string;
  inspectionAgreed: boolean;
}

type V = { ok: true; input: DealInput } | { ok: false; error: L };
const bad = (en: string, ar: string): V => ({ ok: false, error: T(en, ar) });
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function validateDealInput(body: unknown): V {
  if (!body || typeof body !== 'object') return bad('Invalid request.', 'طلب غير صالح.');
  const b = body as Record<string, unknown>;
  if (!SUPPORTED_CATEGORIES.includes(b.category as Category)) {
    return bad('Unsupported transaction category. AMAN Secure Deal supports vehicles and premium license plates only.', 'فئة معاملة غير مدعومة. تدعم أمان للصفقات الآمنة المركبات والأرقام المميزة فقط.');
  }
  const category = b.category as Category;
  const price = Number(b.price);
  if (!Number.isFinite(price) || price < 100 || price > 500_000_000) return bad('Enter a valid agreed price in AED.', 'أدخل سعراً متفقاً عليه صحيحاً بالدرهم.');
  const party = (v: unknown): Party => {
    const p = (v ?? {}) as Record<string, unknown>;
    return { name: str(p.name, 100), phone: str(p.phone, 30), email: str(p.email, 120) || undefined };
  };
  const buyer = party(b.buyer);
  const seller = party(b.seller);
  if (!buyer.name || !seller.name || !buyer.phone || !seller.phone) return bad('Buyer and seller name and phone are required.', 'اسم ورقم هاتف المشتري والبائع مطلوبان.');
  const pay = (b.payment ?? {}) as Record<string, unknown>;
  const method = (['aman_hold', 'bank_transfer_to_seller', 'third_party_account', 'cash'] as PaymentMethod[]).includes(pay.method as PaymentMethod) ? (pay.method as PaymentMethod) : 'aman_hold';
  const payment: PaymentInstructions = { method, beneficiaryName: str(pay.beneficiaryName, 100) || undefined, iban: str(pay.iban, 40) || undefined };
  const conditions = str(b.conditions, 2000);
  const inspectionAgreed = b.inspectionAgreed === true;
  const emirate = (v: unknown) => (EMIRATES.includes(v as Emirate) ? (v as Emirate) : null);

  if (category === 'vehicle') {
    const v = (b.vehicle ?? {}) as Record<string, unknown>;
    const e = emirate(v.emirate);
    const year = Number(v.year);
    const vehicle: VehicleDetails = {
      make: str(v.make, 40), model: str(v.model, 60), year, vin: str(v.vin, 20).toUpperCase().replace(/\s/g, ''), emirate: e ?? 'dubai',
      registeredOwner: str(v.registeredOwner, 100), registrationNo: str(v.registrationNo, 30) || undefined, plate: str(v.plate, 30) || undefined,
      mileageKm: Number.isFinite(Number(v.mileageKm)) && Number(v.mileageKm) > 0 ? Math.round(Number(v.mileageKm)) : undefined,
    };
    if (!vehicle.make || !vehicle.model || !vehicle.vin || !vehicle.registeredOwner || !e || !Number.isInteger(year)) {
      return bad('Make, model, year, VIN, registration emirate and registered owner are required.', 'الشركة المصنّعة والطراز وسنة الصنع ورقم الهيكل وإمارة التسجيل واسم المالك المسجّل مطلوبة.');
    }
    return { ok: true, input: { category, price, buyer, seller, vehicle, payment, conditions, inspectionAgreed } };
  }
  const p = (b.plate ?? {}) as Record<string, unknown>;
  const e = emirate(p.emirate);
  const plate: PlateDetails = {
    emirate: e ?? 'dubai', code: str(p.code, 10).toUpperCase(), number: str(p.number, 6),
    plateType: (['private', 'classic', 'motorcycle', 'commercial'] as const).includes(p.plateType as PlateDetails['plateType']) ? (p.plateType as PlateDetails['plateType']) : 'private',
    registeredOwner: str(p.registeredOwner, 100),
  };
  if (!e || !plate.code || !plate.number || !plate.registeredOwner) {
    return bad('Issuing emirate, plate code, plate number and registered owner are required.', 'الإمارة المصدِرة ورمز اللوحة ورقمها واسم المالك المسجّل مطلوبة.');
  }
  return { ok: true, input: { category, price, buyer, seller, plate, payment, conditions, inspectionAgreed } };
}

export function dealTitle(i: Pick<DealInput, 'category' | 'vehicle' | 'plate'>): string {
  if (i.category === 'vehicle' && i.vehicle) return `${i.vehicle.year} ${i.vehicle.make} ${i.vehicle.model}`;
  if (i.plate) return `${EMIRATE_LABEL[i.plate.emirate].en} ${i.plate.code} ${i.plate.number}`;
  return 'Transaction';
}

export function createDeal(input: DealInput, opts: { id?: string; now?: Date; seeded?: boolean; idempotencyKey?: string } = {}): Deal {
  const at = (opts.now ?? new Date()).toISOString();
  return {
    id: opts.id ?? 'AMN-' + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 8).toUpperCase(),
    category: input.category,
    title: dealTitle(input),
    price: input.price,
    currency: 'AED',
    fee: calcFee(input.price),
    buyer: input.buyer,
    seller: input.seller,
    vehicle: input.vehicle,
    plate: input.plate,
    payment: input.payment,
    conditions: input.conditions,
    inspectionAgreed: input.inspectionAgreed,
    documents: {},
    status: 'details_submitted',
    acceptedBy: [],
    timeline: [
      { at, kind: 'create', actor: 'system' },
      { at, kind: 'submit_details', actor: 'system', note: 'Buyer and seller details submitted' },
    ],
    createdAt: at,
    updatedAt: at,
    version: 1,
    seeded: opts.seeded,
    idempotencyKey: opts.idempotencyKey,
  };
}

// ---------- risk assessment (deterministic; local consistency checks only) ----------

export const RISK_DISCLOSURE = T(
  'Automated consistency checks on the information and file metadata provided. Ownership is NOT verified with RTA, ITC, MOI or any official registry, and documents are not read or authenticated.',
  'فحوصات اتساق آلية على المعلومات وبيانات الملفات المقدّمة. لا يتم التحقق من الملكية لدى هيئة الطرق أو مركز النقل المتكامل أو وزارة الداخلية أو أي سجل رسمي، ولا تتم قراءة المستندات أو توثيقها.',
);

const OFF_PLATFORM_WORDS = ['outside aman', 'outside the platform', 'pay directly', 'direct transfer', 'transfer first', 'pay first', 'deposit before', 'before inspection', 'before viewing', 'without inspection', 'no inspection', 'ship the car', 'shipping fee', 'from abroad', 'overseas', 'release the money first', 'release payment first', 'western union', 'crypto', 'usdt', 'gift card', 'خارج المنصة', 'ادفع مباشرة', 'تحويل مباشر', 'قبل المعاينة', 'بدون معاينة', 'رسوم شحن', 'من الخارج', 'حول أولا', 'حوّل أولاً', 'عربون قبل'];

export function assessRisk(deal: Deal, others: Deal[] = [], now = new Date()): RiskAssessment {
  const f: Finding[] = [];
  const owner = deal.vehicle?.registeredOwner ?? deal.plate?.registeredOwner ?? '';

  // Identity / ownership consistency
  if (owner && nameSimilarity(owner, deal.seller.name) < 0.5) {
    f.push(finding('owner-mismatch', 35, T('Seller is not the registered owner', 'البائع ليس المالك المسجّل'), T(`The ownership document lists "${owner}", but the seller is "${deal.seller.name}". This can indicate seller impersonation or an unauthorized sale.`, `تُظهر وثيقة الملكية اسم "${owner}" بينما البائع "${deal.seller.name}". قد يشير ذلك إلى انتحال صفة البائع أو بيع غير مصرّح به.`), `${owner} ≠ ${deal.seller.name}`));
  }
  if (nameSimilarity(deal.buyer.name, deal.seller.name) >= 0.99 || deal.buyer.phone.replace(/\D/g, '') === deal.seller.phone.replace(/\D/g, '')) {
    f.push(finding('same-party', 25, T('Buyer and seller details overlap', 'تداخل بيانات المشتري والبائع'), T('Buyer and seller share the same name or phone number, a potential identity mismatch.', 'يتشارك المشتري والبائع الاسم أو رقم الهاتف نفسه، وهو عدم تطابق محتمل في الهوية.')));
  }
  for (const [who, p] of [['seller', deal.seller], ['buyer', deal.buyer]] as const) {
    const c = classifyUaePhone(p.phone);
    if (c.type === 'invalid' || c.type === 'premium') {
      f.push(finding(`${who}-phone`, 10, T(`${who === 'seller' ? 'Seller' : 'Buyer'} phone number format is unusual`, `صيغة هاتف ${who === 'seller' ? 'البائع' : 'المشتري'} غير معتادة`), T('The number does not follow the UAE numbering plan.', 'الرقم لا يتبع خطة الترقيم الإماراتية.'), p.phone));
    } else if (c.type === 'international' && who === 'seller') {
      f.push(finding('seller-foreign-phone', 10, T('Seller uses a foreign phone number', 'البائع يستخدم رقماً أجنبياً'), T('Sellers who are "abroad" are a common pattern in vehicle and plate scams.', 'البائعون "خارج الدولة" نمط شائع في احتيال المركبات والأرقام.'), p.phone));
    }
  }

  // Payment instructions
  const pay = deal.payment;
  if (pay.method === 'third_party_account') {
    f.push(finding('third-party-payment', 35, T('Payment to a third-party account', 'الدفع لحساب طرف ثالث'), T('The seller asks for payment to someone else\'s account. Legitimate sellers receive payment in their own name.', 'يطلب البائع الدفع لحساب شخص آخر. البائعون الحقيقيون يستلمون الدفع بأسمائهم.'), pay.beneficiaryName));
  } else if (pay.method === 'bank_transfer_to_seller') {
    f.push(finding('off-platform-payment', 20, T('Direct transfer outside the protected flow', 'تحويل مباشر خارج المسار المحمي'), T('Paying the seller directly removes payment protection. Use the AMAN holding step so money is only released after transfer and review.', 'الدفع المباشر للبائع يلغي حماية الدفع. استخدم خطوة الحجز في أمان ليتم الإفراج عن المبلغ فقط بعد النقل والمراجعة.')));
    if (pay.beneficiaryName && nameSimilarity(pay.beneficiaryName, deal.seller.name) < 0.5) {
      f.push(finding('beneficiary-mismatch', 30, T('Account holder is not the seller', 'صاحب الحساب ليس البائع'), T(`Payment would go to "${pay.beneficiaryName}", not to the seller "${deal.seller.name}".`, `سيذهب الدفع إلى "${pay.beneficiaryName}" وليس إلى البائع "${deal.seller.name}".`), pay.beneficiaryName));
    }
  } else if (pay.method === 'cash') {
    f.push(finding('cash-payment', 15, T('Cash payment', 'دفع نقدي'), T('Cash leaves no trace and cannot be recovered if the transfer fails.', 'النقد لا يترك أثراً ولا يمكن استرداده إذا فشل النقل.')));
  }
  if (pay.iban && !ibanValid(pay.iban)) {
    f.push(finding('iban-invalid', 20, T('IBAN fails validation', 'رقم الآيبان غير صالح'), T('The IBAN does not pass the international check-digit test (or the UAE 23-character format).', 'رقم الآيبان لا يجتاز اختبار رقم التحقق الدولي (أو صيغة الإمارات المكونة من 23 خانة).'), pay.iban.slice(0, 4) + '…'));
  }

  // Conditions text: scam patterns (deposit before inspection, fake payment confirmation, urgency, off-platform)
  if (deal.conditions) {
    const c = contentFindings(deal.conditions);
    for (const x of c.findings) if (x.weight > 0) f.push({ ...x, id: `cond-${x.id}`, title: T(`Conditions: ${x.title.en}`, `الشروط: ${x.title.ar}`) });
    const lower = deal.conditions.toLowerCase();
    const off = OFF_PLATFORM_WORDS.filter((w) => lower.includes(w));
    if (off.length) f.push(finding('cond-off-platform', 25, T('Conditions push payment outside the protected flow', 'الشروط تدفع نحو الدفع خارج المسار المحمي'), T('Requests to pay first, pay a deposit before inspection, or pay shipping are classic vehicle and plate scams.', 'طلبات الدفع أولاً أو دفع عربون قبل المعاينة أو دفع رسوم شحن احتيال تقليدي في المركبات والأرقام.'), off.slice(0, 3).join(', ')));
  }
  if (deal.category === 'vehicle' && !deal.inspectionAgreed) {
    f.push(finding('no-inspection', 15, T('No physical inspection agreed', 'لم يتم الاتفاق على معاينة فعلية'), T('Buying a vehicle without inspecting it and its chassis number in person is high risk.', 'شراء مركبة دون معاينتها ورقم هيكلها شخصياً مخاطرة عالية.')));
  }

  // Vehicle-specific consistency
  if (deal.vehicle) {
    const v = deal.vehicle;
    const year = now.getFullYear();
    if (v.year < 1950 || v.year > year + 1) {
      f.push(finding('year-invalid', 20, T('Implausible manufacturing year', 'سنة صنع غير منطقية'), T(`Year ${v.year} is outside the plausible range.`, `السنة ${v.year} خارج النطاق المنطقي.`), String(v.year)));
    }
    if (!vinFormatValid(v.vin)) {
      f.push(finding('vin-invalid', 25, T('VIN format is invalid', 'صيغة رقم الهيكل غير صالحة'), T('A VIN has exactly 17 characters and never contains I, O or Q.', 'يتكون رقم الهيكل من 17 خانة بالضبط ولا يحتوي على الأحرف I أو O أو Q.'), v.vin));
    } else {
      const years = vinModelYears(v.vin);
      if (years.length && !years.some((y) => Math.abs(y - v.year) <= 1)) {
        f.push(finding('vin-year-mismatch', 20, T('VIN model year does not match the stated year', 'سنة الطراز في رقم الهيكل لا تطابق السنة المذكورة'), T(`Position 10 of the VIN encodes model year ${years.filter((y) => y <= year + 1).slice(-1)[0] ?? years[0]}, but the listing says ${v.year}.`, `الخانة العاشرة في رقم الهيكل تشير إلى سنة ${years.filter((y) => y <= year + 1).slice(-1)[0] ?? years[0]}، بينما يذكر الإعلان ${v.year}.`), v.vin[9]));
      }
      const makes = vinMakes(v.vin);
      if (makes && !makes.some((m) => v.make.toLowerCase().includes(m) || m.includes(v.make.toLowerCase()))) {
        f.push(finding('vin-make-mismatch', 25, T('VIN manufacturer does not match the stated make', 'الشركة المصنّعة في رقم الهيكل لا تطابق الماركة المذكورة'), T(`The VIN prefix belongs to ${makes.join('/')}, not ${v.make}.`, `بادئة رقم الهيكل تعود إلى ${makes.join('/')} وليس ${v.make}.`), v.vin.slice(0, 3)));
      }
      if (isNorthAmericanVin(v.vin) && !vinCheckDigitValid(v.vin)) {
        f.push(finding('vin-checkdigit', 15, T('VIN check digit is wrong', 'خانة التحقق في رقم الهيكل خاطئة'), T('North-American VINs include a check digit (position 9). It does not match, suggesting a typo or an altered VIN.', 'أرقام الهيكل لأمريكا الشمالية تتضمن خانة تحقق (الخانة 9). لا تتطابق، ما يشير إلى خطأ أو تلاعب.'), v.vin[8]));
      }
    }
    const dupVin = others.find((o) => o.id !== deal.id && o.vehicle?.vin === v.vin && ACTIVE.includes(o.status));
    if (dupVin) f.push(finding('duplicate-vin', 35, T('Same VIN in another active transaction', 'رقم الهيكل نفسه في معاملة نشطة أخرى'), T('This vehicle is already part of another open AMAN transaction. The same car may be sold to several buyers.', 'هذه المركبة جزء من معاملة أمان مفتوحة أخرى. قد تُباع السيارة نفسها لعدة مشترين.'), dupVin.id));
  }

  // Plate-specific consistency
  if (deal.plate) {
    const p = deal.plate;
    if (!plateFormatValid(p.code, p.number)) {
      f.push(finding('plate-format', 20, T('Plate code or number format is unusual', 'صيغة رمز اللوحة أو رقمها غير معتادة'), T('Plate numbers have 1–5 digits without a leading zero; codes are 1–2 letters or digits. This is a format check only.', 'أرقام اللوحات من 1 إلى 5 أرقام دون صفر في البداية؛ والرموز حرف أو حرفان أو رقم أو رقمان. هذا فحص صيغة فقط.'), `${p.code} ${p.number}`));
    }
    const prem = premiumPattern(p.number);
    if (prem) f.push(finding('premium-pattern', 0, T('High-value plate pattern', 'نمط رقم عالي القيمة'), T(`${prem}: such plates attract more fraud attempts. AMAN does not provide market valuations.`, `${prem}: تجذب هذه الأرقام محاولات احتيال أكثر. لا تقدّم أمان تقييمات سوقية.`), p.number));
    const dup = others.find((o) => o.id !== deal.id && o.plate && o.plate.emirate === p.emirate && o.plate.code === p.code && o.plate.number === p.number && ACTIVE.includes(o.status));
    if (dup) f.push(finding('duplicate-plate', 35, T('Same plate in another active transaction', 'الرقم نفسه في معاملة نشطة أخرى'), T('This plate is already part of another open AMAN transaction, a sign it may be offered to several buyers.', 'هذا الرقم جزء من معاملة أمان مفتوحة أخرى، ما قد يعني عرضه على عدة مشترين.'), dup.id));
  }

  // Document metadata consistency (files never leave the browser; only name, size, type and SHA-256 are stored)
  const docs = Object.entries(deal.documents);
  const byHash = new Map<string, string[]>();
  for (const [k, d] of docs) byHash.set(d.sha256, [...(byHash.get(d.sha256) ?? []), k]);
  const dupDocs = [...byHash.values()].find((ks) => ks.length > 1);
  if (dupDocs) f.push(finding('duplicate-document', 25, T('Same file submitted as different documents', 'الملف نفسه مقدّم كمستندات مختلفة'), T('Identical files (same SHA-256 fingerprint) were submitted for different required documents.', 'تم تقديم ملفات متطابقة (البصمة نفسها) لمستندات مطلوبة مختلفة.'), dupDocs.join(' = ')));
  const reused = docs.find(([, d]) => others.some((o) => o.id !== deal.id && Object.values(o.documents).some((x) => x.sha256 === d.sha256)));
  if (reused) f.push(finding('document-reused', 30, T('Document already used in another transaction', 'المستند مستخدم في معاملة أخرى'), T('An identical file was submitted in a different AMAN transaction. Ownership documents should be unique to one deal.', 'تم تقديم ملف مطابق في معاملة أمان أخرى. يجب أن تكون وثائق الملكية خاصة بصفقة واحدة.'), reused[0]));
  const ownKey = deal.category === 'vehicle' ? 'ownership' : 'plate_ownership';
  const own = deal.documents[ownKey];
  if (own && own.size < 15_000) f.push(finding('tiny-ownership-doc', 10, T('Ownership document file is unusually small', 'ملف وثيقة الملكية صغير بشكل غير معتاد'), T('Very small files are often cropped screenshots rather than full documents.', 'الملفات الصغيرة جداً غالباً لقطات مقتطعة وليست مستندات كاملة.'), `${Math.round(own.size / 1024)} KB`));

  if (!f.some((x) => x.weight > 0)) {
    f.push(finding('no-issues', 0, T('No inconsistencies detected', 'لم تُكتشف تناقضات'), T('The submitted details are internally consistent. This is not an official ownership verification.', 'البيانات المقدّمة متسقة داخلياً. هذا ليس تحققاً رسمياً من الملكية.')));
  }
  const findings = sortFindings(f);
  const score = Math.max(0, Math.min(100, findings.reduce((a, x) => a + x.weight, 0)));
  return { score, level: levelFromScore(score), findings, assessedAt: now.toISOString(), disclosure: RISK_DISCLOSURE };
}

// ---------- documents ----------

export type Result = { ok: true; deal: Deal } | { ok: false; error: L };
const fail = (en: string, ar: string): Result => ({ ok: false, error: T(en, ar) });
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_DOC = 10 * 1024 * 1024;

export function missingDocs(deal: Deal): DocDef[] {
  return DOCS[deal.category].filter((d) => d.required && !deal.documents[d.key]);
}

export function uploadDocument(deal: Deal, key: string, file: { name: string; size: number; type: string; sha256: string }, by: Role, now = new Date()): Result {
  const def = DOCS[deal.category].find((d) => d.key === key);
  if (!def) return fail('Unknown document type.', 'نوع مستند غير معروف.');
  if (!['details_submitted', 'needs_verification'].includes(deal.status)) return fail('Documents can only be added before submission or when additional verification is requested.', 'يمكن إضافة المستندات فقط قبل التقديم أو عند طلب تحقق إضافي.');
  if (by !== def.by) return fail(`Only the ${def.by} can upload this document.`, def.by === 'buyer' ? 'المشتري فقط يمكنه رفع هذا المستند.' : 'البائع فقط يمكنه رفع هذا المستند.');
  if (!ALLOWED_TYPES.includes(file.type)) return fail('Only PDF, JPG or PNG files are accepted.', 'تُقبل ملفات PDF أو JPG أو PNG فقط.');
  if (!(file.size > 0 && file.size <= MAX_DOC)) return fail('Files must be between 1 byte and 10 MB.', 'يجب أن يكون حجم الملف بين 1 بايت و10 ميغابايت.');
  if (!/^[a-f0-9]{64}$/.test(file.sha256)) return fail('Invalid file fingerprint.', 'بصمة ملف غير صالحة.');
  const at = now.toISOString();
  return {
    ok: true,
    deal: touch({
      ...deal,
      documents: { ...deal.documents, [key]: { fileName: file.name.slice(0, 120), size: file.size, type: file.type, sha256: file.sha256, uploadedAt: at, by } },
      timeline: [...deal.timeline, { at, kind: 'upload', actor: by, note: def.label.en }],
    }, at),
  };
}

// ---------- state machine ----------

/** Which role may perform each action, and from which statuses. */
export const RULES: Record<Action, { roles: Role[]; from: DealStatus[]; noteRequired?: boolean }> = {
  submit_documents: { roles: ['buyer', 'seller'], from: ['details_submitted', 'needs_verification'] },
  accept_conditions: { roles: ['buyer', 'seller'], from: ['risk_assessed'] },
  hold_payment: { roles: ['buyer'], from: ['conditions_accepted'] },
  confirm_transfer: { roles: ['seller'], from: ['payment_held'] },
  approve: { roles: ['reviewer'], from: ['transfer_simulated'] },
  release_payment: { roles: ['reviewer'], from: ['approved'] },
  reject: { roles: ['reviewer'], from: ['documents_submitted', 'risk_assessed', 'conditions_accepted', 'payment_held', 'transfer_simulated', 'approved', 'flagged', 'needs_verification'], noteRequired: true },
  cancel: { roles: ['buyer', 'seller'], from: ['details_submitted', 'documents_submitted', 'risk_assessed', 'conditions_accepted', 'needs_verification', 'flagged'] },
  flag: { roles: ['reviewer'], from: ['details_submitted', 'documents_submitted', 'risk_assessed', 'conditions_accepted', 'payment_held', 'transfer_simulated'], noteRequired: true },
  clear_flag: { roles: ['reviewer'], from: ['flagged'], noteRequired: true },
  request_verification: { roles: ['reviewer'], from: ['flagged', 'risk_assessed'], noteRequired: true },
};

export const FLAG_THRESHOLD = 50;

function touch(d: Deal, at: string): Deal {
  return { ...d, updatedAt: at, version: d.version + 1 };
}

export interface ActionOptions {
  note?: string;
  /** Reviewer checklist (all items must be confirmed before approval). */
  checklist?: boolean[];
  /** Other deals in the store (for duplicate checks during assessment). */
  others?: Deal[];
  now?: Date;
}

export const REVIEW_CHECKLIST: L[] = [
  T('Ownership document matches the seller\'s identity', 'وثيقة الملكية تطابق هوية البائع'),
  T('Asset details (VIN / plate) match the documents', 'بيانات الأصل (رقم الهيكل / الرقم) تطابق المستندات'),
  T('Risk assessment findings were reviewed and resolved', 'تمت مراجعة نتائج تقييم المخاطر ومعالجتها'),
  T('Simulated ownership transfer confirmed by the seller', 'أكّد البائع نقل الملكية (محاكاة)'),
];

export function applyAction(deal: Deal, action: Action, actor: Role, opts: ActionOptions = {}): Result {
  const rule = RULES[action];
  if (!rule) return fail('Unknown action.', 'إجراء غير معروف.');
  const now = opts.now ?? new Date();
  const at = now.toISOString();
  const note = opts.note?.trim().slice(0, 500) || undefined;
  if (action === 'release_payment' && deal.status !== 'approved') {
    return fail('Payment cannot be released before reviewer approval.', 'لا يمكن الإفراج عن الدفع قبل موافقة المراجع.');
  }
  if (!rule.roles.includes(actor)) return fail('Your role is not allowed to perform this step.', 'دورك لا يسمح بتنفيذ هذه الخطوة.');
  if (!rule.from.includes(deal.status)) return fail('This step is not available at the current stage.', 'هذه الخطوة غير متاحة في المرحلة الحالية.');
  if (rule.noteRequired && !note) return fail('A note explaining the reason is required.', 'يجب كتابة ملاحظة توضّح السبب.');

  const tl = (kind: TimelineKind, a: Role | 'system' = actor, n = note): TimelineEntry => ({ at, kind, actor: a, note: n });
  let next: Deal = { ...deal };

  switch (action) {
    case 'submit_documents': {
      const missing = missingDocs(deal);
      if (missing.length) return fail(`Missing documents: ${missing.map((d) => d.label.en).join(', ')}`, `مستندات ناقصة: ${missing.map((d) => d.label.ar).join('، ')}`);
      const risk = assessRisk(deal, opts.others ?? [], now);
      const flagged = risk.score >= FLAG_THRESHOLD;
      next = {
        ...deal,
        risk,
        acceptedBy: [],
        status: flagged ? 'flagged' : 'risk_assessed',
        flaggedFrom: flagged ? 'risk_assessed' : undefined,
        timeline: [...deal.timeline, tl('submit_documents'), tl('risk_assessment', 'system', `Score ${risk.score}/100 (${risk.level})${flagged ? ' - flagged for review' : ''}`)],
      };
      break;
    }
    case 'accept_conditions': {
      if (deal.acceptedBy.includes(actor)) return fail('You have already accepted the conditions.', 'لقد قبلت الشروط بالفعل.');
      const acceptedBy = [...deal.acceptedBy, actor];
      const both = acceptedBy.includes('buyer') && acceptedBy.includes('seller');
      next = { ...deal, acceptedBy, status: both ? 'conditions_accepted' : deal.status, timeline: [...deal.timeline, tl('accept_conditions')] };
      break;
    }
    case 'hold_payment':
      next = { ...deal, status: 'payment_held', timeline: [...deal.timeline, tl('hold_payment')] };
      break;
    case 'confirm_transfer':
      next = { ...deal, status: 'transfer_simulated', timeline: [...deal.timeline, tl('confirm_transfer')] };
      break;
    case 'approve': {
      const c = opts.checklist ?? [];
      if (c.length !== REVIEW_CHECKLIST.length || c.some((x) => x !== true)) return fail('Complete the reviewer checklist before approving.', 'أكمل قائمة تحقق المراجع قبل الموافقة.');
      next = { ...deal, status: 'approved', reviewerNote: note ?? deal.reviewerNote, timeline: [...deal.timeline, tl('approve')] };
      break;
    }
    case 'release_payment':
      next = { ...deal, status: 'completed', timeline: [...deal.timeline, tl('release_payment'), tl('complete', 'system', undefined)] };
      break;
    case 'reject': {
      const held = ['payment_held', 'transfer_simulated', 'approved'].includes(deal.status);
      next = { ...deal, status: 'rejected', reviewerNote: note, timeline: [...deal.timeline, tl('reject'), ...(held ? [tl('refund', 'system', 'Held payment returned to buyer (simulated)')] : [])] };
      break;
    }
    case 'cancel':
      next = { ...deal, status: 'cancelled', timeline: [...deal.timeline, tl('cancel')] };
      break;
    case 'flag':
      next = { ...deal, status: 'flagged', flaggedFrom: deal.status, reviewerNote: note, timeline: [...deal.timeline, tl('flag')] };
      break;
    case 'clear_flag': {
      const back = deal.flaggedFrom && !['details_submitted', 'documents_submitted'].includes(deal.flaggedFrom) ? deal.flaggedFrom : deal.risk ? 'risk_assessed' : 'details_submitted';
      next = { ...deal, status: back, flaggedFrom: undefined, reviewerNote: note, timeline: [...deal.timeline, tl('clear_flag')] };
      break;
    }
    case 'request_verification':
      next = { ...deal, status: 'needs_verification', flaggedFrom: undefined, acceptedBy: [], reviewerNote: note, timeline: [...deal.timeline, tl('request_verification')] };
      break;
  }
  return { ok: true, deal: touch(next, at) };
}

// ---------- presentation helpers ----------

/** The 10-step lifecycle shown in the timeline. */
export const LIFECYCLE: { key: string; label: L; reachedAt: (d: Deal) => boolean }[] = [
  { key: 'create', label: T('Deal created', 'تم إنشاء الصفقة'), reachedAt: () => true },
  { key: 'details', label: T('Buyer & seller details', 'بيانات المشتري والبائع'), reachedAt: () => true },
  { key: 'documents', label: T('Documents submitted', 'تقديم المستندات'), reachedAt: (d) => d.timeline.some((e) => e.kind === 'submit_documents') },
  { key: 'risk', label: T('Fraud risk assessed', 'تقييم مخاطر الاحتيال'), reachedAt: (d) => !!d.risk },
  { key: 'conditions', label: T('Conditions accepted', 'قبول الشروط'), reachedAt: (d) => d.timeline.some((e) => e.kind === 'accept_conditions') && ['conditions_accepted', 'payment_held', 'transfer_simulated', 'approved', 'completed'].includes(d.status) },
  { key: 'hold', label: T('Payment held (simulated)', 'حجز الدفع (محاكاة)'), reachedAt: (d) => d.timeline.some((e) => e.kind === 'hold_payment') },
  { key: 'transfer', label: T('Ownership transfer (simulated)', 'نقل الملكية (محاكاة)'), reachedAt: (d) => d.timeline.some((e) => e.kind === 'confirm_transfer') },
  { key: 'approval', label: T('Review & approval', 'المراجعة والموافقة'), reachedAt: (d) => d.timeline.some((e) => e.kind === 'approve') },
  { key: 'release', label: T('Payment released (simulated)', 'الإفراج عن الدفع (محاكاة)'), reachedAt: (d) => d.timeline.some((e) => e.kind === 'release_payment') },
  { key: 'complete', label: T('Completed', 'مكتملة'), reachedAt: (d) => d.status === 'completed' },
];

export const STATUS_LABEL: Record<DealStatus, L> = {
  details_submitted: T('Pending documents', 'بانتظار المستندات'),
  documents_submitted: T('Documents submitted', 'تم تقديم المستندات'),
  risk_assessed: T('Risk assessed · awaiting conditions', 'تم تقييم المخاطر · بانتظار قبول الشروط'),
  conditions_accepted: T('Conditions accepted', 'تم قبول الشروط'),
  payment_held: T('Payment held (simulated)', 'الدفع محجوز (محاكاة)'),
  transfer_simulated: T('Transaction under review', 'المعاملة قيد المراجعة'),
  approved: T('Approved · awaiting release', 'تمت الموافقة · بانتظار الإفراج'),
  completed: T('Completed', 'مكتملة'),
  flagged: T('Flagged for review', 'مُعلَّمة للمراجعة'),
  needs_verification: T('Additional verification required', 'مطلوب تحقق إضافي'),
  rejected: T('Rejected', 'مرفوضة'),
  cancelled: T('Cancelled', 'ملغاة'),
};

export const TIMELINE_LABEL: Record<TimelineKind, L> = {
  create: T('Deal created', 'تم إنشاء الصفقة'),
  submit_details: T('Buyer and seller details submitted', 'تم تقديم بيانات المشتري والبائع'),
  upload: T('Document added', 'تمت إضافة مستند'),
  submit_documents: T('Documents submitted', 'تم تقديم المستندات'),
  risk_assessment: T('Fraud risk assessment completed', 'اكتمل تقييم مخاطر الاحتيال'),
  accept_conditions: T('Transaction conditions accepted', 'تم قبول شروط المعاملة'),
  hold_payment: T('Payment held by AMAN (simulated)', 'تم حجز الدفع لدى أمان (محاكاة)'),
  confirm_transfer: T('Ownership transfer confirmed (simulated)', 'تم تأكيد نقل الملكية (محاكاة)'),
  approve: T('Reviewer approved the transaction', 'وافق المراجع على المعاملة'),
  release_payment: T('Payment released to seller (simulated)', 'تم الإفراج عن الدفع للبائع (محاكاة)'),
  complete: T('Transaction completed', 'اكتملت المعاملة'),
  reject: T('Reviewer rejected the transaction', 'رفض المراجع المعاملة'),
  refund: T('Held payment returned to buyer (simulated)', 'أُعيد المبلغ المحجوز للمشتري (محاكاة)'),
  cancel: T('Transaction cancelled', 'تم إلغاء المعاملة'),
  flag: T('Flagged for review', 'تم تعليمها للمراجعة'),
  clear_flag: T('Flag cleared by reviewer', 'أزال المراجع علامة المراجعة'),
  request_verification: T('Additional verification requested', 'طُلب تحقق إضافي'),
};

export const ROLE_LABEL: Record<Role | 'system', L> = {
  buyer: T('Buyer', 'المشتري'),
  seller: T('Seller', 'البائع'),
  reviewer: T('AMAN reviewer', 'مراجع أمان'),
  system: T('System', 'النظام'),
};

export type FundsState = 'awaiting' | 'held' | 'released' | 'returned' | 'none';
export function fundsState(deal: Deal): FundsState {
  const held = deal.timeline.some((e) => e.kind === 'hold_payment');
  if (deal.status === 'completed') return 'released';
  if (deal.timeline.some((e) => e.kind === 'refund')) return 'returned';
  if (deal.status === 'cancelled' || deal.status === 'rejected') return 'none';
  return held ? 'held' : 'awaiting';
}

/** SYNTHETIC example inputs (clearly labelled as seeded examples in the UI). */
export const EXAMPLE_INPUTS: Record<'vehicle' | 'vehicleRisky' | 'plate' | 'plateRisky', DealInput> = {
  vehicle: {
    category: 'vehicle', price: 185000,
    buyer: { name: 'Fatima Al Mansoori (example)', phone: '+971 50 000 0001' },
    seller: { name: 'Omar Al Hammadi (example)', phone: '+971 50 000 0002' },
    vehicle: { make: 'Toyota', model: 'Land Cruiser GXR', year: 2021, vin: 'JTMHV05J604123456', emirate: 'dubai', registeredOwner: 'Omar Al Hammadi', plate: 'Dubai P 12345', mileageKm: 64000 },
    payment: { method: 'aman_hold' }, conditions: 'Buyer inspects the vehicle at an approved test centre before payment is held. Transfer at the RTA service centre.', inspectionAgreed: true,
  },
  vehicleRisky: {
    category: 'vehicle', price: 62000,
    buyer: { name: 'Khalid Al Suwaidi (example)', phone: '+971 50 000 0003' },
    seller: { name: 'Prime Cars Trading (example)', phone: '+44 7700 900123' },
    vehicle: { make: 'Nissan', model: 'Patrol', year: 2023, vin: 'JTMHV05J604123456', emirate: 'sharjah', registeredOwner: 'Saeed Rashid', mileageKm: 12000 },
    payment: { method: 'third_party_account', beneficiaryName: 'Global Shipping Agent', iban: 'AE07 0331 2345 6789 0123 456' },
    conditions: 'Urgent sale, owner travelling abroad. Pay AED 5,000 deposit before inspection; car will be shipped. Send screenshot of transfer and we release the car.', inspectionAgreed: false,
  },
  plate: {
    category: 'plate', price: 95000,
    buyer: { name: 'Mariam Al Ali (example)', phone: '+971 50 000 0005' },
    seller: { name: 'Yousef Nasser (example)', phone: '+971 50 000 0006' },
    plate: { emirate: 'abu_dhabi', code: '1', number: '7070', plateType: 'private', registeredOwner: 'Yousef Nasser' },
    payment: { method: 'aman_hold' }, conditions: 'Transfer at the licensing authority after payment is held.', inspectionAgreed: true,
  },
  plateRisky: {
    category: 'plate', price: 45000,
    buyer: { name: 'Layla Ibrahim (example)', phone: '+971 50 000 0007' },
    seller: { name: 'Hassan K. (example)', phone: '+971 50 123 4999' },
    plate: { emirate: 'dubai', code: 'A', number: '777', plateType: 'private', registeredOwner: 'Abdullah Saif' },
    payment: { method: 'bank_transfer_to_seller', beneficiaryName: 'R. Kumar', iban: 'AE12 3456 7890 1234 5678 901' },
    conditions: 'عربون قبل نقل الملكية. حوّل المبلغ وأرسل صورة التحويل اليوم فقط، بيع مستعجل.', inspectionAgreed: true,
  },
};
