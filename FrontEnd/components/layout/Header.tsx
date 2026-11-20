'use client';

import Image from 'next/image';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { AnnouncementBar } from './AnnouncementBar';
import { BagIcon, CheckIcon, ChevronIcon, CloseIcon, GlassesIcon, LanguagesIcon, MenuIcon, SearchIcon, UserIcon } from './icons';
import styles from './Header.module.css';

const languages: ReadonlyArray<{ code: Locale; label: string; native: string }> = [
  { code: 'en', label: 'English', native: 'EN' },
  { code: 'fa', label: 'فارسی', native: 'FA' },
  { code: 'de', label: 'Deutsch', native: 'DE' },
];

type PendingActionProps = Readonly<{
  label: string;
  children: ReactNode;
  className?: string;
}>;

function PendingAction({ label, children, className }: PendingActionProps) {
  return (
    <button aria-disabled="true" className={`${styles.action} ${className ?? ''}`} title={label} type="button">
      {children}
    </button>
  );
}

export default function Header() {
  const t = useTranslations('Header');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuId = useId();
  const languageMenuId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLanguageOpen(false);
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const changeLocale = (nextLocale: Locale) => {
    setIsLanguageOpen(false);
    if (nextLocale !== locale) router.replace(pathname, { locale: nextLocale });
  };

  return (
    <div className={styles.headerShell}>
      <AnnouncementBar />
      <header className={styles.header}>
        <button
          aria-controls={menuId}
          aria-expanded={isMobileMenuOpen}
          aria-label={isMobileMenuOpen ? t('closeMenu') : t('openMenu')}
          className={styles.mobileMenuButton}
          onClick={() => setIsMobileMenuOpen((open) => !open)}
          type="button"
        >
          {isMobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>

        <nav aria-label={t('mainNavigation')} className={styles.desktopNavigation}>
          <PendingAction label={t('shop')}>{t('shop')}</PendingAction>
          <PendingAction label={t('collections')}>{t('collections')}</PendingAction>
          <PendingAction label={t('story')}>{t('story')}</PendingAction>
        </nav>

        <Link aria-label={t('home')} className={styles.logo} href="/">
          <Image alt="VYBERN" height={45} priority src="/images/Logos/IMG_4217 2.png" width={50} />
        </Link>

        <div className={styles.actions}>
          <PendingAction label={t('search')}><SearchIcon /></PendingAction>
          <PendingAction className={styles.tryOn} label={t('virtualTryOn')}><GlassesIcon /><span>{t('virtualTryOn')}</span></PendingAction>
          <PendingAction className={styles.account} label={t('account')}><UserIcon /></PendingAction>

          <div className={styles.languageSwitcher}>
            <button
              aria-controls={languageMenuId}
              aria-expanded={isLanguageOpen}
              aria-haspopup="true"
              aria-label={t('changeLanguage')}
              className={styles.languageTrigger}
              onClick={() => setIsLanguageOpen((open) => !open)}
              type="button"
            >
              <LanguagesIcon />
              <span>{locale.toUpperCase()}</span>
              <ChevronIcon className={isLanguageOpen ? styles.chevronOpen : undefined} />
            </button>

            {isLanguageOpen && (
              <div className={styles.languageMenu} id={languageMenuId}>
                <p className={styles.languageTitle}>{t('selectLanguage')}</p>
                {languages.map((language) => (
                  <button
                    aria-current={locale === language.code ? 'true' : undefined}
                    className={locale === language.code ? styles.languageOptionActive : styles.languageOption}
                    key={language.code}
                    onClick={() => changeLocale(language.code)}
                    type="button"
                  >
                    <span>{language.label}</span>
                    <span className={styles.languageCode}>{language.native}</span>
                    {locale === language.code && <CheckIcon className={styles.languageCheck} />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <PendingAction className={styles.cart} label={t('cart')}>
            <BagIcon />
            <span aria-label={t('cartItemCount', { count: 0 })} className={styles.cartCount}>0</span>
          </PendingAction>
        </div>
      </header>

      <div className={isMobileMenuOpen ? styles.mobileNavigationOpen : styles.mobileNavigation} id={menuId}>
        <nav aria-label={t('mainNavigation')} className={styles.mobileNavigationContent}>
          <PendingAction label={t('shop')}>{t('shop')}</PendingAction>
          <PendingAction label={t('collections')}>{t('collections')}</PendingAction>
          <PendingAction label={t('story')}>{t('story')}</PendingAction>
          <PendingAction label={t('virtualTryOn')}>{t('virtualTryOn')}</PendingAction>
        </nav>
      </div>
    </div>
  );
}
