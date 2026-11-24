'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import { Logo } from '@/components/Logo';

export default function Home() {
  const { tr } = useI18n();

  const detect = [
    { icon: '🔗', title: tr('Suspicious links', 'الروابط المشبوهة'), body: tr('Look-alike and homograph domains, deceptive subdomains, fake payment links, shorteners, with verified official-domain comparison.', 'النطاقات المشابهة والمتشابهة بصرياً، والنطاقات الفرعية المضلّلة، وروابط الدفع المزيّفة، والروابط المختصرة، مع مقارنة بالنطاقات الرسمية الموثّقة.') },
    { icon: '💬', title: tr('SMS, WhatsApp & email', 'SMS وواتساب والبريد'), body: tr('Fake traffic fines, toll and delivery fees, bank suspension and fake customer-service numbers, in Arabic, English and mixed text.', 'المخالفات المرورية المزيّفة، ورسوم الطرق والتوصيل، وإيقاف الحسابات البنكية، وأرقام خدمة العملاء المزيّفة، بالعربية والإنجليزية والنصوص المختلطة.') },
    { icon: '🛰️', title: tr('Live evidence', 'أدلة مباشرة'), body: tr('Domain age (RDAP), DNS and hosting, safe redirect and HTTPS inspection, plus internet research with cited sources.', 'عمر النطاق (RDAP) وDNS والاستضافة، والفحص الآمن لإعادة التوجيه وHTTPS، والبحث على الإنترنت مع ذكر المصادر.') },
    { icon: '✨', title: tr('Explained by AI', 'شرح بالذكاء الاصطناعي'), body: tr('Gemini, with automatic Groq and OpenRouter failover, explains the evidence in Arabic and English. It never changes the score.', 'Gemini، مع تحويل تلقائي إلى Groq وOpenRouter، يشرح الأدلة بالعربية والإنجليزية دون أن يغيّر الدرجة.') },
  ];

  const steps = [
    tr('Deal created', 'إنشاء الصفقة'), tr('Documents submitted', 'تقديم المستندات'), tr('Fraud risk assessed', 'تقييم مخاطر الاحتيال'), tr('Conditions accepted', 'قبول الشروط'),
    tr('Payment held', 'حجز الدفع'), tr('Ownership transfer', 'نقل الملكية'), tr('Review & approval', 'المراجعة والموافقة'), tr('Payment released', 'الإفراج عن الدفع'),
  ];

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-brand-900 px-6 py-12 text-white sm:px-12 sm:py-16">
        <div className="absolute -end-16 -top-16 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" aria-hidden />
        <div className="relative max-w-2xl space-y-5">
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <span className="chip bg-white/10 text-brand-200">ScamShield AI · 42 Abu Dhabi</span>
          </div>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">{tr('Check before you click. Protect before you pay.', 'تحقّق قبل أن تنقر. احمِ أموالك قبل أن تدفع.')}</h1>
          <p className="text-base text-slate-300 sm:text-lg">
            {tr('AMAN AI detects UAE fraud with verified evidence and explains it in Arabic and English, and protects vehicle and premium plate sales with a guided, risk-checked transaction flow.', 'يكشف أمان AI الاحتيال في الإمارات بأدلة موثّقة ويشرحها بالعربية والإنجليزية، ويحمي بيع المركبات والأرقام المميزة عبر مسار معاملة موجّه ومفحوص المخاطر.')}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/assistant" className="btn-primary px-5 py-3 text-base">{tr('Open AMAN AI Assistant', 'افتح مساعد أمان الذكي')}</Link>
            <Link href="/deal" className="btn border border-white/30 bg-white/10 px-5 py-3 text-base text-white hover:bg-white/20">{tr('AMAN Secure Deal', 'أمان للصفقات الآمنة')}</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card flex flex-col p-6">
          <div className="mb-1 text-sm font-bold text-brand-700">01</div>
          <h2 className="text-2xl font-bold">{tr('AMAN AI Assistant', 'مساعد أمان الذكي')}</h2>
          <p className="mt-2 text-slate-600">{tr('Intelligent fraud detection and early warning. Every verdict shows its evidence, sources and limitations.', 'كشف ذكي للاحتيال وإنذار مبكر. كل نتيجة تعرض أدلتها ومصادرها وحدودها.')}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {detect.map((x) => (
              <div key={x.title} className="rounded-xl border border-slate-200 p-4">
                <div className="text-2xl" aria-hidden>{x.icon}</div>
                <div className="mt-1 font-semibold">{x.title}</div>
                <p className="mt-1 text-sm text-slate-500">{x.body}</p>
              </div>
            ))}
          </div>
          <Link href="/assistant" className="btn-primary mt-6 self-start">{tr('Analyze something now →', 'حلّل الآن ←')}</Link>
        </div>

        <div className="card flex flex-col p-6">
          <div className="mb-1 text-sm font-bold text-brand-700">02</div>
          <h2 className="text-2xl font-bold">{tr('AMAN Secure Deal', 'أمان للصفقات الآمنة')}</h2>
          <p className="mt-2 text-slate-600">{tr('Fraud prevention for vehicle and premium license plate transactions. Payment is released only after documents, a risk assessment, a simulated transfer and reviewer approval.', 'حماية من الاحتيال في معاملات المركبات والأرقام المميزة. لا يُفرج عن الدفع إلا بعد المستندات وتقييم المخاطر ونقل الملكية (محاكاة) وموافقة المراجع.')}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link href="/deal/new?type=vehicle" className="rounded-xl border border-slate-200 p-4 transition hover:border-brand-400"><div className="text-2xl">🚗</div><div className="mt-1 font-semibold">{tr('Vehicles', 'المركبات')}</div></Link>
            <Link href="/deal/new?type=plate" className="rounded-xl border border-slate-200 p-4 transition hover:border-brand-400"><div className="text-2xl">🔢</div><div className="mt-1 font-semibold">{tr('Premium plates', 'الأرقام المميزة')}</div></Link>
          </div>
          <ol className="mt-5 grid gap-2 sm:grid-cols-2">
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{i + 1}</span>
                <span className="text-sm font-medium">{s}</span>
              </li>
            ))}
          </ol>
          <Link href="/deal" className="btn-primary mt-6 self-start">{tr('Open Secure Deal →', 'افتح الصفقات الآمنة ←')}</Link>
        </div>
      </section>
    </div>
  );
}
