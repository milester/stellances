# Contributing to Stellance

Welcome! This guide will help you understand the project architecture and how to contribute effectively.

---

## 📖 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Data Models](#data-models)
4. [User Flows](#user-flows)
5. [API Design](#api-design)
6. [Stellar Integration](#stellar-integration)
7. [Development Setup](#development-setup)
8. [Picking an Issue](#picking-an-issue)
9. [Submitting a PR](#submitting-a-pr)

---

## 🎯 Project Overview

### What is Stellance?

Stellance is a **decentralized freelance payment platform** that eliminates traditional payment barriers for freelancers worldwide. Instead of using PayPal, Upwork, or banks (which charge high fees and exclude many users), we use the **Stellar blockchain** for instant, low-cost, cross-border payments.

### The Problem We're Solving

- **High Fees:** Platforms like Upwork take 20% of earnings
- **Banking Barriers:** Millions of freelancers can't receive international payments
- **Slow Payouts:** Traditional payments take 3-7 days
- **Lack of Trust:** No transparent escrow system

### Our Solution

- ✅ **Instant payments** (3-5 seconds on Stellar)
- ✅ **Low fees** (<2% platform fee + $0.0001 network fee)
- ✅ **No bank required** (just a Stellar wallet)
- ✅ **Trustless escrow** (smart contract holds funds until work is approved)
- ✅ **Global access** (works anywhere Stellar is accessible)

---

## 🏗 Architecture

### System Overview

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│                 │         │                 │         │                 │
│  Next.js Web    │ ◄─────► │  NestJS API     │ ◄─────► │  Stellar        │
│  (Frontend)     │  HTTP   │  (Backend)      │  SDK    │  Network        │
│                 │         │                 │         │  (Blockchain)   │
└─────────────────┘         └─────────────────┘         └─────────────────┘
                                    │
                                    │
                                    ▼
                            ┌─────────────────┐
                            │                 │
                            │  PostgreSQL     │
                            │  (Database)     │
                            │                 │
                            └─────────────────┘
```

### Tech Stack Breakdown

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 16 (App Router) | User interface, wallet connection |
| **Backend** | NestJS | API, business logic, Stellar integration |
| **Database** | PostgreSQL + Prisma | Store users, jobs, contracts, payments |
| **Blockchain** | Stellar (XLM/USDC) | Payment rails, escrow |
| **Smart Contracts** | Soroban (Rust) | Trustless escrow logic |

---

## 📊 Data Models

The source of truth is `stellance/backend/prisma/schema.prisma`. The models below mirror it exactly.

### Enums

```typescript
UserRole:        CLIENT | FREELANCER | ADMIN
JobStatus:       OPEN | IN_PROGRESS | COMPLETED | CANCELLED
ContractStatus:  ACTIVE | COMPLETED | DISPUTED | CANCELLED
MilestoneStatus: PENDING | IN_REVIEW | APPROVED | PAID
```

### Core Entities

```typescript
// User — clients, freelancers, and admins
User {
  id:               string    // UUID primary key
  email:            string    // unique
  name:             string
  role:             UserRole
  password:         string    // argon2 hash — never returned in API responses
  stellarPublicKey: string?   // unique — the user's Stellar wallet address
  tokenVersion:     number    // incremented on logout-all to invalidate all sessions
  createdAt:        DateTime
  updatedAt:        DateTime
}

// Job — posted by clients
Job {
  id:          string
  title:       string
  description: string
  budget:      Decimal    // 18 digits, 7 decimal places (Decimal(18,7))
  category:    string
  status:      JobStatus
  clientId:    string     // FK → User
  createdAt:   DateTime
  updatedAt:   DateTime
}

// Contract — created when a client hires a freelancer for a job
Contract {
  id:           string
  jobId:        string         // FK → Job (unique — one contract per job)
  freelancerId: string         // FK → User
  clientId:     string         // FK → User
  status:       ContractStatus
  escrowTxHash: string?        // unique — Stellar tx hash that funded the escrow
  createdAt:    DateTime
  updatedAt:    DateTime
}

// Milestone — a deliverable phase within a contract
Milestone {
  id:         string
  contractId: string          // FK → Contract
  title:      string
  amount:     Decimal         // portion of contract value for this milestone
  status:     MilestoneStatus
  createdAt:  DateTime
  updatedAt:  DateTime
}

// Payment — an on-chain fund release, one per milestone approval
Payment {
  id:            string
  contractId:    string    // FK → Contract
  milestoneId:   string?   // FK → Milestone (unique — one payment per milestone)
  amount:        Decimal
  stellarTxHash: string    // unique — the Stellar tx that transferred funds
  createdAt:     DateTime
}
```

### Relationships

```
User ──────────────┬── jobs[]               (as CLIENT)
                   ├── contractsAsClient[]   (as CLIENT)
                   ├── contractsAsFreelancer[] (as FREELANCER)
                   └── refreshTokens[]

Job ───────────────── contract?             (one-to-one, optional)

Contract ──────────┬── milestones[]
                   └── payments[]

Milestone ─────────── payment?             (one-to-one, optional)

Payment ────────────── (belongs to Contract + optional Milestone)
```

### Key Stellar fields

Two fields link the off-chain database to the Stellar blockchain:

| Field | Model | Description |
|-------|-------|-------------|
| `stellarPublicKey` | `User` | The user's Stellar account address |
| `escrowTxHash` | `Contract` | Hash of the Soroban `fund()` transaction |
| `stellarTxHash` | `Payment` | Hash of the Soroban `release()` or `refund()` transaction |

Any payment can be independently verified on [stellar.expert](https://stellar.expert/explorer/testnet) using its `stellarTxHash`.

---

## 👥 User Flows

### Flow 1: Client Posts a Job & Hires Freelancer

```
1. Client signs up → creates Stellar wallet (or connects existing)
2. Client posts a job (title, description, budget)
3. Freelancers browse jobs and apply
4. Client reviews applications and hires a freelancer
5. System creates a Contract
6. Client funds escrow (sends XLM/USDC to escrow account)
   └─► Escrow smart contract locks funds
7. Contract status → "active"
```

### Flow 2: Freelancer Completes Work & Gets Paid

```
1. Freelancer works on the job
2. Freelancer submits work for review
3. Client reviews and approves work
4. System calls escrow contract to release funds
   └─► Stellar blockchain transfers XLM/USDC to freelancer's wallet
5. Payment record created (links to Stellar tx hash)
6. Contract status → "completed"
```

### Flow 3: Dispute Resolution

```
1. Either party opens a dispute
2. Contract status → "disputed"
3. Escrow funds are frozen
4. Platform admin reviews evidence
5. Admin decides:
   a) Release to freelancer
   b) Refund to client
   c) Split payment
6. Escrow contract executes decision
```

---

## 🔌 API Design

### Authentication

All protected endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

### Endpoint Patterns

```
POST   /auth/register          - Create new user
POST   /auth/login             - Get JWT token + refresh token cookie
POST   /auth/refresh           - Rotate refresh token, get new access token
POST   /auth/logout            - Revoke current session
POST   /auth/logout-all        - Revoke all sessions

GET    /users/me               - Get current user profile  ← implemented
PATCH  /users/me               - Update profile / set Stellar public key  ← planned

GET    /jobs                   - List all jobs (with filters)
GET    /jobs/:id               - Get single job
POST   /jobs                   - Create job (client only)
PATCH  /jobs/:id               - Update job (owner only)
DELETE /jobs/:id               - Delete job (owner only)
POST   /jobs/:id/apply         - Apply to job (freelancer only)

POST   /contracts              - Create contract (when hiring)
GET    /contracts              - List user's contracts
GET    /contracts/:id          - Get contract details
POST   /contracts/:id/confirm-fund    - Confirm on-chain escrow funding
PATCH  /contracts/:id/milestones/:mid/submit  - Submit work (freelancer)
PATCH  /contracts/:id/milestones/:mid/approve - Approve & release funds (client)
POST   /contracts/:id/dispute  - Open dispute

GET    /payments               - List payments
GET    /payments/:id           - Get payment details
```

### Response Format

Responses are flat objects — there is no top-level `success` wrapper. The exact shape depends on the endpoint. Auth endpoints look like:

```typescript
// POST /auth/register → 201
{
  message: "Registered successfully",
  access_token: "eyJhbGci...",
  user: { id, email, name, role, stellarPublicKey, tokenVersion, createdAt, updatedAt }
}

// POST /auth/login → 200
{
  message: "Logged in successfully",
  access_token: "eyJhbGci...",
  user: { id, email, name, role, stellarPublicKey }
}

// POST /auth/refresh → 200
{
  access_token: "eyJhbGci..."
}

// POST /auth/logout → 200
{
  message: "Logged out successfully"
}
```

Errors use NestJS's standard format:

```typescript
// Validation error
{
  statusCode: 400,
  message: ["email must be an email", "password must be longer than or equal to 8 characters"],
  error: "Bad Request"
}

// Auth error
{
  statusCode: 401,
  message: "Invalid credentials",
  error: "Unauthorized"
}
```

See [docs/api-reference.md](docs/api-reference.md) for the full request/response reference.

---

## ⛓️ Stellar Integration

### Why Stellar?

- **Fast:** 3-5 second settlement
- **Cheap:** $0.0001 per transaction
- **Built for payments:** Native multi-currency support
- **Soroban:** Smart contracts for escrow logic

### How We Use Stellar

#### 1. User Wallets

Each user has a Stellar wallet (public/private keypair):
- **Public Key:** Stored in database, used to receive payments
- **Private Key:** User controls (via Freighter browser extension)

#### 2. Escrow Account

The platform maintains an escrow account:
- Clients send funds to this account when hiring
- Smart contract controls when funds can be released
- Only released when both parties agree (or admin resolves dispute)

#### 3. Payment Flow

```
Client Wallet
     │
     │ (1) Send XLM/USDC to escrow
     ▼
Escrow Account (Smart Contract)
     │
     │ (2) Client approves work
     ▼
Freelancer Wallet
```

### Soroban Smart Contract (Escrow)

```rust
// Simplified contract structure
pub struct EscrowContract;

impl EscrowContract {
    // Lock funds when contract is created
    pub fn create_escrow(
        contract_id: String,
        client: Address,
        freelancer: Address,
        amount: i128,
    ) -> Result<(), Error>
    
    // Release funds to freelancer
    pub fn release_escrow(
        contract_id: String,
        caller: Address,  // Must be client or admin
    ) -> Result<(), Error>
    
    // Refund to client
    pub fn refund_escrow(
        contract_id: String,
        caller: Address,  // Must be both parties or admin
    ) -> Result<(), Error>
}
```

### Stellar SDK Usage (Backend)

```typescript
// Example: Creating an escrow payment
import * as StellarSDK from '@stellar/stellar-sdk';

async fundEscrow(contractId: string, amount: number) {
  const server = new StellarSDK.Horizon.Server('https://horizon-testnet.stellar.org');
  
  // Build transaction
  const transaction = new StellarSDK.TransactionBuilder(escrowAccount)
    .addOperation(
      StellarSDK.Operation.payment({
        destination: freelancerPublicKey,
        asset: StellarSDK.Asset.native(), // XLM
        amount: amount.toString(),
      })
    )
    .build();
  
  // Sign and submit
  transaction.sign(escrowKeypair);
  const result = await server.submitTransaction(transaction);
  
  return result.hash; // Store this in the database
}
```

---

## 💻 Development Setup

### Prerequisites

- Node.js 18+
- PostgreSQL
- Stellar testnet account ([Create here](https://laboratory.stellar.org/#account-creator?network=test))

### Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/stallance/stellances.git
cd stellances

# 2. Start PostgreSQL (requires Docker)
docker compose up -d

# 3. Install backend dependencies
cd stellance/backend
npm install

# 4. Set up backend environment
cp .env.example .env
# Edit .env — set JWT_SECRET and REFRESH_TOKEN_PEPPER to random strings
# DATABASE_URL default matches the docker-compose settings

# 5. Run database migrations
npx prisma migrate dev

# 6. Start the backend
npm run start:dev
# → http://localhost:3001/api  (Swagger: http://localhost:3001/docs)

# 7. In a new terminal, install and start the frontend
cd stellance/frontend
npm install
cp .env.local.example .env.local
npm run dev
# → http://localhost:3000  (Stellar demo: http://localhost:3000/demo)
```

### Environment Variables

**Backend (`stellance/backend/.env`)**
```env
DATABASE_URL=postgresql://stellance:stellance_pass@localhost:5432/stellance
JWT_SECRET=your_random_secret_here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_DAYS=30
REFRESH_TOKEN_PEPPER=your_random_pepper_here
FRONTEND_URL=http://localhost:3000
```

**Frontend (`stellance/frontend/.env.local`)**

Copy the provided template:
```bash
cp stellance/frontend/.env.local.example stellance/frontend/.env.local
```

Default values:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_STELLAR_NETWORK=testnet
```

---

## 🎯 Picking an Issue

### Step 1: Choose Your Area

- **Frontend?** Look for issues tagged `frontend`
- **Backend?** Look for issues tagged `backend`
- **Blockchain?** Look for issues tagged `stellar` or `smart contract`
- **New to the project?** Start with `good first issue`

### Step 2: Read the Context

Before starting, make sure you understand:

1. **Dependencies:** Does this issue depend on others being completed first?
2. **Data Models:** Which entities does this touch? (See [Data Models](#data-models))
3. **User Flow:** Which user journey is this part of? (See [User Flows](#user-flows))
4. **API Contract:** If building an endpoint, what should the request/response look like?

### Step 3: Comment on the Issue

Let others know you're working on it:

```
I'd like to work on this! ETA: 3-4 days.
Quick question: Should the job listing support pagination or infinite scroll?
```

### Example Workflow

**You pick Issue #5: Build Jobs Listing Page**

1. ✅ Read the issue description
2. ✅ Check Data Models → understand `Job` entity
3. ✅ Check API Design → `GET /jobs` endpoint
4. ✅ Check if backend issue #14 is done (it provides the API)
   - If not done: either wait, or implement a mock API response
5. ✅ Comment on the issue that you're starting
6. ✅ Create a branch: `git checkout -b feature/jobs-listing-page`
7. ✅ Build the feature
8. ✅ Test locally
9. ✅ Submit PR

---

## 🚀 Submitting a PR

### PR Checklist

- [ ] Code follows project structure and conventions
- [ ] No console.log() or commented-out code
- [ ] Environment variables are documented (if added new ones)
- [ ] Tests pass (if applicable)
- [ ] Linked to the issue: `Closes #5`

### PR Template

```markdown
## What does this PR do?
Implements the jobs listing page with search and filter functionality.

## Related Issue
Closes #5

## How to Test
1. Start the dev server
2. Navigate to `/dashboard/jobs`
3. Try searching for "React developer"
4. Filter by budget range

## Screenshots (if applicable)
[Add screenshot]

## Notes
- Used React Query for data fetching
- Added loading skeleton for better UX
```

---

## 🤝 Questions?

If you're stuck or need clarification:

1. **Check the docs** in the `/docs` folder
2. **Comment on the issue** you're working on
3. **Ask in Discussions** (GitHub Discussions tab)
4. **Open a Draft PR** with your questions in the description

---

## 📚 Helpful Resources

- [Stellar Documentation](https://developers.stellar.org)
- [Soroban Smart Contracts](https://soroban.stellar.org)
- [NestJS Docs](https://docs.nestjs.com)
- [Next.js Docs](https://nextjs.org/docs)
- [Prisma Docs](https://www.prisma.io/docs)

---

**Thank you for contributing to Stellance! 🚀**

*Your work helps freelancers around the world get paid fairly and instantly.*
