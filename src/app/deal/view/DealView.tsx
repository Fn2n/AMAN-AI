'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { actionApi, documentApi, fetchDeal, sha256File } from '@/lib/deal/client';
import { requestDealAi } from '@/lib/ai/client';
import type { AiResponse } from '@/lib/ai/contract';
import {
  CATEGORY_LABEL, DOCS, EMIRATE_LABEL, LIFECYCLE, REVIEW_CHECKLIST, ROLE_LABEL, RULES, TIMELINE_LABEL, fundsState, missingDocs,
  type Action, type Deal, type Role,
} from '@/lib/deal/engine';
import { LEVEL_LABEL } from '@/lib/analysis/report';
import { T, type L } from '@/lib/analysis/types';
import { SimNote, StatusChip, formatAED } from '@/components/deal/ui';
import { Gauge } from '@/components/RiskReport';
import { AiResultCard, AttemptTrail } from '@/components/AiInsight';

const ACTION_LABEL: Record<Action, L> = {
  submit_documents: T('Submit documents & run risk assessment', 'تقديم المستندات وتشغيل تقييم المخاطر'),
  accept_conditions: T('Accept transaction conditions', 'قبول شروط المعاملة'),
  hold_payment: T('Hold payment with AMAN (simulated)', 'حجز الدفع لدى أمان (محاكاة)'),
  confirm_transfer: T('Confirm ownership transfer (simulated)', 'تأكيد نقل الملكية (محاكاة)'),
  approve: T('Approve transaction', 'الموافقة على المعاملة'),
  release_payment: T('Release payment to seller (simulated)', 'الإفراج عن الدفع للبائع (محاكاة)'),
  reject: T('Reject transaction', 'رفض المعاملة'),
  cancel: T('Cancel transaction', 'إلغاء المعاملة'),
  flag: T('Flag for review', 'تعليم للمراجعة'),
  clear_flag: T('Clear flag', 'إزالة العلامة'),
  request_verification: T('Request additional verification', 'طلب تحقق إضافي'),
};

const NEXT: Record<Deal['status'], { who: L; text: L }> = {
  details_submitted: { who: T('Buyer & seller', 'المشتري والبائع'), text: T('Each party adds their required documents, then submits them. AMAN then runs the fraud risk assessment.', 'يضيف كل طرف مستنداته المطلوبة ثم يقدّمها. بعدها تشغّل أمان تقييم مخاطر الاحتيال.') },
  documents_submitted: { who: T('System', 'النظام'), text: T('Risk assessment in progress.', 'تقييم المخاطر قيد التنفيذ.') },
  risk_assessed: { who: T('Buyer & seller', 'المشتري والبائع'), text: T('Review the risk assessment. Both parties must accept the transaction conditions.', 'راجعا تقييم المخاطر. يجب أن يقبل الطرفان شروط المعاملة.') },
  conditions_accepted: { who: T('Buyer', 'المشتري'), text: T('Buyer places the payment on hold with AMAN (simulated).', 'يحجز المشتري الدفع لدى أمان (محاكاة).') },
  payment_held: { who: T('Seller', 'البائع'), text: T('Payment is held. Seller completes the ownership transfer and confirms it.', 'الدفع محجوز. يكمل البائع نقل الملكية ويؤكده.') },
  transfer_simulated: { who: T('AMAN reviewer', 'مراجع أمان'), text: T('Reviewer checks documents, risk findings and transfer, then approves or rejects.', 'يراجع المراجع المستندات ونتائج المخاطر والنقل، ثم يوافق أو يرفض.') },
  approved: { who: T('AMAN reviewer', 'مراجع أمان'), text: T('Approved. The held payment can now be released to the seller.', 'تمت الموافقة. يمكن الآن الإفراج عن الدفع المحجوز للبائع.') },
  completed: { who: T('—', '—'), text: T('Transaction completed.', 'اكتملت المعاملة.') },
  flagged: { who: T('AMAN reviewer', 'مراجع أمان'), text: T('Flagged by the risk assessment or a reviewer. The reviewer must request verification, clear the flag with a reason, or reject.', 'تم تعليمها بواسطة تقييم المخاطر أو المراجع. يجب على المراجع طلب تحقق أو إزالة العلامة مع ذكر السبب أو الرفض.') },
  needs_verification: { who: T('Buyer & seller', 'المشتري والبائع'), text: T('Additional verification required: correct or add documents, then resubmit for a new risk assessment.', 'مطلوب تحقق إضافي: صحّحا أو أضيفا المستندات ثم أعيدا التقديم لتقييم مخاطر جديد.') },
  rejected: { who: T('—', '—'), text: T('Transaction rejected.', 'تم رفض المعاملة.') },
  cancelled: { who: T('—', '—'), text: T('Transaction cancelled.', 'تم إلغاء المعاملة.') },
};

function sampleFile(key: string, dealId: string): File {
  // Synthetic placeholder content (unique per deal + document) for demos.
  const size = 60_000 + Math.floor(Math.random() * 120_000);
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes.subarray(0, Math.min(size, 65_536)));
  const header = new TextEncoder().encode(`%PDF-1.4\n% AMAN synthetic sample ${dealId} ${key} ${Date.now()}\n`);
  bytes.set(header, 0);
  return new File([bytes], `${key}_sample.pdf`, { type: 'application/pdf' });
}

export default function DealView() {
  const id = useSearchParams().get('id') ?? '';
  const { t, tr, lang } = useI18n();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [role, setRole] = useState<Role>('seller');
  const [error, setError] = useState<L | null>(null);
  const [note, setNote] = useState('');
  const [checks, setChecks] = useState<boolean[]>(REVIEW_CHECKLIST.map(() => false));
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [ai, setAi] = useState<AiResponse | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchDeal(id);
    setDeal(r.ok ? r.deal : null);
    setLoaded(true);
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (!loaded) return <div className="card mx-auto max-w-lg animate-pulse p-8 text-center text-slate-400">{tr('Loading…', 'جارٍ التحميل…')}</div>;
  if (!deal) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <p className="text-slate-600">{tr('Transaction not found.', 'المعاملة غير موجودة.')}</p>
        <Link href="/deal" className="btn-primary mt-4">{tr('Back to Secure Deal', 'العودة إلى الصفقات الآمنة')}</Link>
      </div>
    );
  }

  const commit = (r: { ok: true; deal: Deal } | { ok: false; error: L }) => {
    if (r.ok) {
      setDeal(r.deal);
      setError(null);
      setNote('');
    } else {
      setError(r.error);
      load();
    }
  };

  const act = async (a: Action) => {
    if (busy) return;
    setBusy(true);
    commit(await actionApi(deal.id, deal.version, role, a, { note: note.trim() || undefined, checklist: a === 'approve' ? checks : undefined }));
    if (a === 'submit_documents') setAi(null);
    setBusy(false);
  };

  const upload = async (key: string, file: File) => {
    if (busy) return;
    setBusy(true);
    const sha256 = await sha256File(file);
    commit(await documentApi(deal.id, deal.version, role, key, { name: file.name, size: file.size, type: file.type, sha256 }));
    setBusy(false);
  };

  const attachSamples = async () => {
    if (busy) return;
    setBusy(true);
    let d = deal;
    for (const doc of DOCS[d.category].filter((x) => x.by === role && !d.documents[x.key])) {
      const f = sampleFile(doc.key, d.id);
      const r = await documentApi(d.id, d.version, role, doc.key, { name: f.name, size: f.size, type: f.type, sha256: await sha256File(f) });
      if (!r.ok) {
        commit(r);
        break;
      }
      d = r.deal;
    }
    setDeal(d);
    setBusy(false);
  };

  const askAi = async () => {
    setAiBusy(true);
    setAi(await requestDealAi(deal.id));
    setAiBusy(false);
  };

  const fs = fundsState(deal);
  const missing = missingDocs(deal);
  const docsOpen = ['details_submitted', 'needs_verification'].includes(deal.status);
  const terminal = ['completed', 'rejected', 'cancelled'].includes(deal.status);
  const available = (Object.keys(RULES) as Action[]).filter((a) => RULES[a].roles.includes(role) && RULES[a].from.includes(deal.status) && !(a === 'accept_conditions' && deal.acceptedBy.includes(role)));
  const showLockedRelease = role === 'reviewer' && !terminal && deal.status !== 'approved';
  const needsNote = available.some((a) => RULES[a].noteRequired);
  const asset = deal.vehicle
    ? [[tr('Make / model', 'الماركة / الطراز'), `${deal.vehicle.make} ${deal.vehicle.model}`], [tr('Year', 'السنة'), String(deal.vehicle.year)], ['VIN', deal.vehicle.vin], [tr('Registration emirate', 'إمارة التسجيل'), t(EMIRATE_LABEL[deal.vehicle.emirate])], [tr('Registered owner', 'المالك المسجّل'), deal.vehicle.registeredOwner], ...(deal.vehicle.plate ? [[tr('Plate', 'اللوحة'), deal.vehicle.plate]] : []), ...(deal.vehicle.mileageKm ? [[tr('Mileage', 'المسافة'), `${deal.vehicle.mileageKm.toLocaleString()} km`]] : [])]
    : deal.plate
      ? [[tr('Issuing emirate', 'الإمارة المصدِرة'), t(EMIRATE_LABEL[deal.plate.emirate])], [tr('Code', 'الرمز'), deal.plate.code], [tr('Number', 'الرقم'), deal.plate.number], [tr('Type', 'النوع'), deal.plate.plateType], [tr('Registered owner', 'المالك المسجّل'), deal.plate.registeredOwner]]
      : [];
  const payLabel: Record<string, string> = { aman_hold: tr('Held with AMAN until transfer', 'محجوز لدى أمان حتى النقل'), bank_transfer_to_seller: tr('Direct transfer to seller', 'تحويل مباشر للبائع'), third_party_account: tr('Transfer to a third party', 'تحويل لطرف ثالث'), cash: tr('Cash', 'نقداً') };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/deal" className="text-sm text-slate-500 hover:text-brand-700">← {tr('All transactions', 'كل المعاملات')}</Link>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold sm:text-3xl">
            <span aria-hidden>{deal.category === 'vehicle' ? '🚗' : '🔢'}</span> <span className="truncate">{deal.title}</span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="ltr-text font-mono">{deal.id}</span>·<span>{t(CATEGORY_LABEL[deal.category])}</span>·<StatusChip status={deal.status} />
            {deal.seeded && <span className="chip bg-slate-100 text-slate-500">{tr('Example transaction', 'معاملة تجريبية')}</span>}
          </div>
        </div>
        <div className="card p-3">
          <div className="mb-1 text-xs font-semibold text-slate-500">{tr('Acting as (prototype role switch)', 'التصرف بصفة (تبديل الأدوار في النموذج)')}</div>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {(['buyer', 'seller', 'reviewer'] as Role[]).map((r) => (
              <button key={r} onClick={() => { setRole(r); setError(null); }} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${role === r ? 'bg-white text-brand-700 shadow' : 'text-slate-600'}`}>{t(ROLE_LABEL[r])}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Lifecycle */}
      <div className="card overflow-x-auto p-4">
        <ol className="flex min-w-[860px] items-start">
          {LIFECYCLE.map((s, i) => {
            const done = s.reachedAt(deal);
            const nextIdx = LIFECYCLE.findIndex((x) => !x.reachedAt(deal));
            const current = i === nextIdx && !terminal;
            return (
              <li key={s.key} className="flex flex-1 items-start">
                <div className="flex w-full flex-col items-center gap-1 text-center">
                  <div className="flex w-full items-center">
                    <div className={`h-0.5 flex-1 ${i === 0 ? 'invisible' : done ? 'bg-brand-500' : 'bg-slate-200'}`} />
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-brand-600 text-white' : current ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-500' : 'bg-slate-100 text-slate-400'}`}>{done ? '✓' : s.key === 'approval' ? '🔒' : i + 1}</span>
                    <div className={`h-0.5 flex-1 ${i === LIFECYCLE.length - 1 ? 'invisible' : LIFECYCLE[i + 1].reachedAt(deal) ? 'bg-brand-500' : 'bg-slate-200'}`} />
                  </div>
                  <span className={`px-1 text-[11px] font-semibold leading-tight ${current ? 'text-brand-700' : 'text-slate-500'}`}>{t(s.label)}</span>
                </div>
              </li>
            );
          })}
        </ol>
        {['flagged', 'needs_verification', 'rejected', 'cancelled'].includes(deal.status) && (
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${deal.status === 'needs_verification' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-700'}`}>
            <b><StatusChip status={deal.status} /></b> {deal.reviewerNote ? `· ${deal.reviewerNote}` : ''}
          </div>
        )}
      </div>

      {deal.status === 'completed' && (
        <div className="card border-emerald-300 bg-emerald-50 p-5">
          <div className="text-lg font-extrabold text-emerald-800">✓ {tr('Transaction completed', 'اكتملت المعاملة')}</div>
          <p className="mt-1 text-sm text-emerald-900">{tr('Payment released to the seller and ownership transferred to the buyer (both simulated: no real funds or registry changes).', 'تم الإفراج عن الدفع للبائع ونقل الملكية للمشتري (كلاهما محاكاة: لا أموال حقيقية ولا تغيير في أي سجل).')}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Next step */}
          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{tr('Next step', 'الخطوة التالية')}</h2>
              {!terminal && <span className="chip bg-slate-100 text-slate-600">{tr('Waiting for:', 'بانتظار:')} {t(NEXT[deal.status].who)}</span>}
            </div>
            <p className="mt-1 text-sm text-slate-600">{t(NEXT[deal.status].text)}</p>
            {deal.status === 'risk_assessed' && deal.acceptedBy.length > 0 && <p className="mt-1 text-xs text-slate-500">{tr('Accepted by:', 'قبِلها:')} {deal.acceptedBy.map((r) => t(ROLE_LABEL[r])).join(', ')}</p>}

            {role === 'reviewer' && deal.status === 'transfer_simulated' && (
              <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4">
                <div className="text-sm font-semibold">{tr('Reviewer checklist', 'قائمة تحقق المراجع')}</div>
                {REVIEW_CHECKLIST.map((c, i) => (
                  <label key={i} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={checks[i]} onChange={(e) => setChecks(checks.map((x, j) => (j === i ? e.target.checked : x)))} />
                    {t(c)}
                  </label>
                ))}
              </div>
            )}
            {needsNote && role === 'reviewer' && <textarea className="input mt-3" rows={2} placeholder={tr('Reviewer note (required to flag, clear, request verification or reject)', 'ملاحظة المراجع (مطلوبة للتعليم أو الإزالة أو طلب التحقق أو الرفض)')} value={note} onChange={(e) => setNote(e.target.value)} />}

            {!terminal && (
              <div className="mt-4 flex flex-wrap gap-2">
                {available.length === 0 && !showLockedRelease && <p className="text-sm text-slate-400">{tr('No action for this role at this stage. Switch role above.', 'لا يوجد إجراء لهذا الدور في هذه المرحلة. بدّل الدور من الأعلى.')}</p>}
                {available.map((a) => {
                  const disabled = busy || (a === 'submit_documents' && missing.length > 0) || (a === 'approve' && checks.some((x) => !x)) || (!!RULES[a].noteRequired && !note.trim());
                  const cls = ['reject', 'cancel', 'flag'].includes(a) ? 'btn-secondary text-rose-700' : a === 'release_payment' ? 'btn-primary bg-emerald-600 hover:bg-emerald-700' : ['clear_flag', 'request_verification'].includes(a) ? 'btn-secondary' : 'btn-primary';
                  return (
                    <button key={a} className={cls} disabled={disabled} onClick={() => act(a)}>{t(ACTION_LABEL[a])}</button>
                  );
                })}
                {showLockedRelease && !available.includes('release_payment') && (
                  <div className="flex flex-col">
                    <button className="btn-primary bg-emerald-600" disabled>🔒 {t(ACTION_LABEL.release_payment)}</button>
                    <span className="mt-1 text-xs text-rose-600">{tr('Locked until the transaction is approved.', 'مقفل حتى تتم الموافقة على المعاملة.')}</span>
                  </div>
                )}
              </div>
            )}
            {missing.length > 0 && docsOpen && <p className="mt-2 text-xs text-slate-500">{tr(`${missing.length} required document(s) missing`, `${missing.length} مستند/مستندات مطلوبة ناقصة`)}</p>}
            {['conditions_accepted', 'payment_held'].includes(deal.status) && <div className="mt-3"><SimNote>{tr('Payment holding is simulated. In production this step would use a licensed escrow or bank partner.', 'حجز الدفع محاكاة. في الإنتاج ستتم هذه الخطوة عبر شريك ضمان أو بنك مرخّص.')}</SimNote></div>}
            {['payment_held', 'transfer_simulated'].includes(deal.status) && <div className="mt-2"><SimNote>{tr('Ownership transfer is simulated. No RTA, ITC or licensing-authority record is changed.', 'نقل الملكية محاكاة. لا يتم تغيير أي سجل لدى هيئة الطرق أو مركز النقل المتكامل أو جهة الترخيص.')}</SimNote></div>}
            {error && <div className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700" role="alert">⛔ {t(error)}</div>}
          </section>

          {/* Risk assessment */}
          {deal.risk && (
            <section className="card overflow-hidden">
              <div className="flex flex-col gap-4 bg-slate-50 p-5 sm:flex-row sm:items-center">
                <Gauge score={deal.risk.score} level={deal.risk.level} size={84} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1.5">
                    <span className="chip border border-slate-300 bg-white text-slate-700">{tr('Transaction risk assessment', 'تقييم مخاطر المعاملة')}</span>
                    {deal.risk.score >= 50 && <span className="chip bg-rose-100 text-rose-800">{tr('Additional Verification Required', 'مطلوب تحقق إضافي')}</span>}
                  </div>
                  <div className="mt-1 text-xl font-extrabold">{t(LEVEL_LABEL[deal.risk.level])}</div>
                  <p className="text-xs text-slate-500">{t(deal.risk.disclosure)}</p>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <ul className="space-y-2">
                  {deal.risk.findings.map((f) => (
                    <li key={f.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{t(f.title)}</span>
                        {f.weight !== 0 && <span className="ms-auto font-mono text-xs text-slate-400">+{f.weight}</span>}
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{t(f.detail)}</p>
                      {f.evidence && <code className="ltr-text mt-1 inline-block break-all rounded bg-slate-100 px-1.5 py-0.5 text-xs">{f.evidence}</code>}
                    </li>
                  ))}
                </ul>
                <div className="rounded-xl border border-violet-200 p-4">
                  {ai?.ok ? (
                    <AiResultCard ex={ai.explanation} attempts={ai.attempts} cached={ai.cached} />
                  ) : (
                    <>
                      <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-violet-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                        <span>{tr('I agree to send the non-sensitive risk findings (no names, phone numbers, IBANs or documents) to an external AI provider for an explanation.', 'أوافق على إرسال نتائج المخاطر غير الحساسة (بلا أسماء أو أرقام هواتف أو آيبان أو مستندات) إلى مزوّد ذكاء اصطناعي خارجي للشرح.')}</span>
                      </label>
                      <button className="btn-secondary mt-3 text-violet-700" disabled={!consent || aiBusy} onClick={askAi}>✨ {aiBusy ? tr('AI is reviewing…', 'الذكاء الاصطناعي يراجع…') : tr('Explain risks and next verification steps', 'اشرح المخاطر وخطوات التحقق التالية')}</button>
                      {ai && !ai.ok && <p className="mt-2 text-xs text-slate-500">{tr('AI interpretation unavailable right now. The assessment above comes from the AMAN rules.', 'تفسير الذكاء الاصطناعي غير متاح حالياً. التقييم أعلاه صادر عن قواعد أمان.')}</p>}
                      {ai && !ai.ok && <AttemptTrail attempts={ai.attempts} />}
                    </>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Documents */}
          <section className="card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">{tr('Documents', 'المستندات')}</h2>
              {docsOpen && role !== 'reviewer' && DOCS[deal.category].some((d) => d.by === role && !deal.documents[d.key]) && (
                <button onClick={attachSamples} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs">⚡ {tr(`Attach synthetic sample files as ${role}`, `إرفاق ملفات تجريبية بصفة ${role === 'buyer' ? 'المشتري' : 'البائع'}`)}</button>
              )}
            </div>
            <ul className="space-y-2">
              {DOCS[deal.category].map((d) => {
                const doc = deal.documents[d.key];
                const canUpload = docsOpen && role === d.by;
                return (
                  <li key={d.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${doc ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{doc ? '✓' : '📄'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{t(d.label)} {!d.required && <span className="text-xs font-normal text-slate-400">({tr('optional', 'اختياري')})</span>}</div>
                      <div className="truncate text-xs text-slate-500">
                        {doc ? <><span>{doc.fileName} · {(doc.size / 1024).toFixed(0)} KB · {t(ROLE_LABEL[doc.by])}</span> · <span className="ltr-text font-mono" title={doc.sha256}>SHA-256 {doc.sha256.slice(0, 12)}…</span></> : `${tr('Required from', 'مطلوب من')} ${t(ROLE_LABEL[d.by])}`}
                      </div>
                    </div>
                    {canUpload && (
                      <label className={`btn-secondary cursor-pointer px-3 py-1.5 text-xs ${busy ? 'pointer-events-none opacity-50' : ''}`}>
                        {doc ? tr('Replace', 'استبدال') : tr('Add file', 'إضافة ملف')}
                        <input type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(d.key, f); e.target.value = ''; }} />
                      </label>
                    )}
                    {doc && <span className="chip bg-amber-50 text-amber-700">{tr('Not verified with authority', 'غير متحقق منه لدى الجهة')}</span>}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3"><SimNote>{tr('Files stay on your device. AMAN records only the file name, size, type and SHA-256 fingerprint to detect duplicated or reused documents. Documents are not read or authenticated.', 'تبقى الملفات على جهازك. تسجّل أمان فقط اسم الملف وحجمه ونوعه وبصمة SHA-256 لاكتشاف المستندات المكررة أو المعاد استخدامها. لا تتم قراءة المستندات أو توثيقها.')}</SimNote></div>
          </section>

          {/* Details */}
          <section className="card p-5">
            <h2 className="mb-3 text-lg font-bold">{tr('Asset, parties and conditions', 'الأصل والأطراف والشروط')}</h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {asset.map(([k, v]) => (
                <div key={k}><dt className="text-xs font-semibold text-slate-500">{k}</dt><dd className="font-medium">{v}</dd></div>
              ))}
              <div><dt className="text-xs font-semibold text-slate-500">{t(ROLE_LABEL.buyer)}</dt><dd className="font-medium">{deal.buyer.name} <span className="ltr-text text-slate-500">{deal.buyer.phone}</span></dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">{t(ROLE_LABEL.seller)}</dt><dd className="font-medium">{deal.seller.name} <span className="ltr-text text-slate-500">{deal.seller.phone}</span></dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">{tr('Payment instructions', 'تعليمات الدفع')}</dt><dd className="font-medium">{payLabel[deal.payment.method]}{deal.payment.beneficiaryName ? ` · ${deal.payment.beneficiaryName}` : ''}</dd></div>
              {deal.conditions && <div className="sm:col-span-2"><dt className="text-xs font-semibold text-slate-500">{tr('Conditions', 'الشروط')}</dt><dd className="whitespace-pre-wrap">{deal.conditions}</dd></div>}
            </dl>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card overflow-hidden">
            <div className="bg-gradient-to-br from-ink-900 to-brand-900 p-5 text-white">
              <div className="text-xs font-semibold uppercase tracking-wide text-brand-200">{tr('Simulated payment holding', 'حجز دفع محاكى')}</div>
              <div className="mt-1 text-3xl font-extrabold">{formatAED(deal.price, lang)}</div>
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className={`h-2.5 w-2.5 rounded-full ${fs === 'held' ? 'animate-pulse bg-amber-400' : fs === 'released' ? 'bg-emerald-400' : fs === 'returned' ? 'bg-sky-400' : 'bg-slate-400'}`} />
                {fs === 'awaiting' && tr('Not yet held', 'لم يُحجز بعد')}
                {fs === 'held' && tr('Held: locked until approval', 'محجوز: مقفل حتى الموافقة')}
                {fs === 'released' && tr('Released to seller', 'أُفرج عنه للبائع')}
                {fs === 'returned' && tr('Returned to buyer', 'أُعيد للمشتري')}
                {fs === 'none' && tr('No payment held', 'لا يوجد دفع محجوز')}
              </div>
            </div>
            <dl className="space-y-2 p-5 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">{tr('Agreed price', 'السعر المتفق عليه')}</dt><dd className="font-semibold">{formatAED(deal.price, lang)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{tr('AMAN fee (1%)', 'رسوم أمان (1٪)')}</dt><dd className="font-semibold">{formatAED(deal.fee, lang)}</dd></div>
              <div className="flex justify-between border-t border-slate-100 pt-2"><dt className="font-semibold">{tr('Buyer pays', 'يدفع المشتري')}</dt><dd className="font-bold">{formatAED(deal.price + deal.fee, lang)}</dd></div>
              <p className="pt-1 text-xs text-slate-400">{tr('No real payment is processed.', 'لا تتم معالجة أي دفع حقيقي.')}</p>
            </dl>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-lg font-bold">{tr('Audit trail', 'سجل التدقيق')}</h2>
            <ol className="relative space-y-4 border-s border-slate-200 ps-4">
              {[...deal.timeline].reverse().map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -start-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-500 ring-4 ring-white" />
                  <div className="text-sm font-semibold">{t(TIMELINE_LABEL[e.kind])}</div>
                  <div className="text-xs text-slate-500">{t(ROLE_LABEL[e.actor])} · {new Date(e.at).toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-GB')}</div>
                  {e.note && <div className="mt-0.5 text-xs text-slate-600">“{e.note}”</div>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
