'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { AuthenticationModal } from '@/components/auth/AuthenticationModal';
import { apiUrl, AuthApiError, getCurrentUser, logout, type AuthUser } from '@/lib/auth-client';
import { AnnouncementBar } from './AnnouncementBar';
import { BagIcon, CheckIcon, ChevronIcon, CloseIcon, GlassesIcon, LanguagesIcon, LocationIcon, LogoutIcon, MenuIcon, OrdersIcon, SearchIcon, SettingsIcon, ShieldIcon, UserIcon } from './icons';
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
  const accountT = useTranslations('Account');
  const adminT = useTranslations('Admin');
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuthenticationOpen, setIsAuthenticationOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const accountSwitcherRef = useRef<HTMLDivElement>(null);
  const accountCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();
  const languageMenuId = useId();
  const accountMenuId = useId();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLanguageOpen(false);
        setIsMobileMenuOpen(false);
        setIsAccountOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => () => { if (accountCloseTimer.current) clearTimeout(accountCloseTimer.current); }, []);

  const keepAccountOpen = () => {
    if (accountCloseTimer.current) clearTimeout(accountCloseTimer.current);
    if (authUser) setIsAccountOpen(true);
  };
  const closeAccountSoon = () => {
    if (accountCloseTimer.current) clearTimeout(accountCloseTimer.current);
    accountCloseTimer.current = setTimeout(() => setIsAccountOpen(false), 180);
  };

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!accountSwitcherRef.current?.contains(event.target as Node)) setIsAccountOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  useEffect(() => {
    let isMounted = true;
    getCurrentUser().then((user) => {
      if (isMounted) setAuthUser(user);
    }).catch(() => {
      if (isMounted) setAuthUser(null);
    });
    return () => { isMounted = false; };
  }, []);

  const changeLocale = (nextLocale: Locale) => {
    setIsLanguageOpen(false);
    if (nextLocale !== locale) router.replace(pathname, { locale: nextLocale });
  };

  const handleLogout = async () => {
    setAccountError(null);
    setIsLoggingOut(true);
    try {
      await logout();
      setAuthUser(null);
      setIsAccountOpen(false);
    } catch (error) {
      if (error instanceof AuthApiError && (error.status === 401 || error.status === 403)) {
        setAuthUser(null);
        setIsAccountOpen(false);
        setIsAuthenticationOpen(true);
      } else {
        setAccountError(t('logoutError'));
      }
    } finally {
      setIsLoggingOut(false);
    }
  };

  const accountName = authUser?.firstName || authUser?.lastName ? `${authUser.firstName ?? ''} ${authUser.lastName ?? ''}`.trim() : accountT('customer');

  return (
    <div className={styles.headerShell}>
      <AnnouncementBar />
      <header className={styles.header} data-locale={locale} dir="ltr">
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
          <div className={styles.accountSwitcher} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsAccountOpen(false); }} onPointerEnter={keepAccountOpen} onPointerLeave={(event) => { if (event.pointerType === 'mouse') closeAccountSoon(); }} ref={accountSwitcherRef}>
            <button
              aria-controls={authUser ? accountMenuId : undefined}
              aria-expanded={authUser ? isAccountOpen : undefined}
              aria-haspopup={authUser ? 'menu' : 'dialog'}
              aria-label={authUser ? t('accountMenu') : t('account')}
              className={`${styles.action} ${styles.account}`}
              onClick={() => {
                setAccountError(null);
                if (authUser) setIsAccountOpen((open) => !open);
                else setIsAuthenticationOpen(true);
              }}
              onFocus={keepAccountOpen}
              ref={accountButtonRef}
              type="button"
            >
              <UserIcon />
            </button>
            {authUser && isAccountOpen && (
              <div className={styles.accountMenu} id={accountMenuId} role="menu">
                <div className={styles.accountIdentity}>{authUser.avatarUrl ? <img alt="" src={apiUrl(authUser.avatarUrl)} /> : <span>{accountName.slice(0, 2).toUpperCase()}</span>}<p><strong>{accountName}</strong><small dir="ltr">{authUser.phone}</small></p></div>
                {accountError && <p aria-live="polite" className={styles.accountError}>{accountError}</p>}
                <div className={styles.accountLinks}>
                  <Link onClick={() => setIsAccountOpen(false)} role="menuitem" href="/account/profile"><UserIcon />{accountT('profile')}</Link>
                  <Link onClick={() => setIsAccountOpen(false)} role="menuitem" href="/account/orders"><OrdersIcon />{accountT('orders')}</Link>
                  <Link onClick={() => setIsAccountOpen(false)} role="menuitem" href="/account/addresses"><LocationIcon />{accountT('addresses')}</Link>
                  <Link onClick={() => setIsAccountOpen(false)} role="menuitem" href="/account/settings"><SettingsIcon />{accountT('settings')}</Link>
                  {(authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN') && <Link onClick={() => setIsAccountOpen(false)} role="menuitem" href="/admin"><ShieldIcon />{adminT('control')}</Link>}
                </div>
                <button disabled={isLoggingOut} onClick={handleLogout} role="menuitem" type="button"><LogoutIcon />{isLoggingOut ? t('loggingOut') : t('logout')}</button>
              </div>
            )}
          </div>

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
      <AuthenticationModal
        isOpen={isAuthenticationOpen}
        onAuthenticated={(user) => { setAuthUser(user); setIsAccountOpen(false); }}
        onClose={() => setIsAuthenticationOpen(false)}
        returnFocusRef={accountButtonRef}
      />
    </div>
  );
}
