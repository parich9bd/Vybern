'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoonIcon, SunIcon } from '@/components/layout/icons';

type Theme = 'light' | 'dark';

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('Theme');
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const timer = window.setTimeout(() => setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem('vybern-theme', next);
    setTheme(next);
  };

  return <button aria-label={theme === 'dark' ? t('switchToLight') : t('switchToDark')} className={className} onClick={toggle} type="button">
    {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
  </button>;
}
