import { PrismaClient, ProductStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // All catalogue data in this script is fictional demonstration data.
  const category = await prisma.category.upsert({
    where: { slug: 'sunglasses' },
    update: {},
    create: {
      slug: 'sunglasses', position: 1,
      translations: { create: [
        { locale: 'en', name: 'Sunglasses' }, { locale: 'fa', name: 'عینک آفتابی' }, { locale: 'de', name: 'Sonnenbrillen' },
      ] },
    },
  });
  await prisma.product.upsert({
    where: { slug: 'aurelia-noir' },
    update: {},
    create: {
      slug: 'aurelia-noir', sku: 'VYB-AUR-NOIR', categoryId: category.id,
      status: ProductStatus.ACTIVE, basePriceMinor: 48500, currency: 'EUR', isFeatured: true,
      tryOnAvailable: true, tryOnModelUrl: 'https://assets.example.invalid/models/aurelia-noir.glb', tryOnModelFormat: 'GLB',
      frameWidthMm: 145, lensWidthMm: 52, bridgeWidthMm: 19, templeLengthMm: 145,
      translations: { create: [
        { locale: 'en', name: 'Aurelia Noir', description: 'Fictional handcrafted acetate sunglasses.', material: 'Italian acetate' },
        { locale: 'fa', name: 'اورلیا نوآر', description: 'عینک آفتابی خیالی از استات دست‌ساز.', material: 'استات ایتالیایی' },
        { locale: 'de', name: 'Aurelia Noir', description: 'Fiktive handgefertigte Acetat-Sonnenbrille.', material: 'Italienisches Acetat' },
      ] },
      images: { create: [{ url: 'https://assets.example.invalid/products/aurelia-noir/front.jpg', alt: 'Fictional Aurelia Noir sunglasses', position: 0 }] },
      variants: { create: [{ sku: 'VYB-AUR-NOIR-52', name: 'Noir / 52', colour: 'Noir', stockOnHand: 12 }] },
    },
  });
}

main().then(() => prisma.$disconnect()).catch(async (error: unknown) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
