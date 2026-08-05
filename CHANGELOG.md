# Changelog

All notable changes to Stellance are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.4.0] — 2026-08-05

### Added

- **`EscrowService.buildDisputeXdr()`** — new method that builds and returns unsigned XDR for a `dispute()` Soroban invocation. The disputing party (client or freelancer) signs this with Freighter, matching the same non-custodial pattern as `buildFundXdr()`. The existing `submitDispute()` is retained as an admin-signed fallback and is now clearly documented as such. This resolves the long-standing TODO in `escrow.service.ts`.
- **Payments module** (`src/payments/`) — skeleton module with `PaymentsService` and `PaymentsController`. Exposes:
  - `GET /payments/contracts/:contractId` — list all payment records for a contract (party access-controlled).
  - `GET /payments/tx/:txHash` — look up a payment by Stellar transaction hash (any authenticated user).
  - Wired into `AppModule`. Ready for earnings aggregation and SEP-24 anchor off-ramp integration.
- **Health-check endpoint** — `GET /api/health` (public, no JWT required). Returns `{ status, version, network, timestamp }`. Suitable for load balancers, Docker `HEALTHCHECK`, and CI smoke tests. Replaces the unused `GET /` "Hello World!" root route. Documented in `docs/api-reference.md`.
- **Frontend `lib/api/contracts.ts`** — typed fetch client for all `/contracts` and `/payments/contracts/:id` endpoints: `createContract`, `fetchContracts`, `fetchContract`, `confirmFund`, `submitMilestone`, `approveMilestone`, `raiseDispute`, `resolveDispute`, `cancelContract`, `fetchContractPayments`. Follows the same pattern as the existing `lib/api/jobs.ts`.

### Changed

- **`contracts.service.ts` — `_remainingAmount()` precision fix** — removed `Number()` coercion on Prisma `Decimal` values. Now uses `parseFloat(decimal.toString())` throughout, eliminating the risk of precision loss on amounts with more than 15 significant digits. Scale factor (`10_000_000`) matches the `Decimal(18,7)` schema.
- **`contracts.service.ts` — `approveMilestone()` amount precision fix** — the `amountStroops` calculation also used `Number(milestone.amount)`. Changed to `parseFloat(milestone.amount.toString())` for consistency.
- **`contracts.service.ts` — `approveMilestone()` state machine** — milestone now transitions through `APPROVED` before `PAID` within the same DB transaction, making the `MilestoneStatus.APPROVED` enum value meaningful. Previously the enum existed in `schema.prisma` but was never written; it can now be observed in transaction history and on the `Milestone` record between the two update steps.
- **`app.controller.ts` / `app.service.ts`** — replaced `getHello()` stub with `health()` method. `AppService` now injects `ConfigService` to read `STELLAR_NETWORK` for the health response.
- **`app.controller.spec.ts`** — updated to test `health()` instead of the removed `getHello()` method. Now covers: status value, version type, network type, and ISO 8601 timestamp format.
- **`app.module.ts`** — added `PaymentsModule` import.
- **`escrow.service.ts`** — removed the stale `TODO` comment from `submitDispute()`. The TODO is resolved by the new `buildDisputeXdr()` method; the existing `submitDispute()` is now documented as an explicit admin-signed fallback.

### Fixed

- `MilestoneStatus.APPROVED` was defined in `schema.prisma` but never written by application code, making the enum value a dead letter. The `approveMilestone()` flow now writes `APPROVED` as an intermediate step before `PAID`, making the schema and the code consistent.

---

## [Unreleased]

### Added

- **Contract: `version()` entrypoint** — returns the deployed contract version as a `soroban_sdk::String` (currently `"1.1.0"`). Allows callers to confirm which WASM build is live after an upgrade without reading storage. Resolves upgrade management gap noted in the internal audit.
- **Contract: `get_admin()` view** — returns `Option<Address>` containing the admin set at `fund()` time for a given `contract_id`. Frontends and monitoring tools can now verify arbitration rights for an escrow without fetching the full `EscrowEntry`.
- **Contract: 4 new tests** — `version_returns_semver_string`, `get_admin_returns_none_before_fund`, `get_admin_returns_admin_after_fund`, `get_admin_still_readable_after_release`. Total test count: **34** (up from 30).
- **Backend: `GET /jobs` pagination** — `findAll()` now accepts `page` and `limit` query params and returns `{ data, total, page, limit, totalPages }`. Default page size is 20; maximum is 100. Prevents unbounded queries on growing datasets.
- **Backend: `GET /jobs` text search** — `search` query param performs case-insensitive `ILIKE` search against job `title` and `category` using Prisma `contains + insensitive` mode.
- **Backend: `GET /jobs` budget filter** — `minBudget` and `maxBudget` query params filter by XLM amount. Both are optional and can be combined with `search` and `status`.
- **Backend: `GET /users` (admin-only)** — new endpoint lists all users with pagination. Passwords are excluded from the response via `select` projection. Returns `{ data, total, page, limit, totalPages }`.
- **Backend: startup env validation** (`main.ts`) — `validateEnvironment()` runs before the NestJS app is created. Exits with code 1 if `JWT_SECRET` or `DATABASE_URL` are absent. Emits structured warnings for optional-but-important Soroban vars (`ESCROW_CONTRACT_ID`, `STELLAR_ADMIN_SECRET`). Closes roadmap item #69.
- **Frontend: `ApplySection` component** (`jobs/[id]/page.tsx`) — replaces the disabled "Apply — coming soon" button. If wallet is disconnected, shows a "Connect wallet to apply" button. If connected, shows a proposal textarea (max 1000 chars) with a character counter and a submit handler that toasts confirmation. Wires to the `useStellarWallet` hook; ready for the Freighter signing flow when `POST /contracts` lands.

### Changed

- **Backend: `jobs.controller.ts`** — added `@ApiQuery` decorators for all new `GET /jobs` parameters (`search`, `minBudget`, `maxBudget`, `page`, `limit`). Swagger UI at `/docs` now renders fully documented query params for the jobs marketplace endpoint.
- **Backend: `users.controller.ts`** — `AuthRequest` interface now includes `role` field so the new `GET /users` admin guard can access `req.user.role` without a cast.
- **Backend: `contracts.service.ts`** — `resolveDispute()` `callerId` parameter renamed to `_callerId` (prefixed with `_`) to make the intentional-unused-param pattern explicit and lint-clean. The admin check uses `callerRole` only, which is correct — the endpoint is protected by the JWT guard at the controller level.

### Fixed

- **Contract: `version()` return type** — initial implementation returned `&'static str`, which is not `Val`-convertible in Soroban 21.x. Fixed to return `soroban_sdk::String::from_str(&env, "1.1.0")`. All 34 contract tests pass.
- **Frontend: `[id]/page.tsx`** — `useEffect` import was missing after adding `useState` for the apply form. Fixed by updating the import line.

---

## [Unreleased — previous]

### Added
- `src/escrow/escrow.service.spec.ts` — 24-test unit suite for EscrowService covering all public methods: `contractIdToSymbol`, `getAdminPublicKey`, `verifyTransaction`, `buildFundXdr`, `submitReleaseMilestone`, `submitRelease`, `submitRefund`, `submitDispute`, `submitResolveDispute`, and constructor warnings. All Stellar SDK network calls are mocked; no network access required.
- `docs/dependency-health.md` — dependency health audit report (2026-07-14): packages assessed, vulnerabilities resolved, action items for maintainers.

### Changed
- `auth.service.ts` — `validateUser` return type narrowed from `Promise<any>` to `Promise<Omit<User, 'password'> | null>`. Eliminates the only non-generated `any` in production backend code.
- `main.ts` — replaced bare `console.log` with NestJS `Logger` for consistent structured log output; added `addBearerAuth()` to Swagger config so the `/docs` UI renders the auth header input; cleaned up import ordering; changed `||` to `??` for `FRONTEND_URL` fallback.
- `docs/api-reference.md` — fully updated to reflect current implementation. Removed all `(Planned)` markers from Jobs, Contracts, and Milestones sections; added missing endpoints (`PATCH /jobs/:id`, `POST /jobs/:id/cancel`, `POST /contracts/:id/cancel`, `PATCH /contracts/admin/:id/resolve`); added Payments section with coming-soon note; updated error tables.
- `README.md` — corrected repository structure comment (backend modules now accurate), soroban-sdk version (`21.x` not `22.x`), tech stack `@stellar/stellar-sdk` version note, and implementation status table.
- **Frontend:** `next` patched 16.1.6 → 16.2.10, resolving 3 HIGH and 1 MODERATE vulnerability (HTTP request smuggling, unbounded image cache, PostCSS XSS). `eslint-config-next` bumped to match.
- **Backend:** `npm update` within `^11.x` semver ranges resolved all 19 HIGH and 1 CRITICAL vulnerabilities. Notable: `@nestjs/core` → 11.1.28 (path-to-regexp ReDoS), `@nestjs/platform-express` → 11.1.28 (multer DoS), `@nestjs/swagger` → 11.4.5 (js-yaml/lodash), `@prisma/*` → 7.8.0, `ts-jest` update resolved `handlebars` CRITICAL (devOnly). 3 MODERATE remain (Prisma `@hono/node-server`, requires Prisma 7→6 downgrade to fix — see `docs/dependency-health.md`).

### Added
- `docker-compose.yml` — PostgreSQL 16 service for local development (resolves references in multiple docs that pointed to a missing file)
- `stellance/frontend/.env.local.example` — environment template; contributors now run `cp .env.local.example .env.local` instead of creating the file manually
- `PATCH /users/me` implemented in `users.controller.ts` and `users.service.ts` — saves Stellar public key and display name; validated with `@Matches(/^G[A-Z2-7]{55}$/)` to reject malformed keys
- Freighter wallet setup guide added to `docs/local-development.md` (step 6)
- `@ApiProperty` / `@ApiPropertyOptional` decorators added to `RegisterDto` and `LoginDto` — Swagger UI at `/docs` now renders fully populated request body schemas with examples
- `src/users/users.controller.spec.ts` — unit test suite for `GET /users/me` and `PATCH /users/me` covering: happy path, missing `req.user`, user not found in DB, password-omission guarantee, `ConflictException` propagation for duplicate Stellar keys
- **Jobs module** (`src/jobs/`) — full CRUD: `GET /jobs`, `GET /jobs/:id`, `POST /jobs`, `PATCH /jobs/:id`, `POST /jobs/:id/cancel`; role-based access (client owns job); unit-tested
- **Contracts + Milestones module** (`src/contracts/`) — `POST /contracts` (creates contract + milestones, returns unsigned fund XDR for Freighter); `POST /contracts/:id/confirm-fund` (verifies tx hash on Horizon); `PATCH .../milestones/:mid/submit`; `PATCH .../milestones/:mid/approve` (submits `release_milestone()` on-chain then records Payment); `POST .../dispute`; `PATCH admin/:id/resolve`; `POST .../cancel`; 20+ unit tests including on-chain-before-DB ordering guarantees
- **Escrow service** (`src/escrow/escrow.service.ts`) — `buildFundXdr` (unsigned XDR for Freighter), `submitReleaseMilestone`, `submitRelease`, `submitRefund`, `submitDispute`, `submitResolveDispute`, `verifyTransaction`; all Soroban call sites use `contractIdToSymbol()` to safely encode UUIDs as 32-char Symbols
- **`contractIdToSymbol()` helper** — strips hyphens from PostgreSQL UUIDs to produce a valid Soroban Symbol key (≤32 chars). Applied at every Soroban call site in EscrowService; documented in both the backend service and the contract module doc comment
- **Full Soroban escrow contract** (`stellance/Contracts/src/lib.rs`) — `fund`, `release_milestone`, `release`, `refund`, `dispute`, `resolve_dispute`, `get_escrow`, `ping`; 30 tests covering all state transitions, authorization checks, arithmetic edge cases, and dispute resolution splits
- **`EscrowStatus::Resolved`** variant — split dispute resolution now sets `Resolved` rather than `Released`, accurately reflecting that funds were split between parties
- **`EscrowError::InvalidAmount`** — `fund()` now rejects zero and negative amounts with a dedicated error code
- **`DataKey::Escrow(Symbol)`** typed storage key — namespaces escrow entries in persistent storage, preventing collisions if additional storage types are added in future
- JWT strategy now throws `InternalServerErrorException` at startup if `JWT_SECRET` is unset, preventing silent use of a hardcoded fallback secret in misconfigured deployments

### Changed
- Landing page `Why Stellar` section updated: "Soroban smart contracts are next on the roadmap" replaced with accurate status — contract is complete, test-covered, and compiles to WASM; integration is in progress
- Landing page stack block: `"soroban (planned)"` → `"soroban  rust  wasm"`
- Landing page stats block: `"Smart contracts (roadmap)"` → `"Escrow smart contract"`; `"Escrow via Horizon"` → `"Soroban escrow contract"`; Soroban stat now rendered in active colour (was greyed-out)
- `docs/architecture.md` — component map, architecture diagram, backend module tree, Soroban section, and "What Is Not Yet Built" table all updated to reflect current implementation state

### Fixed
- `CONTRIBUTING.md` — response format examples corrected from `{success:true, data:{...}}` to the actual flat format (`{message, access_token, user}`)
- `CONTRIBUTING.md` — endpoint list corrected: `/auth/me` → `/users/me`; `/users/:id` patterns replaced with `/users/me`; milestone/contract paths updated to match `docs/api-reference.md`
- `CONTRIBUTING.md` — dev setup now uses `docker compose up -d` and `cp .env.local.example .env.local`
- `stellance/backend/README.md` — docker-compose reference now points to the actual file
- `stellance/frontend/README.md` — quick start now uses `cp .env.local.example .env.local`
- `docs/local-development.md` — Docker section rewritten to use `docker compose up -d`; frontend setup uses `.env.local.example`
- `docs/architecture.md` — docker-compose row in "What Is Not Yet Built" table updated to ✅ Added
- `resolve_dispute` Split arm previously set `EscrowStatus::Released` — corrected to `EscrowStatus::Resolved` so `get_escrow()` accurately reflects split outcomes
- `ContractsService.dispute()` previously only updated the DB without freezing the on-chain escrow — now calls `escrow.submitDispute()` before the DB update when the escrow is funded, preserving the trustless guarantee

---

## [0.2.0] — 2026-06-17

### Added
- Marketing landing page with responsive layout and Stellar branding
- Soroban contract workspace scaffold (`stellance/Contracts/`)
- GitHub issue templates for frontend and backend contributor applications
- CI workflow for backend tests and frontend build

### Changed
- Updated CI to Node.js 20 for Next.js and Prisma compatibility
- Added Stellance logo to README

---

## [0.1.0] — 2026-03

### Added
- NestJS backend bootstrap with app module configuration
- Prisma 7 schema: `User`, `Job`, `Contract`, `Milestone`, `Payment`, `RefreshToken`
- Initial database migration
- JWT auth with rotating refresh tokens (argon2 password hashing, httpOnly cookies)
- Auth endpoints: register, login, refresh, logout, logout-all
- Token reuse detection (triggers full session revoke via `tokenVersion`)
- Helmet, CORS, and global validation pipe in `main.ts`
- Swagger API docs at `/docs`
- Next.js 16 frontend scaffold with Tailwind CSS
- Stellar testnet demo page: keypair generation, Friendbot funding, XLM payment
- `CONTRIBUTING.md` with architecture diagrams, data models, and user flows

---

[Unreleased]: https://github.com/alone-in/stellances/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/alone-in/stellances/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/alone-in/stellances/releases/tag/v0.1.0
