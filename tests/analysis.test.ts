import { describe, expect, it } from 'vitest';
import { analyzeUrl, checkUrl } from '@/lib/analysis/url';
import { analyzeEmail, detectScenarios } from '@/lib/analysis/email';
import { analyzeBusiness } from '@/lib/analysis/business';
import { analyzeSocial } from '@/lib/analysis/social';
import { classifyUaePhone, registeredDomain, levenshtein, toUnicodeHost } from '@/lib/analysis/domain';
import { finding, scoreFindings } from '@/lib/analysis/report';
import { T } from '@/lib/analysis/types';
import { redact } from '@/lib/redact';
import { SAMPLE_BUSINESS, SAMPLE_EMAIL_AR, SAMPLE_EMAIL_EN, SAMPLE_SMS_FINE, SAMPLE_SOCIAL, SAMPLE_URLS, SAMPLE_WHATSAPP_PLATE } from '@/data/samples';

const ids = (r: { findings: { id: string }[] }) => r.findings.map((f) => f.id);

describe('domain utils', () => {
  it('extracts registrable domains with the Public Suffix List', () => {
    expect(registeredDomain('www.dubaipolice.gov.ae')).toBe('dubaipolice.gov.ae');
    expect(registeredDomain('a.b.tamm.abudhabi')).toBe('tamm.abudhabi');
    expect(registeredDomain('login.paypal.com')).toBe('paypal.com');
    expect(registeredDomain('a.b.example.co.uk')).toBe('example.co.uk');
  });
  it('decodes punycode (homograph reveal)', () => {
    expect(toUnicodeHost('xn--slik-53d.ae')).toBe('sаlik.ae');
    expect(toUnicodeHost('xn--pypl-53dc.com')).toBe('pаypаl.com');
  });
  it('computes edit distance', () => {
    expect(levenshtein('paypal', 'paypa1')).toBe(1);
  });
  it('classifies UAE phone numbers by format', () => {
    expect(classifyUaePhone('+971 50 123 4567').type).toBe('mobile');
    expect(classifyUaePhone('04 555 0101').type).toBe('landline');
    expect(classifyUaePhone('800 4444').type).toBe('tollfree');
    expect(classifyUaePhone('+44 7700 900123').type).toBe('international');
  });
});

describe('URL analysis', () => {
  it('flags UAE bank impersonation on a suspicious TLD as dangerous', () => {
    const r = analyzeUrl(SAMPLE_URLS.phishing)!;
    expect(ids(r)).toEqual(expect.arrayContaining(['brand-impersonation', 'suspicious-tld', 'no-https', 'redirect']));
    expect(r.level).toBe('critical');
    expect(r.official?.matches).toBe(false);
    expect(r.official?.officialDomains).toContain('emiratesnbd.com');
  });
  it('detects typosquatting', () => {
    const r = analyzeUrl(SAMPLE_URLS.typosquat)!;
    expect(ids(r)).toContain('typosquat');
    expect(r.score).toBeGreaterThanOrEqual(50);
  });
  it('detects a deceptive subdomain that puts an official domain in front', () => {
    const r = analyzeUrl(SAMPLE_URLS.subdomain)!;
    expect(ids(r)).toContain('brand-subdomain');
    expect(['high', 'critical']).toContain(r.level);
  });
  it('detects a Cyrillic homograph of Salik', () => {
    const r = checkUrl(SAMPLE_URLS.homograph)!;
    expect(r.unicodeHost).toBe('sаlik.ae');
    expect(r.findings.map((f) => f.id)).toEqual(expect.arrayContaining(['homograph', 'typosquat']));
  });
  it('detects a fake traffic-fine payment link', () => {
    const r = analyzeUrl(SAMPLE_URLS.finePayment)!;
    expect(r.scenarios).toContain('fake-payment-link');
    expect(['high', 'critical']).toContain(r.level);
  });
  it('rates verified official sites low, including .abudhabi and gov.ae', () => {
    for (const u of [SAMPLE_URLS.safe, 'https://www.tamm.abudhabi/', 'https://www.salik.ae/en', 'https://www.bankfab.com/en-ae/personal', 'https://www.adib.ae/en']) {
      const r = analyzeUrl(u)!;
      expect(ids(r), u).toContain('official-domain');
      expect(r.level, u).toBe('low');
    }
  });
  it('does not treat short brand names as substrings (no false positives)', () => {
    expect(ids(analyzeUrl('https://www.dubai.com/')!)).not.toContain('brand-impersonation');
    expect(ids(analyzeUrl('https://moon.com/')!)).not.toContain('typosquat');
    expect(analyzeUrl('https://www.afternoon-tea.com/')!.level).toBe('low');
  });
  it('flags IP hosts, shorteners and free hosting', () => {
    expect(ids(analyzeUrl('http://192.168.10.5/login')!)).toContain('ip-host');
    expect(ids(analyzeUrl('https://bit.ly/abc123')!)).toContain('shortener');
    const fh = analyzeUrl('https://uae-pass-verify.web.app/login')!;
    expect(ids(fh)).toEqual(expect.arrayContaining(['free-hosting', 'brand-impersonation']));
    expect(fh.official?.submitted).toBe('uae-pass-verify.web.app');
  });
  it('returns null for non-URLs', () => {
    expect(analyzeUrl('hello there')).toBeNull();
  });
  it('discloses live checks as not performed when only the offline engine runs', () => {
    const r = analyzeUrl('https://example.com')!;
    expect(r.unavailableChecks.length).toBeGreaterThan(0);
    expect(r.live).toBe(false);
    expect(r.sufficiency).toBe('limited');
  });
});

describe('Message analysis (email / SMS / WhatsApp)', () => {
  it('detects classic bank phishing email', () => {
    const r = analyzeEmail(SAMPLE_EMAIL_EN);
    expect(ids(r)).toEqual(expect.arrayContaining(['display-name-spoof', 'reply-to-mismatch', 'auth-fail', 'credentials', 'urgency', 'malicious-link']));
    expect(r.level).toBe('critical');
  });
  it('detects Arabic parcel-fee scam', () => {
    const r = analyzeEmail(SAMPLE_EMAIL_AR);
    expect(r.scenarios).toContain('delivery-fee');
    expect(ids(r)).toEqual(expect.arrayContaining(['urgency', 'credentials']));
    expect(r.score).toBeGreaterThanOrEqual(50);
  });
  it('detects a mixed Arabic/English fake traffic-fine SMS impersonating Abu Dhabi Police', () => {
    const r = analyzeEmail(SAMPLE_SMS_FINE);
    expect(r.scenarios).toContain('fake-traffic-fine');
    expect(ids(r)).toContain('link-not-official');
    expect(r.official?.brand.en).toBe('Abu Dhabi Police');
    expect(['high', 'critical']).toContain(r.level);
  });
  it('detects a WhatsApp premium plate scam with fake payment confirmation', () => {
    const r = analyzeEmail(SAMPLE_WHATSAPP_PLATE);
    expect(r.scenarios).toEqual(expect.arrayContaining(['plate-sale', 'fake-payment-confirmation']));
    expect(['high', 'critical']).toContain(r.level);
  });
  it('normalizes Arabic spelling variants', () => {
    expect(detectScenarios('شرطه ابوظبي: لديك مخالفه غير مدفوعه، ادفع عبر الرابط').map((s) => s.id)).toContain('fake-traffic-fine');
  });
  it('keeps benign messages low (EN and AR)', () => {
    expect(analyzeEmail('From: Sara <sara@example.org>\nSubject: Lunch tomorrow\n\nHi, are we still meeting for lunch at 1pm?').level).toBe('low');
    expect(analyzeEmail('مرحبا، هل ما زلنا على موعد الغداء غداً الساعة الواحدة؟').level).toBe('low');
  });
});

describe('Business, listing and phone check', () => {
  it('flags a fake bank customer-service ad with a mobile number', () => {
    const r = analyzeBusiness(SAMPLE_BUSINESS.fakeHotline);
    expect(ids(r)).toEqual(expect.arrayContaining(['phone-mobile-official']));
    expect(r.official?.matches).toBe(false);
    expect(['high', 'critical']).toContain(r.level);
  });
  it('flags a car-deposit listing and identifies the Maps link without fetching it', () => {
    const r = analyzeBusiness(SAMPLE_BUSINESS.dealerAd);
    expect(ids(r)).toContain('maps-listing');
    expect(r.scenarios).toContain('vehicle-sale');
    expect(['high', 'critical']).toContain(r.level);
  });
  it('recognizes the official website of a verified organization', () => {
    const r = analyzeBusiness(SAMPLE_BUSINESS.official);
    expect(r.official?.matches).toBe(true);
    expect(r.level).toBe('low');
  });
  it('does not use any synthetic registry', () => {
    const r = analyzeBusiness({ name: 'Totally Unknown Widgets Co' });
    expect(ids(r).some((i) => /registry|license|watchlist/.test(i))).toBe(false);
    expect(r.level).toBe('low');
  });
});

describe('Social account analysis', () => {
  it('flags an impersonating bank-support account', () => {
    const r = analyzeSocial(SAMPLE_SOCIAL.impersonator);
    expect(ids(r)).toEqual(expect.arrayContaining(['impersonation', 'fake-badge', 'new-account', 'credentials', 'off-platform']));
    expect(r.level).toBe('critical');
  });
  it('recognizes the commonly used handle', () => {
    const r = analyzeSocial(SAMPLE_SOCIAL.official);
    expect(ids(r)).toContain('known-handle');
    expect(r.level).toBe('low');
  });
});

describe('Scoring guard', () => {
  it('live/research signals alone cannot exceed "Caution"', () => {
    const f = [finding('new-domain', 20, T('x', 'x'), T('x', 'x'), undefined, 'live'), finding('public-warnings', 30, T('x', 'x'), T('x', 'x'), undefined, 'research')];
    expect(scoreFindings(f)).toBe(45);
    expect(scoreFindings([...f, finding('brand-impersonation', 40, T('x', 'x'), T('x', 'x'))])).toBe(90);
  });
});

describe('Redaction', () => {
  it('redacts cards, IBANs, Emirates ID, OTPs, emails and phone digits', () => {
    const out = redact('Card 4111 1111 1111 1111, IBAN AE070331234567890123456, EID 784-1990-1234567-1, OTP code 482913, mail ali.hassan@example.com, call +971 50 123 4567');
    expect(out).not.toContain('4111 1111 1111 1111');
    expect(out).toContain('•••• •••• •••• 1111');
    expect(out).not.toContain('0331234567890123');
    expect(out).not.toContain('1234567-1');
    expect(out).not.toContain('482913');
    expect(out).not.toContain('ali.hassan');
    expect(out).toContain('4567');
    expect(out).not.toContain('123 4567');
  });
});
