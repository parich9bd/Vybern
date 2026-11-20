import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import Header from '@/components/layout/Header';

type HomePageProps = Readonly<{
  params: Promise<{ locale: Locale }>;
}>;

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Home' });

  return (
    <>
      <Header />
      <main className="grid min-h-[calc(100dvh-126px)] place-items-center px-6 py-12 sm:px-10">
        <section aria-labelledby="foundation-title" className="w-full max-w-3xl border-y border-border py-10 sm:py-16">
          <p className="mb-8 text-xs font-medium tracking-[0.24em] text-accent sm:mb-12">{t('eyebrow')}</p>
          <h1 id="foundation-title" className="max-w-2xl font-serif text-4xl leading-tight text-foreground sm:text-6xl">
            {t('title')}
          </h1>
          <p className="mt-6 max-w-lg text-base leading-8 text-muted sm:text-lg">{t('body')}</p>
          <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs tracking-[0.15em] text-muted">
            <span className="text-accent">{t('status')}</span>
            <span aria-hidden="true" className="h-px w-8 bg-border" />
            <span>{t('language')}</span>
          </div>
        </section>
      </main>
    </>
  );
}
