'use client';

import { useI18n } from '@/lib/i18n';

export function Footer() {
  const { tr } = useI18n();
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>© 2026 AMAN AI · ScamShield AI Hackathon</p>
        <p className="max-w-2xl">
          {tr(
            'Prototype. AMAN AI is not affiliated with or endorsed by any police force, government entity or bank. Secure Deal payments and ownership transfers are simulated. Always confirm through official channels.',
            'نموذج أولي. أمان AI غير تابع لأي جهة شرطية أو حكومية أو بنك ولا يحظى بتأييدها. المدفوعات ونقل الملكية في الصفقات الآمنة محاكاة. تحقّق دائماً عبر القنوات الرسمية.',
          )}
        </p>
      </div>
    </footer>
  );
}
