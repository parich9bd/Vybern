import type { FastifyInstance } from 'fastify';
import { categoryListQuerySchema, productListQuerySchema, productParamsSchema } from './product.schemas.js';
import { ProductService } from './product.service.js';

const errorResponse = { type: 'object', required: ['error'], additionalProperties: false, properties: { error: { type: 'object', required: ['code', 'message'], additionalProperties: true, properties: { code: { type: 'string' }, message: { type: 'string' } } } } } as const;
const moneySchema = { type: 'object', required: ['amountMinor', 'currency'], additionalProperties: false, properties: { amountMinor: { type: 'integer' }, currency: { type: 'string', pattern: '^[A-Z]{3}$' } } } as const;
const productSchema = { type: 'object', required: ['id', 'slug', 'sku', 'name', 'description', 'material', 'price', 'category', 'featured', 'images', 'variants', 'tryOn'], additionalProperties: false, properties: {
  id: { type: 'string' }, slug: { type: 'string' }, sku: { type: 'string' }, name: { type: ['string', 'null'] }, description: { type: ['string', 'null'] }, material: { type: ['string', 'null'] }, price: moneySchema,
  category: { type: 'object', required: ['slug', 'name'], additionalProperties: false, properties: { slug: { type: 'string' }, name: { type: ['string', 'null'] } } }, featured: { type: 'boolean' },
  images: { type: 'array', items: { type: 'object', required: ['url', 'alt', 'altText', 'position'], additionalProperties: false, properties: { url: { type: 'string' }, alt: { type: ['string', 'null'] }, altText: { type: ['object', 'null'], additionalProperties: false, properties: { en: { type: ['string', 'null'] }, fa: { type: ['string', 'null'] }, de: { type: ['string', 'null'] } }, required: ['en', 'fa', 'de'] }, position: { type: 'integer' } } } },
  variants: { type: 'array', items: { type: 'object', required: ['sku', 'name', 'colour', 'price', 'availableQuantity', 'available'], additionalProperties: false, properties: { sku: { type: 'string' }, name: { type: 'string' }, colour: { type: ['string', 'null'] }, price: moneySchema, availableQuantity: { type: 'integer', minimum: 0 }, available: { type: 'boolean' } } } },
  tryOn: { type: 'object', required: ['available', 'modelUrl', 'modelFormat', 'dimensionsMm', 'calibration'], additionalProperties: false, properties: { available: { type: 'boolean' }, modelUrl: { type: ['string', 'null'] }, modelFormat: { type: ['string', 'null'] }, dimensionsMm: { type: 'object', required: ['frameWidth', 'lensWidth', 'bridgeWidth', 'templeLength'], additionalProperties: false, properties: { frameWidth: { type: ['integer', 'null'] }, lensWidth: { type: ['integer', 'null'] }, bridgeWidth: { type: ['integer', 'null'] }, templeLength: { type: ['integer', 'null'] } } }, calibration: {} } },
} } as const;
const metaSchema = { type: 'object', required: ['page', 'limit', 'total', 'totalPages'], additionalProperties: false, properties: { page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } } } as const;

export async function productRoutes(app: FastifyInstance): Promise<void> {
  const service = new ProductService(app.prisma);

  app.get('/products', {
    schema: {
      tags: ['Products'],
      summary: 'List active products',
      querystring: { type: 'object', properties: { locale: { enum: ['en', 'fa', 'de'] }, page: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100 }, category: { type: 'string' }, q: { type: 'string' }, featured: { type: 'string', enum: ['true', 'false'] }, sort: { enum: ['newest', 'price_asc', 'price_desc'] } } },
      response: { 200: { type: 'object', required: ['data', 'meta'], additionalProperties: false, properties: { data: { type: 'array', items: productSchema }, meta: metaSchema } }, 400: errorResponse },
    },
  }, async (request) => service.list(productListQuerySchema.parse(request.query)));

  app.get('/products/:slug', {
    schema: { tags: ['Products'], summary: 'Get an active product by slug', response: { 200: { type: 'object', required: ['data'], additionalProperties: false, properties: { data: productSchema } }, 400: errorResponse, 404: errorResponse } },
  }, async (request) => {
    const { slug } = productParamsSchema.parse(request.params);
    const { locale } = productListQuerySchema.pick({ locale: true }).parse(request.query);
    return service.bySlug(slug, locale);
  });

  app.get('/categories', {
    schema: { tags: ['Categories'], summary: 'List active product categories', response: { 200: { type: 'object', required: ['data'], additionalProperties: false, properties: { data: { type: 'array', items: { type: 'object', required: ['slug', 'name'], additionalProperties: false, properties: { slug: { type: 'string' }, name: { type: ['string', 'null'] } } } } } }, 400: errorResponse } },
  }, async (request) => {
    const { locale } = categoryListQuerySchema.parse(request.query);
    return service.categories(locale);
  });
}
