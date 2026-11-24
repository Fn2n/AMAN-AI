'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { BASE, IS_STATIC } from '@/lib/ai/client';
import { LEVEL_LABEL } from '@/lib/analysis/report';
import type { RiskLevel } from '@/lib/analysis/types';

interface Rec {
  id: string;
  at: string;
  kind: string;
  target: string;
  domain?: string;
  brand?: string;
  level: RiskLevel;
  score: number;
  scenarios: string[];
  findings: { id: string; title: string; source: string }[];
  domainAgeDays?: number;
  sources: number;
}
interface Summary {
  total: number;
  last7Days: number;
  flagged: number;
  byLevel: Record<RiskLevel, number>;
  impersonatedBrands: [string, number][];
  scenarios: [string, number][];
  newDomains: { domain?: string; ageDays?: number; level: RiskLevel; at: string }[];
  suspiciousDomains: { domain?: string; brand?: string; level: RiskLevel; score: number; at: string }[];
}

const LEVEL_CLS: Record<RiskLevel, string> = { low: 'bg-emerald-100 text-emerald-800', medium: 'bg-amber-100 text-amber-800', high: 'bg-orange-100 text-orange-800', critical: 'bg-rose-100 text-rose-800' };
const SCENARIO: Record<string, { en: string; ar: string }> = {
  'fake-traffic-fine': { en: 'Fake traffic fine', ar: 'مخالفة مرورية مزيّفة' },
  'toll-fee': { en: 'Fake toll payment', ar: 'دفع رسوم طرق مزيّف' },
  'delivery-fee': { en: 'Fake delivery fee', ar: 'رسوم توصيل مزيّفة' },
  'bank-suspension': { en: 'Bank suspension', ar: 'إيقاف حساب بنكي' },
  'gov-payment': { en: 'Government payment', ar: 'دفع خدمة حكومية' },
  'vehicle-sale': { en: 'Vehicle sale scam', ar: 'احتيال بيع مركبة' },
  'plate-sale': { en: 'Plate sale scam', ar: 'احتيال بيع رقم مميز' },
  'fake-payment-confirmation': { en: 'Fake payment proof', ar: 'إثبات دفع مزيّف' },
  'fake-customer-service': { en: 'Fake customer service', ar: 'خدمة عملاء مزيّفة' },
  'fake-payment-link': { en: 'Fake payment link', ar: 'رابط دفع مزيّف' },
  'credential-phishing': { en: 'Credential phishing', ar: 'تصيّد بيانات الدخول' },
  investment: { en: 'Investment scam', ar: 'احتيال استثماري' },
};

export function ThreatFeed() {
  const { t, tr, lang } = useI18n();
  const [data, setData] = useState<{ summary: Summary; recent: Rec[] } | null>(null);
  const [err, setErr] = useState(false);
  const load = useCallback(async () => {
    if (IS_STATIC) return setErr(true);
    try {
      const r = await fetch(`${BASE}/api/threats`, { cache: 'no-store' });
      setData(await r.json());
      setErr(false);
    } catch {
      setErr(true);
    }
  }, []);
  useEffect(() => {
    load();
    const i = setInterval(load, 20_000);
    return () => clearInterval(i);
  }, [load]);

  const when = (iso: string) => new Date(iso).toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });

  if (err) return <div className="card p-6 text-sm text-slate-500">{tr('The early-warning feed needs the AMAN server.', 'تحتاج لوحة الإنذار المبكر إلى خادم أمان.')}</div>;
  if (!data) return <div className="card animate-pulse p-6 text-sm text-slate-400">{tr('Loading…', 'جارٍ التحميل…')}</div>;
  const s = data.summary;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        {tr('Built from analyses performed on this AMAN server (redacted). This is not internet-wide monitoring. It refreshes every 20 seconds.', 'مبنية على التحليلات المنفّذة على خادم أمان هذا (مع حجب البيانات). هذه ليست مراقبة شاملة للإنترنت. تتحدّث كل 20 ثانية.')}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [tr('Analyses', 'التحليلات'), s.total],
          [tr('Last 7 days', 'آخر 7 أيام'), s.last7Days],
          [tr('High / dangerous', 'عالية / خطيرة'), s.flagged],
          [tr('New suspicious domains', 'نطاقات مريبة جديدة'), s.newDomains.length],
        ].map(([k, v]) => (
          <div key={String(k)} className="card p-4">
            <div className="text-2xl font-extrabold text-ink-900">{v}</div>
            <div className="text-xs font-semibold text-slate-500">{k}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-4">
          <h3 className="mb-2 text-sm font-bold">{tr('Impersonated organizations', 'الجهات المنتحَلة')}</h3>
          {s.impersonatedBrands.length ? (
            <ul className="space-y-1 text-sm">{s.impersonatedBrands.map(([b, n]) => <li key={b} className="flex justify-between"><span>{b}</span><span className="font-mono text-slate-500">{n}</span></li>)}</ul>
          ) : <p className="text-xs text-slate-400">{tr('None detected yet.', 'لم يُكتشف أي منها بعد.')}</p>}
        </section>
        <section className="card p-4">
          <h3 className="mb-2 text-sm font-bold">{tr('Detected scam patterns', 'أنماط الاحتيال المكتشفة')}</h3>
          {s.scenarios.length ? (
            <ul className="space-y-1 text-sm">{s.scenarios.map(([k, n]) => <li key={k} className="flex justify-between"><span>{SCENARIO[k]?.[lang] ?? k}</span><span className="font-mono text-slate-500">{n}</span></li>)}</ul>
          ) : <p className="text-xs text-slate-400">{tr('None detected yet.', 'لم يُكتشف أي منها بعد.')}</p>}
        </section>
        <section className="card p-4">
          <h3 className="mb-2 text-sm font-bold">{tr('Newly registered suspicious domains', 'نطاقات مريبة مسجّلة حديثاً')}</h3>
          {s.newDomains.length ? (
            <ul className="space-y-1 text-sm">{s.newDomains.map((d, i) => <li key={i} className="flex justify-between gap-2"><span className="ltr-text truncate font-mono text-xs">{d.domain}</span><span className="shrink-0 text-xs text-slate-500">{d.ageDays} {tr('days', 'يوم')}</span></li>)}</ul>
          ) : <p className="text-xs text-slate-400">{tr('None with RDAP age under 90 days yet.', 'لا يوجد نطاق عمره أقل من 90 يوماً حسب RDAP بعد.')}</p>}
        </section>
      </div>

      <section className="card overflow-hidden">
        <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-bold">{tr('Recently analyzed threats', 'التهديدات المحلَّلة مؤخراً')}</h3>
        {data.recent.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">{tr('No analyses yet. Run a check in the Analyze tab.', 'لا توجد تحليلات بعد. شغّل فحصاً في تبويب التحليل.')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
                <span className={`chip ${LEVEL_CLS[r.level]}`}>{t(LEVEL_LABEL[r.level])} · {r.score}</span>
                <div className="min-w-0 flex-1">
                  <div className="ltr-text truncate font-medium">{r.target}</div>
                  <div className="text-xs text-slate-500">
                    {r.brand && <>{tr('Impersonates', 'ينتحل')} {r.brand} · </>}
                    {r.findings.map((f) => f.title).slice(0, 3).join(' · ')}
                    {r.sources > 0 && <> · {r.sources} {tr('sources', 'مصادر')}</>}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{when(r.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
