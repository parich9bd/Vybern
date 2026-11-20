# Phase 02 header integration notes

The Header renders the reference navigation and action controls, but only the VYBERN logo links to the implemented locale home route. The following destinations do not exist in the current application and are intentionally presented as non-functional, keyboard-accessible buttons with `aria-disabled="true"`:

- Shop
- Collections
- Our Story
- Search
- Virtual Try-On
- Account
- Shopping bag

This avoids emitting 404 routes or suggesting that future commerce features already work. Replace each pending action with a locale-aware `Link` only when its corresponding route is implemented in an approved later phase.
