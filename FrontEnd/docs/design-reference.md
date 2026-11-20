# VYBERN visual reference audit

## Scope and source

This audit is based on the inspected reference project in `references/`. No standalone ZIP archive was present. The source files reviewed were `components/layout/Header.tsx`, `components/home/HeroSection.tsx`, `components/animations/ScrollExperience.tsx`, `app/globals.css`, `app/[locale]/layout.tsx`, locale messages, and the assets listed below.

## Visual identity

The reference is an editorial, dark-luxury experience rather than a conventional storefront. It combines a near-black background with warm, muted metallic accents, sparse all-caps utility copy, large display headings, radial lighting, and isolated product photography.

- **Background** — `#090909`, main canvas.
- **Foreground** — `#f5f2eb`, primary type.
- **Muted** — `#92918c`, secondary copy.
- **Gold** — `#c8a76b`, highlights, progress, and scene emphasis.
- **Taupe** — `#928575`, announcement bar.
- **Cream** — `#f8f7f4`, light contrast.
- **Dark gold** — `#998052`, supporting accent.

The reference uses a local variable Vazirmatn font for Persian and a display-like serif/sans treatment for Latin editorial copy. Persian rules remove letter spacing and use taller heading/body line heights.

## Header and announcement bar

The original header consists of a 36px rotating announcement bar followed by a three-column 90px navigation. Its left side contains Shop, Collections, and Our Story; the centre is a logo image; the right side contains Search, Virtual Try-On, Account, language selection, and a cart count. It collapses to a mobile-menu trigger at tablet widths.

The announcement messages rotate every four seconds with a page-flip transition. This is a reference behaviour only; it is intentionally not present in Phase 01.

## Four-scene scroll experience

`ScrollExperience.tsx` pins a full-viewport scene for 4000px and scrubs a GSAP timeline across four image layers:

1. **Main eyewear hero** — `public/images/Hero/mainpic.PNG` (1448×1086), product-centred composition.
2. **Exploded construction** — `public/images/Hero/details.PNG` (1536×1024), distributed editorial annotations.
3. **Precision details** — `public/images/Hero/detailsofglass.PNG` (1537×1023), construction/detail narrative.
4. **Fashion model** — `public/images/Hero/model.webp`, asymmetric right-weighted composition.

The timeline crossfades and scales image layers, shifts text overlays vertically, updates a 01–04 counter, and fills a horizontal progress bar. Scene 02 and 03 deliberately place text in opposing corners; scene 04 returns to a left-aligned narrative beside the model.

## Responsive behaviour

At 768px and below, the reference reduces header and annotation sizes, hides desktop navigation, reduces image padding, repositions the model, and uses percentage-based columns for scene 02/03 text. At 380px and below it further reduces logo, type, and decoration sizing. The visual intent is retained, but much of the original CSS is a single global stylesheet with hard-coded scene geometry.

## Assets

- `public/images/Hero/mainpic.PNG`
- `public/images/Hero/details.PNG`
- `public/images/Hero/detailsofglass.PNG`
- `public/images/Hero/model.webp`
- `public/images/Logos/IMG_4217 2.png` (used by the header)
- `public/images/Logos/IMG_4216 2.jpg`
- `public/fonts/vazirmatn/farsi/Vazirmatn[wght].ttf` and accompanying WOFF2 weights

## Architectural direction for the new frontend

The Phase 01 foundation already preserves the core palette, semantic tokens, App Router/i18n routing, RTL document direction, and local Persian font delivery. It can support a faithful recreation without copying the reference wholesale.

For the approved cinematic phase, keep scene-specific geometry in a co-located CSS Module, use element refs rather than broad class selectors for GSAP targets, explicitly clean up the animation context, and provide a reduced-motion/static fallback. Optimise or convert the large hero PNGs before shipping, prioritise only the first scene, and load later scenes lazily. Header state and announcements should remain isolated Client Components; the page and layout should stay Server Components.

Do not reintroduce the reference's monolithic global stylesheet. Keep global CSS limited to tokens, reset, typography, and accessibility primitives.
