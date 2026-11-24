import type { BusinessInput } from '@/lib/analysis/business';
import type { SocialInput } from '@/lib/analysis/social';

/** SYNTHETIC demo inputs. Every phone number, handle and suspicious domain below is fictional. */
export const SAMPLE_URLS = {
  phishing: 'http://emiratesnbd-secure-login.xyz/verify/account?redirect=https://example.com',
  typosquat: 'https://paypa1.com/signin/update-billing',
  finePayment: 'https://rta-fines-payment.top/pay?ref=DXB-88231',
  subdomain: 'https://dubaipolice.gov.ae.fines-portal.online/pay',
  /** "sаlik.ae" with a Cyrillic "а" (U+0430). */
  homograph: 'https://xn--slik-53d.ae/pay',
  safe: 'https://www.dubaipolice.gov.ae/',
};

export const SAMPLE_EMAIL_EN = `From: "Emirates NBD Security" <alerts@enbd-secure-mail.com>
Reply-To: support.enbd@gmail.com
Subject: URGENT: Your account will be suspended within 24 hours
Authentication-Results: spf=fail dkim=none dmarc=fail

Dear Customer,

We detected unusual activity on your account. To avoid suspension you must verify your account immediately.
Click here: http://emiratesnbd-verify.top/login?id=88231
Please confirm your card number, CVV and the OTP you receive.

Failure to respond will result in legal action.
Emirates NBD Security Team`;

export const SAMPLE_EMAIL_AR = `From: "بريد الإمارات" <noreply@emiratespost-delivery.online>
Subject: شحنتك معلقة - رسوم جمركية

عزيزي العميل،
شحنتك معلقة بسبب رسوم جمركية غير مدفوعة (12.50 درهم).
يرجى الدفع فوراً خلال 24 ساعة وإلا سيتم إرجاع الشحنة.
ادفع الآن: https://bit.ly/3xParcel
أدخل رقم البطاقة ورمز التحقق لإتمام الدفع.`;

/** SMS-style fake traffic fine (Arabic + English mix). */
export const SAMPLE_SMS_FINE = `شرطة أبوظبي: لديك مخالفة مرورية غير مدفوعة بقيمة 400 درهم. ادفع خلال 24 ساعة لتجنب الغرامة الإضافية عبر الرابط: https://adpolice-fines.vip/pay
Abu Dhabi Police: unpaid traffic fine. Pay now to avoid penalty.`;

/** WhatsApp-style premium plate scam. */
export const SAMPLE_WHATSAPP_PLATE = `السلام عليكم، عندي رقم مميز دبي A 777 للبيع بسعر 45,000 درهم فقط، بيع مستعجل لأني مسافر.
حوّل عربون 5,000 درهم اليوم على حسابي الشخصي وأرسل لي صورة التحويل، وبعدها ننقل الملكية.
تواصل واتساب +971 50 123 4999`;

export const SAMPLE_BUSINESS: Record<'fakeHotline' | 'dealerAd' | 'official', BusinessInput> = {
  fakeHotline: {
    name: 'Emirates NBD Customer Service',
    phone: '+971 55 987 6543',
    website: 'emiratesnbd-help.com',
    adText: 'Sponsored · Emirates NBD customer care 24/7. Card blocked? Call our hotline now to unblock immediately.',
  },
  dealerAd: {
    name: 'Prime Cars Trading',
    phone: '+971 50 123 4999',
    listingUrl: 'https://maps.app.goo.gl/AbCdEf123',
    adText: 'Land Cruiser 2022 for AED 95,000 only. Owner travelling abroad, urgent sale. Pay AED 5,000 booking fee by transfer first, car will be shipped to you.',
  },
  official: {
    name: 'Salik',
    website: 'https://www.salik.ae',
  },
};

export const SAMPLE_SOCIAL: Record<'impersonator' | 'official', SocialInput> = {
  impersonator: {
    platform: 'instagram',
    handle: '@emiratesnbd_support_uae',
    displayName: 'Emirates NBD ✅ Support',
    followers: 48,
    following: 1200,
    posts: 6,
    accountAgeMonths: 1,
    message: 'Dear customer, your card is blocked. To unblock immediately send us your card number and the OTP code, or contact us on WhatsApp wa.me/971559876543',
  },
  official: {
    platform: 'instagram',
    handle: '@emiratesnbd',
    displayName: 'Emirates NBD',
    followers: 520000,
    following: 120,
    posts: 4100,
    accountAgeMonths: 140,
    message: '',
  },
};
