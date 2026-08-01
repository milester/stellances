# Stellance Near-Term Roadmap

_Last updated: 2026-08-01_

## Focus: Escrow Create → Fund → Milestone Release → Dispute

The Soroban contract is complete, test-covered (34 tests), and compiles to WASM.
The backend EscrowService is wired. The gap is the integration layer — testnet
deployment, end-to-end backend ↔ contract calls, and the Freighter signing flow
in the frontend.

---

## Completed since last update (2026-07-28 → 2026-08-01)

| Item | Status |
|------|--------|
| Contract `version()` entrypoint | ✅ Done |
| Contract `get_admin()` read-only view | ✅ Done |
| 4 new contract tests (34 total) | ✅ Done |
| `GET /jobs` pagination + text search + budget filter | ✅ Done |
| `GET /users` admin list endpoint | ✅ Done |
| Startup env-var validation (roadmap #69) | ✅ Done |
| Job detail "Apply" button wired to wallet + proposal form | ✅ Done |

---

## Escrow Flow (the path we are building toward)

```
Client                Backend                  Soroban Contract
  │                      │                           │
  │  POST /contracts      │                           │
  │─────────────────────>│  createContract()          │
  │                      │  (DB: PENDING)             │
  │                      │                           │
  │  POST /contracts/:id/fund                        │
  │─────────────────────>│  buildFundXdr()            │
  │  <── unsigned XDR ───│                           │
  │                      │                           │
  │  [Freighter signs]    │                           │
  │  POST /contracts/:id/submit-fund                 │
  │─────────────────────>│  submitToHorizon()         │
  │                      │───────────────────────>   │
  │                      │  fund() on-chain           │
  │                      │   (DB: ACTIVE)             │
  │                      │                           │
  │  POST /milestones/:id/submit                     │
  │─────────────────────>│  submitMilestone()         │
  │                      │  (DB: IN_REVIEW)           │
  │                      │                           │
  │  POST /milestones/:id/approve                    │
  │─────────────────────>│  submitReleaseMilestone()  │
  │                      │───────────────────────>   │
  │                      │  release_milestone()       │
  │                      │  (DB: PAID, on-chain)      │
  │                      │                           │
  │  POST /contracts/:id/dispute  [optional path]    │
  │─────────────────────>│  submitDispute()           │
  │                      │───────────────────────>   │
  │                      │  dispute()  (frozen)       │
  │                      │                           │
  │  PATCH /admin/:id/resolve     [admin only]       │
  │─────────────────────>│  submitResolveDispute()    │
  │                      │───────────────────────>   │
  │                      │  resolve_dispute(bps)      │
  │                      │  (atomic split, settled)   │
```

---

## Weekly Breakdown

### Week 1 — Testnet deployment + backend integration wire-up

**Goal:** a real escrow contract address on Stellar testnet; backend calls reach it.

- Deploy the Soroban escrow contract to Stellar testnet, record the contract address
- Set `SOROBAN_CONTRACT_ID` and `STELLAR_NETWORK` in backend `.env.example`
- Smoke-test `EscrowService.buildFundXdr()` against the deployed contract
- Validate `verifyTransaction()` against a real Horizon testnet response
- Update `docs/local-development.md` with testnet setup steps

_Completion signal:_ `POST /contracts/:id/fund` returns a valid XDR string that can be decoded with Stellar Lab.

---

### Week 2 — Freighter signing flow (frontend)

**Goal:** a client can fund a contract from the browser using Freighter.

- Integrate `@stellar/freighter-api` — connect wallet, get public key
- Build `FundEscrow` component: calls `/fund` → receives XDR → calls `freighter.signTransaction()` → submits to `/submit-fund`
- Handle Freighter not installed, user rejection, and submission errors
- Wire `MilestoneApprove` button to the same XDR-sign-submit pattern (`release_milestone`)
- Complete the proposal → contract creation flow started by `ApplySection`

_Completion signal:_ a complete fund → approve milestone round-trip from the browser on testnet, with Freighter signing each step.

---

### Week 3 — Dispute flow + on-chain state verification

**Goal:** disputes can be raised and resolved; UI shows verified on-chain state.

- `POST /contracts/:id/dispute`: build unsigned dispute XDR, return for Freighter signing (closes issue #45)
- `GET /contracts/:id/on-chain`: call Soroban `get_escrow`, compare with DB state (closes issue #48)
- Frontend contract detail page shows on-chain status badge with link to stellar.expert (closes issue #49)
- Admin resolve endpoint tested end-to-end on testnet (60/40 split)

_Completion signal:_ a contract can enter and exit the dispute state entirely from the UI, with the on-chain event visible on stellar.expert.

---

### Week 4 — Hardening + contributor handoff

**Goal:** the flow is stable enough for contributors to build on.

- ~~Startup env-var validation (`ConfigModule` schema) — closes issue #69~~ ✅ Done (2026-08-01)
- Rate limiting on auth endpoints (`@nestjs/throttler`) — closes issue #53
- Write testnet deployment guide (`docs/testnet-deployment.md`) — closes issue #54
- Fix `MilestoneStatus.APPROVED` — either implement the transition or remove the dead enum value (#61)
- Triage remaining open issues (#60, #62, #67, #68, #72) and assign or close

_Completion signal:_ CI green on the full flow; `docs/testnet-deployment.md` exists and a new contributor can run a fund → milestone → release cycle on testnet following only that document.

---

## What is explicitly out of scope for this window

- `stellar-sdk` v15 frontend upgrade (#51 is already done at v13; v15 has breaking changes)
- Prisma 8.x upgrade (tracked in #70)
- Marketplace UI / job search beyond current stub pages (#28, #29)
- Payments module beyond the on-chain milestone release already in `ContractsService`

---

## Open issues targeted in this window

| Issue | Description | Closes in |
|-------|-------------|-----------|
| #45 | dispute XDR for Freighter signing | Week 3 |
| #46 | deploy escrow to testnet | Week 1 |
| #47 | Soroban event streaming | Post-roadmap |
| #48 | GET /contracts/:id/on-chain | Week 3 |
| #49 | link to stellar.expert | Week 3 |
| #53 | auth rate limiting | Week 4 |
| #54 | testnet deployment guide | Week 4 |
| #61 | APPROVED status dead code | Week 4 |
| #69 | startup env validation | ✅ Done |
