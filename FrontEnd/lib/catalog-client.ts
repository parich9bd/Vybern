export type CatalogProduct = Readonly<{
  id: string;
  slug: string;
  name: string | null;
  description: string | null;
  price: { amountMinor: number; currency: string };
  category: { slug: string; name: string | null };
  images: Array<{ url: string; alt: string | null; altText: { en: string | null; fa: string | null; de: string | null } | null; position: number }>;
  variants: Array<{ sku: string; name: string; colour: string | null; price: { amountMinor: number; currency: string }; availableQuantity: number; available: boolean }>;
}>;

export type CatalogCategory = Readonly<{ slug: string; name: string | null }>;
export type CatalogResult = Readonly<{ data: CatalogProduct[]; meta: { page: number; limit: number; total: number; totalPages: number } }>;

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');

async function publicRequest<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) throw new Error(`Public catalog request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export function productImageUrl(path: string): string {
  return path.startsWith('http') ? path : `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getCatalog(locale: string, category: string, sort: 'newest' | 'price_asc' | 'price_desc', page = 1): Promise<CatalogResult> {
  const params = new URLSearchParams({ locale, limit: '24', sort, page: String(page) });
  if (category) params.set('category', category);
  return publicRequest<CatalogResult>(`/products?${params}`);
}

export async function getFeaturedCatalog(locale: string): Promise<CatalogResult> {
  const featured = await publicRequest<CatalogResult>(`/products?${new URLSearchParams({ locale, featured: 'true', limit: '6', sort: 'newest' })}`);
  if (featured.data.length) return featured;
  return publicRequest<CatalogResult>(`/products?${new URLSearchParams({ locale, limit: '6', sort: 'newest' })}`);
}

export function getCatalogCategories(locale: string): Promise<{ data: CatalogCategory[] }> {
  return publicRequest<{ data: CatalogCategory[] }>(`/categories?locale=${encodeURIComponent(locale)}`);
}

export function getProduct(slug: string, locale: string): Promise<{ data: CatalogProduct }> {
  return publicRequest<{ data: CatalogProduct }>(`/products/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`);
}
