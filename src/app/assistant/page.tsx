'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { RiskReport } from '@/components/RiskReport';
import { ThreatFeed } from '@/components/ThreatFeed';
import { Logo } from '@/components/Logo';
import { analyzeUrl } from '@/lib/analysis/url';
import { analyzeEmail } from '@/lib/analysis/email';
import { analyzeBusiness, type BusinessInput } from '@/lib/analysis/business';
import { analyzeSocial, type Platform, type SocialInput } from '@/lib/analysis/social';
import { extractUrls } from '@/lib/analysis/domain';
import { T, type AnalysisKind, type L, type Report } from '@/lib/analysis/types';
import { SAMPLE_BUSINESS, SAMPLE_EMAIL_AR, SAMPLE_EMAIL_EN, SAMPLE_SMS_FINE, SAMPLE_SOCIAL, SAMPLE_URLS, SAMPLE_WHATSAPP_PLATE } from '@/data/samples';
import { BASE, IS_STATIC, getServerStatus, type ServerStatus } from '@/lib/ai/client';
import type { AiMode } from '@/components/AiInsight';

const PREF_KEY = 'aman.assistant.prefs.v2';

type Msg = { id: number; role: 'user' | 'assistant'; text?: string | L; report?: Report; submitted?: string };
type Mode = AnalysisKind | null;
type Prefs = { ai: boolean; live: boolean; research: boolean };

const WELCOME: L = T(
  'Hi, I am AMAN. Paste a suspicious link, SMS, WhatsApp or email message, or check a business, ad or phone number. I check it against detection rules, live domain data and public sources, then explain the evidence.',
  'مرحباً، أنا أمان. الصق رابطاً أو رسالة SMS أو واتساب أو بريداً مريباً، أو افحص نشاطاً تجارياً أو إعلاناً أو رقم هاتف. أفحصه بقواعد الكشف وبيانات النطاق المباشرة والمصادر العلنية، ثم أشرح الأدلة.',
);

const MODE_INTRO: Record<AnalysisKind, L> = {
  url: T('Paste the link. I will compare it with verified official domains, check its registration date, DNS, redirects and HTTPS, and search for public scam reports. The site is never opened in your browser.', 'الصق الرابط. سأقارنه بالنطاقات الرسمية الموثّقة، وأفحص تاريخ تسجيله وDNS وإعادة التوجيه وHTTPS، وأبحث عن بلاغات احتيال علنية. لا يُفتح الموقع في متصفحك أبداً.'),
  email: T('Paste the SMS, WhatsApp message or email. For emails, include the From:, Reply-To: and Subject: lines if you can.', 'الصق رسالة SMS أو واتساب أو البريد. للبريد، أضف أسطر From: و Reply-To: و Subject: إن أمكن.'),
  business: T('Enter what you were given: business name, phone number, website, a Google Maps link, or the text of the ad / search result.', 'أدخل ما وصلك: اسم النشاط أو رقم الهاتف أو الموقع أو رابط خرائط Google أو نص الإعلان / نتيجة البحث.'),
  social: T('Enter the account details and, if you have it, the message they sent you.', 'أدخل بيانات الحساب، والرسالة التي أرسلها إن وُجدت.'),
};

const PLATFORMS: Platform[] = ['instagram', 'x', 'facebook', 'tiktok', 'whatsapp', 'telegram', 'linkedin', 'snapchat'];
const emptyBiz: BusinessInput = { name: '', phone: '', website: '', listingUrl: '', adText: '' };
const emptySocial = { platform: 'instagram' as Platform, handle: '', displayName: '', followers: '', following: '', posts: '', accountAgeMonths: '', message: '' };
type SocialForm = typeof emptySocial;
const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

const SERVER_DOWN = T('The AMAN server could not be reached, so only the offline detection rules ran (no live checks, research or AI).', 'تعذّر الوصول إلى خادم أمان، لذا تم تشغيل قواعد الكشف دون اتصال فقط (بلا فحوصات مباشرة أو بحث أو ذكاء اصطناعي).');

export default function AssistantPage() {
  const { t, tr, lang } = useI18n();
  const [tab, setTab] = useState<'chat' | 'feed'>('chat');
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, role: 'assistant', text: WELCOME }]);
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState('');
  const [biz, setBiz] = useState<BusinessInput>(emptyBiz);
  const [social, setSocial] = useState<SocialForm>(emptySocial);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<L | null>(null);
  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ServerStatus>({ state: 'checking', ai: false, research: false, providers: [] });
  const [prefs, setPrefs] = useState<Prefs>({ ai: true, live: true, research: true });

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? 'null') as Prefs | null;
      if (p) setPrefs({ ai: p.ai !== false, live: p.live !== false, research: p.research !== false });
    } catch {
      /* ignore */
    }
    getServerStatus().then(setStatus);
  }, []);

  const setPref = (k: keyof Prefs) => {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const aiMode: AiMode = status.state === 'checking' ? 'checking' : IS_STATIC ? 'static' : !status.ai ? 'not_configured' : prefs.ai ? 'on' : 'user_off';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, busy]);

  const push = (...m: Omit<Msg, 'id'>[]) => setMsgs((prev) => [...prev, ...m.map((x) => ({ ...x, id: idRef.current++ }))]);

  /** Server pipeline first; offline rules engine as the final fallback. */
  const analyze = async (userText: string, kind: AnalysisKind, payload: Record<string, unknown>, local: () => Report | null, invalid: L) => {
    push({ role: 'user', text: userText });
    setBusy(true);
    setPhase(T('Running detection rules…', 'جارٍ تشغيل قواعد الكشف…'));
    const timer = setTimeout(() => setPhase(prefs.live || prefs.research ? T('Checking domain registration, DNS and public sources…', 'جارٍ فحص تسجيل النطاق وDNS والمصادر العلنية…') : null), 700);
    let report: Report | null = null;
    let note: L | undefined;
    if (!IS_STATIC && status.state !== 'offline') {
      try {
        const r = await fetch(`${BASE}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, ...payload, options: { live: prefs.live, research: prefs.research } }),
          signal: AbortSignal.timeout(30_000),
        });
        const j = await r.json();
        if (j.ok) report = j.report as Report;
        else if (r.status === 400 || r.status === 422) {
          report = null;
        } else note = SERVER_DOWN;
      } catch {
        note = SERVER_DOWN;
      }
    } else note = SERVER_DOWN;
    if (!report && note) report = local();
    clearTimeout(timer);
    setPhase(null);
    setBusy(false);
    if (!report) return push({ role: 'assistant', text: invalid });
    if (note) push({ role: 'assistant', text: note });
    push({ role: 'assistant', report, submitted: userText });
  };

  const chooseMode = (m: AnalysisKind) => {
    setMode(m);
    push({ role: 'assistant', text: MODE_INTRO[m] });
  };

  const submit = () => {
    if (busy) return;
    if (mode === 'business') {
      if (!biz.name.trim() && !biz.website?.trim() && !biz.phone?.trim() && !biz.adText?.trim() && !biz.listingUrl?.trim()) return;
      const summary = [biz.name, biz.phone, biz.website, biz.listingUrl, biz.adText].filter(Boolean).join('\n');
      const input = { ...biz };
      setBiz(emptyBiz);
      return analyze(summary, 'business', { business: input }, () => analyzeBusiness(input), T('Please enter at least a name, phone, website or ad text.', 'أدخل على الأقل اسماً أو هاتفاً أو موقعاً أو نص إعلان.'));
    }
    if (mode === 'social') {
      if (!social.handle.trim()) return;
      const input: SocialInput = { platform: social.platform, handle: social.handle, displayName: social.displayName, followers: num(social.followers), following: num(social.following), posts: num(social.posts), accountAgeMonths: num(social.accountAgeMonths), message: social.message };
      setSocial(emptySocial);
      return analyze(`${input.platform}: ${input.handle}${input.message ? '\n' + input.message : ''}`, 'social', { social: input }, () => analyzeSocial(input), T('Please enter the account handle.', 'أدخل معرّف الحساب.'));
    }
    const v = text.trim();
    if (!v) return;
    setText('');
    const badUrl = T('That does not look like a valid link. Paste a full address, e.g. https://example.com', 'لا يبدو هذا رابطاً صالحاً. الصق عنواناً كاملاً مثل https://example.com');
    if (mode === 'url') return analyze(v, 'url', { text: v }, () => analyzeUrl(v), badUrl);
    if (mode === 'email') return analyze(v, 'email', { text: v }, () => analyzeEmail(v), badUrl);
    // Free text: detect intent
    const urls = extractUrls(v);
    const singleUrl = !/\s/.test(v) && (urls.length === 1 || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v));
    if (singleUrl) return analyze(v, 'url', { text: v }, () => analyzeUrl(v), badUrl);
    if (/^(from|subject|reply-to):/im.test(v) || v.length > 40 || urls.length > 0) return analyze(v, 'email', { text: v }, () => analyzeEmail(v), badUrl);
    push({ role: 'user', text: v }, { role: 'assistant', text: T('I can check links, SMS/WhatsApp/email messages, businesses, ads, phone numbers and social accounts. Pick a quick action below, or paste the suspicious content directly.', 'يمكنني فحص الروابط ورسائل SMS وواتساب والبريد والأنشطة التجارية والإعلانات وأرقام الهواتف وحسابات التواصل. اختر إجراءً سريعاً أدناه، أو الصق المحتوى المريب مباشرة.') });
  };

  const fillSample = (which: string) => {
    if (mode === 'url') setText(SAMPLE_URLS[which as keyof typeof SAMPLE_URLS] ?? SAMPLE_URLS.phishing);
    if (mode === 'email') setText(which === 'ar' ? SAMPLE_EMAIL_AR : which === 'sms' ? SAMPLE_SMS_FINE : which === 'wa' ? SAMPLE_WHATSAPP_PLATE : SAMPLE_EMAIL_EN);
    if (mode === 'business') setBiz({ ...emptyBiz, ...SAMPLE_BUSINESS[which as keyof typeof SAMPLE_BUSINESS] });
    if (mode === 'social') {
      const s = SAMPLE_SOCIAL[which as 'impersonator' | 'official'];
      setSocial({ platform: s.platform, handle: s.handle, displayName: s.displayName ?? '', followers: String(s.followers ?? ''), following: String(s.following ?? ''), posts: String(s.posts ?? ''), accountAgeMonths: String(s.accountAgeMonths ?? ''), message: s.message ?? '' });
    }
  };

  const samples: Record<AnalysisKind, { key: string; label: string }[]> = {
    url: [
      { key: 'phishing', label: tr('Bank phishing', 'تصيّد بنكي') },
      { key: 'finePayment', label: tr('Fake fine payment', 'دفع مخالفة مزيّف') },
      { key: 'subdomain', label: tr('Deceptive subdomain', 'نطاق فرعي مضلّل') },
      { key: 'typosquat', label: tr('Look-alike', 'نطاق مشابه') },
      { key: 'safe', label: tr('Official site', 'موقع رسمي') },
    ],
    email: [
      { key: 'sms', label: tr('Traffic fine SMS (AR/EN)', 'رسالة مخالفة (عربي/إنجليزي)') },
      { key: 'wa', label: tr('WhatsApp plate scam', 'احتيال رقم مميز عبر واتساب') },
      { key: 'en', label: tr('Bank phishing email', 'بريد تصيّد بنكي') },
      { key: 'ar', label: tr('Parcel fee (AR)', 'رسوم شحنة (عربي)') },
    ],
    business: [
      { key: 'fakeHotline', label: tr('Fake bank hotline ad', 'إعلان خط ساخن بنكي مزيّف') },
      { key: 'dealerAd', label: tr('Car deposit ad', 'إعلان سيارة بعربون') },
      { key: 'official', label: tr('Official website', 'موقع رسمي') },
    ],
    social: [
      { key: 'impersonator', label: tr('Impersonator', 'حساب منتحِل') },
      { key: 'official', label: tr('Official handle', 'حساب رسمي') },
    ],
  };

  const actions: { key: AnalysisKind; icon: string; label: string }[] = [
    { key: 'url', icon: '🔗', label: tr('Check a link', 'فحص رابط') },
    { key: 'email', icon: '💬', label: tr('SMS / WhatsApp / email', 'رسالة SMS / واتساب / بريد') },
    { key: 'business', icon: '🏢', label: tr('Business, ad or phone', 'نشاط أو إعلان أو هاتف') },
    { key: 'social', icon: '👤', label: tr('Social account', 'حساب تواصل') },
  ];

  const placeholder = mode === 'url' ? 'https://…' : mode === 'email' ? tr('Paste the SMS / WhatsApp / email here…', 'الصق رسالة SMS / واتساب / البريد هنا…') : tr('Paste a link or a suspicious message…', 'الصق رابطاً أو رسالة مريبة…');
  const sends = [prefs.live && tr('domains are checked via RDAP/DNS', 'تُفحص النطاقات عبر RDAP/DNS'), prefs.research && status.research && tr('domains, phone numbers or names are searched via Tavily', 'يُبحث عن النطاقات أو الأرقام أو الأسماء عبر Tavily'), prefs.ai && status.ai && tr('the evidence summary (not your raw message) is sent to an AI provider', 'يُرسل ملخص الأدلة (وليس رسالتك الأصلية) إلى مزوّد ذكاء اصطناعي')].filter(Boolean);

  const Toggle = ({ k, label, disabled }: { k: keyof Prefs; label: string; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={() => setPref(k)} aria-pressed={prefs[k] && !disabled} className={`chip border px-2.5 py-1 text-xs transition ${prefs[k] && !disabled ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 bg-white text-slate-500'} disabled:opacity-50`}>
      <span className={`h-2 w-2 rounded-full ${prefs[k] && !disabled ? 'bg-brand-600' : 'bg-slate-300'}`} />
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{tr('AMAN AI Assistant', 'مساعد أمان الذكي')}</h1>
          <p className="text-sm text-slate-500">{tr('Fraud detection with verified evidence: detection rules, live domain intelligence, internet research and AI explanation.', 'كشف الاحتيال بأدلة موثّقة: قواعد الكشف، معلومات النطاق المباشرة، البحث على الإنترنت، وشرح بالذكاء الاصطناعي.')}</p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-semibold" role="tablist">
          {(['chat', 'feed'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 transition ${tab === k ? 'bg-white text-brand-700 shadow' : 'text-slate-600'}`}>
              {k === 'chat' ? tr('Analyze', 'تحليل') : tr('Early-warning feed', 'لوحة الإنذار المبكر')}
            </button>
          ))}
        </div>
      </div>

      {tab === 'feed' ? (
        <ThreatFeed />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-slate-500">{tr('Capabilities:', 'القدرات:')}</span>
            <Toggle k="live" label={tr('Live domain checks', 'فحص النطاق المباشر')} disabled={IS_STATIC} />
            <Toggle k="research" label={tr('Internet research', 'البحث على الإنترنت')} disabled={!status.research} />
            <Toggle k="ai" label={tr('AI explanation', 'شرح بالذكاء الاصطناعي')} disabled={!status.ai} />
            {status.state === 'ready' && status.ai && (
              <span className="ltr-text text-[11px] text-slate-400">AI: {status.providers.filter((p) => p.configured).map((p) => (p.provider === 'gemini' ? 'Gemini' : p.provider === 'groq' ? 'Groq' : 'OpenRouter')).join(' → ')} → {tr('rules engine', 'محرك القواعد')}</span>
            )}
            {status.state === 'offline' && <span className="text-amber-700">{tr('Server unavailable: offline rules only', 'الخادم غير متاح: قواعد دون اتصال فقط')}</span>}
            <button className="btn-secondary ms-auto px-3 py-1.5 text-xs" onClick={() => { setMsgs([{ id: 0, role: 'assistant', text: WELCOME }]); setMode(null); }}>
              {tr('New chat', 'محادثة جديدة')}
            </button>
          </div>

          <div className="card flex flex-col">
            <div className="max-h-[68vh] min-h-[340px] space-y-4 overflow-y-auto p-3 sm:p-5" aria-live="polite">
              {msgs.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-ee-sm bg-brand-600 px-4 py-2.5 text-sm text-white">{typeof m.text === 'string' ? m.text : m.text ? t(m.text) : ''}</div>
                  </div>
                ) : (
                  <div key={m.id} className="flex items-start gap-2.5">
                    <div className="mt-0.5 hidden shrink-0 sm:block"><Logo size={28} /></div>
                    <div className="min-w-0 flex-1">
                      {m.text && <div className="inline-block max-w-full rounded-2xl rounded-ss-sm bg-slate-100 px-4 py-2.5 text-sm text-slate-800">{typeof m.text === 'string' ? m.text : t(m.text)}</div>}
                      {m.report && <RiskReport report={m.report} ai={m.report.live ? aiMode : 'not_configured'} submitted={m.submitted ?? m.report.target} />}
                    </div>
                  </div>
                ),
              )}
              {busy && (
                <div className="flex items-center gap-2.5 text-sm text-slate-500">
                  <Logo size={28} />
                  <span className="animate-pulse">{phase ? t(phase) : tr('Analyzing…', 'جارٍ التحليل…')}</span>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="border-t border-slate-200 p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                {actions.map((a) => (
                  <button key={a.key} onClick={() => chooseMode(a.key)} className={`chip border px-3 py-1.5 text-sm transition ${mode === a.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-500'}`}>
                    <span aria-hidden>{a.icon}</span> {a.label}
                  </button>
                ))}
              </div>

              {mode && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-500">{tr('Try a synthetic sample:', 'جرّب مثالاً تجريبياً:')}</span>
                  {samples[mode].map((s) => (
                    <button key={s.key} onClick={() => fillSample(s.key)} className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700 hover:bg-slate-200">{s.label}</button>
                  ))}
                  <button onClick={() => setMode(null)} className="ms-auto text-slate-400 hover:text-slate-600">✕ {tr('Free text', 'نص حر')}</button>
                </div>
              )}

              <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-2">
                {mode === 'business' ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input className="input" placeholder={tr('Business or claimed organization name', 'اسم النشاط أو الجهة المدّعاة')} value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} />
                    <input className="input" dir="ltr" placeholder={tr('Phone number', 'رقم الهاتف')} value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} />
                    <input className="input" dir="ltr" placeholder={tr('Website', 'الموقع')} value={biz.website} onChange={(e) => setBiz({ ...biz, website: e.target.value })} />
                    <input className="input" dir="ltr" placeholder={tr('Google Maps / listing link', 'رابط خرائط Google / الإعلان')} value={biz.listingUrl} onChange={(e) => setBiz({ ...biz, listingUrl: e.target.value })} />
                    <textarea className="input sm:col-span-2" rows={3} placeholder={tr('Ad, search result or listing text (optional)', 'نص الإعلان أو نتيجة البحث أو القائمة (اختياري)')} value={biz.adText} onChange={(e) => setBiz({ ...biz, adText: e.target.value })} />
                  </div>
                ) : mode === 'social' ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <select className="input" value={social.platform} onChange={(e) => setSocial({ ...social, platform: e.target.value as Platform })}>
                      {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input className="input" dir="ltr" placeholder="@handle *" value={social.handle} onChange={(e) => setSocial({ ...social, handle: e.target.value })} />
                    <input className="input" placeholder={tr('Display name', 'اسم العرض')} value={social.displayName} onChange={(e) => setSocial({ ...social, displayName: e.target.value })} />
                    <input className="input" type="number" min={0} placeholder={tr('Followers', 'المتابِعون')} value={social.followers} onChange={(e) => setSocial({ ...social, followers: e.target.value })} />
                    <input className="input" type="number" min={0} placeholder={tr('Following', 'المتابَعون')} value={social.following} onChange={(e) => setSocial({ ...social, following: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <input className="input" type="number" min={0} placeholder={tr('Posts', 'المنشورات')} value={social.posts} onChange={(e) => setSocial({ ...social, posts: e.target.value })} />
                      <input className="input" type="number" min={0} placeholder={tr('Age (months)', 'العمر (أشهر)')} value={social.accountAgeMonths} onChange={(e) => setSocial({ ...social, accountAgeMonths: e.target.value })} />
                    </div>
                    <textarea className="input sm:col-span-3" rows={3} placeholder={tr('Message they sent you (optional)', 'الرسالة التي أرسلها (اختياري)')} value={social.message} onChange={(e) => setSocial({ ...social, message: e.target.value })} />
                  </div>
                ) : mode === 'url' ? (
                  <input className="input" dir="ltr" placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
                ) : (
                  <textarea className="input" rows={mode === 'email' ? 6 : 3} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }} />
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="max-w-xl text-[11px] leading-snug text-slate-400">
                    {sends.length ? `${tr('Privacy:', 'الخصوصية:')} ${sends.join(' · ')}. ${tr('Suspicious sites are never opened in your browser.', 'لا تُفتح المواقع المشبوهة في متصفحك أبداً.')}` : lang === 'ar' ? 'لا يتم إرسال أي بيانات إلى خدمات خارجية.' : 'Nothing is sent to external services.'}
                  </span>
                  <button type="submit" className="btn-primary" disabled={busy}>{busy ? tr('Analyzing…', 'جارٍ التحليل…') : tr('Analyze', 'حلّل')}</button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
