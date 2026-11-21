'use client';

import { useEffect, useState } from 'react';
import { createAdminProduct, getAdminCategories, type AdminCategory } from '@/lib/admin-client';
import styles from './AdminArea.module.css';

export function ProductManager() {
  const [categories, setCategories] = useState<AdminCategory[]>([]); const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  useEffect(() => { getAdminCategories().then(setCategories).catch(() => setState('error')); }, []);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get('name') ?? '').trim(); setState('saving'); try { await createAdminProduct({ slug: String(form.get('slug') ?? ''), sku: String(form.get('sku') ?? ''), categoryId: String(form.get('categoryId') ?? ''), basePriceMinor: Number(form.get('price')), currency: String(form.get('currency') ?? 'IRR'), translations: [{ locale: 'en', name, description: String(form.get('description') ?? '') }] }); event.currentTarget.reset(); setState('saved'); } catch { setState('error'); } };
  return <form className={styles.productForm} onSubmit={submit}><h2>Create product</h2><label>Name<input name="name" required /></label><label>Slug<input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label><label>SKU<input name="sku" required /></label><label>Category<select name="categoryId" required><option value="">Select a category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.translations.find((item) => item.locale === 'en')?.name ?? category.slug}</option>)}</select></label><label>Price (minor units)<input min="0" name="price" required type="number" /></label><label>Currency<input defaultValue="IRR" maxLength={3} name="currency" required /></label><label>Description<textarea name="description" /></label><button disabled={state === 'saving'} type="submit">{state === 'saving' ? 'Saving…' : 'Create draft product'}</button>{state === 'saved' && <p>Draft product created. Publish it from the product actions.</p>}{state === 'error' && <p role="alert">The product could not be created. Check the fields and your session.</p>}</form>;
}
