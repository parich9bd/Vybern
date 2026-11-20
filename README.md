# VYBERN EYEWEAR

VYBERN EYEWEAR is an in-progress premium multilingual eyewear commerce platform. It combines a Fastify commerce API with a Next.js storefront designed for English, Persian, and German audiences. A real-time virtual try-on experience is planned, but is not implemented yet.

The project is under active development and is not production-ready.

## Technology

### Backend

- Node.js 22+
- TypeScript
- Fastify 5
- Prisma 6
- PostgreSQL
- Redis
- Zod validation

### Frontend

- Next.js 16 App Router
- React 19
- TypeScript (strict mode)
- Tailwind CSS 4
- next-intl
- Vazirmatn for Persian typography

## Repository structure

```text
BackEnd/   Fastify API, Prisma schema/migrations, tests and local Docker services
FrontEnd/  Next.js storefront, design tokens, i18n and UI components
```

`references/` is intentionally local-only. It contains the prior visual implementation used during development and is never required to run or deploy the project.

## Current implementation status

### Implemented

- Fastify REST API foundation with health and readiness endpoints.
- Multilingual public catalogue endpoints for products and categories.
- Cookie-based OTP session authentication with CSRF protection for state-changing requests.
- Cart, order, payment, shipping, discount, customer-address, media, settings and administration API modules.
- Prisma migrations, PostgreSQL/Redis local development configuration and OpenAPI documentation.
- Next.js App Router foundation with English (`en`), Persian (`fa`) and German (`de`) routes.
- Persian RTL document direction and local Vazirmatn font loading.
- Semantic frontend design tokens, reduced-motion handling and locale-aware metadata.
- Reference-based VYBERN Header, announcement bar, real logo asset, mobile navigation and locale selector.
- Customer account area with profile editing, OTP-backed sessions, order/payment history and an Iranian address book.
- Customer avatar upload, replacement and removal. Files are content-validated JPEG, PNG or WebP assets stored outside PostgreSQL; only a server-controlled storage key is persisted.

### Partially implemented

- Header controls for catalogue, search, account, cart and virtual try-on are visually present but intentionally non-functional until their routes and frontend integrations are approved.
- Backend commerce modules exist, but the storefront has not yet integrated them.

### Planned

- Cinematic Hero and scroll experience.
- Product catalogue and product-detail interface.
- Authentication, cart and checkout user interfaces.
- Payment and order status frontend integration.
- Real-time virtual try-on with camera, face landmarks and frame rendering.
- End-to-end tests, performance work and deployment configuration.

## Backend API

The API is served under `/api/v1`. Confirmed public endpoints include:

- `GET /health`
- `GET /ready`
- `GET /products`
- `GET /products/:slug`
- `GET /categories`

Authentication uses OTP verification. A successful verification sets an opaque HttpOnly session cookie and provides a CSRF token. Authenticated mutations, including cart, order, payment, address and administration actions, require the session cookie and `x-csrf-token` header. Order creation also requires an `Idempotency-Key` header.

Customer account endpoints include `GET/PATCH /account/profile`, `GET/POST/PATCH/DELETE /account/addresses`, `GET /orders`, `GET /orders/:orderId`, `GET /account/payments`, and `POST/GET/DELETE /account/avatar`. Avatar writes require CSRF protection; the avatar content endpoint only serves the authenticated owner.

Run the backend locally to access Swagger UI at `http://localhost:3001/docs` for the complete, generated contract.

## Local development

### Prerequisites

- Node.js 22 or newer
- npm
- Docker Desktop for PostgreSQL and Redis

### Backend

```bash
cd BackEnd
cp .env.example .env
# Replace every uppercase placeholder in .env with local values. Generate
# AUTH_SECRET with: openssl rand -hex 32
# Keep POSTGRES_USER, POSTGRES_PASSWORD and POSTGRES_DB aligned with DATABASE_URL.
docker compose up -d
npm install
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run dev
```

`MEDIA_STORAGE_PATH` controls local avatar and product-media storage, and `MEDIA_MAX_FILE_SIZE_BYTES` limits uploads. The storage directory is runtime data and must remain outside version control. For production, use durable shared/object storage behind the same storage interface: local filesystem storage is suitable only for a single persistent instance, not serverless or multi-instance deployments.

Apply checked-in migrations without resetting data:

```bash
npm run prisma:deploy
```

The backend runs at `http://localhost:3001`. PostgreSQL is exposed locally on port `5433`; Redis is exposed on `6379` by the supplied Compose configuration.

Useful backend checks:

```bash
npm run typecheck
npm run lint
npm test
```

### Frontend

```bash
cd FrontEnd
npm install
npm run dev
```

The frontend runs at `http://localhost:3000`. Locale routes are available at:

- `http://localhost:3000/en`
- `http://localhost:3000/fa`
- `http://localhost:3000/de`

Useful frontend checks:

```bash
npm run typecheck
npm run lint
npm run build
```

## Internationalisation

The storefront uses `next-intl` with English, Persian and German locale routes. Persian renders with RTL document direction; English and German use LTR. User-facing strings in the implemented frontend are stored in locale message files.

## Development roadmap

1. Frontend foundation — completed
2. Header and Announcement Bar — implemented; visual refinement can continue alongside later work
3. Cinematic Hero and ScrollExperience
4. Product catalogue and product details
5. Authentication integration
6. Shopping cart integration
7. Checkout and order flow
8. Real-time Virtual Try-On
9. Testing, optimisation and deployment

Backend capabilities should be integrated only when the corresponding frontend phase is approved. A backend endpoint existing in this repository does not mean its customer-facing experience is complete.

## Security and repository hygiene

Do not commit `.env` files, credentials, generated build output, dependency directories or the local `references/` directory. Keep only `.env.example` files under version control. Production secrets must be supplied by the deployment platform.
