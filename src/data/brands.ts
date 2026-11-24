import { T, type L } from '@/lib/analysis/types';

/**
 * Commonly impersonated organizations (UAE + global).
 *
 * Every domain below was verified with live DNS resolution plus a web search showing the organization's
 * own site on that domain: see scripts/verify-official-domains.mjs and docs/official-domains-verification.json.
 * A domain that could not be verified (e.g. ecrime.ae) is deliberately NOT listed as trusted.
 *
 * Matching:
 *  - `keywords`: distinctive strings (>= 5 chars) matched as substrings of a hostname / text.
 *  - `tokens`:   short names matched only as a whole hostname label or hyphen-separated token
 *                (so "du" matches "du-billing.com" but not "dubai.com").
 *  - `ar`:       Arabic names matched in message text.
 */
export type BrandCategory = 'government' | 'police' | 'bank' | 'telecom' | 'transport' | 'delivery' | 'marketplace' | 'global';

export interface Brand {
  id: string;
  name: L;
  category: BrandCategory;
  keywords: string[];
  tokens: string[];
  ar: string[];
  domains: string[];
  handles: string[];
  uae: boolean;
}

const b = (id: string, name: L, category: BrandCategory, domains: string[], o: Partial<Pick<Brand, 'keywords' | 'tokens' | 'ar' | 'handles'>> & { uae?: boolean } = {}): Brand => ({
  id,
  name,
  category,
  domains,
  keywords: o.keywords ?? [],
  tokens: o.tokens ?? [],
  ar: o.ar ?? [],
  handles: o.handles ?? [],
  uae: o.uae ?? true,
});

export const BRANDS: Brand[] = [
  // Government & police
  b('uaepass', T('UAE PASS', 'الهوية الرقمية (UAE PASS)'), 'government', ['uaepass.ae'], { keywords: ['uaepass', 'uae-pass'], ar: ['الهوية الرقمية', 'يو ايه اي باس'], handles: ['uaepass'] }),
  b('tamm', T('TAMM (Abu Dhabi Government)', 'تم (حكومة أبوظبي)'), 'government', ['tamm.abudhabi'], { tokens: ['tamm'], ar: ['منصة تم', 'تطبيق تم'] }),
  b('adpolice', T('Abu Dhabi Police', 'شرطة أبوظبي'), 'police', ['adpolice.gov.ae', 'abudhabipolice.gov.ae'], { keywords: ['adpolice', 'abudhabipolice', 'abudhabi-police'], ar: ['شرطة أبوظبي', 'شرطة ابوظبي'], handles: ['adpolicehq'] }),
  b('dubaipolice', T('Dubai Police', 'شرطة دبي'), 'police', ['dubaipolice.gov.ae'], { keywords: ['dubaipolice', 'dubai-police'], ar: ['شرطة دبي'], handles: ['dubaipolicehq'] }),
  b('uaegov', T('UAE Government portal', 'البوابة الرسمية لحكومة الإمارات'), 'government', ['u.ae'], { keywords: ['uaegov', 'uae-gov', 'govuae'], ar: ['حكومة الإمارات'] }),
  b('moi', T('UAE Ministry of Interior', 'وزارة الداخلية'), 'government', ['moi.gov.ae'], { keywords: ['moiuae', 'moi-uae', 'uaemoi'], tokens: ['moi'], ar: ['وزارة الداخلية'] }),
  b('icp', T('ICP (Identity, Citizenship, Customs & Port Security)', 'الهيئة الاتحادية للهوية والجنسية والجمارك وأمن المنافذ'), 'government', ['icp.gov.ae'], { keywords: ['icpuae', 'icp-uae'], tokens: ['icp'], ar: ['الهيئة الاتحادية للهوية'], handles: ['icpuae'] }),
  b('cbuae', T('Central Bank of the UAE', 'مصرف الإمارات المركزي'), 'government', ['centralbank.ae'], { keywords: ['centralbank', 'cbuae'], ar: ['المصرف المركزي'] }),
  // Transport & tolls & utilities
  b('rta', T('RTA Dubai', 'هيئة الطرق والمواصلات'), 'transport', ['rta.ae'], { keywords: ['rtadubai', 'rta-dubai', 'dubairta'], tokens: ['rta'], ar: ['هيئة الطرق والمواصلات'], handles: ['rta_dubai'] }),
  b('salik', T('Salik', 'سالك'), 'transport', ['salik.ae'], { keywords: ['salik'], ar: ['سالك'] }),
  b('darb', T('Darb (Abu Dhabi toll, ITC)', 'درب (بوابات أبوظبي)'), 'transport', ['itc.gov.ae'], { keywords: ['darbtoll', 'darb-toll'], tokens: ['darb', 'itc'], ar: ['بوابات درب', 'رسوم درب', 'تعرفة درب', 'نظام درب'] }),
  b('dewa', T('DEWA', 'هيئة كهرباء ومياه دبي'), 'government', ['dewa.gov.ae'], { tokens: ['dewa'], ar: ['هيئة كهرباء ومياه دبي', 'ديوا'] }),
  // Banks
  b('enbd', T('Emirates NBD', 'بنك الإمارات دبي الوطني'), 'bank', ['emiratesnbd.com'], { keywords: ['emiratesnbd', 'emirates-nbd'], tokens: ['enbd'], ar: ['الإمارات دبي الوطني'], handles: ['emiratesnbd'] }),
  b('fab', T('First Abu Dhabi Bank (FAB)', 'بنك أبوظبي الأول'), 'bank', ['bankfab.com'], { keywords: ['bankfab', 'fabbank'], tokens: ['fab'], ar: ['بنك أبوظبي الأول', 'بنك ابوظبي الاول'] }),
  b('adcb', T('ADCB', 'بنك أبوظبي التجاري'), 'bank', ['adcb.com'], { tokens: ['adcb'], keywords: ['adcbbank'], ar: ['بنك أبوظبي التجاري'], handles: ['adcb'] }),
  b('adib', T('ADIB', 'مصرف أبوظبي الإسلامي'), 'bank', ['adib.ae'], { tokens: ['adib'], ar: ['مصرف أبوظبي الإسلامي'] }),
  b('mashreq', T('Mashreq', 'بنك المشرق'), 'bank', ['mashreq.com'], { keywords: ['mashreq'], ar: ['بنك المشرق', 'المشرق'], handles: ['mashreq'] }),
  b('dib', T('Dubai Islamic Bank', 'بنك دبي الإسلامي'), 'bank', ['dib.ae'], { keywords: ['dubaiislamic'], tokens: ['dib'], ar: ['بنك دبي الإسلامي'] }),
  // Telecom
  b('eand', T('e& (Etisalat)', 'إي آند (اتصالات)'), 'telecom', ['etisalat.ae', 'eand.com'], { keywords: ['etisalat'], tokens: ['eand'], ar: ['اتصالات', 'إي آند'], handles: ['etisalat'] }),
  b('du', T('du', 'دو'), 'telecom', ['du.ae'], { keywords: ['dutelecom', 'du-telecom'], tokens: ['du'], ar: ['دو للاتصالات', 'شركة دو'] }),
  // Delivery & marketplaces
  b('emiratespost', T('Emirates Post', 'بريد الإمارات'), 'delivery', ['emiratespost.ae'], { keywords: ['emiratespost', 'emirates-post'], tokens: ['empost'], ar: ['بريد الإمارات', 'بريد الامارات'], handles: ['emiratespost'] }),
  b('aramex', T('Aramex', 'أرامكس'), 'delivery', ['aramex.com'], { keywords: ['aramex'], ar: ['أرامكس', 'ارامكس'], handles: ['aramex'] }),
  b('dhl', T('DHL', 'دي إتش إل'), 'delivery', ['dhl.com'], { tokens: ['dhl'], keywords: ['dhlexpress'], ar: ['دي إتش إل'], uae: false }),
  b('fedex', T('FedEx', 'فيديكس'), 'delivery', ['fedex.com'], { keywords: ['fedex'], ar: ['فيديكس'], uae: false }),
  b('emiratesauction', T('Emirates Auction', 'الإمارات للمزادات'), 'marketplace', ['emiratesauction.com'], { keywords: ['emiratesauction', 'emirates-auction'], ar: ['الإمارات للمزادات'] }),
  b('dubizzle', T('dubizzle', 'دوبيزل'), 'marketplace', ['dubizzle.com'], { keywords: ['dubizzle'], ar: ['دوبيزل'] }),
  b('noon', T('noon', 'نون'), 'marketplace', ['noon.com'], { tokens: ['noon'], ar: ['موقع نون'] }),
  b('careem', T('Careem', 'كريم'), 'marketplace', ['careem.com'], { keywords: ['careem'], ar: ['كريم كار', 'تطبيق كريم'] }),
  b('emirates', T('Emirates (airline)', 'طيران الإمارات'), 'transport', ['emirates.com'], { tokens: ['emirates'], ar: ['طيران الإمارات'] }),
  b('etihad', T('Etihad Airways', 'الاتحاد للطيران'), 'transport', ['etihad.com'], { keywords: ['etihad'], ar: ['الاتحاد للطيران'] }),
  // Global
  b('amazon', T('Amazon', 'أمازون'), 'global', ['amazon.ae', 'amazon.com'], { keywords: ['amazon'], ar: ['أمازون', 'امازون'], uae: false }),
  b('paypal', T('PayPal', 'باي بال'), 'global', ['paypal.com'], { keywords: ['paypal'], ar: ['باي بال'], uae: false }),
  b('apple', T('Apple', 'أبل'), 'global', ['apple.com'], { keywords: ['icloud', 'appleid', 'apple-id'], tokens: ['apple'], ar: ['أبل', 'آبل'], uae: false }),
  b('microsoft', T('Microsoft', 'مايكروسوفت'), 'global', ['microsoft.com'], { keywords: ['microsoft', 'office365', 'outlook'], ar: ['مايكروسوفت'], uae: false }),
  b('google', T('Google', 'جوجل'), 'global', ['google.com'], { keywords: ['google', 'gmail'], ar: ['جوجل', 'قوقل'], uae: false }),
  b('netflix', T('Netflix', 'نتفليكس'), 'global', ['netflix.com'], { keywords: ['netflix'], ar: ['نتفليكس'], uae: false }),
  b('whatsapp', T('WhatsApp', 'واتساب'), 'global', ['whatsapp.com'], { keywords: ['whatsapp'], uae: false }),
  b('binance', T('Binance', 'بينانس'), 'global', ['binance.com'], { keywords: ['binance'], ar: ['بينانس'], uae: false }),
];

export const OFFICIAL_DOMAINS = new Map<string, Brand>(BRANDS.flatMap((x) => x.domains.map((d) => [d, x] as const)));

/** Public suffixes whose registrations are restricted to UAE government entities. */
export const GOVERNMENT_SUFFIXES = ['gov.ae', 'abudhabi'];

export const URL_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rb.gy', 'ow.ly', 'buff.ly', 'shorturl.at', 'tiny.cc', 's.id',
  'rebrand.ly', 't.ly', 'lnkd.in', 'shorte.st', 'v.gd', 'qrco.de', 'bitly.com', 'tinu.be', 'shorturl.asia', 'u.to', 'clck.ru', 'n9.cl',
]);

export const SUSPICIOUS_TLDS = new Set([
  'xyz', 'top', 'click', 'zip', 'mov', 'tk', 'ml', 'ga', 'cf', 'gq', 'work', 'support', 'buzz', 'rest', 'fit', 'cam', 'icu',
  'monster', 'sbs', 'cfd', 'quest', 'lol', 'country', 'loan', 'win', 'bid', 'review', 'party', 'date', 'racing', 'download',
  'stream', 'gdn', 'men', 'kim', 'online', 'site', 'live', 'shop', 'vip', 'cyou', 'bond', 'help', 'info',
]);

export const FREE_EMAIL_PROVIDERS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'aol.com', 'icloud.com', 'proton.me', 'protonmail.com',
  'gmx.com', 'mail.com', 'yandex.com', 'zoho.com',
]);

/** Free hosting / site-builder platforms frequently abused to host phishing pages. */
export const FREE_HOSTING = new Set([
  'web.app', 'firebaseapp.com', 'netlify.app', 'vercel.app', 'pages.dev', 'workers.dev', 'github.io', 'glitch.me', 'weebly.com',
  'wixsite.com', 'blogspot.com', 'sites.google.com', '000webhostapp.com', 'square.site', 'webflow.io', 'repl.co', 'ngrok.io',
  'ngrok-free.app', 'trycloudflare.com', 'r2.dev', 'onrender.com', 'herokuapp.com', 'azurewebsites.net', 'z13.web.core.windows.net',
]);
