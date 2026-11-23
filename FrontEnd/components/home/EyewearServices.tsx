import Image from 'next/image';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import styles from './EyewearServices.module.css';

const services = [
  { key: 'exam', hasDescription: false, href: 'services/eye-exam', src: '/images/MiddBanerPic/EyeExamination.png' },
  { key: 'lenses', hasDescription: true, href: 'services/lens-upgrade', src: '/images/MiddBanerPic/LensUpgrade.png' },
] as const;

export function EyewearServices() {
  const t = useTranslations('EyewearServices');
  const locale = useLocale();
  const textDirection = locale === 'fa' ? 'rtl' : 'ltr';

  return (
    <>
    <section aria-label={t('sectionLabel')} className={styles.services} dir="ltr">
      <div className={styles.grid}>
        {services.map(({ key, hasDescription, href, src }) => (
          <Link aria-label={t(`${key}.title`)} className={`${styles.card} ${styles[key]}`} href={`/${locale}/${href}`} key={key}>
            <div className={styles.media}>
              <Image alt={t(`${key}.imageAlt`)} fill sizes="(max-width: 760px) 100vw, 50vw" src={src} />
            </div>
            <div className={styles.content} dir={textDirection}>
              <h2>{t(`${key}.title`)}</h2>
              {hasDescription && <p>{t(`${key}.description`)}</p>}
              <span className={styles.cta}>
                <span>{t(`${key}.cta`)}</span>
                <span aria-hidden="true" className={styles.ctaArrow}>→</span>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
    <section aria-label={t('accessories.sectionLabel')} className={styles.accessories}>
      <Image
        alt={t('accessories.imageAlt')}
        fill
        sizes="100vw"
        src="/images/MiddBanerPic/accessories.png"
      />
      <h2 className={styles.accessoriesHeading} dir={textDirection}>{t('accessories.headline')}</h2>
    </section>
    </>
  );
}
