'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { AuthApiError } from '@/lib/auth-client';
import { getAdminDashboard, getAdminMe, type AdminDashboard } from '@/lib/admin-client';
import { DashboardIcon, OrdersIcon, SettingsIcon, ShieldIcon, UserIcon } from '@/components/layout/icons';
import styles from './AdminArea.module.css';

function Bars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return <div aria-label="Trend chart" className={styles.bars}>{values.map((value, index) => <i key={index} style={{ height: `${Math.max(5, value / max * 100)}%` }} title={String(value)} />)}</div>;
}

export function AdminArea() {
  const t = useTranslations('Admin'); const locale = useLocale(); const [data, setData] = useState<AdminDashboard | null>(null); const [denied, setDenied] = useState(false); const [days, setDays] = useState(30);
  useEffect(() => { Promise.all([getAdminMe(), getAdminDashboard(days)]).then(([, dashboard]) => setData(dashboard)).catch((error) => setDenied(error instanceof AuthApiError && error.status === 403)); }, [days]);
  if (denied) return <main className={styles.state}><ShieldIcon /><h1>{t('accessDenied')}</h1></main>;
  if (!data) return <main className={styles.state}><p>{t('loading')}</p></main>;
  const cards = [[t('revenue'), data.metrics.realRevenueMinor], ['AOV', data.metrics.averageOrderValueMinor], [t('ordersTotal'), data.metrics.totalOrders], [t('customersTotal'), data.metrics.totalCustomers], [t('activeProducts'), data.metrics.activeProducts], [t('lowStock'), data.metrics.lowStockProducts], [t('pendingOrders'), data.metrics.pendingOrders]];
  const nav = [[t('dashboard'), '/admin', <DashboardIcon key="d" />], [t('products'), '/admin/products', <UserIcon key="p" />], [t('orders'), '/admin/orders', <OrdersIcon key="o" />], [t('customers'), '/admin/customers', <UserIcon key="c" />], [t('inventory'), '/admin/inventory', <DashboardIcon key="i" />], [t('payments'), '/admin/payments', <OrdersIcon key="pa" />], [t('settings'), '/admin/settings', <SettingsIcon key="s" />]] as const;
  return <main className={styles.page} dir={locale === 'fa' ? 'rtl' : 'ltr'}><aside className={styles.sidebar}><p>VYBERN / {t('control')}</p><nav>{nav.map(([label, href, icon]) => <Link href={href} key={href}>{icon}<span>{label}</span></Link>)}</nav></aside><section className={styles.content}><div className={styles.heading}><div><p className={styles.eyebrow}>{t('control')}</p><h1>{t('dashboard')}</h1></div><div className={styles.ranges}>{[7, 30, 90].map((range) => <button aria-pressed={days === range} key={range} onClick={() => setDays(range)} type="button">{range}d</button>)}</div></div><div className={styles.cards}>{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{typeof value === 'number' ? new Intl.NumberFormat(locale).format(value) : value}</strong></article>)}</div><div className={styles.analytics}><section><h2>Revenue</h2><Bars values={data.revenueTrends.real.map((item) => item.amountMinor)} /></section><section><h2>Orders</h2><Bars values={data.orderTrends.map((item) => item.count)} /></section><section><h2>Order status</h2>{data.orderStatusDistribution.length ? data.orderStatusDistribution.map((item) => <div className={styles.row} key={item.status}><span>{item.status}</span><strong>{item.count}</strong></div>) : <p>{t('noData')}</p>}</section><section><h2>Inventory health</h2>{Object.entries(data.inventoryHealth).map(([label, value]) => <div className={styles.row} key={label}><span>{label}</span><strong>{value}</strong></div>)}</section></div><div className={styles.grid}><section><h2>{t('recentOrders')}</h2>{data.recentOrders.length ? data.recentOrders.map((order) => <div className={styles.row} key={order.id}><span dir="ltr">{order.id.slice(-8)}</span><span>{order.status}</span></div>) : <p>{t('noData')}</p>}</section><section><h2>{t('topProducts')}</h2>{data.topSellingProducts.length ? data.topSellingProducts.map((product) => <div className={styles.row} key={product.productId ?? product.name}><span>{product.name}</span><strong>{product.quantity}</strong></div>) : <p>{t('noData')}</p>}</section></div></section></main>;
}
