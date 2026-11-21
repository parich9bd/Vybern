'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AuthApiError, isE164PhoneNumber, normalisePhoneNumber, requestOtp, verifyOtp, type AuthUser } from '@/lib/auth-client';
import { CloseIcon } from '@/components/layout/icons';
import styles from './AuthenticationModal.module.css';

type AuthenticationModalProps = Readonly<{
  isOpen: boolean;
  onAuthenticated: (user: AuthUser) => void;
  onClose: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}>;

type Step = 'phone' | 'otp';
const flowStorageKey = 'vybern-auth-flow';
type StoredFlow = { step: Step; phone: string; cooldownUntil: number | null; savedAt: number };

function readStoredFlow(): StoredFlow | null {
  try { const value = JSON.parse(window.sessionStorage.getItem(flowStorageKey) ?? 'null') as StoredFlow | null; return value?.step === 'otp' && isE164PhoneNumber(value.phone) && typeof value.savedAt === 'number' && Date.now() - value.savedAt < 15 * 60_000 ? value : null; } catch { return null; }
}

function maskPhone(phone: string): string {
  if (phone.length < 7) return phone;
  return `${phone.slice(0, 4)} ${'•'.repeat(Math.max(3, phone.length - 7))} ${phone.slice(-3)}`;
}

function getErrorKey(error: unknown): string {
  if (!(error instanceof AuthApiError)) return 'genericError';
  switch (error.code) {
    case 'VALIDATION_ERROR': return 'invalidPhone';
    case 'OTP_RESEND_COOLDOWN': return 'resendCooldown';
    case 'OTP_RATE_LIMITED': return 'rateLimited';
    case 'SMS_UNAVAILABLE': return 'serviceUnavailable';
    case 'OTP_INVALID_OR_EXPIRED': return 'invalidCode';
    case 'OTP_VERIFICATION_IN_PROGRESS': return 'verificationInProgress';
    case 'CONNECTION_FAILED': return 'connectionFailed';
    default: return 'genericError';
  }
}

export function AuthenticationModal({ isOpen, onAuthenticated, onClose, returnFocusRef }: AuthenticationModalProps) {
  const t = useTranslations('Authentication');
  const cooldownT = useTranslations('Otp');
  const locale = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const titleId = useId();
  const descriptionId = useId();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const cooldownSeconds = cooldownUntil ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0;

  const persistFlow = (nextStep: Step, nextPhone: string, nextCooldownUntil: number | null) => {
    try { if (nextStep === 'otp') window.sessionStorage.setItem(flowStorageKey, JSON.stringify({ step: nextStep, phone: nextPhone, cooldownUntil: nextCooldownUntil, savedAt: Date.now() })); else window.sessionStorage.removeItem(flowStorageKey); } catch { /* Storage is optional. */ }
  };

  useEffect(() => {
    if (!isOpen) return;
    const stored = readStoredFlow();
    if (!stored) return;
    const timer = window.setTimeout(() => { setPhone(stored.phone); setCooldownUntil(stored.cooldownUntil && stored.cooldownUntil > Date.now() ? stored.cooldownUntil : null); setNow(Date.now()); setStep('otp'); }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  const applyCooldown = (seconds: number, nextPhone = phone) => { const until = Date.now() + seconds * 1000; setNow(Date.now()); setCooldownUntil(until); persistFlow('otp', nextPhone, until); };

  const close = () => {
    dialogRef.current?.close();
    onClose();
    window.setTimeout(() => returnFocusRef.current?.focus(), 0);
  };

  const reset = () => {
    setStep('phone');
    setPhone('');
    setOtp(Array(6).fill(''));
    setError(null);
    setIsSubmitting(false);
    persistFlow('phone', '', null);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      document.body.classList.add('modalOpen');
      window.setTimeout(() => phoneInputRef.current?.focus(), 0);
    }
    if (!isOpen && dialog.open) dialog.close();
    if (!isOpen) document.body.classList.remove('modalOpen');
    return () => document.body.classList.remove('modalOpen');
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (event: Event) => {
      event.preventDefault();
      close();
    };
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('keydown', trapFocus);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('keydown', trapFocus);
    };
  });

  const submitPhone = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalisedPhone = normalisePhoneNumber(phone);
    if (!isE164PhoneNumber(normalisedPhone)) {
      setError(t('invalidPhone'));
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const cooldown = await requestOtp(normalisedPhone);
      applyCooldown(cooldown, normalisedPhone);
      setPhone(normalisedPhone);
      setStep('otp');
      window.setTimeout(() => otpInputRefs.current[0]?.focus(), 0);
    } catch (requestError) {
      if (requestError instanceof AuthApiError && requestError.status === 429) applyCooldown(requestError.retryAfterSeconds ?? 60, normalisedPhone);
      setError(t(getErrorKey(requestError)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = otp.join('');
    if (!/^\d{6}$/.test(code)) {
      setError(t('completeCode'));
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const user = await verifyOtp(phone, code);
      persistFlow('phone', '', null);
      onAuthenticated(user);
      reset();
      close();
    } catch (requestError) {
      setError(t(getErrorKey(requestError)));
      setOtp(Array(6).fill(''));
      window.setTimeout(() => otpInputRefs.current[0]?.focus(), 0);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateOtp = (index: number, value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length > 1) {
      const next = Array(6).fill('').map((_, digitIndex) => digits[digitIndex] ?? otp[digitIndex]);
      setOtp(next);
      otpInputRefs.current[Math.min(digits.length, 5)]?.focus();
      return;
    }
    const next = [...otp];
    next[index] = digits;
    setOtp(next);
    if (digits && index < 5) otpInputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !otp[index] && index > 0) otpInputRefs.current[index - 1]?.focus();
    if (event.key === 'ArrowLeft' && index > 0) otpInputRefs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < 5) otpInputRefs.current[index + 1]?.focus();
  };

  const resendOtp = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const cooldown = await requestOtp(phone);
      applyCooldown(cooldown);
      setOtp(Array(6).fill(''));
      otpInputRefs.current[0]?.focus();
    } catch (requestError) {
      if (requestError instanceof AuthApiError && requestError.status === 429) applyCooldown(requestError.retryAfterSeconds ?? 60, phone);
      setError(t(getErrorKey(requestError)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <dialog aria-describedby={descriptionId} aria-labelledby={titleId} className={styles.dialog} onClose={() => { if (isOpen) onClose(); }} ref={dialogRef}>
      <div className={styles.panel} dir={locale === 'fa' ? 'rtl' : 'ltr'}>
        <button aria-label={t('close')} className={styles.closeButton} onClick={close} type="button"><CloseIcon /></button>
        <p className={styles.brand}>VYBERN EYEWEAR</p>
        <h2 id={titleId}>{step === 'phone' ? t('welcome') : t('verifyTitle')}</h2>
        <p className={styles.description} id={descriptionId}>{step === 'phone' ? t('description') : t('verificationDescription', { phone: maskPhone(phone) })}</p>

        {step === 'phone' ? (
          <form noValidate onSubmit={submitPhone}>
            <label className={styles.label} htmlFor="auth-phone">{t('phoneLabel')}</label>
            <input aria-describedby="auth-phone-hint auth-error" autoComplete="tel" className={styles.phoneInput} disabled={isSubmitting} id="auth-phone" inputMode="tel" onChange={(event) => setPhone(event.target.value)} placeholder={t('phonePlaceholder')} ref={phoneInputRef} type="tel" value={phone} />
            <p className={styles.hint} id="auth-phone-hint">{t('phoneHint')}</p>
            {error && <p aria-live="polite" className={styles.error} id="auth-error">{error}</p>}
            {cooldownSeconds > 0 && <p aria-live="polite" className={styles.cooldown}>{cooldownT('retryIn', { seconds: cooldownSeconds })}</p>}
            <button className={styles.primaryButton} disabled={isSubmitting || cooldownSeconds > 0} type="submit">{isSubmitting ? t('sending') : t('continue')}</button>
            <p className={styles.legal}>{t('legal')}</p>
          </form>
        ) : (
          <form noValidate onSubmit={submitOtp}>
            <div aria-label={t('codeLabel')} className={styles.otpGroup} dir="ltr">
              {otp.map((digit, index) => (
                <input aria-label={t('digitLabel', { number: index + 1 })} autoComplete={index === 0 ? 'one-time-code' : 'off'} className={styles.otpInput} disabled={isSubmitting} inputMode="numeric" key={index} maxLength={6} onChange={(event) => updateOtp(index, event.target.value)} onKeyDown={(event) => handleOtpKeyDown(index, event)} onPaste={(event) => { event.preventDefault(); updateOtp(0, event.clipboardData.getData('text')); }} pattern="[0-9]*" ref={(element) => { otpInputRefs.current[index] = element; }} type="text" value={digit} />
              ))}
            </div>
            {error && <p aria-live="polite" className={styles.error} id="auth-error">{error}</p>}
            <button className={styles.primaryButton} disabled={isSubmitting} type="submit">{isSubmitting ? t('verifying') : t('verify')}</button>
            <div className={styles.otpActions}>
              <button className={styles.textButton} disabled={isSubmitting} onClick={() => { setStep('phone'); setOtp(Array(6).fill('')); setError(null); persistFlow('phone', '', null); }} type="button">{t('changeNumber')}</button>
              <button className={styles.textButton} disabled={isSubmitting || cooldownSeconds > 0} onClick={resendOtp} type="button">{cooldownSeconds > 0 ? cooldownT('retryIn', { seconds: cooldownSeconds }) : t('resend')}</button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
