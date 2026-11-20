'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiUrl, AuthApiError } from '@/lib/auth-client';
import { LocationIcon, OrdersIcon, SettingsIcon, UserIcon } from '@/components/layout/icons';
import { deleteAddress, getAddresses, getOrder, getOrders, getPayments, getProfile, removeAvatar, saveAddress, updateProfile, uploadAvatar, type AddressInput, type CustomerAddress, type CustomerOrder, type CustomerPayment, type CustomerProfile } from '@/lib/account-client';
import styles from './AccountArea.module.css';

export type AccountSection = 'overview' | 'profile' | 'orders' | 'addresses' | 'settings' | 'order-detail';
type Props = Readonly<{ section: AccountSection; orderId?: string }>;

const emptyAddress: AddressInput = { firstName: '', lastName: '', phone: '', addressLine1: '', addressLine2: '', city: '', province: 'Tehran', postalCode: '', isDefault: false };

function initials(profile: CustomerProfile) { return `${profile.firstName?.[0] ?? ''}${profile.lastName?.[0] ?? ''}`.toUpperCase() || 'V'; }
function formatMoney(amount: number, currency: string, locale: string) { return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
function formatDate(value: string, locale: string) { return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value)); }
function apiMessage(error: unknown, fallback: string) { return error instanceof AuthApiError && error.status === 401 ? 'loadError' : fallback; }

export function AccountArea({ section, orderId }: Props) {
  const t = useTranslations('Account');
  const locale = useLocale();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getProfile().then((value) => { if (active) setProfile(value); }).catch((cause) => { if (active) setError(apiMessage(cause, 'loadError')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const navigation = useMemo(() => [
    ['overview', '/account', t('overview'), <UserIcon key="overview" />], ['profile', '/account/profile', t('profile'), <UserIcon key="profile" />], ['orders', '/account/orders', t('orders'), <OrdersIcon key="orders" />], ['addresses', '/account/addresses', t('addresses'), <LocationIcon key="addresses" />], ['settings', '/account/settings', t('settings'), <SettingsIcon key="settings" />],
  ] as const, [t]);

  if (loading) return <main className={styles.state}><p>{t('loading')}</p></main>;
  if (error || !profile) return <main className={styles.state}><h1>{t('account')}</h1><p>{t(error ?? 'loadError')}</p><Link href="/">{t('returnHome')}</Link></main>;

  const content = section === 'profile' ? <Profile profile={profile} onSaved={setProfile} />
    : section === 'orders' ? <Orders />
      : section === 'order-detail' && orderId ? <OrderDetail orderId={orderId} />
        : section === 'addresses' ? <Addresses profile={profile} />
          : section === 'settings' ? <Settings profile={profile} />
            : <Overview profile={profile} />;

  return <main className={styles.page} dir={locale === 'fa' ? 'rtl' : 'ltr'}>
    <aside className={styles.sidebar}>
      <div className={styles.profileSummary}>{profile.avatarUrl ? <img alt="" className={styles.avatar} src={apiUrl(profile.avatarUrl)} /> : <span className={styles.avatar}>{initials(profile)}</span>}<div><p>{profile.firstName || profile.lastName ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() : t('customer')}</p><span dir="ltr">{profile.phone}</span></div></div>
      <nav aria-label={t('accountNavigation')} className={styles.navigation}>{navigation.map(([key, href, label, icon]) => <Link aria-current={section === key || (section === 'order-detail' && key === 'orders') ? 'page' : undefined} className={section === key || (section === 'order-detail' && key === 'orders') ? styles.active : undefined} href={href} key={key}>{icon}<span>{label}</span></Link>)}</nav>
    </aside>
    <section className={styles.content}>{content}</section>
  </main>;
}

function Overview({ profile }: { profile: CustomerProfile }) {
  const t = useTranslations('Account');
  return <><p className={styles.eyebrow}>{t('account')}</p><h1>{t('welcome', { name: profile.firstName || t('customer') })}</h1><p className={styles.lead}>{t('overviewDescription')}</p><div className={styles.cards}><Link href="/account/profile" className={styles.card}><h2>{t('profile')}</h2><p>{t('profileDescription')}</p></Link><Link href="/account/orders" className={styles.card}><h2>{t('orders')}</h2><p>{t('ordersDescription')}</p></Link><Link href="/account/addresses" className={styles.card}><h2>{t('addresses')}</h2><p>{t('addressesDescription')}</p></Link></div></>;
}

function Profile({ profile, onSaved }: { profile: CustomerProfile; onSaved: (profile: CustomerProfile) => void }) {
  const t = useTranslations('Account');
  const avatarT = useTranslations('Avatar');
  const [firstName, setFirstName] = useState(profile.firstName ?? ''); const [lastName, setLastName] = useState(profile.lastName ?? ''); const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (!firstName.trim() && !lastName.trim()) { setState('error'); return; } setState('saving'); try { onSaved(await updateProfile({ firstName: firstName.trim() || undefined, lastName: lastName.trim() || undefined })); setState('saved'); } catch { setState('error'); } };
  const [avatarState, setAvatarState] = useState<'idle' | 'uploading' | 'error'>('idle');
  const changeAvatar = async (file?: File) => { if (!file) return; setAvatarState('uploading'); try { await uploadAvatar(file); onSaved(await getProfile()); setAvatarState('idle'); } catch { setAvatarState('error'); } };
  const clearAvatar = async () => { setAvatarState('uploading'); try { await removeAvatar(); onSaved(await getProfile()); setAvatarState('idle'); } catch { setAvatarState('error'); } };
  return <><p className={styles.eyebrow}>{t('profile')}</p><h1>{t('personalDetails')}</h1><div className={styles.avatarEditor}>{profile.avatarUrl ? <img alt="" className={styles.avatarLarge} src={apiUrl(profile.avatarUrl)} /> : <span className={styles.avatarLarge}>{initials(profile)}</span>}<label className={styles.uploadLabel}>{avatarState === 'uploading' ? avatarT('uploading') : avatarT('upload')}<input accept="image/jpeg,image/png,image/webp" disabled={avatarState === 'uploading'} onChange={(event) => { void changeAvatar(event.target.files?.[0]); event.currentTarget.value = ''; }} type="file" /></label>{profile.avatarUrl && <button disabled={avatarState === 'uploading'} onClick={() => void clearAvatar()} type="button">{avatarT('remove')}</button>}{avatarState === 'error' && <p className={styles.error}>{avatarT('error')}</p>}</div><form className={styles.form} onSubmit={submit}><label>{t('firstName')}<input onChange={(event) => setFirstName(event.target.value)} value={firstName} /></label><label>{t('lastName')}<input onChange={(event) => setLastName(event.target.value)} value={lastName} /></label><label>{t('phone')}<input dir="ltr" disabled value={profile.phone} /><small>{t('phoneReadOnly')}</small></label>{state === 'error' && <p className={styles.error}>{t('saveError')}</p>}{state === 'saved' && <p className={styles.success}>{t('saved')}</p>}<button disabled={state === 'saving'} type="submit">{state === 'saving' ? t('saving') : t('saveChanges')}</button></form></>;
}

function PaymentStatus({ payment }: { payment?: CustomerPayment }) {
  const t = useTranslations('Payment');
  return payment ? <span className={styles.payment}>{t('status', { status: t(payment.status) })}</span> : null;
}

function Orders() {
  const t = useTranslations('Account'); const locale = useLocale(); const [orders, setOrders] = useState<CustomerOrder[] | null>(null); const [payments, setPayments] = useState<CustomerPayment[]>([]); const [error, setError] = useState(false);
  useEffect(() => { Promise.all([getOrders(), getPayments()]).then(([nextOrders, nextPayments]) => { setOrders(nextOrders); setPayments(nextPayments); }).catch(() => setError(true)); }, []);
  if (error) return <ErrorState />; if (!orders) return <p>{t('loading')}</p>; if (!orders.length) return <Empty title={t('noOrders')} body={t('noOrdersDescription')} />;
  return <><p className={styles.eyebrow}>{t('orders')}</p><h1>{t('orderHistory')}</h1><div className={styles.list}>{orders.map((order) => <Link className={styles.order} href={`/account/orders/${order.id}`} key={order.id}><div><span className={styles.orderId} dir="ltr">{t('orderNumber', { id: order.id.slice(-8).toUpperCase() })}</span><span>{formatDate(order.createdAt, locale)}</span></div><div><strong>{formatMoney(order.total.amountMinor, order.total.currency, locale)}</strong><span className={styles.status}>{t(`orderStatus.${order.status}`)}</span><PaymentStatus payment={payments.find((payment) => payment.orderId === order.id)} /></div></Link>)}</div></>;
}

function OrderDetail({ orderId }: { orderId: string }) {
  const t = useTranslations('Account'); const locale = useLocale(); const [order, setOrder] = useState<CustomerOrder | null>(null); const [payment, setPayment] = useState<CustomerPayment | undefined>(); const [error, setError] = useState(false);
  useEffect(() => { Promise.all([getOrder(orderId), getPayments()]).then(([nextOrder, payments]) => { setOrder(nextOrder); setPayment(payments.find((item) => item.orderId === nextOrder.id)); }).catch(() => setError(true)); }, [orderId]);
  if (error) return <ErrorState />; if (!order) return <p>{t('loading')}</p>;
  return <><Link className={styles.back} href="/account/orders">{t('backToOrders')}</Link><p className={styles.eyebrow}>{t('orderNumber', { id: order.id.slice(-8).toUpperCase() })}</p><h1>{t('orderDetails')}</h1><p className={styles.status}>{t(`orderStatus.${order.status}`)}</p><PaymentStatus payment={payment} /><div className={styles.items}>{order.items.map((item) => <div className={styles.item} key={item.id}><div><strong>{item.product.name}</strong><span>{item.variant.name} · {t('quantity', { count: item.quantity })}</span></div><strong>{formatMoney(item.lineTotal.amountMinor, item.lineTotal.currency, locale)}</strong></div>)}</div><div className={styles.totals}><p><span>{t('subtotal')}</span><strong>{formatMoney(order.subtotal.amountMinor, order.total.currency, locale)}</strong></p><p><span>{t('shipping')}</span><strong>{formatMoney(order.shipping.amountMinor, order.shipping.currency, locale)}</strong></p><p><span>{t('total')}</span><strong>{formatMoney(order.total.amountMinor, order.total.currency, locale)}</strong></p></div>{order.shippingAddress && <div className={styles.addressSnapshot}><h2>{t('shippingAddress')}</h2><p>{order.shippingAddress.firstName} {order.shippingAddress.lastName}<br />{order.shippingAddress.addressLine1}<br />{order.shippingAddress.city} · {order.shippingAddress.postalCode}</p></div>}</>;
}

function Addresses({ profile }: { profile: CustomerProfile }) {
  const t = useTranslations('Account'); const [addresses, setAddresses] = useState<CustomerAddress[] | null>(null); const [editing, setEditing] = useState<CustomerAddress | 'new' | null>(null); const [error, setError] = useState(false);
  const load = () => { void getAddresses().then(setAddresses).catch(() => setError(true)); }; useEffect(() => { load(); }, []);
  if (error) return <ErrorState />; if (!addresses) return <p>{t('loading')}</p>;
  const addressInitial = editing === 'new'
    ? { ...emptyAddress, firstName: profile.firstName ?? '', lastName: profile.lastName ?? '', phone: profile.phone }
    : editing && { ...editing, addressLine2: editing.addressLine2 ?? undefined };
  return <><div className={styles.headingRow}><div><p className={styles.eyebrow}>{t('addresses')}</p><h1>{t('addressBook')}</h1></div><button onClick={() => setEditing('new')} type="button">{t('addAddress')}</button></div>{!addresses.length && !editing && <Empty title={t('noAddresses')} body={t('noAddressesDescription')} />}{addresses.map((address) => <article className={styles.address} key={address.id}><div><strong>{address.firstName} {address.lastName}</strong>{address.isDefault && <span className={styles.default}>{t('defaultAddress')}</span>}<p dir="ltr">{address.phone}</p><p>{address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ''}<br />{address.city}, {address.province} · {address.postalCode}</p></div><div className={styles.inlineActions}><button onClick={() => setEditing(address)} type="button">{t('edit')}</button><button onClick={async () => { if (window.confirm(t('deleteConfirm'))) { await deleteAddress(address.id); load(); } }} type="button">{t('delete')}</button></div></article>)}{addressInitial && <AddressForm initial={addressInitial} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}</>;
}

function AddressForm({ initial, onClose, onSaved }: { initial: AddressInput & { id?: string }; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations('Account'); const [input, setInput] = useState(initial); const [errors, setErrors] = useState<Record<string, string[]>>({}); const [saving, setSaving] = useState(false);
  const field = (key: keyof AddressInput, label: string, type = 'text') => { const id = `address-${key}`; const errorId = `${id}-error`; const optional = key === 'addressLine2'; return <label htmlFor={id}>{label}{!optional && <b aria-hidden="true"> *</b>}<input aria-describedby={errors[key]?.[0] ? errorId : undefined} aria-invalid={Boolean(errors[key])} dir={key === 'phone' ? 'ltr' : undefined} id={id} onChange={(event) => { setInput({ ...input, [key]: event.target.value }); setErrors((current) => ({ ...current, [key]: [] })); }} required={!optional} type={type} value={String(input[key] ?? '')} />{errors[key]?.[0] && <small className={styles.error} id={errorId} role="alert">{errors[key][0]}</small>}</label>; };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); if (saving) return; setSaving(true); setErrors({}); try { await saveAddress(input, initial.id); onSaved(); } catch (cause) { setErrors(cause instanceof AuthApiError ? cause.fieldErrors : {}); if (!(cause instanceof AuthApiError) || !Object.keys(cause.fieldErrors).length) setErrors({ form: [t('saveError')] }); } finally { setSaving(false); } };
  return <div className={styles.formPanel}><h2>{initial.id ? t('editAddress') : t('addAddress')}</h2><form className={styles.form} onSubmit={submit}><div className={styles.grid}>{field('firstName', t('firstName'))}{field('lastName', t('lastName'))}{field('phone', t('phone'), 'tel')}{field('postalCode', t('postalCode'))}</div>{field('addressLine1', t('streetAddress'))}{field('addressLine2', t('unitOptional'))}<div className={styles.grid}>{field('province', t('province'))}{field('city', t('city'))}</div><label className={styles.check}><input checked={Boolean(input.isDefault)} onChange={(event) => setInput({ ...input, isDefault: event.target.checked })} type="checkbox" />{t('setDefault')}</label>{errors.form?.[0] && <p className={styles.error}>{errors.form[0]}</p>}<div className={styles.inlineActions}><button disabled={saving} type="submit">{saving ? t('saving') : t('saveAddress')}</button><button disabled={saving} onClick={onClose} type="button">{t('cancel')}</button></div></form></div>;
}

function Settings({ profile }: { profile: CustomerProfile }) { const t = useTranslations('Account'); return <><p className={styles.eyebrow}>{t('settings')}</p><h1>{t('accountSettings')}</h1><div className={styles.setting}><span>{t('verifiedPhone')}</span><strong dir="ltr">{profile.phone}</strong></div><p className={styles.pending}>{t('preferencesPending')}</p></>; }
function Empty({ title, body }: { title: string; body: string }) { return <div className={styles.empty}><h2>{title}</h2><p>{body}</p></div>; }
function ErrorState() { const t = useTranslations('Account'); return <div className={styles.empty}><h2>{t('loadError')}</h2><p>{t('tryAgain')}</p></div>; }
