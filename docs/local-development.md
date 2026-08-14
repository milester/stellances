# Stellance — Local Development Setup

Get the full stack running locally in about 10 minutes.

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Node.js | 20 | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| npm | 10 | Included with Node 20 |
| PostgreSQL | 14 | [postgresql.org](https://www.postgresql.org/download/) or Docker (recommended) |
| Rust + Cargo | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Git | any | [git-scm.com](https://git-scm.com) |

To work on smart contracts you also need:
```bash
rustup target add wasm32-unknown-unknown
```

---

## 1. Clone the repo

```bash
git clone https://github.com/stallance/stellances.git
cd stellances
```

---

## 2. Start PostgreSQL

### Option A — Docker Compose (recommended)

A `docker-compose.yml` is included in the repo root:

```bash
# from the repo root
docker compose up -d

# Stop later
docker compose down

# Stop and remove data volume (full reset)
docker compose down -v
```

This starts PostgreSQL 16 on port 5432 with:
- User: `stellance`
- Password: `stellance_pass`
- Database: `stellance`

These match the defaults in `stellance/backend/.env.example`.

### Option B — Docker (standalone)

```bash
docker run --name stellance-db \
  -e POSTGRES_USER=stellance \
  -e POSTGRES_PASSWORD=stellance_pass \
  -e POSTGRES_DB=stellance \
  -p 5432:5432 \
  -d postgres:16
```

To stop/start later:
```bash
docker stop stellance-db
docker start stellance-db
```

### Option C — Local PostgreSQL

Create a database manually:
```sql
CREATE USER stellance WITH PASSWORD 'stellance_pass';
CREATE DATABASE stellance OWNER stellance;
```

---

## 3. Set up the backend

```bash
cd stellance/backend
npm install
cp .env.example .env
```

Edit `.env` — the defaults work with the Docker setup above, but verify:

```env
DATABASE_URL="postgresql://stellance:stellance_pass@localhost:5432/stellance?schema=public"
JWT_SECRET="replace-with-a-random-string-at-least-32-chars"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_DAYS="30"
REFRESH_TOKEN_PEPPER="replace-with-another-random-string"
FRONTEND_URL="http://localhost:3000"
NODE_ENV="development"
```

> Generate secrets: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Run migrations and start:

```bash
npx prisma migrate dev
npm run start:dev
```

Backend is ready at:
- API: `http://localhost:3001/api`
- Swagger: `http://localhost:3001/docs`

---

## 4. Set up the frontend

In a new terminal:

```bash
cd stellance/frontend
npm install
```

Copy the environment template:

```bash
cp .env.local.example .env.local
```

The defaults work for local development. If your backend runs on a different port, edit `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_STELLAR_NETWORK=testnet
```

Start the dev server:

```bash
npm run dev
```

Frontend is available at `http://localhost:3000`.  
Visit `http://localhost:3000/demo` for the live Stellar testnet demo (no wallet needed).

---

## 5. (Optional) Build the Soroban contract

```bash
cd stellance/Contracts
cargo build --target wasm32-unknown-unknown --release
cargo test
```

The compiled WASM outputs to `target/wasm32-unknown-unknown/release/stellance_contract.wasm`.

---

## 6. (Optional) Set up Freighter wallet

[Freighter](https://www.freighter.app/) is the Stellar browser extension wallet used to sign transactions from the frontend. You'll need it when developing the escrow or milestone payment flows.

**Install Freighter:**
1. Install the extension for [Chrome](https://chromewebstore.google.com/detail/freighter/bcacfldlkkdogcmkkibnjlakofdplcbk) or [Firefox](https://addons.mozilla.org/en-US/firefox/addon/freighter-wallet/)
2. Open the extension and create a new wallet (or import an existing one)
3. Switch the network to **Testnet** (Settings → Network → Testnet)
4. Get free testnet XLM: open `http://localhost:3000/demo`, or use the [Stellar Friendbot](https://laboratory.stellar.org/#account-creator?network=test) directly with your Freighter public key

**Finding your Freighter public key:** click the account icon in the top right of the Freighter popup. The public key starts with `G`.

> The `/demo` page at `http://localhost:3000/demo` generates a disposable keypair in the browser without Freighter — it's the fastest way to test the Stellar integration without any wallet setup.

---

## Verify everything is working

### Backend health check

```bash
curl http://localhost:3001/api
# Should return 200
```

### Register a test user

```bash
curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User","password":"password123","role":"CLIENT"}' \
  | jq .
```

### Swagger UI

Open `http://localhost:3001/docs` — all endpoints are listed and can be tried in the browser.

### Stellar testnet demo

1. Open `http://localhost:3000/demo`
2. Click **Create Keypair** — generates a Stellar testnet keypair in-browser
3. Click **Fund (Friendbot)** — funds the account with 10,000 testnet XLM
4. Click **Send 1 XLM** — submits a real transaction on the Stellar testnet
5. The transaction hash links to [stellar.expert](https://stellar.expert/explorer/testnet) for verification

---

## Running tests

### Backend unit tests

```bash
cd stellance/backend
npm run test          # Run all unit tests
npm run test:cov      # Run with coverage report
npm run test:watch    # Watch mode
```

Tests use an in-memory Prisma mock (`src/test-utils/prisma.mock.ts`) — no database connection needed.

### Backend e2e tests

```bash
cd stellance/backend
npm run test:e2e      # Requires DATABASE_URL to be set
```

### Contract tests

```bash
cd stellance/Contracts
cargo test
```

---

## Common issues

### `DATABASE_URL` connection refused

Make sure PostgreSQL is running. If using Docker:
```bash
docker ps | grep stellance-db
docker start stellance-db   # if stopped
```

### Prisma migration errors

If the database schema is out of date:
```bash
cd stellance/backend
npx prisma migrate reset    # WARNING: drops and recreates the database
npx prisma migrate dev
```

### Port already in use

If `3001` is taken, set `PORT=3002` in `stellance/backend/.env`.  
If `3000` is taken, Next.js will automatically try `3001`, `3002`, etc.

### `EACCES` installing npm packages

Don't use `sudo npm install`. Fix npm permissions or use a Node version manager (`nvm`, `fnm`).

### Contract build fails: `wasm32-unknown-unknown` target missing

```bash
rustup target add wasm32-unknown-unknown
```

---

## Useful commands reference

| Task | Command |
|------|---------|
| Start backend (watch) | `cd stellance/backend && npm run start:dev` |
| Start frontend | `cd stellance/frontend && npm run dev` |
| Run migrations | `cd stellance/backend && npx prisma migrate dev` |
| Open Prisma Studio | `cd stellance/backend && npx prisma studio` |
| Run backend tests | `cd stellance/backend && npm test` |
| Run backend tests + coverage | `cd stellance/backend && npm run test:cov` |
| Lint backend | `cd stellance/backend && npm run lint` |
| Lint frontend | `cd stellance/frontend && npm run lint` |
| Build contract | `cd stellance/Contracts && cargo build --target wasm32-unknown-unknown --release` |
| Test contract | `cd stellance/Contracts && cargo test` |
