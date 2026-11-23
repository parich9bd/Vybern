'use client';

import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { demoCartItemCount, demoCartSubtotal, removeDemoCartItem, setDemoCartItemQuantity, useDemoCart } from '@/lib/demo-cart';
import styles from './DemoCartDrawer.module.css';

type DemoCartDrawerProps = Readonly<{ isOpen: boolean; onClose: () => void }>;

export function DemoCartDrawer({ isOpen, onClose }: DemoCartDrawerProps) {
  const t = useTranslations('DemoCart');
  const locale = useLocale();
  const items = useDemoCart();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const total = demoCartSubtotal(items);

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const formatPrice = (amountMinor: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amountMinor / 100);

  return <>
    <button aria-label={t('close')} className={styles.backdrop} onClick={onClose} type="button" />
    <aside aria-label={t('title')} aria-modal="true" className={styles.drawer} role="dialog">
      <header><div><p>{t('previewLabel')}</p><h2>{t('title')}</h2></div><button aria-label={t('close')} onClick={onClose} ref={closeButtonRef} type="button">×</button></header>
      {items.length === 0 ? <p className={styles.empty}>{t('empty')}</p> : <div className={styles.items}>{items.map((item) => <article className={styles.item} key={item.key}><div><h3>{item.productName}</h3><p>{item.variantLabel}</p><strong>{formatPrice(item.unitPriceMinor)}</strong></div><div className={styles.itemActions}><div aria-label={t('quantity')} className={styles.quantity}><button aria-label={t('decreaseQuantity', { name: item.productName })} onClick={() => setDemoCartItemQuantity(item.key, item.quantity - 1)} type="button">−</button><span>{item.quantity}</span><button aria-label={t('increaseQuantity', { name: item.productName })} onClick={() => setDemoCartItemQuantity(item.key, item.quantity + 1)} type="button">+</button></div><button className={styles.remove} onClick={() => removeDemoCartItem(item.key)} type="button">{t('removeItem')}</button></div></article>)}</div>}
      <footer><div><span>{t('subtotal')}</span><strong>{formatPrice(total)}</strong></div><button disabled type="button">{t('checkoutUnavailable')}</button><small>{t('notice')}</small><span className={styles.count}>{t('itemCount', { count: demoCartItemCount(items) })}</span></footer>
    </aside>
  </>;
}
