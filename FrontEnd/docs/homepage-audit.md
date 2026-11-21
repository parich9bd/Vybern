# Homepage technical audit

Inspected: locale layout, global CSS, Header, AnnouncementBar, AuthenticationModal, ToastProvider, Admin components, the reference `ScrollExperience.tsx`/`HeroSection.tsx`, and Hero assets.

- The App Router uses a locale layout with `next-intl`; shared Header and ToastProvider are mounted once per locale.
- Theme is token-based. Persian typography is centralised through `--font-ui` and the RTL root rule.
- Header is interactive client-side; authentication and admin access remain server-authorised through the API. The cart remains a zero-count presentation control rather than a complete cart integration.
- Toast infrastructure is global, but auth/cart/checkout/account flows are not all yet integrated.
- The previous home page was a static foundation section. The reference uses a four-scene GSAP pinned timeline; the replacement uses scoped `useGSAP`, `ScrollTrigger`, image transforms and a reduced-motion static path.
- No browser or Lighthouse run was available. Typecheck, lint and webpack production build passed; lint retains four existing `<img>` warnings for avatars/local previews.
- Product/admin workflows remain incomplete and were deliberately not expanded in this Hero-only phase.
