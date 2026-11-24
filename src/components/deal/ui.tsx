'use client';

import { useI18n } from '@/lib/i18n';
import { STATUS_LABEL, type DealStatus } from '@/lib/deal/engine';
import type { Lang } from '@/lib/analysis/types';

export function formatAED(n: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-AE' : 'en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n);
}

const STYLE: Record<DealStatus, string> = {
  details_submitted: 'bg-slate-100 text-slate-700',
  documents_submitted: 'bg-sky-100 text-sky-800',
  risk_assessed: 'bg-sky-100 text-sky-800',
  conditions_accepted: 'bg-indigo-100 text-indigo-800',
  payment_held: 'bg-indigo-100 text-indigo-800',
  transfer_simulated: 'bg-violet-100 text-violet-800',
  approved: 'bg-teal-100 text-teal-800',
  completed: 'bg-emerald-100 text-emerald-800',
  flagged: 'bg-rose-100 text-rose-800',
  needs_verification: 'bg-amber-100 text-amber-800',
  rejected: 'bg-rose-200 text-rose-900',
  cancelled: 'bg-slate-200 text-slate-600',
};

export function StatusChip({ status }: { status: DealStatus }) {
  const { t } = useI18n();
  return <span className={`chip ${STYLE[status]}`}>{t(STATUS_LABEL[status])}</span>;
}

/** Concise, contextual simulation disclosure. */
export function SimNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
      <span aria-hidden>ⓘ</span>
      <span>{children}</span>
    </p>
  );
}
