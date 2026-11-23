'use client';

import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { getFeaturedCatalog, productImageUrl, type CatalogProduct } from '@/lib/catalog-client';
import { demoFeaturedProducts, type DemoColourKey } from '@/lib/demo-featured-products';
import { useWishlist } from '@/lib/wishlist';
import { addDemoCartItem } from '@/lib/demo-cart';
import { useToast } from '@/components/toast/ToastProvider';
import { BagIcon, CheckIcon } from '@/components/layout/icons';
import styles from './FeaturedProducts.module.css';

const allowDemoOnApiFailure = process.env.NODE_ENV === 'development';

type CardVariant = Readonly<{ id: string; label: string; swatch?: string; amountMinor: number; originalAmountMinor?: number; available: boolean }>;
type CardReview = Readonly<{ id: string; name: string; rating: number }>;
type CardRating = Readonly<{ average: number; count: number; reviews: readonly CardReview[] }>;
type CardProduct = Readonly<{ id: string; name: string; category: string; image: { src: string; alt: string; remote: boolean }; secondaryImage?: { src: string; remote: boolean }; variants: CardVariant[]; href?: string; demo: boolean; rating?: CardRating }>;

function formatPrice(amountMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
}

function HeartIcon({ selected }: Readonly<{ selected: boolean }>) {
  return <svg aria-hidden="true" fill={selected ? 'currentColor' : 'none'} viewBox="0 0 24 24"><path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z" /></svg>;
}

function realProductCard(product: CatalogProduct, locale: string): CardProduct {
  const image = product.images[0];
  const secondary = product.images[1];
  return {
    id: product.id, name: product.name ?? 'VYBERN', category: product.category.name ?? product.category.slug,
    image: image ? { src: productImageUrl(image.url), alt: image.altText?.[locale as 'en' | 'fa' | 'de'] ?? image.alt ?? product.name ?? '', remote: true } : { src: '', alt: '', remote: false },
    ...(secondary ? { secondaryImage: { src: productImageUrl(secondary.url), remote: true } } : {}),
    variants: product.variants.map((variant) => ({ id: variant.sku, label: variant.colour ?? variant.name, amountMinor: variant.price.amountMinor, available: variant.available })), href: `/${locale}/shop/${product.slug}`, demo: false,
  };
}

function demoProductCards(t: ReturnType<typeof useTranslations<'FeaturedProducts'>>): CardProduct[] {
  return demoFeaturedProducts.map((product) => ({
    id: product.id, name: product.name, category: t(`categories.${product.category}`), image: { src: product.image, alt: t('demoImageAlt', { name: product.name }), remote: false }, demo: true, rating: product.rating,
    variants: product.variants.map((variant) => ({ id: variant.id, label: t(`colours.${variant.colour satisfies DemoColourKey}`), swatch: variant.swatch, amountMinor: variant.amountMinor, ...(variant.originalAmountMinor ? { originalAmountMinor: variant.originalAmountMinor } : {}), available: variant.available })),
  }));
}

function FeaturedCard({ locale, product }: Readonly<{ locale: string; product: CardProduct }>) {
  const t = useTranslations('FeaturedProducts');
  const toast = useToast();
  const { selected: wished, toggle } = useWishlist(product.id, product.demo ? 'demo' : 'catalog');
  const [selectedId, setSelectedId] = useState(product.variants.find((variant) => variant.available)?.id ?? product.variants[0]?.id ?? '');
  const variant = product.variants.find((item) => item.id === selectedId);
  const rawDiscount = variant?.originalAmountMinor && variant.originalAmountMinor > variant.amountMinor ? Math.round((1 - variant.amountMinor / variant.originalAmountMinor) * 100) : null;
  const discount = rawDiscount === null ? null : Math.min(100, Math.max(0, rawDiscount));
  const cardRef = useRef<HTMLElement>(null);
  const ratingRef = useRef<HTMLDivElement>(null);
  const [discountEntered, setDiscountEntered] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [wasAdded, setWasAdded] = useState(false);
  const purchaseLabel = product.demo ? (isAdding ? t('addingToBag') : wasAdded ? t('addedToBag') : t('addToBag')) : variant?.available ? t('selectOnProductPage') : t('soldOut');
  const purchaseHint = product.demo ? t('demoPurchaseHint') : variant?.available ? t('cartUnavailableHint') : t('soldOutHint');
  const content = <>{product.image.src ? <Image alt={product.image.alt} className={styles.primaryImage} fill sizes="(max-width: 620px) 50vw, (max-width: 960px) 50vw, 33vw" src={product.image.src} unoptimized={product.image.remote} /> : <span>{t('imageUnavailable')}</span>}{product.secondaryImage && <Image alt="" aria-hidden="true" className={styles.secondaryImage} fill sizes="(max-width: 620px) 50vw, (max-width: 960px) 50vw, 33vw" src={product.secondaryImage.src} unoptimized />}</>;

  useEffect(() => {
    if (discount === null || !cardRef.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setDiscountEntered(true);
      observer.disconnect();
    }, { threshold: 0.2 });
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [discount]);

  useEffect(() => {
    if (!reviewsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!ratingRef.current?.contains(event.target as Node)) setReviewsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReviewsOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [reviewsOpen]);

  const addToDemoBag = () => {
    if (!product.demo || !variant?.available || isAdding) return;
    setIsAdding(true);
    try {
      addDemoCartItem({ productId: product.id, productName: product.name, image: product.image.src, variantId: variant.id, variantLabel: variant.label, unitPriceMinor: variant.amountMinor });
      setWasAdded(true);
      toast.success(t('addedToBagToast', { name: product.name }));
      window.setTimeout(() => setWasAdded(false), 1600);
    } catch {
      toast.error(t('addToBagError'));
    } finally {
      window.setTimeout(() => setIsAdding(false), 200);
    }
  };

  return <article className={styles.card} ref={cardRef}>
    <div className={styles.image}>{product.href ? <Link aria-label={t('viewProduct', { name: product.name })} className={styles.imageLink} href={product.href}>{content}</Link> : <div className={styles.imageLink}>{content}</div>}{discount !== null && <span className={`${styles.discountMeter} ${discountEntered ? styles.discountMeterEntered : ''}`} style={{ '--discount-level': `${discount}%` } as CSSProperties}><span className={styles.discountFill} /><span className={styles.discountLabel}>−{discount}%</span><span className={styles.discountOffer}>{t('offer')}</span></span>}<div className={styles.wishlistTab}><button aria-label={wished ? t('removeFromWishlist', { name: product.name }) : t('addToWishlist', { name: product.name })} aria-pressed={wished} className={styles.wishlist} onClick={toggle} type="button"><HeartIcon selected={wished} /></button></div></div>
    <div className={styles.meta}><p>{product.category}</p><h3>{product.href ? <Link href={product.href}>{product.name}</Link> : product.name}</h3>{product.rating && <div className={styles.ratingWrap} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setReviewsOpen(false); }} onMouseEnter={() => setReviewsOpen(true)} onMouseLeave={() => setReviewsOpen(false)} ref={ratingRef}><button aria-controls={`reviews-${product.id}`} aria-expanded={reviewsOpen} aria-label={t('ratingButtonLabel', { name: product.name, rating: product.rating.average, count: product.rating.count })} className={styles.ratingButton} onClick={() => setReviewsOpen((open) => !open)} onFocus={() => setReviewsOpen(true)} type="button"><span aria-hidden="true" className={styles.ratingStar}>★</span><span>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(product.rating.average)}</span><span className={styles.ratingCount}>({new Intl.NumberFormat(locale).format(product.rating.count)})</span></button>{reviewsOpen && <section aria-label={t('reviewPanelLabel', { name: product.name })} className={styles.reviewPanel} id={`reviews-${product.id}`} role="region"><p>{t('previewReviews')}</p>{product.rating.reviews.map((review, index) => <article className={styles.reviewBubble} key={review.id} style={{ '--review-delay': `${index * 120}ms` } as CSSProperties}><span aria-label={t('reviewStarLabel', { rating: review.rating })} className={styles.reviewStars}>{'★'.repeat(review.rating)}</span><q>{t(`reviews.${review.id}`)}</q><cite>— {review.name}</cite></article>)}<small>{t('demoReviewsNotice')}</small></section>}</div>}<div aria-label={t('colourOptions')} className={styles.swatches}>{product.variants.map((item) => <button aria-label={t('selectColour', { colour: item.label })} aria-pressed={item.id === selectedId} className={styles.swatch} key={item.id} onClick={() => setSelectedId(item.id)} style={item.swatch ? ({ '--swatch-colour': item.swatch } as CSSProperties) : undefined} title={item.label} type="button"><span>{item.swatch ? '' : item.label.slice(0, 1)}</span></button>)}</div><span className={styles.colourName}>{variant?.label}</span><div className={styles.price}><strong>{variant && formatPrice(variant.amountMinor, 'EUR', locale)}</strong>{variant?.originalAmountMinor && <del>{formatPrice(variant.originalAmountMinor, 'EUR', locale)}</del>}{variant && <span className={variant.available ? styles.available : styles.soldOut}>{variant.available ? t('available') : t('soldOut')}</span>}</div><button aria-describedby={`purchase-hint-${product.id}`} className={`${styles.purchaseAction} ${product.demo && variant?.available ? styles.purchaseActionActive : ''} ${wasAdded ? styles.purchaseActionAdded : ''}`} disabled={product.demo ? !variant?.available || isAdding : true} onClick={addToDemoBag} type="button"><span className={styles.purchaseActionLabel}>{purchaseLabel}</span><span aria-hidden="true" className={styles.purchaseActionIcon}>{wasAdded ? <CheckIcon /> : <BagIcon />}</span></button><span aria-live="polite" className={styles.visuallyHidden}>{isAdding ? t('addingToBag') : wasAdded ? t('addedToBag') : ''}</span><span className={styles.visuallyHidden} id={`purchase-hint-${product.id}`}>{purchaseHint}</span></div>
  </article>;
}

export function FeaturedProducts() {
  const t = useTranslations('FeaturedProducts');
  const locale = useLocale();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'preview' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    getFeaturedCatalog(locale).then((result) => { if (active) { setProducts(result.data); setState('ready'); } }).catch(() => { if (active) setState(allowDemoOnApiFailure ? 'preview' : 'error'); });
    return () => { active = false; };
  }, [locale]);

  const demo = state === 'preview' || (state === 'ready' && products.length === 0);
  const cards = demo ? demoProductCards(t) : products.map((product) => realProductCard(product, locale));
  return <section aria-labelledby="featured-products-heading" className={styles.section} dir={locale === 'fa' ? 'rtl' : 'ltr'}><header className={styles.header}><p>{t('eyebrow')}</p><h2 id="featured-products-heading">{t('title')}</h2><span>{t('description')}</span>{demo && <small>{t('previewCollection')}</small>}</header>{state === 'loading' && <p className={styles.state}>{t('loading')}</p>}{state === 'error' && <p className={styles.state}>{t('unavailable')}</p>}{(state === 'ready' || state === 'preview') && <div className={styles.grid}>{cards.map((product) => <FeaturedCard key={product.id} locale={locale} product={product} />)}</div>}<Link className={styles.explore} href={`/${locale}/shop`}>{t('exploreAll')} <span aria-hidden="true">→</span></Link></section>;
}
