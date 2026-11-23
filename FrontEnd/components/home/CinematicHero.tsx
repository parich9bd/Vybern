'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import styles from './CinematicHero.module.css';

gsap.registerPlugin(ScrollTrigger);

const sceneAssets = [
  '/images/Hero/mainpic.PNG',
  '/images/Hero/details.PNG',
  '/images/Hero/detailsofglass.PNG',
  '/images/Hero/model.webp',
] as const;

export function CinematicHero() {
  const t = useTranslations('CinematicHero');
  const locale = useLocale();
  const textDirection = locale === 'fa' ? 'rtl' : 'ltr';
  const root = useRef<HTMLElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const typewriterTimer = useRef<number | undefined>(undefined);
  const detailOpenRef = useRef(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [typedDescription, setTypedDescription] = useState('');
  const scenes = sceneAssets.map((src, index) => {
    const key = `s${index + 1}` as const;
    const common = {
      src,
      eyebrow: t(`${key}.eyebrow`),
      title: t(`${key}.title`),
      highlight: t(`${key}.highlight`),
      label: t(`${key}.label`),
      alt: t(`${key}.alt`),
    };

    if (index === 3) return { ...common, kind: 'model' as const };

    return {
      ...common,
      kind: 'editorial' as const,
      supportingLead: t(`${key}.supportingLead`),
      supportingDetail: t(`${key}.supportingDetail`),
      pyramid: [
        t(`${key}.pyramid1`),
        t(`${key}.pyramid2`),
        t(`${key}.pyramid3`),
      ],
    };
  });

  const detail = {
    button: t('details.button'),
    openLabel: t('details.openLabel'),
    closeLabel: t('details.closeLabel'),
    title: t('details.title'),
    label: t('details.label'),
    description: t('details.description'),
  };

  const clearDetailTimers = useCallback(() => {
    if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current);
    if (typewriterTimer.current !== undefined) window.clearTimeout(typewriterTimer.current);
    closeTimer.current = undefined;
    typewriterTimer.current = undefined;
  }, []);

  const closeDetails = useCallback(() => {
    if (!detailOpenRef.current) return;
    clearDetailTimers();
    detailOpenRef.current = false;
    setIsDetailOpen(false);
    setTypedDescription('');
  }, [clearDetailTimers]);

  const openDetails = useCallback(() => {
    if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current);
    closeTimer.current = undefined;
    if (detailOpenRef.current) return;
    detailOpenRef.current = true;
    setIsDetailOpen(true);
  }, []);

  const scheduleCloseDetails = useCallback(() => {
    if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(closeDetails, 180);
  }, [closeDetails]);

  useEffect(() => {
    if (!isDetailOpen) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const segments = 'Segmenter' in Intl
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(detail.description), ({ segment }) => segment)
      : Array.from(detail.description);

    if (media.matches) {
      typewriterTimer.current = window.setTimeout(() => setTypedDescription(detail.description), 0);
      return () => {
        if (typewriterTimer.current !== undefined) window.clearTimeout(typewriterTimer.current);
        typewriterTimer.current = undefined;
      };
    }

    let index = 0;
    const typeNext = () => {
      index += 1;
      setTypedDescription(segments.slice(0, index).join(''));
      if (index < segments.length) typewriterTimer.current = window.setTimeout(typeNext, 34);
    };
    typewriterTimer.current = window.setTimeout(typeNext, 120);
    return () => {
      if (typewriterTimer.current !== undefined) window.clearTimeout(typewriterTimer.current);
      typewriterTimer.current = undefined;
    };
  }, [detail.description, isDetailOpen]);

  useEffect(() => () => clearDetailTimers(), [clearDetailTimers]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetails();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeDetails]);

  useGSAP(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const element = root.current;
    if (!element) return;
    const images = gsap.utils.toArray<HTMLElement>('[data-scene-image]', element);
    const copies = gsap.utils.toArray<HTMLElement>('[data-scene-copy]', element);
    const highlights = gsap.utils.toArray<HTMLElement>('[data-scene-highlight]', element);
    const counter = element.querySelector<HTMLElement>('[data-counter]');
    const indicator = element.querySelector<HTMLElement>('[data-scroll-indicator]');
    gsap.set(images.slice(1), { autoAlpha: 0, scale: 1.06 });
    gsap.set(copies.slice(1), { autoAlpha: 0, y: 24 });
    gsap.set(highlights.slice(1), { autoAlpha: 0, y: 16 });
    const timeline = gsap.timeline({ scrollTrigger: { trigger: element, start: 'top top', end: () => (window.matchMedia('(max-width: 700px)').matches ? '+=4000' : '+=3500'), pin: true, scrub: 1, invalidateOnRefresh: true, onUpdate: (self) => { const index = Math.min(3, Math.floor(self.progress * 4)); if (counter) counter.textContent = scenes[index].label; element.style.setProperty('--scroll-progress', String(Math.max(.08, self.progress))); if (index > 0) closeDetails(); } } });
    for (let index = 0; index < 3; index += 1) {
      const at = index + 1;
      timeline
        .to(images[index], { autoAlpha: 0, scale: 0.94, duration: 0.7 }, at)
        .to(images[index + 1], { autoAlpha: 1, scale: 1, duration: 0.7 }, at)
        .to(copies[index], { autoAlpha: 0, y: -20, duration: 0.35 }, at)
        .to(highlights[index], { autoAlpha: 0, y: -8, duration: 0.25 }, at)
        .to(copies[index + 1], { autoAlpha: 1, y: 0, duration: 0.45 }, at + 0.22)
        .to(highlights[index + 1], { autoAlpha: 1, y: 0, duration: 0.4 }, at + 0.36);
    }
    if (indicator) timeline.to(indicator, { autoAlpha: 0, duration: 0.2 }, 3.75);
    return () => {
      timeline.scrollTrigger?.kill();
      timeline.kill();
    };
  }, { scope: root, dependencies: [closeDetails] });

  return (
    <section className={styles.hero} dir="ltr" ref={root}>
      {scenes.map((scene, index) => (
        <div className={`${styles.scene} ${scene.kind === 'model' ? styles.modelScene : styles[`scene${index + 1}`]}`} data-scene-image key={scene.src}>
          <div className={styles.imageRegion}>
            <Image alt={scene.alt} fill priority={index === 0} sizes="100vw" src={scene.src} />
            {index === 0 && (
              <div className={styles.detailRegion}>
                <button
                  aria-controls="vybern-hero-frame-details"
                  aria-expanded={isDetailOpen}
                  aria-label={detail.openLabel}
                  className={styles.detailTarget}
                  dir={textDirection}
                  onBlur={scheduleCloseDetails}
                  onClick={() => (isDetailOpen ? closeDetails() : openDetails())}
                  onFocus={openDetails}
                  onMouseEnter={openDetails}
                  onMouseLeave={scheduleCloseDetails}
                  type="button"
                >
                  <span aria-hidden="true" className={styles.detailMarker} />
                  <span className={styles.detailButtonText}>{detail.button}</span>
                </button>
                {isDetailOpen && (
                  <aside
                    aria-live="polite"
                    className={styles.detailBubble}
                    dir={textDirection}
                    id="vybern-hero-frame-details"
                    onBlur={scheduleCloseDetails}
                    onFocus={openDetails}
                    onMouseEnter={openDetails}
                    onMouseLeave={scheduleCloseDetails}
                  >
                    <button aria-label={detail.closeLabel} className={styles.detailClose} onClick={closeDetails} type="button">×</button>
                    <p className={styles.detailTitle}>{detail.title}</p>
                    <p className={styles.detailLabel}>{detail.label}</p>
                    <p className={styles.detailDescription}>{typedDescription}<span aria-hidden="true" className={styles.typeCursor} /></p>
                  </aside>
                )}
              </div>
            )}
          </div>
          {scene.kind === 'model' ? (
            <div className={styles.copy} data-scene-copy dir={textDirection}>
              <p>{scene.eyebrow}</p>
              <h1>{scene.title}<em data-scene-highlight>{scene.highlight}</em></h1>
            </div>
          ) : (
            <div className={styles.editorial} data-scene-copy dir={textDirection}>
              <div className={styles.editorialTop}>
                <div className={styles.brandGroup} dir={textDirection}>
                  <p className={styles.eyebrow}>{scene.eyebrow}</p>
                  <p className={styles.supportingLead}>{scene.supportingLead}</p>
                  <span className={styles.divider} aria-hidden="true" />
                </div>
                <div className={styles.highlightGroup} dir={textDirection}>
                  <em className={styles.highlight} data-scene-highlight>{scene.highlight}</em>
                  <p className={styles.supportingDetail}>{scene.supportingDetail}</p>
                  <span className={styles.motif} aria-hidden="true" />
                </div>
              </div>
              <div className={styles.headlineGroup} dir={textDirection}>
                <h1>{scene.title}</h1>
                <div className={styles.pyramid}>
                  {scene.pyramid.map((line) => <p key={line}>{line}</p>)}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
      <p className={styles.progress} data-counter dir={textDirection}>{scenes[0].label}</p>
      <div aria-hidden="true" className={styles.scrollIndicator} data-scroll-indicator>
        <span className={styles.scrollIndicatorText}>{t('scroll')}</span>
        <span className={styles.scrollIndicatorTrack}><i /></span>
      </div>
    </section>
  );
}
