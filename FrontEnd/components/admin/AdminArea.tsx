'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { AuthApiError } from '@/lib/auth-client';
import { getAdminDashboard, getAdminMe, type AdminDashboard } from '@/lib/admin-client';
import { DashboardIcon, OrdersIcon, SettingsIcon, ShieldIcon, UserIcon } from '@/components/layout/icons';
import styles from './AdminArea.module.css';

export function AdminArea() {
  const t = useTranslations('Admin'); const locale = useLocale(); const [data, setData] = useState<AdminDashboard | null>(null); const [denied, setDenied] = useState(false);
  useEffect(() => { Promise.all([getAdminMe(), getAdminDashboard()]).then(([, dashboard]) => setData(dashboard)).catch((error) => setDenied(error instanceof AuthApiError && error.status === 403)); }, []);
  if (denied) return <main className={styles.state}><ShieldIcon /><h1>{t('accessDenied')}</h1></main>;
  if (!data) return <main className={styles.state}><p>{t('loading')}</p></main>;
  const cards = [[t('revenue'), data.metrics.realRevenueMinor], [t('ordersTotal'), data.metrics.totalOrders], [t('customersTotal'), data.metrics.totalCustomers], [t('activeProducts'), data.metrics.activeProducts], [t('lowStock'), data.metrics.lowStockProducts], [t('pendingOrders'), data.metrics.pendingOrders]];
  const nav = [[t('dashboard'), '/admin', <DashboardIcon key="d" />], [t('products'), '/admin/products', <UserIcon key="p" />], [t('orders'), '/admin/orders', <OrdersIcon key="o" />], [t('customers'), '/admin/customers', <UserIcon key="c" />], [t('inventory'), '/admin/inventory', <DashboardIcon key="i" />], [t('payments'), '/admin/payments', <OrdersIcon key="pa" />], [t('settings'), '/admin/settings', <SettingsIcon key="s" />]] as const;
  return <main className={styles.page} dir={locale === 'fa' ? 'rtl' : 'ltr'}><aside className={styles.sidebar}><p>VYBERN / {t('control')}</p><nav>{nav.map(([label, href, icon]) => <Link href={href} key={href}>{icon}<span>{label}</span></Link>)}</nav></aside><section className={styles.content}><p className={styles.eyebrow}>{t('control')}</p><h1>{t('dashboard')}</h1><div className={styles.cards}>{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{typeof value === 'number' ? new Intl.NumberFormat(locale).format(value) : value}</strong></article>)}</div><div className={styles.grid}><section><h2>{t('recentOrders')}</h2>{data.recentOrders.length ? data.recentOrders.map((order) => <div className={styles.row} key={order.id}><span dir="ltr">{order.id.slice(-8)}</span><span>{order.status}</span></div>) : <p>{t('noData')}</p>}</section><section><h2>{t('topProducts')}</h2>{data.topSellingProducts.length ? data.topSellingProducts.map((product) => <div className={styles.row} key={product.productId ?? product.name}><span>{product.name}</span><strong>{product.quantity}</strong></div>) : <p>{t('noData')}</p>}</section></div></section></main>;
}
