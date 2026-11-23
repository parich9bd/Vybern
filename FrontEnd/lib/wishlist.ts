'use client';

import { useSyncExternalStore } from 'react';

const storageKey = 'vybern:wishlist';
const changeEvent = 'vybern:wishlist-change';

export function useWishlist(productId: string, namespace = 'catalog') {
  const scopedStorageKey = `${storageKey}:${namespace}`;
  const scopedEvent = `${changeEvent}:${namespace}`;
  const readScoped = () => {
    try {
      const value: unknown = JSON.parse(window.localStorage.getItem(scopedStorageKey) ?? '[]');
      return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : [];
    } catch {
      return [];
    }
  };
  const subscribeScoped = (onStoreChange: () => void) => {
    window.addEventListener('storage', onStoreChange);
    window.addEventListener(scopedEvent, onStoreChange);
    return () => { window.removeEventListener('storage', onStoreChange); window.removeEventListener(scopedEvent, onStoreChange); };
  };
  const selected = useSyncExternalStore(subscribeScoped, () => readScoped().includes(productId), () => false);
  return {
    selected,
    toggle() {
      const current = readScoped();
      const next = selected ? current.filter((id) => id !== productId) : [...new Set([...current, productId])];
      window.localStorage.setItem(scopedStorageKey, JSON.stringify(next));
      window.dispatchEvent(new Event(scopedEvent));
    },
  };
}
