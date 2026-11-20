import { describe, expect, it } from 'vitest';
import { productListQuerySchema, productParamsSchema } from './product.schemas.js';

describe('product query validation', () => {
  it('applies safe pagination defaults', () => {
    expect(productListQuerySchema.parse({})).toMatchObject({ locale: 'en', page: 1, limit: 24, sort: 'newest' });
  });

  it('rejects pagination beyond the public limit', () => {
    expect(() => productListQuerySchema.parse({ limit: '101' })).toThrow();
  });

  it('accepts only supported locales and valid slugs', () => {
    expect(() => productListQuerySchema.parse({ locale: 'fr' })).toThrow();
    expect(productParamsSchema.parse({ slug: 'aurelia-noir' }).slug).toBe('aurelia-noir');
    expect(() => productParamsSchema.parse({ slug: '../private' })).toThrow();
  });
});
