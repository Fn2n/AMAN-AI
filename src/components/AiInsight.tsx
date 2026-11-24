'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { AiAttempt, AiExplanation, AiFailure, AiResponse } from '@/lib/ai/contract';

export type AiMode = 'checking' | 'on' | 'user_off' | 'not_configured' | 'static';

export const PROVIDER_NAME: Record<string, string> = { gemini: 'Google Gemini', groq: 'Groq', openrouter: 'OpenRouter' };

const REASON: Record<AiFailure | 'user_off', { en: string; ar: string }> = {
  not_configured: { en: 'No AI provider is configured on this server', ar: 'لا يوجد مزوّد ذكاء اصطناعي مُعدّ على هذا الخادم' },
  static_deployment: { en: 'AI is not available on this static site', ar: 'الذكاء الاصطناعي غير متاح في هذه النسخة الثابتة' },
  rate_limited: { en: 'AI request limit reached, try again shortly', ar: 'تم بلوغ حد الطلبات، حاول بعد قليل' },
  all_providers_failed: { en: 'All AI providers are busy or unavailable right now', ar: 'جميع مزوّدي الذكاء الاصطناعي مشغولون أو غير متاحين حالياً' },
  timeout: { en: 'AI took too long to respond', ar: 'تأخر الذكاء الاصطناعي في الاستجابة' },
  network: { en: 'Could not reach the AI service', ar: 'تعذّر الوصول إلى خدمة الذكاء الاصطناعي' },
  bad_request: { en: 'AI request was rejected', ar: 'تم رفض طلب الذكاء الاصطناعي' },
  forbidden: { en: 'AI request was not allowed', ar: 'طلب الذكاء الاصطناعي غير مسموح' },
  consent_required: { en: 'Consent is required before sending data to AI', ar: 'الموافقة مطلوبة قبل إرسال البيانات إلى الذكاء الاصطناعي' },
  user_off: { en: 'AI interpretation is turned off', ar: 'تفسير الذكاء الاصطناعي متوقف' },
};

const OUTCOME: Record<AiAttempt['outcome'], { en: string; ar: string }> = {
  success: { en: 'answered', ar: 'أجاب' },
  rate_limited: { en: 'rate-limited', ar: 'تجاوز الحد' },
  quota_exceeded: { en: 'quota exhausted', ar: 'نفدت الحصة' },
  unavailable: { en: 'unavailable', ar: 'غير متاح' },
  timeout: { en: 'timed out', ar: 'انتهت المهلة' },
  invalid_output: { en: 'invalid answer', ar: 'إجابة غير صالحة' },
  auth_error: { en: 'key rejected', ar: 'المفتاح مرفوض' },
  error: { en: 'error', ar: 'خطأ' },
  cooling_down: { en: 'skipped (cooling down)', ar: 'تم تخطيه (فترة تهدئة)' },
};

export function AttemptTrail({ attempts }: { attempts?: AiAttempt[] }) {
  const { lang } = useI18n();
  const shown = (attempts ?? []).filter((a) => a.outcome !== 'cooling_down');
  if (shown.length <= 1) return null;
  return (
    <div className="ltr-text mt-1 text-[11px] text-slate-500">
      {shown.map((a, i) => (
        <span key={i}>
          {i > 0 && ' → '}
          {PROVIDER_NAME[a.provider]} ({OUTCOME[a.outcome][lang]})
        </span>
      ))}
    </div>
  );
}

export function AiResultCard({ ex, attempts, cached }: { ex: AiExplanation; attempts?: AiAttempt[]; cached?: boolean }) {
  const { t, tr } = useI18n();
  return (
    <section className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip bg-violet-600 text-white">✨ {tr('AI Analysis Completed', 'اكتمل تحليل الذكاء الاصطناعي')}</span>
        <span className="ltr-text text-xs font-medium text-violet-800">
          {PROVIDER_NAME[ex.provider]} · {ex.model}
          {cached ? ' · cached' : ''}
        </span>
      </div>
      <AttemptTrail attempts={attempts} />
      <p className="mt-2 text-sm leading-relaxed text-slate-800">{t(ex.summary)}</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <h5 className="mb-1 text-xs font-bold uppercase tracking-wide text-violet-800">{tr('Key points', 'أهم النقاط')}</h5>
          <ul className="list-disc space-y-1 ps-5 text-sm text-slate-700">{ex.indicators.map((x, i) => <li key={i}>{t(x)}</li>)}</ul>
        </div>
        <div>
          <h5 className="mb-1 text-xs font-bold uppercase tracking-wide text-violet-800">{tr('Next steps', 'الخطوات التالية')}</h5>
          <ul className="list-disc space-y-1 ps-5 text-sm text-slate-700">{ex.recommendations.map((x, i) => <li key={i}>{t(x)}</li>)}</ul>
        </div>
      </div>
      <p className="mt-3 border-t border-violet-100 pt-2 text-[11px] text-slate-500">
        {tr('AI interpretation of the evidence below. It does not change the score or verify anything.', 'تفسير الذكاء الاصطناعي للأدلة أدناه. لا يغيّر الدرجة ولا يتحقق من أي شيء.')}
      </p>
    </section>
  );
}

export function AiInsight({ mode, request, onResult }: { mode: AiMode; request: (force: boolean) => Promise<AiResponse>; onResult?: (ex: AiExplanation | null) => void }) {
  const { tr, lang } = useI18n();
  const [res, setRes] = useState<AiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(
    (force = false) => {
      setLoading(true);
      request(force).then((r) => {
        setRes(r);
        setLoading(false);
        onResult?.(r.ok ? r.explanation : null);
      });
    },
    [request, onResult],
  );

  useEffect(() => {
    if (mode === 'on' && !res && !loading) run();
  }, [mode, res, loading, run]);

  if (mode === 'checking') return null;

  if (mode !== 'on' || (res && !res.ok)) {
    const reason: AiFailure | 'user_off' = mode === 'user_off' ? 'user_off' : mode === 'static' ? 'static_deployment' : mode === 'not_configured' ? 'not_configured' : res && !res.ok ? res.reason : 'all_providers_failed';
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip bg-slate-200 text-slate-700">{tr('AI interpretation unavailable', 'تفسير الذكاء الاصطناعي غير متاح')}</span>
          <span>{REASON[reason][lang]}. {tr('The assessment below comes from the AMAN detection engine.', 'التقييم أدناه صادر عن محرك أمان للكشف.')}</span>
          {mode === 'on' && res && !res.ok && (
            <button onClick={() => run(true)} disabled={loading} className="ms-auto font-semibold text-violet-700 hover:underline">
              {loading ? '…' : tr('Retry AI', 'أعد المحاولة')}
            </button>
          )}
        </div>
        {res && !res.ok && <AttemptTrail attempts={res.attempts} />}
      </div>
    );
  }

  if (loading || !res) {
    return (
      <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4" aria-busy="true">
        <div className="flex items-center gap-2 text-sm font-semibold text-violet-800">
          <span className="animate-pulse">✨</span> {tr('AI is interpreting the evidence…', 'الذكاء الاصطناعي يفسّر الأدلة…')}
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-3 w-11/12 animate-pulse rounded bg-violet-200/70" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-violet-200/70" />
        </div>
      </div>
    );
  }

  return <AiResultCard ex={res.explanation} attempts={res.attempts} cached={res.cached} />;
}
