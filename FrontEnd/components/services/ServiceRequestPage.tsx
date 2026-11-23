'use client';

import Image from 'next/image';
import { FormEvent, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AuthApiError, isE164PhoneNumber, normalisePhoneNumber } from '@/lib/auth-client';
import { submitServiceRequest } from '@/lib/service-client';
import { useToast } from '@/components/toast/ToastProvider';
import styles from './ServiceRequestPage.module.css';

type Kind = 'eyeExam' | 'lensUpgrade';

const config: Record<Kind, { endpoint: 'eye-exam' | 'lens-upgrade'; image: string }> = {
  eyeExam: { endpoint: 'eye-exam', image: '/images/MiddBanerPic/EyeExamination.png' },
  lensUpgrade: { endpoint: 'lens-upgrade', image: '/images/MiddBanerPic/LensUpgrade.png' },
};

function createIdempotencyKey() { return crypto.randomUUID(); }

export function ServiceRequestPage({ kind }: { kind: Kind }) {
  const t = useTranslations('ServicePages');
  const locale = useLocale();
  const toast = useToast();
  const idempotencyKey = useRef<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isEyeExam = kind === 'eyeExam';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || reference) return;
    const form = new FormData(event.currentTarget);
    const phone = normalisePhoneNumber(String(form.get('phone') ?? ''));
    if (!isE164PhoneNumber(phone)) { setError(t('errors.phone')); return; }
    setError(null);
    setSubmitting(true);
    idempotencyKey.current ??= createIdempotencyKey();
    const payload = Object.fromEntries(form.entries()) as Record<string, string>;
    payload.phone = phone;
    try {
      const result = await submitServiceRequest(config[kind].endpoint, payload, idempotencyKey.current);
      setReference(result.data.reference);
      toast.success(t('success.toast'));
    } catch (caught) {
      const message = caught instanceof AuthApiError && caught.status === 429 ? t('errors.rateLimited') : t('errors.submit');
      setError(message);
      toast.error(message);
    } finally { setSubmitting(false); }
  }

  const textDirection = locale === 'fa' ? 'rtl' : 'ltr';
  return <main className={`${styles.page} ${styles[kind]}`} dir="ltr">
    <section className={styles.hero}>
      <Image alt={t(`${kind}.imageAlt`)} fill priority sizes="100vw" src={config[kind].image} />
      <div className={styles.heroCopy} dir={textDirection}><p>{t(`${kind}.eyebrow`)}</p><h1>{t(`${kind}.title`)}</h1><span>{t(`${kind}.description`)}</span></div>
    </section>
    <section aria-labelledby={`${kind}-form-title`} className={styles.panel} dir={textDirection}>
      <div className={styles.explanation}><p>{t('requestLabel')}</p><h2 id={`${kind}-form-title`}>{t(`${kind}.formTitle`)}</h2><span>{t(`${kind}.formDescription`)}</span><small>{t('privacy')}</small></div>
      {reference ? <div className={styles.confirmation} role="status"><p>{t('success.eyebrow')}</p><h2>{t('success.title')}</h2><strong>{reference}</strong><span>{t('success.description')}</span></div> : <form className={styles.form} onSubmit={submit}>
        <label>{t('fields.fullName')}<input autoComplete="name" maxLength={160} name="fullName" required /></label>
        <label>{t('fields.phone')}<input autoComplete="tel" inputMode="tel" name="phone" placeholder="+989…" required type="tel" /></label>
        <label>{t('fields.email')}<input autoComplete="email" maxLength={254} name="email" type="email" /></label>
        {isEyeExam ? <>
          <label>{t('fields.examinationType')}<select defaultValue="COMPREHENSIVE" name="examinationType"><option value="COMPREHENSIVE">{t('eyeExam.types.comprehensive')}</option><option value="VISION_ASSESSMENT">{t('eyeExam.types.vision')}</option><option value="PRESCRIPTION_CONSULTATION">{t('eyeExam.types.prescription')}</option></select></label>
          <label>{t('fields.preferredDate')}<input name="preferredDate" required type="date" /></label>
          <label>{t('fields.preferredTime')}<input name="preferredTime" required type="time" /></label>
        </> : <>
          <label>{t('fields.frameBrand')}<input maxLength={120} name="frameBrand" required /></label>
          <label>{t('fields.frameModel')}<input maxLength={120} name="frameModel" /></label>
          <label>{t('fields.lensType')}<select defaultValue="SINGLE_VISION" name="lensType"><option value="SINGLE_VISION">{t('lensUpgrade.types.singleVision')}</option><option value="PROGRESSIVE">{t('lensUpgrade.types.progressive')}</option><option value="BLUE_LIGHT">{t('lensUpgrade.types.blueLight')}</option><option value="PHOTOCHROMIC">{t('lensUpgrade.types.photochromic')}</option><option value="CONSULTATION">{t('lensUpgrade.types.consultation')}</option></select></label>
          <label>{t('fields.prescription')}<select defaultValue="HAVE_PRESCRIPTION" name="prescriptionAvailability"><option value="HAVE_PRESCRIPTION">{t('lensUpgrade.prescriptions.have')}</option><option value="NEED_EYE_EXAM">{t('lensUpgrade.prescriptions.exam')}</option><option value="NEED_ASSISTANCE">{t('lensUpgrade.prescriptions.help')}</option></select></label>
          <label>{t('fields.consultationDate')}<input name="consultationDate" type="date" /></label>
        </>}
        <label className={styles.notes}>{t('fields.notes')}<textarea maxLength={1000} name="notes" rows={4} /></label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button disabled={submitting} type="submit">{submitting ? t('submitting') : t(`${kind}.submit`)}</button>
      </form>}
    </section>
  </main>;
}
