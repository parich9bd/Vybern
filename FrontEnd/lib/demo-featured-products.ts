export type DemoColourKey = 'champagneGold' | 'midnightBlack' | 'tortoiseshell' | 'roseGold' | 'silverTitanium' | 'espressoBrown';

export type DemoReview = Readonly<{
  id: string;
  name: string;
  rating: number;
}>;

export type DemoFeaturedProduct = Readonly<{
  id: string;
  name: string;
  category: 'optical';
  image: string;
  rating: Readonly<{
    average: number;
    count: number;
    reviews: ReadonlyArray<DemoReview>;
  }>;
  variants: ReadonlyArray<Readonly<{
    id: string;
    colour: DemoColourKey;
    swatch: string;
    amountMinor: number;
    originalAmountMinor?: number;
    available: boolean;
  }>>;
}>;

export const demoFeaturedProducts: ReadonlyArray<DemoFeaturedProduct> = [
  { id: 'demo:aurelio', name: 'AURELIO', category: 'optical', image: '/images/demo-products/aurelio.webp', rating: { average: 4.5, count: 24, reviews: [{ id: 'aurelioSophia', name: 'Sophia M.', rating: 5 }, { id: 'aurelioLeo', name: 'Leo R.', rating: 4 }] }, variants: [{ id: 'champagne', colour: 'champagneGold', swatch: '#c9a466', amountMinor: 28000, originalAmountMinor: 56000, available: true }, { id: 'silver', colour: 'silverTitanium', swatch: '#a7a6a1', amountMinor: 47500, available: true }, { id: 'black', colour: 'midnightBlack', swatch: '#191817', amountMinor: 49000, available: true }] },
  { id: 'demo:valentino', name: 'VALENTINO', category: 'optical', image: '/images/demo-products/valentino.webp', rating: { average: 4.8, count: 37, reviews: [{ id: 'valentinoMilan', name: 'Milan K.', rating: 5 }, { id: 'valentinoElena', name: 'Elena V.', rating: 5 }] }, variants: [{ id: 'black', colour: 'midnightBlack', swatch: '#161514', amountMinor: 6000, originalAmountMinor: 60000, available: true }, { id: 'espresso', colour: 'espressoBrown', swatch: '#40251b', amountMinor: 54000, available: true }, { id: 'tortoise', colour: 'tortoiseshell', swatch: '#8b552b', amountMinor: 55500, available: false }] },
  { id: 'demo:lorenzo', name: 'LORENZO', category: 'optical', image: '/images/demo-products/lorenzo.webp', rating: { average: 4.6, count: 19, reviews: [{ id: 'lorenzoClara', name: 'Clara N.', rating: 5 }, { id: 'lorenzoDaniel', name: 'Daniel B.', rating: 4 }] }, variants: [{ id: 'tortoise', colour: 'tortoiseshell', swatch: '#925724', amountMinor: 51500, available: true }, { id: 'espresso', colour: 'espressoBrown', swatch: '#43261c', amountMinor: 50000, available: true }, { id: 'black', colour: 'midnightBlack', swatch: '#171615', amountMinor: 50000, available: true }] },
  { id: 'demo:serena', name: 'SERENA', category: 'optical', image: '/images/demo-products/serena.webp', rating: { average: 4.9, count: 42, reviews: [{ id: 'serenaMaya', name: 'Maya A.', rating: 5 }, { id: 'serenaNora', name: 'Nora L.', rating: 5 }] }, variants: [{ id: 'rose', colour: 'roseGold', swatch: '#c78e7d', amountMinor: 46500, originalAmountMinor: 52000, available: true }, { id: 'champagne', colour: 'champagneGold', swatch: '#c6a066', amountMinor: 46500, available: true }, { id: 'silver', colour: 'silverTitanium', swatch: '#adaaa5', amountMinor: 45000, available: true }] },
  { id: 'demo:marcello', name: 'MARCELLO', category: 'optical', image: '/images/demo-products/marcello.webp', rating: { average: 4.7, count: 28, reviews: [{ id: 'marcelloTheo', name: 'Theo S.', rating: 5 }, { id: 'marcelloAria', name: 'Aria F.', rating: 4 }] }, variants: [{ id: 'silver', colour: 'silverTitanium', swatch: '#a9aaa8', amountMinor: 58500, available: true }, { id: 'champagne', colour: 'champagneGold', swatch: '#c9a466', amountMinor: 60000, available: true }, { id: 'black', colour: 'midnightBlack', swatch: '#191817', amountMinor: 58500, available: false }] },
  { id: 'demo:vittoria', name: 'VITTORIA', category: 'optical', image: '/images/demo-products/vittoria.webp', rating: { average: 4.4, count: 16, reviews: [{ id: 'vittoriaIris', name: 'Iris P.', rating: 4 }, { id: 'vittoriaJonas', name: 'Jonas W.', rating: 5 }] }, variants: [{ id: 'espresso', colour: 'espressoBrown', swatch: '#42251a', amountMinor: 53000, originalAmountMinor: 59000, available: true }, { id: 'tortoise', colour: 'tortoiseshell', swatch: '#8b542a', amountMinor: 53000, available: true }, { id: 'black', colour: 'midnightBlack', swatch: '#181716', amountMinor: 51500, available: true }] },
];
