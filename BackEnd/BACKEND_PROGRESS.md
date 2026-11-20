# Backend progress

## Test database isolation — COMPLETE

Integration tests require `TEST_DATABASE_URL`, accept only the exact
`vybern_test` database name, and verify `current_database()` after connecting.
Vitest supplies that URL as `DATABASE_URL` to every test worker, so fixture
cleanup cannot fall back to development data.

## Financial checkout — COMPLETE

The IRR financial suite covers address ownership, active/missing rates,
server-controlled shipping, immutable snapshots, discounts, rollback, payment
amount consistency, reservation consumption/release, global usage limits,
per-customer concurrent limits, and concurrent idempotency retries.

Financial corrections included:

- Released redemptions do not count towards a per-customer discount limit.
- Iranian shipping cannot be mixed into a historical EUR checkout.

## Store Settings — COMPLETE

Migration `20261123120000_add_store_settings` creates a constrained singleton
record. Public settings are available at `GET /api/v1/settings`; authorised
administrators can read and update settings at `GET/PATCH /api/v1/admin/settings`.
Updates enforce validation, RBAC, CSRF, rate limits and audit logging. Secrets
and payment credentials are not modelled as store settings.

## Super-admin user management — COMPLETE

`GET /api/v1/admin/users`, `GET /api/v1/admin/users/:userId`, and
`PATCH /api/v1/admin/users/:userId` are limited to `ADMIN_MANAGE`
(`SUPER_ADMIN`). Role/status changes revoke target sessions, are audited, and
cannot demote or suspend the final active super administrator. The protection
uses Serializable transactions.

## Notification Outbox — COMPLETE

Migration `20261123130000_add_notification_outbox` adds a durable at-least-once
outbox with unique event/aggregate keys, retry metadata, processing leases and
delivery/failure timestamps. Order creation, successful/failed/cancelled
payments, and shipped/delivered fulfilment transitions enqueue their events in
the originating PostgreSQL transaction.

`NotificationOutboxService` uses `FOR UPDATE SKIP LOCKED` leases for concurrent
workers, reclaims expired leases, applies bounded exponential backoff and marks
permanent failures. The development worker logs only event metadata; production
does not start a delivery worker without a real provider integration.

## Verification

On 2026-11-18:

- `npm run prisma:generate` passed.
- `npm run prisma:deploy` applied the Store Settings migration to `vybern_test`.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed: 70 tests across 16 files.

## Next implementation step

## Customer Account and Catalogue — IN PROGRESS

Added paginated owned payment history at `GET /api/v1/account/payments`.
Existing owned order history/details, profile, session revocation, deactivation
and address ownership/default-address logic remain in place. Checkout's Fastify
schema now correctly permits either `shippingAddress` or `shippingAddressId`,
matching the existing service validation. Catalogue variant availability is
clamped to zero and exposed explicitly.

Focused verification after these changes passed for the Outbox and Fastify
schema suites. The next action is to add account-payment and public-catalogue
integration coverage, then complete OpenAPI response schemas and production
hardening.

## Production hardening updates — PARTIAL

Migration `20261123140000_fix_outbox_low_inventory_deduplication` replaces the
over-broad outbox event/aggregate uniqueness rule with an optional deduplication
key. State-transition events remain idempotent while legitimate repeated
`LOW_INVENTORY` events are retained. Added `GET /api/v1/ready`, which checks
PostgreSQL and Redis without exposing dependency errors. README now documents
production environment requirements, deployment migrations, backup/restore,
probe use and outbox worker behaviour.

Verification on 2026-11-18: Prisma generate, typecheck, lint and the full test
suite passed (71 tests across 16 files). `npm audit --omit=dev` reports 8
dependency vulnerabilities (5 high, 3 moderate). Available automatic fixes
would perform breaking upgrades to Zod 4 and Fastify Swagger UI 6, so they were
not applied without a compatibility review.

Audit detail: installed `zod@3.25.76` is the latest 3.x but the patch is Zod
4.6.7; installed `@fastify/swagger-ui@5.2.6` is the latest 5.x but the patch
is 6.1.4 (which also updates `@fastify/static`/`glob`); installed
`prisma@6.19.3`/`@prisma/client@6.19.3` are the latest 6.x but retain the
transitive `deepmerge-ts@7.1.5` advisory. These packages are tooling/docs
surfaces except Zod, whose request-validation exposure needs a reviewed Zod 4
migration. No compatible non-breaking upgrade exists as of this audit.

## Dependency remediation — IN PROGRESS

Migrated to `zod@4.6.7` and `@fastify/swagger-ui@6.1.4`. The sole Zod 4 API
incompatibility (`z.record`) was updated with an explicit string key schema;
typecheck, lint and Fastify startup tests pass. The production audit now reports
only three high findings in Prisma's CLI/config dependency chain
(`prisma@6.19.3` → `@prisma/config` → `deepmerge-ts@7.1.5`); no patched Prisma
6 release exists. Customer payment-history integration coverage was added.

Checkout input is now XOR-validated at both Fastify JSON-schema (`oneOf`) and
Zod levels: exactly one of `shippingAddress` or `shippingAddressId` is required.

## Contract-test updates — IN PROGRESS

Added PostgreSQL catalogue integration coverage for active/draft products,
active/inactive variants, zero/non-negative availability, filtering, pagination
and English/Persian/German translations. Generated OpenAPI smoke coverage now
asserts representative public/customer/admin paths using paths relative to the
document's `/api/v1` server. Full route-by-route OpenAPI response schemas and
Fastify checkout acceptance/rejection fixture tests remain the next work.

## Checkout route integration — COMPLETE

Added Fastify/PostgreSQL coverage for all address input combinations. Requests
with only `shippingAddressId` or only inline `shippingAddress` create real
orders; requests with both or neither return HTTP 400 and do not change order
or inventory state. The suite uses authenticated opaque sessions and CSRF
tokens against `vybern_test`.

Latest full verification after checkout/catalogue additions: 79 tests pass
across 19 test files. A stale shared shipping-rate fixture collision was fixed
by making the financial fixture idempotently upsert its rate.

OpenAPI path/security smoke coverage is present, but complete precise response
schemas for every registered endpoint are still incomplete; generated documents
contain default response entries for several legacy routes. This must not be
represented as complete API-contract coverage.

## Authentication OpenAPI contracts — COMPLETE

All four authentication routes (`otp/request`, `otp/verify`, `me`, `logout`)
now declare concrete success and relevant error responses, including nullable
user names and cookie/CSRF security metadata. OTP development codes and opaque
session tokens are intentionally absent from the public OpenAPI contract. A
generated-document regression test verifies this non-disclosure.

## Public Catalogue OpenAPI contracts — COMPLETE

All three public catalogue routes (`GET /products`, `GET /products/:slug`,
`GET /categories`) now have concrete success/error contracts for product lists,
detail, category responses, localisation, images, public variant availability
and pagination. Internal stock fields are excluded from the schema. OpenAPI
response contracts complete so far: 14 of 72 registered routes.

## Customer Orders and Checkout OpenAPI contracts — COMPLETE

All three customer-facing order routes (`POST /orders`, `GET /orders`,
`GET /orders/:orderId`) now declare concrete responses for immutable order,
financial discount/shipping snapshots, shipping-address snapshots, line items,
pagination, ownership and mutation errors. Checkout documents its 201 result,
CSRF and idempotency header. OpenAPI response contracts complete so far: 22 of
72 registered routes.

## Storefront addresses, shipping and payments OpenAPI contracts — COMPLETE

Completed contracts for four Customer Address routes, `POST /shipping/quote`,
and all three Payment routes (initiate, owned status and development-only mock
action). Contracts model ownership/authentication, CSRF mutations, safe payment
status/money fields and shipping/address responses without provider credentials.
OpenAPI response contracts complete so far: 30 of 72 registered routes.

## Customer-facing verification — COMPLETE

Full isolated verification after all storefront response-schema changes passed:
Prisma generate, TypeScript typecheck, ESLint, and 83 tests across 19 files.
The suite covers real Fastify responses for authentication, customer account,
addresses, catalogue, cart, checkout/orders, shipping and payments, including
ownership/CSRF/authentication paths. Production-configured OTP responses are
tested not to return development OTP values; mock payment actions remain
rejected outside development by `PaymentService`.

`npm audit --omit=dev` reports only three high findings in the Prisma CLI/config
chain (`prisma@6.19.3` → `@prisma/config` → `deepmerge-ts@7.1.5`). They are not
reachable through HTTP request handling in this API. No patched Prisma 6
version exists; mitigation is restricted production dependency installation and
a separately reviewed Prisma major migration. Zod and Swagger UI advisories are
resolved.

## Customer Account OpenAPI contracts — COMPLETE

All seven Customer Account/session routes in `customer.routes.ts` now declare
concrete success and relevant error responses: profile read/update, active
sessions, payment history pagination, session revocation and account
deactivation. Session responses deliberately exclude token hashes/tokens and
payment-history responses exclude attempt/provider credentials. Customer
address endpoints remain in the Shipping API contract workstream.

OpenAPI response contracts complete so far: 11 of 72 registered routes
(4 Authentication + 7 Customer Account/session routes). Focused Customer and
OpenAPI regression tests passed (11 tests across 3 files).

## Audit defect fixes — PARTIALLY VERIFIED

Implemented a single server-authoritative Iranian shipping-rate resolver used
by both saved-address and inline-address checkout. Inline checkout now requires
an IR address with a supported province/city and an active province rate; it
cannot silently create a zero-shipping order. New PostgreSQL financial tests
cover equivalent saved/inline addresses, identical rate calculation, and
rollback when the rate is inactive or unavailable.

Production configuration now rejects `AUTH_COOKIE_SECURE=false`, ensuring
production session cookies cannot be configured without `Secure`. The discount
validation endpoint now counts only `RESERVED` and `CONSUMED` redemptions for
per-customer limits; a PostgreSQL/Fastify regression test covers a released
redemption remaining reusable.

Verification in the current environment: TypeScript typecheck and ESLint pass;
the non-database focused suite passes 12/12 and the complete suite has 20
passing tests. PostgreSQL at `127.0.0.1:5433` was unavailable and Docker socket
access was denied, so 63 database tests were skipped and five Outbox tests
failed solely with Prisma connection errors. Full database verification remains
blocked until Docker/PostgreSQL is available; no database reset, migration, or
volume operation was performed.
