'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getCatalog, getCatalogCategories, productImageUrl, type CatalogCategory, type CatalogProduct } from '@/lib/catalog-client';
import { useWishlist } from '@/lib/wishlist';
import styles from './ShopPage.module.css';

type Sort = 'newest' | 'price_asc' | 'price_desc';

function formatPrice(amountMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
}

function HeartIcon({ filled }: Readonly<{ filled: boolean }>) {
  return <svg aria-hidden="true" fill={filled ? 'currentColor' : 'none'} viewBox="0 0 24 24"><path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z" /></svg>;
}

function ProductCard({ locale, product }: Readonly<{ locale: string; product: CatalogProduct }>) {
  const t = useTranslations('Shop');
  const [selectedSku, setSelectedSku] = useState(product.variants.find((variant) => variant.available)?.sku ?? product.variants[0]?.sku ?? '');
  const { selected: wishlist, toggle: toggleWishlist } = useWishlist(product.id);
  const selectedVariant = product.variants.find((variant) => variant.sku === selectedSku);
  const namedColours = product.variants.filter((variant) => variant.colour);
  const primary = product.images[0];
  const secondary = product.images[1];

  const imageAlt = primary?.altText?.[locale as 'en' | 'fa' | 'de'] ?? primary?.alt ?? product.name ?? '';
  const displayPrice = selectedVariant?.price ?? product.price;

  return <article className={styles.card}>
    <div className={styles.image}>
      <Link aria-label={t('viewProduct', { name: product.name ?? t('untitledProduct') })} className={styles.imageLink} href={`/${locale}/shop/${product.slug}`}>
      {primary ? <>
        <Image alt={imageAlt} className={styles.primaryImage} fill sizes="(max-width: 620px) 50vw, (max-width: 960px) 50vw, 33vw" src={productImageUrl(primary.url)} unoptimized />
        {secondary && <Image alt="" aria-hidden="true" className={styles.secondaryImage} fill sizes="(max-width: 620px) 50vw, (max-width: 960px) 50vw, 33vw" src={productImageUrl(secondary.url)} unoptimized />}
      </> : <span>{t('imageUnavailable')}</span>}</Link>
      <button aria-label={wishlist ? t('removeFromWishlist', { name: product.name ?? t('untitledProduct') }) : t('addToWishlist', { name: product.name ?? t('untitledProduct') })} aria-pressed={wishlist} className={styles.wishlist} onClick={toggleWishlist} type="button"><HeartIcon filled={wishlist} /></button>
    </div>
    <div className={styles.cardMeta}>
      <p>{product.category.name ?? product.category.slug}</p>
      <h2><Link href={`/${locale}/shop/${product.slug}`}>{product.name ?? t('untitledProduct')}</Link></h2>
      {namedColours.length > 0 && <div aria-label={t('colourOptions')} className={styles.swatches}>{namedColours.map((variant) => <button aria-label={t('selectColour', { colour: variant.colour ?? variant.name })} aria-pressed={selectedSku === variant.sku} className={styles.swatch} key={variant.sku} onClick={() => setSelectedSku(variant.sku)} title={variant.colour ?? variant.name} type="button"><span>{(variant.colour ?? variant.name).slice(0, 1)}</span></button>)}</div>}
      <div className={styles.priceRow}><strong>{formatPrice(displayPrice.amountMinor, displayPrice.currency, locale)}</strong>{selectedVariant && <span className={selectedVariant.available ? styles.available : styles.soldOut}>{selectedVariant.available ? t('available') : t('soldOut')}</span>}</div>
    </div>
  </article>;
}

export function ShopPage() {
  const t = useTranslations('Shop');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category = searchParams.get('category') ?? '';
  const requestedSort = searchParams.get('sort');
  const sort: Sort = requestedSort === 'price_asc' || requestedSort === 'price_desc' || requestedSort === 'newest' ? requestedSort : 'newest';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileCategory, setMobileCategory] = useState(category);
  const [mobileSort, setMobileSort] = useState<Sort>(sort);

  function updateQuery(next: { category?: string; sort?: Sort; page?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    const nextCategory = next.category ?? category;
    const nextSort = next.sort ?? sort;
    const nextPage = next.page ?? page;
    if (nextCategory) params.set('category', nextCategory); else params.delete('category');
    if (nextSort === 'newest') params.delete('sort'); else params.set('sort', nextSort);
    if (nextPage === 1) params.delete('page'); else params.set('page', String(nextPage));
    router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false });
  }

  useEffect(() => { getCatalogCategories(locale).then(({ data }) => setCategories(data)).catch(() => setCategories([])); }, [locale]);
  useEffect(() => {
    let active = true;
    const resetFailure = window.setTimeout(() => setFailed(false), 0);
    getCatalog(locale, category, sort, page).then((result) => {
      if (!active) return;
      setProducts(result.data);
      setTotal(result.meta.total);
      setTotalPages(result.meta.totalPages);
    }).catch(() => { if (active) { setProducts([]); setTotal(null); setFailed(true); } });
    return () => { active = false; window.clearTimeout(resetFailure); };
  }, [category, locale, page, sort]);

  function openMobileFilters() { setMobileCategory(category); setMobileSort(sort); setMobileOpen(true); }

  return <main className={styles.page} dir={locale === 'fa' ? 'rtl' : 'ltr'}>
    <header className={styles.intro}><p>{t('eyebrow')}</p><h1>{t('title')}</h1><span>{t('description')}</span></header>
    <section aria-label={t('collectionLabel')} className={styles.collection}>
      <div className={styles.controls}>
        <div className={styles.categories}><button aria-pressed={category === ''} onClick={() => updateQuery({ category: '', page: 1 })} type="button">{t('allCategories')}</button>{categories.map((item) => <button aria-pressed={category === item.slug} key={item.slug} onClick={() => updateQuery({ category: item.slug, page: 1 })} type="button">{item.name ?? item.slug}</button>)}</div>
        <label className={styles.sort}>{t('sortLabel')}<select onChange={(event) => updateQuery({ sort: event.target.value as Sort, page: 1 })} value={sort}><option value="newest">{t('sortNewest')}</option><option value="price_asc">{t('sortPriceAscending')}</option><option value="price_desc">{t('sortPriceDescending')}</option></select></label>
      </div>
      <button className={styles.mobileFilterTrigger} onClick={openMobileFilters} type="button">{t('filterAndSort')}</button>
      {mobileOpen && <section aria-label={t('filterAndSort')} className={styles.mobilePanel} role="dialog"><div><label>{t('categoryLabel')}<select onChange={(event) => setMobileCategory(event.target.value)} value={mobileCategory}><option value="">{t('allCategories')}</option>{categories.map((item) => <option key={item.slug} value={item.slug}>{item.name ?? item.slug}</option>)}</select></label><label>{t('sortLabel')}<select onChange={(event) => setMobileSort(event.target.value as Sort)} value={mobileSort}><option value="newest">{t('sortNewest')}</option><option value="price_asc">{t('sortPriceAscending')}</option><option value="price_desc">{t('sortPriceDescending')}</option></select></label></div><footer><button onClick={() => { setMobileCategory(''); setMobileSort('newest'); }} type="button">{t('reset')}</button><button onClick={() => { updateQuery({ category: mobileCategory, sort: mobileSort, page: 1 }); setMobileOpen(false); }} type="button">{t('apply')}</button></footer></section>}
      <p className={styles.count}>{total === null ? t('loading') : t('productCount', { count: total })}</p>
      {failed ? <p className={styles.state}>{t('unavailable')}</p> : <div className={styles.grid}>{products.map((product) => <ProductCard key={product.id} locale={locale} product={product} />)}</div>}
      {!failed && total === 0 && <p className={styles.state}>{t('empty')}</p>}
      {!failed && totalPages > 1 && <nav aria-label={t('paginationLabel')} className={styles.pagination}><button disabled={page === 1} onClick={() => updateQuery({ page: page - 1 })} type="button">{t('previous')}</button><span>{t('page', { page, total: totalPages })}</span><button disabled={page === totalPages} onClick={() => updateQuery({ page: page + 1 })} type="button">{t('next')}</button></nav>}
    </section>
  </main>;
}
