'use client';

import { useCallback, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { KIND_LABEL, LEVEL_LABEL, SUFFICIENCY_LABEL } from '@/lib/analysis/report';
import { buildExport, downloadJson, printReport } from '@/lib/analysis/export';
import { requestAiExplanation } from '@/lib/ai/client';
import type { AiExplanation } from '@/lib/ai/contract';
import type { CheckState, Finding, Report, RiskLevel, Severity } from '@/lib/analysis/types';
import { AiInsight, type AiMode } from './AiInsight';

const LEVEL_STYLE: Record<RiskLevel, { ring: string; text: string; bg: string }> = {
  low: { ring: '#10b981', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  medium: { ring: '#f59e0b', text: 'text-amber-700', bg: 'bg-amber-50' },
  high: { ring: '#f97316', text: 'text-orange-700', bg: 'bg-orange-50' },
  critical: { ring: '#e11d48', text: 'text-rose-700', bg: 'bg-rose-50' },
};

const SEV_STYLE: Record<Severity, string> = {
  critical: 'bg-rose-100 text-rose-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-sky-100 text-sky-800',
  info: 'bg-slate-100 text-slate-700',
  positive: 'bg-emerald-100 text-emerald-800',
};

const SEV_LABEL: Record<Severity, { en: string; ar: string }> = {
  critical: { en: 'Critical', ar: 'حرج' },
  high: { en: 'High', ar: 'عالٍ' },
  medium: { en: 'Medium', ar: 'متوسط' },
  low: { en: 'Low', ar: 'منخفض' },
  info: { en: 'Info', ar: 'معلومة' },
  positive: { en: 'Trust signal', ar: 'مؤشر ثقة' },
};

const CHECK_STYLE: Record<CheckState, { icon: string; cls: string; en: string; ar: string }> = {
  done: { icon: '✓', cls: 'text-emerald-700', en: 'Done', ar: 'تم' },
  failed: { icon: '!', cls: 'text-rose-700', en: 'Failed', ar: 'فشل' },
  skipped: { icon: '–', cls: 'text-slate-500', en: 'Skipped', ar: 'تم تخطيه' },
  unavailable: { icon: '⏸', cls: 'text-slate-500', en: 'Unavailable', ar: 'غير متاح' },
};

export function Gauge({ score, level, size = 96 }: { score: number; level: RiskLevel; size?: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${score}/100`}>
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={LEVEL_STYLE[level].ring} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (score / 100) * c} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold">{score}</span>
        <span className="text-[10px] font-semibold text-slate-400">/ 100</span>
      </div>
    </div>
  );
}

function FindingItem({ f }: { f: Finding }) {
  const { t, lang } = useI18n();
  return (
    <li className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`chip ${SEV_STYLE[f.severity]}`}>{SEV_LABEL[f.severity][lang]}</span>
        <span className="font-semibold">{t(f.title)}</span>
        {f.weight !== 0 && <span className="ms-auto font-mono text-xs text-slate-400">{f.weight > 0 ? '+' : ''}{f.weight}</span>}
      </div>
      <p className="mt-1 text-sm text-slate-600">{t(f.detail)}</p>
      {f.evidence && <code className="ltr-text mt-1.5 inline-block max-w-full break-all rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{f.evidence}</code>}
    </li>
  );
}

export function RiskReport({ report, ai = 'not_configured', submitted }: { report: Report; ai?: AiMode; submitted: string }) {
  const { t, tr, lang } = useI18n();
  const [aiEx, setAiEx] = useState<AiExplanation | null>(null);
  const [shots, setShots] = useState<string[]>([]);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const st = LEVEL_STYLE[report.level];
  const request = useCallback((force: boolean) => requestAiExplanation(report, force), [report]);
  const onAi = useCallback((ex: AiExplanation | null) => setAiEx(ex), []);

  const rule = report.findings.filter((f) => (f.source ?? 'rule') === 'rule' && f.severity !== 'positive');
  const live = report.findings.filter((f) => f.source === 'live' && f.severity !== 'positive');
  const research = report.findings.filter((f) => f.source === 'research' && f.severity !== 'positive');
  const trust = report.findings.filter((f) => f.severity === 'positive');
  const liveChecked = report.checks.some((c) => c.state === 'done');

  const addShots = async (files: FileList | null) => {
    if (!files) return;
    const out: string[] = [];
    for (const f of [...files].slice(0, 3)) {
      if (!f.type.startsWith('image/') || f.size > 3 * 1024 * 1024) continue;
      out.push(await new Promise<string>((res) => {
        const rd = new FileReader();
        rd.onload = () => res(String(rd.result));
        rd.readAsDataURL(f);
      }));
    }
    setShots((s) => [...s, ...out].slice(0, 3));
  };

  return (
    <article className="card overflow-hidden" data-report-id={report.id}>
      <header className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-center ${st.bg}`}>
        <Gauge score={report.score} level={report.level} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500">
            <span>{t(KIND_LABEL[report.kind])}</span>
            <span className="chip border border-slate-300 bg-white text-slate-700">{tr('Evidence-Based Analysis', 'تحليل مبني على الأدلة')}</span>
            {liveChecked && <span className="chip border border-sky-300 bg-sky-50 text-sky-800">{tr('Live Sources Checked', 'تم فحص مصادر مباشرة')}</span>}
            {report.sufficiency === 'limited' && <span className="chip border border-amber-300 bg-amber-50 text-amber-800">{tr('Limited Verification', 'تحقق محدود')}</span>}
            {report.sufficiency !== 'limited' && <span className="chip border border-emerald-300 bg-emerald-50 text-emerald-800">{t(SUFFICIENCY_LABEL[report.sufficiency])}</span>}
          </div>
          <div className={`mt-1 text-2xl font-extrabold ${st.text}`}>{t(LEVEL_LABEL[report.level])}</div>
          <div className="ltr-text mt-0.5 truncate text-sm font-medium text-slate-600" title={report.target}>{report.target}</div>
          <p className="mt-2 text-sm text-slate-700">{t(report.summary)}</p>
        </div>
      </header>

      <div className="space-y-5 p-5">
        <AiInsight mode={ai} request={request} onResult={onAi} />

        {report.official && (
          <section className={`rounded-xl border p-4 ${report.official.matches ? 'border-emerald-200 bg-emerald-50/60' : 'border-rose-200 bg-rose-50/60'}`}>
            <h4 className="mb-2 text-sm font-bold text-slate-800">{tr('Official website comparison', 'المقارنة مع الموقع الرسمي')}</h4>
            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-slate-500">{tr('Claimed / referenced', 'الجهة المدّعاة')}</dt><dd className="font-semibold">{t(report.official.brand)}</dd></div>
              <div><dt className="text-xs text-slate-500">{tr('Verified official domain', 'النطاق الرسمي الموثّق')}</dt><dd className="ltr-text font-mono text-xs font-semibold text-emerald-800">{report.official.officialDomains.join(' · ')}</dd></div>
              <div><dt className="text-xs text-slate-500">{tr('Submitted', 'المقدَّم')}</dt><dd className={`ltr-text font-mono text-xs font-semibold ${report.official.matches ? 'text-emerald-800' : 'text-rose-700'}`}>{report.official.submitted || '—'} {report.official.submitted ? (report.official.matches ? '✓' : '✗') : ''}</dd></div>
            </dl>
          </section>
        )}

        {report.indicators.length > 0 && (
          <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            {report.indicators.map((i, k) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs font-semibold text-slate-500">{t(i.label)}</dt>
                <dd className="ltr-text truncate font-medium" title={i.value}>{i.value}</dd>
              </div>
            ))}
          </dl>
        )}

        {rule.length > 0 && (
          <section>
            <h4 className="mb-2 text-sm font-bold text-slate-800">{tr('Detected warning signs', 'علامات التحذير المكتشفة')} <span className="font-normal text-slate-400">· {tr('detection rules', 'قواعد الكشف')}</span></h4>
            <ul className="space-y-2">{rule.map((f) => <FindingItem key={f.id} f={f} />)}</ul>
          </section>
        )}

        {(live.length > 0 || report.facts.length > 0) && (
          <section>
            <h4 className="mb-2 text-sm font-bold text-slate-800">{tr('Verified technical evidence', 'أدلة تقنية موثّقة')} <span className="font-normal text-slate-400">· RDAP / DNS / HTTPS</span></h4>
            {live.length > 0 && <ul className="mb-2 space-y-2">{live.map((f) => <FindingItem key={f.id} f={f} />)}</ul>}
            {report.facts.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <tbody>
                    {report.facts.map((f) => (
                      <tr key={f.id} className="border-b border-slate-100 last:border-0">
                        <th className="w-1/3 bg-slate-50 px-3 py-2 text-start text-xs font-semibold text-slate-500">{t(f.label)}</th>
                        <td className="px-3 py-2">
                          <div className="ltr-text break-all font-medium">{f.value}</div>
                          <div className="text-[11px] text-slate-400">
                            {f.sourceUrl ? <a className="hover:underline" href={f.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">{f.source}</a> : f.source} · {new Date(f.checkedAt).toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-GB')}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {(research.length > 0 || report.sources.length > 0) && (
          <section>
            <h4 className="mb-2 text-sm font-bold text-slate-800">{tr('Internet research', 'البحث على الإنترنت')} <span className="font-normal text-slate-400">· {tr('public sources, untrusted until verified', 'مصادر علنية، غير موثوقة حتى يتم التحقق')}</span></h4>
            {research.length > 0 && <ul className="mb-2 space-y-2">{research.map((f) => <FindingItem key={f.id} f={f} />)}</ul>}
            <ul className="space-y-2">
              {report.sources.map((s) => (
                <li key={s.url} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`chip ${s.kind === 'official' ? 'bg-emerald-100 text-emerald-800' : s.kind === 'warning' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>
                      {s.kind === 'official' ? tr('Official source', 'مصدر رسمي') : s.kind === 'warning' ? tr('Scam warning', 'تحذير احتيال') : tr('Reference', 'مرجع')}
                    </span>
                    <span className="font-semibold">{s.title || s.domain}</span>
                  </div>
                  {s.snippet && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{s.snippet}</p>}
                  {/* Links open the public source (not the suspicious target), with no referrer. */}
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="ltr-text mt-1 block break-all text-xs text-brand-700 hover:underline">{s.url}</a>
                  <div className="text-[11px] text-slate-400">{tr('Retrieved', 'تاريخ الجلب')} {new Date(s.retrievedAt).toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-GB')}</div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {trust.length > 0 && (
          <section>
            <h4 className="mb-2 text-sm font-bold text-slate-800">{tr('Trust signals', 'مؤشرات الثقة')}</h4>
            <ul className="space-y-2">{trust.map((f) => <FindingItem key={f.id} f={f} />)}</ul>
          </section>
        )}

        <section>
          <h4 className="mb-2 text-sm font-bold text-slate-800">{tr('Recommended actions', 'الإجراءات الموصى بها')}</h4>
          <ul className="list-disc space-y-1 ps-5 text-sm text-slate-700">{report.recommendations.map((r, i) => <li key={i}>{t(r)}</li>)}</ul>
        </section>

        <section className="rounded-xl border border-dashed border-slate-300 p-4">
          <h4 className="mb-2 text-sm font-bold text-slate-700">{tr('Checks performed and limitations', 'الفحوصات المنفّذة والقيود')}</h4>
          <ul className="space-y-1 text-sm">
            {report.checks.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span className={`w-4 text-center font-bold ${CHECK_STYLE[c.state].cls}`} aria-hidden>{CHECK_STYLE[c.state].icon}</span>
                <span className="text-slate-700">{t(c.label)} <span className={`text-xs ${CHECK_STYLE[c.state].cls}`}>({lang === 'ar' ? CHECK_STYLE[c.state].ar : CHECK_STYLE[c.state].en})</span>{c.note && <span className="text-xs text-slate-500"> · {t(c.note)}</span>}</span>
              </li>
            ))}
            {report.unavailableChecks.map((u, i) => (
              <li key={i} className="flex gap-2 text-slate-500"><span className="w-4 text-center" aria-hidden>⏸</span>{t(u)}</li>
            ))}
          </ul>
        </section>

        <footer className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-400">
          <span className="ltr-text font-mono">{report.id}</span>
          <span>· {new Date(report.generatedAt).toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-GB')}</span>
          <div className="ms-auto flex flex-wrap gap-2">
            <label className="btn-secondary cursor-pointer px-3 py-1.5 text-xs" title={tr('Screenshots stay in your browser and are only added to the printed report.', 'تبقى لقطات الشاشة في متصفحك وتُضاف فقط إلى التقرير المطبوع.')}>
              📎 {tr('Add screenshot', 'إضافة لقطة شاشة')}{shots.length ? ` (${shots.length})` : ''}
              <input type="file" accept="image/png,image/jpeg" multiple className="sr-only" onChange={(e) => { addShots(e.target.files); e.target.value = ''; }} />
            </label>
            <button className="btn-secondary px-3 py-1.5 text-xs" onClick={() => downloadJson(buildExport(report, submitted, aiEx))}>{tr('Export JSON', 'تصدير JSON')}</button>
            <button className="btn-primary px-3 py-1.5 text-xs" onClick={() => setPopupBlocked(!printReport(report, submitted, lang, aiEx, shots))}>{tr('Print / Save PDF', 'طباعة / حفظ PDF')}</button>
          </div>
          {popupBlocked && <span className="w-full text-rose-600">{tr('Allow pop-ups for this site to open the printable report.', 'اسمح بالنوافذ المنبثقة لهذا الموقع لفتح التقرير القابل للطباعة.')}</span>}
        </footer>
      </div>
    </article>
  );
}
