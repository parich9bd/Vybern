'use client';

import { useState } from 'react';
import { MoonIcon, SunIcon } from '@/components/layout/icons';

type Theme = 'light' | 'dark';

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem('vybern-theme', next);
    setTheme(next);
  };

  return <button aria-label={theme === 'dark' ? 'Light theme' : 'Dark theme'} className={className} onClick={toggle} type="button">
    {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
  </button>;
}
