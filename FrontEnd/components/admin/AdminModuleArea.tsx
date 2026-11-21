'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { AuthApiError, authenticatedRequest } from '@/lib/auth-client';
import styles from './AdminArea.module.css';
import { ProductManager } from './ProductManager';

const modules = { products: '/admin/products', categories: '/admin/categories', orders: '/admin/orders', customers: '/admin/customers', inventory: '/admin/inventory', payments: '/admin/payments', settings: '/admin/settings', notifications: '/admin/notification-outbox', audit: '/admin/audit-logs' } as const;
type Section = keyof typeof modules;
function cell(value: unknown): string { if (value === null || value === undefined) return '—'; if (typeof value === 'string' || typeof value === 'number') return String(value); if (typeof value === 'boolean') return value ? 'Yes' : 'No'; if (Array.isArray(value)) return String(value.length); return '—'; }
export function AdminModuleArea({ section }: { section: Section }) {
  const t = useTranslations('Admin'); const locale = useLocale(); const [rows, setRows] = useState<Record<string, unknown>[] | null>(null); const [forbidden, setForbidden] = useState(false); const [failed, setFailed] = useState(false);
  useEffect(() => { authenticatedRequest<{ data: Record<string, unknown>[] | Record<string, unknown> }>(modules[section]).then((response) => setRows(Array.isArray(response.data) ? response.data : [response.data])).catch((error) => { setForbidden(error instanceof AuthApiError && error.status === 403); setFailed(!(error instanceof AuthApiError && error.status === 403)); }); }, [section]);
  const title = section === 'categories' ? 'Categories' : section === 'notifications' ? 'Notifications' : section === 'audit' ? 'Audit logs' : t(section);
  if (forbidden) return <main className={styles.state}><h1>{t('accessDenied')}</h1></main>; if (failed) return <main className={styles.state}><p>{t('noData')}</p></main>; if (!rows) return <main className={styles.state}><p>{t('loading')}</p></main>;
  const columns = rows[0] ? Object.keys(rows[0]).filter((key) => !['id', 'translations', 'variants', 'specifications', 'customer', 'category', 'actor'].includes(key)).slice(0, 7) : [];
  return <main className={styles.modulePage} dir={locale === 'fa' ? 'rtl' : 'ltr'}><Link className={styles.backLink} href="/admin">← {t('dashboard')}</Link><p className={styles.eyebrow}>{t('control')}</p><h1>{title}</h1>{section === 'products' && <ProductManager />}{rows.length === 0 ? <p className={styles.empty}>{t('noData')}</p> : <div className={styles.tableWrap}><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((column) => <td key={column}>{cell(row[column])}</td>)}</tr>)}</tbody></table></div>}</main>;
}
