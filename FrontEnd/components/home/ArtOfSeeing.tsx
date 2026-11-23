'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import styles from './ArtOfSeeing.module.css';

gsap.registerPlugin(ScrollTrigger);

const valueKeys = ['precision', 'craftsmanship', 'timelessDesign'] as const;

export function ArtOfSeeing() {
  const t = useTranslations('ArtOfSeeing');
  const locale = useLocale();
  const root = useRef<HTMLElement>(null);
  const direction = locale === 'fa' ? 'rtl' : 'ltr';

  useEffect(() => {
    const section = root.current;
    if (!section || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const context = gsap.context(() => {
      const image = section.querySelector<HTMLElement>('[data-art-image]');
      const light = section.querySelector<HTMLElement>('[data-art-light]');
      const heading = section.querySelector<HTMLElement>('[data-art-heading]');
      const statement = section.querySelector<HTMLElement>('[data-art-statement]');
      const values = gsap.utils.toArray<HTMLElement>('[data-art-value]', section);
      if (!image || !heading || !statement) return;

      gsap.set(image, { clipPath: 'inset(0 100% 0 0)', scale: 1.025 });
      gsap.set([heading, statement], { autoAlpha: 0, y: 25 });
      gsap.set(values, { autoAlpha: 0.46, y: 12 });
      gsap.set(values.map((value) => value.querySelector('[data-art-number]')), { color: 'var(--muted)' });
      if (light) gsap.set(light, { autoAlpha: 0, xPercent: -30 });

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top 76%',
          end: 'bottom 22%',
          toggleActions: 'play none none reverse',
          invalidateOnRefresh: true,
        },
      });

      timeline
        .to(image, { clipPath: 'inset(0 0% 0 0)', scale: 1, duration: 1.4, ease: 'power3.out' })
        .to(light, { autoAlpha: 0.62, xPercent: 28, duration: 1.25, ease: 'power2.inOut' }, '<0.12')
        .to(heading, { autoAlpha: 1, y: 0, duration: 0.72, ease: 'power3.out' }, '<0.32')
        .to(statement, { autoAlpha: 1, y: 0, duration: 0.58, ease: 'power2.out' }, '<0.16');

      values.forEach((value) => {
        timeline
          .to(value, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power2.out' }, '+=0.22')
          .to(value.querySelector('[data-art-number]'), { color: 'var(--accent)', duration: 0.3 }, '<');
      });
    }, section);

    return () => context.revert();
  }, [locale]);

  useEffect(() => {
    const refresh = () => ScrollTrigger.refresh();
    const frame = window.requestAnimationFrame(refresh);
    window.addEventListener('load', refresh);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('load', refresh);
    };
  }, []);

  return <section aria-labelledby="art-of-seeing-title" className={styles.section} ref={root}>
    <div aria-hidden="true" className={styles.divider}><span /><i /><span /></div>
    <div className={styles.composition}>
      <div className={styles.imageFrame}>
        <div className={styles.imageRegion} data-art-image>
          <Image alt={t('imageAlt')} fill sizes="(max-width: 760px) 100vw, 55vw" src="/images/MiddBanerPic/Handmade.png" />
          <span aria-hidden="true" className={styles.imageLight} data-art-light />
        </div>
        <p className={styles.imageLabel}>{t('imageLabel')}</p>
      </div>
      <div className={styles.copy} dir={direction}>
        <header className={styles.heading} data-art-heading>
          <p>{t('eyebrow')}</p>
          <h2 id="art-of-seeing-title">{t('titleLineOne')}<br />{t('titleLineTwo')}</h2>
        </header>
        <p className={styles.statement} data-art-statement>{t('statementLineOne')}<br />{t('statementLineTwo')}</p>
        <ol className={styles.values}>
          {valueKeys.map((key, index) => <li data-art-value key={key}><span data-art-number>{String(index + 1).padStart(2, '0')}</span><div><h3>{t(`values.${key}.title`)}</h3><p>{t(`values.${key}.description`)}</p></div></li>)}
        </ol>
      </div>
    </div>
  </section>;
}
