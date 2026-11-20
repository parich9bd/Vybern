import { Prisma, PrismaClient, ProductStatus } from '@prisma/client';
import { AppError } from '../../lib/errors.js';
import type { ProductListQuery, SupportedLocale } from './product.schemas.js';

const productInclude = (locale: SupportedLocale) => ({
  category: { include: { translations: { where: { locale } } } },
  translations: { where: { locale } },
  images: { orderBy: { position: 'asc' as const }, include: { mediaAsset: { select: { altTextEn: true, altTextFa: true, altTextDe: true } } } },
  variants: { where: { isActive: true }, orderBy: { name: 'asc' as const } },
});

type ProductWithRelations = Prisma.ProductGetPayload<{ include: ReturnType<typeof productInclude> }>;

function serialiseProduct(product: ProductWithRelations) {
  const translation = product.translations[0];
  const categoryTranslation = product.category.translations[0];
  return {
    id: product.id,
    slug: product.slug,
    sku: product.sku,
    name: translation?.name ?? null,
    description: translation?.description ?? null,
    material: translation?.material ?? null,
    price: { amountMinor: product.basePriceMinor, currency: product.currency },
    category: { slug: product.category.slug, name: categoryTranslation?.name ?? null },
    featured: product.isFeatured,
    images: product.images.map((image) => ({ url: image.url, alt: image.alt, altText: image.mediaAsset ? { en: image.mediaAsset.altTextEn, fa: image.mediaAsset.altTextFa, de: image.mediaAsset.altTextDe } : null, position: image.position })),
    variants: product.variants.map((variant) => ({
      sku: variant.sku,
      name: variant.name,
      colour: variant.colour,
      price: { amountMinor: variant.priceMinor ?? product.basePriceMinor, currency: product.currency },
      availableQuantity: Math.max(0, variant.stockOnHand - variant.stockReserved),
      available: variant.stockOnHand > variant.stockReserved,
    })),
    tryOn: {
      available: product.tryOnAvailable,
      modelUrl: product.tryOnModelUrl,
      modelFormat: product.tryOnModelFormat,
      dimensionsMm: {
        frameWidth: product.frameWidthMm,
        lensWidth: product.lensWidthMm,
        bridgeWidth: product.bridgeWidthMm,
        templeLength: product.templeLengthMm,
      },
      calibration: product.calibration,
    },
  };
}

export class ProductService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: ProductListQuery) {
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      ...(query.category ? { category: { slug: query.category, isActive: true } } : {}),
      ...(query.featured === undefined ? {} : { isFeatured: query.featured }),
      ...(query.q
        ? { translations: { some: { locale: query.locale, name: { contains: query.q, mode: 'insensitive' } } } }
        : {}),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      query.sort === 'price_asc' ? { basePriceMinor: 'asc' } :
      query.sort === 'price_desc' ? { basePriceMinor: 'desc' } : { createdAt: 'desc' };
    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: productInclude(query.locale),
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { data: products.map(serialiseProduct), meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async bySlug(slug: string, locale: SupportedLocale) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: ProductStatus.ACTIVE },
      include: productInclude(locale),
    });
    if (!product) throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    return { data: serialiseProduct(product) };
  }

  async categories(locale: SupportedLocale) {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      include: { translations: { where: { locale } } },
      orderBy: { position: 'asc' },
    });
    return { data: categories.map((category) => ({ slug: category.slug, name: category.translations[0]?.name ?? null })) };
  }
}
