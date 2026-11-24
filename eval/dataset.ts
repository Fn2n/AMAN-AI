/**
 * AMAN AI evaluation dataset (separate from the unit-test samples).
 *
 * - "legit" URLs are REAL official websites (verified domains) or real well-known sites.
 * - Every malicious item is SYNTHETIC: invented domains, messages and transactions modelled on publicly reported
 *   UAE scam patterns. No real victim data is included.
 * - Label: malicious = true means the item should be flagged (High or Dangerous, score >= 50).
 * Caveat: the dataset was written by the same team that wrote the rules, so the metrics are a sanity benchmark,
 * not an independent validation. They say nothing about any hidden judging dataset.
 */
import type { DealInput } from '@/lib/deal/engine';

export type Group =
  | 'uae-government' | 'uae-bank' | 'international' | 'phishing-url' | 'brand-impersonation' | 'suspicious-subdomain' | 'unicode-lookalike'
  | 'url-shortener' | 'fake-payment-link' | 'arabic-message' | 'english-message' | 'mixed-message' | 'ambiguous-unknown' | 'vehicle-deal' | 'plate-deal';

export interface UrlCase { type: 'url'; input: string; malicious: boolean; group: Group; synthetic: boolean }
export interface MsgCase { type: 'message'; input: string; malicious: boolean; group: Group; synthetic: true }
export interface DealCase { type: 'deal'; input: DealInput; malicious: boolean; group: Group; synthetic: true }
export type Case = UrlCase | MsgCase | DealCase;

const u = (input: string, malicious: boolean, group: Group, synthetic = malicious): UrlCase => ({ type: 'url', input, malicious, group, synthetic });
const m = (input: string, malicious: boolean, group: Group): MsgCase => ({ type: 'message', input, malicious, group, synthetic: true });

export const URL_CASES: UrlCase[] = [
  // Legitimate UAE government (real)
  u('https://u.ae/en/information-and-services', false, 'uae-government'),
  u('https://www.tamm.abudhabi/en/aspects-of-life/transport', false, 'uae-government'),
  u('https://www.adpolice.gov.ae/en', false, 'uae-government'),
  u('https://www.dubaipolice.gov.ae/app/services/fine-payment', false, 'uae-government'),
  u('https://moi.gov.ae/en/eservices', false, 'uae-government'),
  u('https://icp.gov.ae/en/', false, 'uae-government'),
  u('https://www.rta.ae/wps/portal/rta/ae/home', false, 'uae-government'),
  u('https://www.dewa.gov.ae/en/consumer/billing', false, 'uae-government'),
  u('https://www.salik.ae/en/pay-salik', false, 'uae-government'),
  u('https://uaepass.ae/', false, 'uae-government'),
  u('https://www.centralbank.ae/en/', false, 'uae-government'),
  u('https://www.emiratespost.ae/track-and-trace', false, 'uae-government'),
  // Legitimate UAE banks / telecom / marketplaces (real)
  u('https://www.emiratesnbd.com/en/cards/credit-cards', false, 'uae-bank'),
  u('https://www.bankfab.com/en-ae/personal', false, 'uae-bank'),
  u('https://www.adcb.com/en/personal', false, 'uae-bank'),
  u('https://www.adib.ae/en/personal/accounts', false, 'uae-bank'),
  u('https://www.mashreq.com/en/uae/neo/', false, 'uae-bank'),
  u('https://www.dib.ae/personal', false, 'uae-bank'),
  u('https://www.etisalat.ae/en/consumer/mobile.html', false, 'uae-bank'),
  u('https://www.du.ae/personal', false, 'uae-bank'),
  u('https://www.emiratesauction.com/plates', false, 'uae-bank'),
  u('https://uae.dubizzle.com/motors/used-cars/', false, 'uae-bank'),
  // Legitimate international (real)
  u('https://www.paypal.com/ae/home', false, 'international'),
  u('https://www.amazon.ae/gp/css/order-history', false, 'international'),
  u('https://support.apple.com/en-ae', false, 'international'),
  u('https://www.microsoft.com/en-ae', false, 'international'),
  u('https://www.wikipedia.org/', false, 'international'),
  u('https://github.com/vercel/next.js', false, 'international'),
  u('https://www.bbc.com/news', false, 'international'),
  u('https://www.aramex.com/ae/en/track/shipments', false, 'international'),
  // Ambiguous / unknown but benign (synthetic small businesses or real generic sites)
  u('https://www.alnoor-bakery-dubai.com/menu', false, 'ambiguous-unknown', true),
  u('https://desertrose-flowers.ae/', false, 'ambiguous-unknown', true),
  u('https://www.example.com/', false, 'ambiguous-unknown', false),
  u('https://blog.mycarjourney.net/2024/road-trip-oman', false, 'ambiguous-unknown', true),
  u('https://shop.gulf-gadgets.store/products/charger', false, 'ambiguous-unknown', true),
  u('https://sharjah-swim-academy.com/schedule', false, 'ambiguous-unknown', true),
  // Phishing (synthetic)
  u('http://emiratesnbd-secure-login.xyz/verify/account', true, 'phishing-url'),
  u('https://adcb-online-update.top/login?session=88213', true, 'phishing-url'),
  u('http://185.212.44.10/fab/login.php', true, 'phishing-url'),
  u('https://secure-mashreq-verify.online/auth', true, 'phishing-url'),
  u('https://www.paypal.com@login-verify-account.co/signin', true, 'phishing-url'),
  u('https://account-unlock-uaepass.site/verify?email=ali@example.com', true, 'phishing-url'),
  u('https://netflix-billing-update.click/payment', true, 'phishing-url'),
  u('http://dib-card-kyc.info/update', true, 'phishing-url'),
  // Brand impersonation / typosquatting (synthetic)
  u('https://paypa1.com/signin', true, 'brand-impersonation'),
  u('https://emiratesndb.com/login', true, 'brand-impersonation'),
  u('https://rnashreq.com/online-banking', true, 'brand-impersonation'),
  u('https://salik-ae.com/pay', true, 'brand-impersonation'),
  u('https://emiratespost-delivery.online/track', true, 'brand-impersonation'),
  u('https://aramex-redelivery.shop/fee', true, 'brand-impersonation'),
  u('https://uaepass-login.web.app/', true, 'brand-impersonation'),
  // Suspicious subdomains (synthetic)
  u('https://dubaipolice.gov.ae.fines-portal.online/pay', true, 'suspicious-subdomain'),
  u('https://emiratesnbd.com.secure-update.xyz/login', true, 'suspicious-subdomain'),
  u('https://login.bankfab.verify-access.net/auth', true, 'suspicious-subdomain'),
  u('https://tamm.abudhabi.services-pay.top/violation', true, 'suspicious-subdomain'),
  u('https://salik.ae.toll-balance.info/pay', true, 'suspicious-subdomain'),
  // Unicode look-alikes (synthetic, Cyrillic а/о/е substitutions)
  u('https://xn--slik-53d.ae/pay', true, 'unicode-lookalike'),
  u('https://xn--pypl-53dc.com/signin', true, 'unicode-lookalike'),
  u('https://xn--emirtesnbd-2qi.com/login', true, 'unicode-lookalike'),
  u('https://xn--dcb-5cd.com/login', true, 'unicode-lookalike'),
  // URL shorteners hiding payment / login pages (synthetic paths)
  u('https://bit.ly/3Salik-Pay', true, 'url-shortener'),
  u('http://tinyurl.com/adpolice-fine-pay', true, 'url-shortener'),
  u('https://cutt.ly/enbd-verify', true, 'url-shortener'),
  // Fake payment links (synthetic)
  u('https://rta-fines-payment.top/pay?ref=DXB-88231', true, 'fake-payment-link'),
  u('https://moi-traffic-fines.vip/payment', true, 'fake-payment-link'),
  u('https://darb-toll-unpaid.com/pay-now', true, 'fake-payment-link'),
  u('https://emirates-post-customs-fee.site/checkout', true, 'fake-payment-link'),
  u('https://dewa-refund-claim.online/card', true, 'fake-payment-link'),
  u('https://etisalat-reward-points.club/redeem?card=1', true, 'fake-payment-link'),
];

export const MESSAGE_CASES: MsgCase[] = [
  // Arabic phishing / fraud
  m('شرطة دبي: لديك مخالفة مرورية غير مدفوعة 500 درهم. ادفع الآن لتجنب الحجز: https://dxb-fines.top/pay', true, 'arabic-message'),
  m('سالك: رصيدك غير كافٍ ولديك رسوم غير مدفوعة. اضغط على الرابط للسداد خلال 24 ساعة https://salik-topup.site', true, 'arabic-message'),
  m('بريد الإمارات: شحنتك معلقة بسبب رسوم جمركية 7 دراهم. ادفع هنا https://bit.ly/ep-fee', true, 'arabic-message'),
  m('عزيزي العميل، تم إيقاف بطاقتك المصرفية. يرجى تحديث بياناتك وإرسال رمز التحقق فوراً لتجنب إغلاق الحساب.', true, 'arabic-message'),
  m('مبروك! ربحت جائزة 50,000 درهم من اتصالات. أرسل رقم البطاقة لاستلام الجائزة.', true, 'arabic-message'),
  m('عندي رقم مميز أبوظبي 1 / 9999 للبيع. حوّل عربون 10,000 درهم على حسابي الشخصي اليوم فقط وبعدها ننقل الملكية.', true, 'arabic-message'),
  m('لاندكروزر 2022 بنصف السعر، المالك مسافر، بيع مستعجل. ادفع رسوم الشحن والسيارة توصلك.', true, 'arabic-message'),
  m('الهوية الرقمية: تم تعليق حسابك. لتفعيله أدخل رقم الهوية وكلمة المرور عبر الرابط https://uaepass-renew.online', true, 'arabic-message'),
  // English phishing / fraud
  m('Abu Dhabi Police: You have an unpaid traffic violation of AED 400. Pay within 24 hours to avoid penalty: https://adpolice-fine.click/pay', true, 'english-message'),
  m('Emirates NBD: Your account has been suspended. Verify your identity at http://enbd-verify.top and confirm the OTP sent to you.', true, 'english-message'),
  m('Aramex: your parcel is on hold. A redelivery fee of AED 9.50 is required: https://aramex-fee.shop/pay', true, 'english-message'),
  m('Dear customer, FAB customer care here. Your card is blocked. Call our support on +971 55 123 9876 to unblock immediately.', true, 'english-message'),
  m('Congratulations! You won a prize from Amazon. Pay a small delivery fee with your card number to claim: https://amzn-prize.xyz', true, 'english-message'),
  m('ICP notice: your visa fee is unpaid. Pay now to avoid a travel ban: https://icp-visa-payment.site', true, 'english-message'),
  m('Guaranteed daily profit 5%! Invest in our crypto trading plan, deposit USDT to start today.', true, 'english-message'),
  m('I have transferred the payment, here is the screenshot. Please release the plate and transfer ownership now.', true, 'english-message'),
  // Mixed language
  m('RTA Dubai تنبيه: unpaid fine 300 AED. ادفع الآن via https://rta-pay.vip/fine', true, 'mixed-message'),
  m('Your DEWA refund is ready. استرداد 245 درهم. Enter card details here: https://dewa-refund.online', true, 'mixed-message'),
  m('Salik toll unpaid. رسوم غير مدفوعة. Pay link: https://salik-pay.info', true, 'mixed-message'),
  m('e& rewards: نقاطك ستنتهي اليوم! Redeem now and confirm your card number https://eand-points.top', true, 'mixed-message'),
  // Benign messages
  m('Hi Ahmed, the meeting is moved to 3pm tomorrow at our Dubai office. See you there.', false, 'english-message'),
  m('Your Careem ride receipt: AED 32.50 paid with your saved card. Thank you for riding.', false, 'english-message'),
  m('Reminder: parents meeting at school on Thursday at 5 pm. Please bring the report card.', false, 'english-message'),
  m('Your order from noon has been delivered. Rate your experience in the app.', false, 'english-message'),
  m('Can you send me the photos from the weekend trip to Hatta? Thanks!', false, 'english-message'),
  m('Your salary deposit of AED 12,000 has been credited to your account ending 4421.', false, 'english-message'),
  m('مرحباً، هل ما زلنا على موعد الغداء غداً الساعة الواحدة؟', false, 'arabic-message'),
  m('تذكير: موعدك في العيادة يوم الأحد الساعة 10 صباحاً. يرجى الحضور قبل 15 دقيقة.', false, 'arabic-message'),
  m('شكراً لتسوقك معنا، تم شحن طلبك وسيصلك خلال يومين.', false, 'arabic-message'),
  m('عيد مبارك وكل عام وأنتم بخير، تقبل الله منا ومنكم.', false, 'arabic-message'),
  m('الاجتماع الأسبوعي للفريق سيكون عن بعد هذا الأسبوع، الرابط في التقويم.', false, 'arabic-message'),
  m('Good morning! صباح الخير، don\'t forget the gym class at 7.', false, 'mixed-message'),
];

const party = (name: string, phone: string) => ({ name, phone });

export const DEAL_CASES: DealCase[] = [
  // Clean vehicle deals
  { type: 'deal', malicious: false, group: 'vehicle-deal', synthetic: true, input: { category: 'vehicle', price: 85000, buyer: party('Aisha Rahman', '+971 50 111 2233'), seller: party('Saeed Al Ketbi', '+971 52 444 5566'), vehicle: { make: 'Nissan', model: 'Patrol', year: 2019, vin: 'JN8AY2NY9K0123456', emirate: 'abu_dhabi', registeredOwner: 'Saeed Al Ketbi' }, payment: { method: 'aman_hold' }, conditions: 'Inspection at an approved centre, transfer at the licensing authority.', inspectionAgreed: true } },
  { type: 'deal', malicious: false, group: 'vehicle-deal', synthetic: true, input: { category: 'vehicle', price: 210000, buyer: party('John Mathews', '+971 56 777 8899'), seller: party('Mohammed Al Ali', '+971 50 222 3344'), vehicle: { make: 'BMW', model: 'X5', year: 2022, vin: 'WBACV6107N9K12345', emirate: 'dubai', registeredOwner: 'Mohammed Al Ali' }, payment: { method: 'aman_hold' }, conditions: 'Buyer test drive and inspection before payment hold.', inspectionAgreed: true } },
  { type: 'deal', malicious: false, group: 'vehicle-deal', synthetic: true, input: { category: 'vehicle', price: 42000, buyer: party('Priya Nair', '+971 55 333 1212'), seller: party('Khalfan Al Mazrouei', '+971 50 909 1010'), vehicle: { make: 'Toyota', model: 'Corolla', year: 2018, vin: 'JTDBR32E9J0123456', emirate: 'sharjah', registeredOwner: 'Khalfan Al Mazrouei' }, payment: { method: 'aman_hold' }, conditions: '', inspectionAgreed: true } },
  // Fraudulent vehicle deals
  { type: 'deal', malicious: true, group: 'vehicle-deal', synthetic: true, input: { category: 'vehicle', price: 60000, buyer: party('Omar Haddad', '+971 50 555 6677'), seller: party('Car Export Agent', '+44 7700 900456'), vehicle: { make: 'Lexus', model: 'LX600', year: 2023, vin: 'JTJHY00W0P4123456', emirate: 'dubai', registeredOwner: 'Rashid Al Nuaimi' }, payment: { method: 'third_party_account', beneficiaryName: 'Global Logistics FZE' }, conditions: 'Owner abroad, pay shipping fee and deposit first, car will be shipped.', inspectionAgreed: false } },
  { type: 'deal', malicious: true, group: 'vehicle-deal', synthetic: true, input: { category: 'vehicle', price: 95000, buyer: party('Sara Ahmed', '+971 52 121 3434'), seller: party('Hamad Saif', '+971 50 787 9898'), vehicle: { make: 'Mercedes-Benz', model: 'G500', year: 2021, vin: 'JTMHV05J6M4123456', emirate: 'dubai', registeredOwner: 'Hamad Saif' }, payment: { method: 'bank_transfer_to_seller', beneficiaryName: 'A. Petrov' }, conditions: 'Urgent sale today only.', inspectionAgreed: true } },
  { type: 'deal', malicious: true, group: 'vehicle-deal', synthetic: true, input: { category: 'vehicle', price: 70000, buyer: party('Lina Khoury', '+971 56 454 5656'), seller: party('Yusuf K', '+971 58 111 0000'), vehicle: { make: 'Toyota', model: 'Land Cruiser', year: 2016, vin: 'JTMHV05JOI4123456', emirate: 'ajman', registeredOwner: 'Abdulla Obaid' }, payment: { method: 'cash' }, conditions: 'No inspection, I will send the papers after you transfer the deposit.', inspectionAgreed: false } },
  // Clean plate deals
  { type: 'deal', malicious: false, group: 'plate-deal', synthetic: true, input: { category: 'plate', price: 120000, buyer: party('Noura Al Shamsi', '+971 50 616 1717'), seller: party('Ali Al Hosani', '+971 50 828 2929'), plate: { emirate: 'abu_dhabi', code: '1', number: '4040', plateType: 'private', registeredOwner: 'Ali Al Hosani' }, payment: { method: 'aman_hold' }, conditions: 'Transfer at ITC after payment hold.', inspectionAgreed: true } },
  { type: 'deal', malicious: false, group: 'plate-deal', synthetic: true, input: { category: 'plate', price: 38000, buyer: party('Rahul Menon', '+971 55 919 0101'), seller: party('Fatma Al Zaabi', '+971 50 343 5454'), plate: { emirate: 'dubai', code: 'Q', number: '58221', plateType: 'private', registeredOwner: 'Fatma Al Zaabi' }, payment: { method: 'aman_hold' }, conditions: '', inspectionAgreed: true } },
  { type: 'deal', malicious: false, group: 'plate-deal', synthetic: true, input: { category: 'plate', price: 250000, buyer: party('Majid Al Falasi', '+971 50 676 7878'), seller: party('Sultan Al Dhaheri', '+971 50 989 1212'), plate: { emirate: 'sharjah', code: '3', number: '88', plateType: 'classic', registeredOwner: 'Sultan Al Dhaheri' }, payment: { method: 'aman_hold' }, conditions: 'Transfer at the licensing authority.', inspectionAgreed: true } },
  // Fraudulent plate deals
  { type: 'deal', malicious: true, group: 'plate-deal', synthetic: true, input: { category: 'plate', price: 30000, buyer: party('Huda Saleh', '+971 50 141 5151'), seller: party('Plates Broker', '+971 55 000 9999'), plate: { emirate: 'dubai', code: 'B', number: '9', plateType: 'private', registeredOwner: 'Ahmed Bin Rashid' }, payment: { method: 'third_party_account', beneficiaryName: 'Quick Transfers LLC', iban: 'AE00 1234 5678 9012 3456 789' }, conditions: 'Pay first, send screenshot of transfer and I release the plate.', inspectionAgreed: true } },
  { type: 'deal', malicious: true, group: 'plate-deal', synthetic: true, input: { category: 'plate', price: 55000, buyer: party('Kareem Nasser', '+971 52 818 1919'), seller: party('Zayed M', '+971 50 222 1111'), plate: { emirate: 'abu_dhabi', code: '50', number: '0777', plateType: 'private', registeredOwner: 'Saif Al Mansoori' }, payment: { method: 'bank_transfer_to_seller', beneficiaryName: 'Zayed M' }, conditions: 'عربون قبل نقل الملكية، بيع مستعجل.', inspectionAgreed: true } },
  { type: 'deal', malicious: true, group: 'plate-deal', synthetic: true, input: { category: 'plate', price: 80000, buyer: party('Rania Fawzi', '+971 56 313 4141'), seller: party('Rania Fawzi', '+971 56 313 4141'), plate: { emirate: 'ras_al_khaimah', code: 'K', number: '123', plateType: 'private', registeredOwner: 'Obaid Al Shehhi' }, payment: { method: 'cash' }, conditions: 'Transfer the amount first via western union.', inspectionAgreed: true } },
];
