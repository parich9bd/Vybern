'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import type { Locale } from '@/i18n/routing';
import { AuthenticationModal } from '@/components/auth/AuthenticationModal';
import { apiUrl, AuthApiError, getCurrentUser, logout, type AuthUser } from '@/lib/auth-client';
import { AnnouncementBar } from './AnnouncementBar';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { DemoCartDrawer } from '@/components/cart/DemoCartDrawer';
import { demoCartItemCount, useDemoCart } from '@/lib/demo-cart';
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
  const [isDemoCartOpen, setIsDemoCartOpen] = useState(false);
  const demoCartItems = useDemoCart();
  const demoCartCount = demoCartItemCount(demoCartItems);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const accountSwitcherRef = useRef<HTMLDivElement>(null);
  const languageSwitcherRef = useRef<HTMLDivElement>(null);
  const accountCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const languageCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = 'vybern-mobile-navigation';
  const languageMenuId = 'vybern-language-menu';
  const accountMenuId = 'vybern-account-menu';
  const menuButtonRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => () => { if (accountCloseTimer.current) clearTimeout(accountCloseTimer.current); if (languageCloseTimer.current) clearTimeout(languageCloseTimer.current); }, []);

  useEffect(() => {
    document.body.classList.toggle('modalOpen', isMobileMenuOpen);
    return () => document.body.classList.remove('modalOpen');
  }, [isMobileMenuOpen]);

  const keepAccountOpen = () => {
    if (accountCloseTimer.current) clearTimeout(accountCloseTimer.current);
    if (authUser) setIsAccountOpen(true);
  };
  const closeAccountSoon = () => {
    if (accountCloseTimer.current) clearTimeout(accountCloseTimer.current);
    accountCloseTimer.current = setTimeout(() => setIsAccountOpen(false), 180);
  };
  const keepLanguageOpen = () => { if (languageCloseTimer.current) clearTimeout(languageCloseTimer.current); setIsLanguageOpen(true); };
  const closeLanguageSoon = (pointerType?: string) => { if (pointerType && pointerType !== 'mouse') return; if (languageCloseTimer.current) clearTimeout(languageCloseTimer.current); languageCloseTimer.current = setTimeout(() => setIsLanguageOpen(false), 180); };

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!accountSwitcherRef.current?.contains(event.target as Node)) setIsAccountOpen(false);
      if (!languageSwitcherRef.current?.contains(event.target as Node)) setIsLanguageOpen(false);
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

  useEffect(() => {
    try {
      const flow = JSON.parse(window.sessionStorage.getItem('vybern-auth-flow') ?? 'null') as { step?: string; savedAt?: number } | null;
      if (flow?.step === 'otp' && typeof flow.savedAt === 'number' && Date.now() - flow.savedAt < 15 * 60_000) window.setTimeout(() => setIsAuthenticationOpen(true), 0);
    } catch { /* A malformed local entry must not affect navigation. */ }
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
          ref={menuButtonRef}
          type="button"
        >
          {isMobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
        </button>

        <nav aria-label={t('mainNavigation')} className={styles.desktopNavigation}>
          <Link className={styles.action} href="/shop">{t('shop')}</Link>
          <PendingAction label={t('collections')}>{t('collections')}</PendingAction>
          <PendingAction label={t('story')}>{t('story')}</PendingAction>
        </nav>

        <Link aria-label={t('home')} className={styles.logo} href="/">
          <Image alt="VYBERN" height={45} priority src="/images/Logos/IMG_4217 2.png" width={50} />
        </Link>

        <div className={styles.actions}>
          <button aria-label={t('cartItemCount', { count: demoCartCount })} className={`${styles.action} ${styles.cart}`} onClick={() => setIsDemoCartOpen(true)} type="button">
            <BagIcon />
            <span aria-hidden="true" className={styles.cartCount}>{demoCartCount}</span>
          </button>
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
              <span className={styles.accountLabel}>{t('account')}</span>
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

          <div className={styles.languageSwitcher} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsLanguageOpen(false); }} onPointerEnter={keepLanguageOpen} onPointerLeave={(event) => closeLanguageSoon(event.pointerType)} ref={languageSwitcherRef}>
            <button
              aria-controls={languageMenuId}
              aria-expanded={isLanguageOpen}
              aria-haspopup="true"
              aria-label={t('changeLanguage')}
              className={styles.languageTrigger}
              onClick={() => setIsLanguageOpen((open) => !open)}
              onFocus={keepLanguageOpen}
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

          <ThemeToggle className={`${styles.action} ${styles.themeToggle}`} />
        </div>
      </header>

      {isMobileMenuOpen && <div aria-hidden="true" className={styles.drawerBackdrop} onClick={() => { setIsMobileMenuOpen(false); menuButtonRef.current?.focus(); }} />}
      <aside aria-label={t('mainNavigation')} className={isMobileMenuOpen ? styles.mobileNavigationOpen : styles.mobileNavigation} id={menuId}>
        <nav aria-label={t('mainNavigation')} className={styles.mobileNavigationContent}>
          <Link className={styles.action} href="/shop" onClick={() => setIsMobileMenuOpen(false)}><SearchIcon />{t('shop')}</Link>
          <PendingAction label={t('collections')}><GlassesIcon />{t('collections')}</PendingAction>
          <PendingAction label={t('story')}><UserIcon />{t('story')}</PendingAction>
          <PendingAction label={t('virtualTryOn')}><GlassesIcon />{t('virtualTryOn')}</PendingAction>
          <button className={styles.action} onClick={() => { setIsMobileMenuOpen(false); setIsDemoCartOpen(true); }} type="button"><BagIcon />{t('cart')} <span className={styles.drawerCartCount}>{demoCartCount}</span></button>
          <div className={styles.drawerTheme}><span>THEME</span><ThemeToggle className={styles.action} /></div>
          <div className={styles.drawerLanguages}>{languages.map((language) => <button aria-current={locale === language.code ? 'true' : undefined} key={language.code} onClick={() => changeLocale(language.code)} type="button">{language.label}</button>)}</div>
        </nav>
      </aside>
      <AuthenticationModal
        isOpen={isAuthenticationOpen}
        onAuthenticated={(user) => { setAuthUser(user); setIsAccountOpen(false); }}
        onClose={() => setIsAuthenticationOpen(false)}
        returnFocusRef={accountButtonRef}
      />
      <DemoCartDrawer isOpen={isDemoCartOpen} onClose={() => setIsDemoCartOpen(false)} />
    </div>
  );
}
