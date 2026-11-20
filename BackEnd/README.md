# VYBERN Eyewear API

The production-oriented REST API for VYBERN Eyewear. This first milestone implements the catalogue foundation only: PostgreSQL infrastructure, Prisma schema/migration, fictional seed data, secure application bootstrap, OpenAPI, and public multilingual product endpoints.

Cart, orders and payments are intentionally not present yet. They must not be exposed without their security and transaction guarantees.

## Prerequisites

- Node.js 22 LTS or later
- Docker Desktop (Apple Silicon is supported by the selected multi-architecture images)

## Start locally

```bash
cp .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run dev
```

Before starting the server, replace `AUTH_SECRET` in `.env` with a unique value from `openssl rand -hex 32`. The supplied Compose setup exposes PostgreSQL on port `5433` and Redis on `6379`.

The server runs at `http://localhost:3001`; Swagger UI is at `http://localhost:3001/docs`.

## Phone authentication

`POST /api/v1/auth/otp/request` accepts an E.164 phone number and always returns the same acceptance shape, so it does not reveal whether an account exists. OTP challenges are HMAC-hashed and held only in Redis with a TTL, attempt cap, resend cooldown and IP/phone rate limits.

For local development only, the returned response includes `data.developmentOtp`; it is never logged and development SMS is rejected in production. No real SMS gateway has been integrated.

After `POST /api/v1/auth/otp/verify`, the API sets an opaque HttpOnly session cookie and a readable CSRF cookie. Send the returned `csrfToken` as `x-csrf-token` on authenticated state-changing calls, including `POST /api/v1/auth/logout`. `GET /api/v1/auth/me` reads the session cookie.

## Development payments

Payments use the immutable order total and never accept a client-supplied amount. In development, create a payment with `POST /api/v1/payments` using an authenticated session, CSRF header and an `orderId`. Then use `POST /api/v1/payments/:paymentId/mock` with `{ "action": "success" }`, `{ "action": "fail" }`, or `{ "action": "cancel" }` to exercise the simulated flow.

Mock actions are unavailable outside development. They are not a real payment integration. Pending-payment orders reserve stock for 15 minutes; the built-in scheduler releases expired reservations after restart as well as during normal reads and checkout activity.

Iran is the target market and new Iranian catalogue prices should use integer `IRR` amounts (the display layer may show toman). Existing fictional seed records retain their current currency deliberately; no automatic currency conversion is performed.

## Media library

Administrators with `PRODUCT_MANAGE` can upload JPEG, PNG and WebP assets through `POST /api/v1/admin/media` as `multipart/form-data` using the `file` field. The service validates the binary signature, ignores client MIME claims, generates the storage key itself, and writes only below `MEDIA_STORAGE_PATH` (never a public/static directory). Files become publicly readable only after being assigned to an active product; virtual try-on model fields remain separate from this image library.

Deleting an unused asset is a soft delete. Its physical file is retained for 30 days, then an `ADMIN_MANAGE` administrator may invoke `POST /api/v1/admin/media/cleanup` to purge eligible unreferenced assets. Referenced assets cannot be deleted, and active-product references are rejected explicitly. Object storage can replace `LocalMediaStorage` through the `MediaStorage` interface without changing media business logic.

## Available endpoints

- `GET /api/v1/health`
- `GET /api/v1/products?locale=en&page=1&limit=24&category=sunglasses&q=aurelia&featured=true&sort=price_asc`
- `GET /api/v1/products/:slug?locale=fa`
- `GET /api/v1/categories?locale=de`
- `GET /api/v1/cart?locale=en`
- `POST /api/v1/cart/items`
- `PATCH /api/v1/cart/items/:itemId`
- `DELETE /api/v1/cart/items/:itemId`
- `DELETE /api/v1/cart`
- `POST /api/v1/orders` (requires `Idempotency-Key` and a shipping address)
- `GET /api/v1/orders`
- `GET /api/v1/orders/:orderId`

All successful responses use a `data` envelope; product lists also contain a `meta` pagination object. Validation failures use `400` and missing products use `404`, with no internal error details exposed.

## Design notes

- Prices are signed integer minor units (`basePriceMinor`/`priceMinor`); no floating-point price calculation is permitted.
- Each translation is unique per entity and locale (`en`, `fa`, `de`). Search is limited to the requested locale.
- Product details return only `ACTIVE` records. Draft and archived products cannot leak from public catalogue endpoints.
- Inventory constraints reject negative stock and reservations greater than on-hand stock at database level.
- Virtual try-on is asset metadata only. Camera access, face tracking and 3D rendering remain client-side.
- Cart pricing is recalculated from the current product variant price on every response. Adding an item never reserves stock; availability is rechecked at checkout.
- Checkout creates immutable order snapshots and reserves inventory for 15 minutes using a serializable database transaction. Expired pending-payment reservations are released lazily when orders are read or another checkout begins. Payment settlement is deliberately not implemented.
- The seed uses `example.invalid` asset URLs and explicitly fictional product content. It does not imply an asset-CDN integration.

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
```

## Environment

`DATABASE_URL` is required. `CORS_ORIGIN` is required in production and must be the exact frontend origin. Do not commit `.env` files or credentials.

## Production operations

`GET /api/v1/health` is a liveness endpoint. `GET /api/v1/ready` verifies
PostgreSQL and Redis and is appropriate for a readiness probe.

Use separate managed PostgreSQL and Redis instances in production; the supplied
Compose file is only a local-development convenience. Set `NODE_ENV=production`,
an exact HTTPS `CORS_ORIGIN`, `AUTH_COOKIE_SECURE=true`, an absolute
`MEDIA_STORAGE_PATH`, a random 32+ character `AUTH_SECRET`, and real SMS/payment
providers. The environment validator rejects development SMS and mock payments
in production.

Deployments are additive: supply secrets through the deployment platform, run
`npm run prisma:deploy` once against the production database, then start
application instances. Never run `prisma migrate reset` in a deployed
environment. Back up PostgreSQL through provider PITR or encrypted `pg_dump`,
test restores into an isolated database regularly, and do not restore over a
live database without an approved recovery procedure.

Outbox delivery is at-least-once. Providers must make delivery idempotent using
the event identifier. The development worker is intentionally not started in
production until a real provider is configured; graceful Fastify shutdown stops
the scheduler/worker before Prisma and Redis are closed.
