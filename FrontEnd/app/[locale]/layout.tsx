import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import '../globals.css';
import { routing } from '@/i18n/routing';
import { ToastProvider } from '@/components/toast/ToastProvider';

const doranDisplay = localFont({
  src: [
    { path: '../../public/fonts/Doran/woff/DoranFaNum-Light.woff', weight: '300', style: 'normal' },
    { path: '../../public/fonts/Doran/woff/DoranFaNum-Regular.woff', weight: '400', style: 'normal' },
    { path: '../../public/fonts/Doran/woff/DoranFaNum-Medium.woff', weight: '500', style: 'normal' },
  ],
  variable: '--font-doran-display',
  display: 'swap',
});

type LocaleLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: Omit<LocaleLayoutProps, 'children'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: { default: t('title'), template: `%s | ${t('title')}` },
    description: t('description'),
    alternates: {
      languages: { en: '/en', fa: '/fa', de: '/de' },
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const messages = await getMessages();
  const direction = locale === 'fa' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={direction} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('vybern-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark')}catch(e){document.documentElement.dataset.theme='dark'}" }} /></head>
      <body className={locale === 'fa' ? doranDisplay.variable : undefined}>
        <NextIntlClientProvider messages={messages}><ToastProvider>{children}</ToastProvider></NextIntlClientProvider>
      </body>
    </html>
  );
}
