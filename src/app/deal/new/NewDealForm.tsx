'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { createDealApi } from '@/lib/deal/client';
import { EMIRATE_LABEL, EXAMPLE_INPUTS, calcFee, type Category, type PaymentMethod } from '@/lib/deal/engine';
import { EMIRATES, type Emirate } from '@/lib/deal/validators';
import { SimNote, formatAED } from '@/components/deal/ui';

const emptyParty = { name: '', phone: '', email: '' };
const emptyVehicle = { make: '', model: '', year: '', vin: '', emirate: 'dubai' as Emirate, registeredOwner: '', registrationNo: '', plate: '', mileageKm: '' };
const emptyPlate = { emirate: 'dubai' as Emirate, code: '', number: '', plateType: 'private', registeredOwner: '' };

export default function NewDealForm() {
  const { t, tr, lang } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [category, setCategory] = useState<Category>('vehicle');
  const [price, setPrice] = useState('');
  const [buyer, setBuyer] = useState(emptyParty);
  const [seller, setSeller] = useState(emptyParty);
  const [vehicle, setVehicle] = useState(emptyVehicle);
  const [plate, setPlate] = useState(emptyPlate);
  const [method, setMethod] = useState<PaymentMethod>('aman_hold');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [iban, setIban] = useState('');
  const [conditions, setConditions] = useState('');
  const [inspection, setInspection] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const idem = useRef<string>('');

  useEffect(() => {
    const type = params.get('type');
    if (type === 'plate' || type === 'vehicle') setCategory(type);
    idem.current = crypto.randomUUID?.() ?? String(Date.now());
  }, [params]);

  const priceNum = Number(price.replace(/[,\s]/g, ''));

  const fill = (key: keyof typeof EXAMPLE_INPUTS) => {
    const e = EXAMPLE_INPUTS[key];
    setCategory(e.category);
    setPrice(String(e.price));
    setBuyer({ ...emptyParty, ...e.buyer, email: e.buyer.email ?? '' });
    setSeller({ ...emptyParty, ...e.seller, email: e.seller.email ?? '' });
    if (e.vehicle) setVehicle({ ...emptyVehicle, ...e.vehicle, year: String(e.vehicle.year), mileageKm: String(e.vehicle.mileageKm ?? ''), registrationNo: e.vehicle.registrationNo ?? '', plate: e.vehicle.plate ?? '' });
    if (e.plate) setPlate({ ...e.plate });
    setMethod(e.payment.method);
    setBeneficiaryName(e.payment.beneficiaryName ?? '');
    setIban(e.payment.iban ?? '');
    setConditions(e.conditions);
    setInspection(e.inspectionAgreed);
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    const body = {
      idempotencyKey: idem.current,
      category,
      price: priceNum,
      buyer,
      seller,
      vehicle: category === 'vehicle' ? { ...vehicle, year: Number(vehicle.year), mileageKm: Number(vehicle.mileageKm) || undefined } : undefined,
      plate: category === 'plate' ? plate : undefined,
      payment: { method, beneficiaryName: method === 'aman_hold' ? undefined : beneficiaryName, iban: method === 'aman_hold' || method === 'cash' ? undefined : iban },
      conditions,
      inspectionAgreed: category === 'vehicle' ? inspection : true,
    };
    const r = await createDealApi(body);
    if (r.ok) router.push(`/deal/view?id=${r.deal.id}`);
    else {
      setError(t(r.error));
      setSubmitting(false);
    }
  };

  const field = (label: string, value: string, onChange: (v: string) => void, opts: { dir?: 'ltr'; placeholder?: string; required?: boolean; inputMode?: 'numeric' } = {}) => (
    <div>
      <label className="label">{label}{opts.required && <span className="text-rose-500"> *</span>}</label>
      <input className="input" value={value} dir={opts.dir} inputMode={opts.inputMode} placeholder={opts.placeholder} required={opts.required} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
  const emirateSelect = (value: Emirate, onChange: (v: Emirate) => void, label: string) => (
    <div>
      <label className="label">{label}<span className="text-rose-500"> *</span></label>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as Emirate)}>
        {EMIRATES.map((em) => <option key={em} value={em}>{t(EMIRATE_LABEL[em])}</option>)}
      </select>
    </div>
  );

  return (
    <form onSubmit={submit} className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{category === 'vehicle' ? tr('New vehicle transaction', 'معاملة مركبة جديدة') : tr('New premium plate transaction', 'معاملة رقم مميز جديدة')}</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="self-center font-semibold text-slate-500">{tr('Synthetic example:', 'مثال تجريبي:')}</span>
          <button type="button" className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => fill(category === 'vehicle' ? 'vehicle' : 'plate')}>{tr('Clean', 'سليم')}</button>
          <button type="button" className="btn-secondary px-2.5 py-1.5 text-xs text-rose-700" onClick={() => fill(category === 'vehicle' ? 'vehicleRisky' : 'plateRisky')}>{tr('Suspicious', 'مريب')}</button>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
        {(['vehicle', 'plate'] as Category[]).map((c) => (
          <button key={c} type="button" role="tab" aria-selected={category === c} onClick={() => setCategory(c)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${category === c ? 'bg-white text-brand-700 shadow' : 'text-slate-600'}`}>
            {c === 'vehicle' ? `🚗 ${tr('Vehicle', 'مركبة')}` : `🔢 ${tr('Premium plate', 'رقم مميز')}`}
          </button>
        ))}
      </div>

      {category === 'vehicle' ? (
        <section className="card grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-bold sm:col-span-2">{tr('Vehicle details', 'بيانات المركبة')}</h2>
          {field(tr('Make', 'الشركة المصنّعة'), vehicle.make, (v) => setVehicle({ ...vehicle, make: v }), { placeholder: 'Toyota', required: true })}
          {field(tr('Model', 'الطراز'), vehicle.model, (v) => setVehicle({ ...vehicle, model: v }), { placeholder: 'Land Cruiser', required: true })}
          {field(tr('Manufacturing year', 'سنة الصنع'), vehicle.year, (v) => setVehicle({ ...vehicle, year: v }), { placeholder: '2021', required: true, inputMode: 'numeric', dir: 'ltr' })}
          {field(tr('VIN / chassis number', 'رقم الهيكل (VIN)'), vehicle.vin, (v) => setVehicle({ ...vehicle, vin: v.toUpperCase() }), { placeholder: '17 characters', required: true, dir: 'ltr' })}
          {emirateSelect(vehicle.emirate, (v) => setVehicle({ ...vehicle, emirate: v }), tr('Registration emirate', 'إمارة التسجيل'))}
          {field(tr('Registered owner (as on Mulkiya)', 'المالك المسجّل (كما في الملكية)'), vehicle.registeredOwner, (v) => setVehicle({ ...vehicle, registeredOwner: v }), { required: true })}
          {field(tr('Traffic file / registration no. (optional)', 'رقم الملف المروري / التسجيل (اختياري)'), vehicle.registrationNo, (v) => setVehicle({ ...vehicle, registrationNo: v }), { dir: 'ltr' })}
          {field(tr('Current plate (optional)', 'اللوحة الحالية (اختياري)'), vehicle.plate, (v) => setVehicle({ ...vehicle, plate: v }), { dir: 'ltr' })}
          {field(tr('Mileage (km, optional)', 'المسافة المقطوعة (كم، اختياري)'), vehicle.mileageKm, (v) => setVehicle({ ...vehicle, mileageKm: v }), { inputMode: 'numeric', dir: 'ltr' })}
        </section>
      ) : (
        <section className="card grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-bold sm:col-span-2">{tr('Plate details', 'بيانات الرقم')}</h2>
          {emirateSelect(plate.emirate, (v) => setPlate({ ...plate, emirate: v }), tr('Issuing emirate', 'الإمارة المصدِرة'))}
          <div>
            <label className="label">{tr('Plate type', 'نوع اللوحة')}</label>
            <select className="input" value={plate.plateType} onChange={(e) => setPlate({ ...plate, plateType: e.target.value })}>
              <option value="private">{tr('Private', 'خصوصي')}</option>
              <option value="classic">{tr('Classic', 'كلاسيكي')}</option>
              <option value="motorcycle">{tr('Motorcycle', 'دراجة نارية')}</option>
              <option value="commercial">{tr('Commercial', 'تجاري')}</option>
            </select>
          </div>
          {field(tr('Plate code / category', 'رمز / فئة اللوحة'), plate.code, (v) => setPlate({ ...plate, code: v.toUpperCase() }), { placeholder: 'A / 1', required: true, dir: 'ltr' })}
          {field(tr('Plate number', 'رقم اللوحة'), plate.number, (v) => setPlate({ ...plate, number: v.replace(/\D/g, '') }), { placeholder: '777', required: true, dir: 'ltr', inputMode: 'numeric' })}
          <div className="sm:col-span-2">{field(tr('Registered owner (as on ownership document)', 'المالك المسجّل (كما في وثيقة الملكية)'), plate.registeredOwner, (v) => setPlate({ ...plate, registeredOwner: v }), { required: true })}</div>
          <p className="text-xs text-slate-500 sm:col-span-2">{tr('AMAN checks format and consistency only. It has no access to official plate ownership databases and gives no market valuation.', 'تفحص أمان الصيغة والاتساق فقط. لا تملك وصولاً إلى قواعد بيانات ملكية الأرقام الرسمية ولا تقدّم تقييماً سوقياً.')}</p>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {([['buyer', buyer, setBuyer, tr('Buyer', 'المشتري')], ['seller', seller, setSeller, tr('Seller', 'البائع')]] as const).map(([k, v, set, label]) => (
          <section key={k} className="card space-y-3 p-5">
            <h2 className="font-bold">{label}</h2>
            {field(tr('Full name', 'الاسم الكامل'), v.name, (x) => set({ ...v, name: x }), { required: true })}
            {field(tr('Phone', 'الهاتف'), v.phone, (x) => set({ ...v, phone: x }), { dir: 'ltr', placeholder: '+971 5x xxx xxxx', required: true })}
            {field(tr('Email (optional)', 'البريد (اختياري)'), v.email, (x) => set({ ...v, email: x }), { dir: 'ltr' })}
          </section>
        ))}
      </div>

      <section className="card space-y-4 p-5">
        <h2 className="font-bold">{tr('Price and payment', 'السعر والدفع')}</h2>
        <div className="max-w-xs">
          {field(tr('Agreed sale price (AED)', 'سعر البيع المتفق عليه (درهم)'), price, setPrice, { dir: 'ltr', inputMode: 'numeric', placeholder: '185000', required: true })}
          {priceNum > 0 && <p className="mt-1 text-xs text-slate-500">{tr('AMAN fee (1%, simulated):', 'رسوم أمان (1٪، محاكاة):')} {formatAED(calcFee(priceNum), lang)}</p>}
        </div>
        <div>
          <span className="label">{tr('Seller\'s payment instructions', 'تعليمات الدفع من البائع')}</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['aman_hold', tr('Hold payment with AMAN until transfer (recommended)', 'حجز الدفع لدى أمان حتى النقل (موصى به)')],
              ['bank_transfer_to_seller', tr('Direct bank transfer to the seller', 'تحويل بنكي مباشر للبائع')],
              ['third_party_account', tr('Transfer to another person / agent', 'تحويل لشخص آخر / وسيط')],
              ['cash', tr('Cash', 'نقداً')],
            ] as [PaymentMethod, string][]).map(([m, l]) => (
              <label key={m} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm ${method === m ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                <input type="radio" name="method" className="mt-0.5 accent-emerald-600" checked={method === m} onChange={() => setMethod(m)} />
                {l}
              </label>
            ))}
          </div>
        </div>
        {(method === 'bank_transfer_to_seller' || method === 'third_party_account') && (
          <div className="grid gap-4 sm:grid-cols-2">
            {field(tr('Account holder name', 'اسم صاحب الحساب'), beneficiaryName, setBeneficiaryName)}
            {field('IBAN', iban, setIban, { dir: 'ltr', placeholder: 'AE07 0331 2345 6789 0123 456' })}
          </div>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="font-bold">{tr('Transaction conditions', 'شروط المعاملة')}</h2>
        <textarea className="input" rows={3} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder={tr('e.g. inspection at a test centre before payment is held; transfer at the licensing authority…', 'مثال: فحص في مركز فحص قبل حجز الدفع؛ النقل لدى جهة الترخيص…')} />
        {category === 'vehicle' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={inspection} onChange={(e) => setInspection(e.target.checked)} />
            {tr('Buyer will physically inspect the vehicle and its VIN before payment', 'سيعاين المشتري المركبة ورقم هيكلها فعلياً قبل الدفع')}
          </label>
        )}
        <SimNote>{tr('Documents are added in the next step. Files stay on your device: only file name, size, type and a SHA-256 fingerprint are recorded.', 'تُضاف المستندات في الخطوة التالية. تبقى الملفات على جهازك: يُسجَّل فقط اسم الملف وحجمه ونوعه وبصمة SHA-256.')}</SimNote>
      </section>

      {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</div>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary px-6 py-3" disabled={submitting}>{submitting ? tr('Creating…', 'جارٍ الإنشاء…') : tr('Create transaction', 'إنشاء المعاملة')}</button>
      </div>
    </form>
  );
}
