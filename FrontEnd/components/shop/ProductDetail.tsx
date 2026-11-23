'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { getProduct, productImageUrl, type CatalogProduct } from '@/lib/catalog-client';
import styles from './ProductDetail.module.css';

function formatPrice(amountMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
}

export function ProductDetail() {
  const t = useTranslations('Shop');
  const locale = useLocale();
  const params = useParams<{ slug: string }>();
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    getProduct(params.slug, locale).then((result) => { if (active) setProduct(result.data); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [locale, params.slug]);

  if (failed) return <main className={styles.state} dir={locale === 'fa' ? 'rtl' : 'ltr'}><Link href={`/${locale}/shop`}>{t('backToCollection')}</Link><p>{t('productUnavailable')}</p></main>;
  if (!product) return <main className={styles.state} dir={locale === 'fa' ? 'rtl' : 'ltr'}><p>{t('loading')}</p></main>;

  const image = product.images[0];
  const availableVariants = product.variants.filter((variant) => variant.available);
  const lowestPrice = availableVariants.reduce((lowest, variant) => Math.min(lowest, variant.price.amountMinor), product.price.amountMinor);

  return <main className={styles.page} dir={locale === 'fa' ? 'rtl' : 'ltr'}>
    <Link className={styles.back} href={`/${locale}/shop`}>{t('backToCollection')}</Link>
    <article className={styles.product}>
      <div className={styles.image}>{image ? <Image alt={image.altText?.[locale as 'en' | 'fa' | 'de'] ?? image.alt ?? product.name ?? ''} fill sizes="(max-width: 760px) 100vw, 50vw" src={productImageUrl(image.url)} unoptimized /> : <span>{t('imageUnavailable')}</span>}</div>
      <div className={styles.content}><p>{product.category.name ?? product.category.slug}</p><h1>{product.name ?? t('untitledProduct')}</h1>{product.description && <div className={styles.description}>{product.description}</div>}<strong>{formatPrice(lowestPrice, product.price.currency, locale)}</strong>{product.variants.length > 0 && <section><h2>{t('availableVariants')}</h2><ul>{product.variants.map((variant) => <li key={variant.sku}><span>{variant.colour ?? variant.name}</span><span>{formatPrice(variant.price.amountMinor, variant.price.currency, locale)}</span><em>{variant.available ? t('available') : t('soldOut')}</em></li>)}</ul></section>}</div>
    </article>
  </main>;
}
