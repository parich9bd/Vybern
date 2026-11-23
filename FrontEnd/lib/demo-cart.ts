'use client';

import { useEffect, useState } from 'react';

export type DemoCartItem = Readonly<{
  key: string;
  productId: string;
  productName: string;
  image: string;
  variantId: string;
  variantLabel: string;
  unitPriceMinor: number;
  quantity: number;
}>;

const storageKey = 'vybern:cart:demo';
const changeEvent = 'vybern:demo-cart-change';

function parseCart(value: string | null): DemoCartItem[] {
  if (!value) return [];
  try {
    const items = JSON.parse(value) as unknown;
    if (!Array.isArray(items)) return [];
    return items.filter((item): item is DemoCartItem => typeof item === 'object' && item !== null && typeof (item as DemoCartItem).key === 'string' && typeof (item as DemoCartItem).quantity === 'number' && (item as DemoCartItem).quantity > 0);
  } catch {
    return [];
  }
}

export function readDemoCart(): DemoCartItem[] {
  if (typeof window === 'undefined') return [];
  return parseCart(window.localStorage.getItem(storageKey));
}

function writeDemoCart(items: DemoCartItem[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(items));
  window.dispatchEvent(new Event(changeEvent));
}

export function addDemoCartItem(item: Omit<DemoCartItem, 'key' | 'quantity'>): DemoCartItem[] {
  const key = `${item.productId}:${item.variantId}`;
  const items = readDemoCart();
  const existing = items.find((entry) => entry.key === key);
  const next = existing
    ? items.map((entry) => entry.key === key ? { ...entry, quantity: Math.min(100, entry.quantity + 1) } : entry)
    : [...items, { ...item, key, quantity: 1 }];
  writeDemoCart(next);
  return next;
}

export function setDemoCartItemQuantity(key: string, quantity: number): DemoCartItem[] {
  const next = quantity < 1 ? readDemoCart().filter((item) => item.key !== key) : readDemoCart().map((item) => item.key === key ? { ...item, quantity: Math.min(100, quantity) } : item);
  writeDemoCart(next);
  return next;
}

export function removeDemoCartItem(key: string): DemoCartItem[] {
  return setDemoCartItemQuantity(key, 0);
}

export function useDemoCart(): DemoCartItem[] {
  const [items, setItems] = useState<DemoCartItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(readDemoCart());
    sync();
    window.addEventListener(changeEvent, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(changeEvent, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return items;
}

export function demoCartItemCount(items: readonly DemoCartItem[]) {
  return items.reduce((count, item) => count + item.quantity, 0);
}

export function demoCartSubtotal(items: readonly DemoCartItem[]) {
  return items.reduce((subtotal, item) => subtotal + item.unitPriceMinor * item.quantity, 0);
}
