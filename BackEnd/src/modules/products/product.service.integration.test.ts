import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, ProductStatus } from '@prisma/client';
import { ProductService } from './product.service.js';

const prisma = new PrismaClient();
const service = new ProductService(prisma);
const suffix = `catalogue_${Date.now()}`;
let categoryId: string;
let activeProductId: string;
let inactiveProductId: string;

describe('Public catalogue PostgreSQL integration', () => {
  beforeAll(async () => {
    const category = await prisma.category.create({ data: { slug: `${suffix}-cat`, translations: { create: [{ locale: 'en', name: 'English category' }, { locale: 'fa', name: 'دسته فارسی' }, { locale: 'de', name: 'Deutsche Kategorie' }] } } });
    categoryId = category.id;
    const active = await prisma.product.create({ data: { slug: `${suffix}-active`, sku: `${suffix}-active`, categoryId, status: ProductStatus.ACTIVE, isFeatured: true, basePriceMinor: 100, currency: 'IRR', translations: { create: [{ locale: 'en', name: 'Azure Frame' }, { locale: 'fa', name: 'فریم آبی' }, { locale: 'de', name: 'Blauer Rahmen' }] }, variants: { create: [{ sku: `${suffix}-available`, name: 'Available', stockOnHand: 2, stockReserved: 2 }, { sku: `${suffix}-hidden`, name: 'Hidden', stockOnHand: 5, isActive: false }] } }, include: { variants: true } });
    activeProductId = active.id;
    inactiveProductId = (await prisma.product.create({ data: { slug: `${suffix}-draft`, sku: `${suffix}-draft`, categoryId, status: ProductStatus.DRAFT, basePriceMinor: 50, currency: 'IRR', translations: { create: { locale: 'en', name: 'Hidden Frame' } } } })).id;
  });
  afterAll(async () => { await prisma.product.deleteMany({ where: { id: { in: [activeProductId, inactiveProductId] } } }); await prisma.category.delete({ where: { id: categoryId } }); await prisma.$disconnect(); });

  it('exposes only active products and variants with safe availability', async () => {
    const result = await service.list({ locale: 'en', page: 1, limit: 1, sort: 'price_asc' });
    const product = result.data.find((item) => item.id === activeProductId);
    expect(product?.variants).toHaveLength(1);
    expect(product?.variants[0]).toMatchObject({ availableQuantity: 0, available: false });
    expect(result.data.some((item) => item.id === inactiveProductId)).toBe(false);
  });

  it('supports locale-aware search, category filtering, sorting and pagination', async () => {
    const english = await service.list({ locale: 'en', q: 'Azure', page: 1, limit: 24, sort: 'newest' });
    const persian = await service.bySlug(`${suffix}-active`, 'fa');
    const german = await service.bySlug(`${suffix}-active`, 'de');
    const filtered = await service.list({ locale: 'en', category: `${suffix}-cat`, featured: true, page: 1, limit: 1, sort: 'price_asc' });
    expect(english.data.map((item) => item.id)).toContain(activeProductId);
    expect(persian.data.name).toBe('فریم آبی');
    expect(german.data.name).toBe('Blauer Rahmen');
    expect(filtered).toMatchObject({ meta: { page: 1, limit: 1 } });
    expect(filtered.data.every((item) => item.featured)).toBe(true);
  });
});
