'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { readLegacy, seedApi, useDeals, LEGACY_KEY } from '@/lib/deal/client';
import { ACTIVE, CATEGORY_LABEL, type Category, type DealStatus } from '@/lib/deal/engine';
import { LEVEL_LABEL } from '@/lib/analysis/report';
import { SimNote, StatusChip, formatAED } from '@/components/deal/ui';

type Filter = 'all' | Category | 'active' | 'completed' | 'flagged' | 'verification';

export default function DealDashboard() {
  const { t, tr, lang } = useI18n();
  const { deals, loaded, error, refresh } = useDeals();
  const [filter, setFilter] = useState<Filter>('all');
  const [seeding, setSeeding] = useState(false);
  const [legacy, setLegacy] = useState<ReturnType<typeof readLegacy>>([]);

  useEffect(() => setLegacy(readLegacy()), []);

  const stats = useMemo(() => {
    const is = (s: DealStatus[]) => deals.filter((d) => s.includes(d.status)).length;
    return {
      total: deals.length,
      active: is(ACTIVE),
      completed: is(['completed']),
      flagged: is(['flagged']),
      verification: is(['needs_verification']),
      vehicle: deals.filter((d) => d.category === 'vehicle').length,
      plate: deals.filter((d) => d.category === 'plate').length,
    };
  }, [deals]);

  const shown = deals.filter((d) =>
    filter === 'all' ? true : filter === 'vehicle' || filter === 'plate' ? d.category === filter : filter === 'active' ? ACTIVE.includes(d.status) : filter === 'completed' ? d.status === 'completed' : filter === 'flagged' ? d.status === 'flagged' : d.status === 'needs_verification',
  );

  const seed = async () => {
    setSeeding(true);
    await seedApi();
    await refresh();
    setSeeding(false);
  };

  const downloadLegacy = () => {
    const raw = localStorage.getItem(LEGACY_KEY) ?? '[]';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    a.download = 'aman-legacy-transactions.json';
    a.click();
  };

  const cards: [Filter, string, number, string][] = [
    ['all', tr('Total transactions', 'إجمالي المعاملات'), stats.total, 'text-ink-900'],
    ['active', tr('Active', 'نشطة'), stats.active, 'text-sky-700'],
    ['completed', tr('Completed', 'مكتملة'), stats.completed, 'text-emerald-700'],
    ['flagged', tr('Flagged', 'مُعلَّمة'), stats.flagged, 'text-rose-700'],
    ['verification', tr('Awaiting verification', 'بانتظار التحقق'), stats.verification, 'text-amber-700'],
    ['vehicle', tr('Vehicles', 'مركبات'), stats.vehicle, 'text-ink-900'],
    ['plate', tr('Premium plates', 'أرقام مميزة'), stats.plate, 'text-ink-900'],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{tr('AMAN Secure Deal', 'أمان للصفقات الآمنة')}</h1>
          <p className="max-w-2xl text-slate-500">
            {tr('Fraud prevention for vehicle and premium license plate sales in the UAE: consistency checks, risk assessment, and a protected step-by-step transaction flow.', 'حماية من الاحتيال في بيع المركبات والأرقام المميزة في الإمارات: فحوصات اتساق، وتقييم مخاطر، ومسار معاملة محمي خطوة بخطوة.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/deal/new?type=vehicle" className="btn-primary">🚗 {tr('New vehicle deal', 'صفقة مركبة جديدة')}</Link>
          <Link href="/deal/new?type=plate" className="btn-primary">🔢 {tr('New premium plate deal', 'صفقة رقم مميز جديدة')}</Link>
        </div>
      </div>

      <SimNote>{tr('Prototype: payment holding, ownership transfer and payment release are simulated. No real payments are processed and no RTA, ITC, MOI or bank system is connected.', 'نموذج أولي: حجز الدفع ونقل الملكية والإفراج عن الدفع محاكاة. لا تتم معالجة مدفوعات حقيقية ولا يوجد اتصال بأنظمة هيئة الطرق أو مركز النقل المتكامل أو وزارة الداخلية أو البنوك.')}</SimNote>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{tr('Could not reach the AMAN server.', 'تعذّر الوصول إلى خادم أمان.')}</div>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {cards.map(([k, label, v, cls]) => (
          <button key={k} onClick={() => setFilter(k)} className={`card p-3 text-start transition hover:border-brand-400 ${filter === k ? 'border-brand-600 ring-2 ring-brand-500/20' : ''}`}>
            <div className={`text-2xl font-extrabold ${cls}`}>{loaded ? v : '–'}</div>
            <div className="text-xs font-semibold text-slate-500">{label}</div>
          </button>
        ))}
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{filter === 'all' ? tr('All transactions', 'كل المعاملات') : cards.find((c) => c[0] === filter)?.[1]}</h2>
          <button onClick={seed} disabled={seeding} className="btn-secondary px-3 py-1.5 text-xs">{seeding ? '…' : tr('+ Add example transactions', '+ إضافة معاملات تجريبية')}</button>
        </div>
        {!loaded ? (
          <div className="card animate-pulse p-8 text-center text-slate-400">{tr('Loading…', 'جارٍ التحميل…')}</div>
        ) : shown.length === 0 ? (
          <div className="card p-8 text-center text-slate-500">{tr('No transactions yet. Create a vehicle or premium plate deal, or add the example transactions.', 'لا توجد معاملات بعد. أنشئ صفقة مركبة أو رقم مميز، أو أضف المعاملات التجريبية.')}</div>
        ) : (
          <div className="card divide-y divide-slate-100">
            {shown.map((d) => (
              <Link key={d.id} href={`/deal/view?id=${d.id}`} className="flex flex-wrap items-center gap-3 p-4 hover:bg-slate-50">
                <span className="text-2xl" aria-hidden>{d.category === 'vehicle' ? '🚗' : '🔢'}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold">{d.title}</span>
                    {d.seeded && <span className="chip bg-slate-100 text-slate-500">{tr('Example', 'مثال')}</span>}
                  </div>
                  <div className="text-xs text-slate-500">
                    <span className="ltr-text font-mono">{d.id}</span> · {t(CATEGORY_LABEL[d.category])} · {formatAED(d.price, lang)}
                    {d.risk && <> · {tr('Risk', 'المخاطر')} {d.risk.score}/100 ({t(LEVEL_LABEL[d.risk.level])})</>}
                  </div>
                </div>
                <StatusChip status={d.status} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {legacy.length > 0 && (
        <section className="card border-amber-200 p-4 text-sm">
          <h3 className="font-bold">{tr('Legacy transactions in this browser', 'معاملات قديمة في هذا المتصفح')} ({legacy.length})</h3>
          <p className="mt-1 text-slate-600">
            {tr('These were created before Secure Deal was limited to vehicles and premium plates. They are kept read-only in your browser and were not deleted. Categories no longer supported (e.g. real estate, land, businesses, goods) cannot continue in the new flow.', 'تم إنشاؤها قبل أن تقتصر أمان للصفقات الآمنة على المركبات والأرقام المميزة. تُحفظ للقراءة فقط في متصفحك ولم تُحذف. الفئات غير المدعومة (مثل العقارات والأراضي والأنشطة التجارية والبضائع) لا يمكن متابعتها في المسار الجديد.')}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-slate-500">{legacy.slice(0, 8).map((l) => <li key={l.id}><span className="ltr-text font-mono">{l.id}</span> · {l.title} · {l.category} · {l.status}</li>)}</ul>
          <button onClick={downloadLegacy} className="btn-secondary mt-3 px-3 py-1.5 text-xs">{tr('Download legacy data (JSON)', 'تنزيل البيانات القديمة (JSON)')}</button>
        </section>
      )}
    </div>
  );
}
