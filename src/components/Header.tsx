'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { Logo } from './Logo';

export function Header() {
  const { tr, toggle, lang } = useI18n();
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const links = [
    { href: '/', label: tr('Home', 'الرئيسية') },
    { href: '/assistant', label: tr('AMAN Assistant', 'مساعد أمان') },
    { href: '/deal', label: tr('AMAN Secure Deal', 'أمان للصفقات الآمنة') },
  ];
  const active = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <Logo />
          <span className="text-lg font-extrabold tracking-tight text-ink-900">
            AMAN <span className="text-brand-600">AI</span>
          </span>
          <span className="hidden text-sm font-bold text-slate-400 sm:inline">| أمان</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${active(l.href) ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button onClick={toggle} className="btn-secondary px-3 py-1.5" aria-label="Switch language">
            {lang === 'ar' ? 'English' : 'العربية'}
          </button>
          <button className="btn-secondary px-2.5 py-1.5 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu">
            ☰
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-slate-200 bg-white px-4 py-2 md:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`block rounded-lg px-3 py-2 text-sm font-semibold ${active(l.href) ? 'bg-brand-50 text-brand-700' : 'text-slate-700'}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
