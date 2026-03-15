#  Stellance

**Decentralized freelance payment platform powered by the Stellar blockchain**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Stellar](https://img.shields.io/badge/Stellar-XLM-blue)](https://stellar.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

##  Problem Statement

Freelancers worldwide face a broken payment system. Traditional platforms are:
- ❌ Expensive (up to 20% in platform fees and payment processor cuts)
- ❌ Slow (3–7 business days for payouts through multiple intermediaries)
- ❌ Inaccessible (millions in Africa, Asia, and Latin America can't receive international payments)
- ❌ Opaque (no transparent, verifiable record of agreements or payment history)

##  Solution

Stellance leverages the **Stellar blockchain** to create a borderless, low-cost platform where:

✅ **Freelancers** get paid instantly with no bank account required  
✅ **Clients** secure work agreements with trustless on-chain escrow  
✅ **Payments** release automatically upon work approval  
✅ **Everyone** benefits from <$0.00001 transaction fees and 3–5 second settlement

##  Key Features

### For Freelancers
-  **Instant Payouts**: Receive funds in seconds, not days
-  **No Bank Required**: Just a Stellar wallet address to get started
-  **On-Chain Reputation**: Build verifiable payment history and reviews
-  **Mobile-Friendly**: Works for anyone with a smartphone

### For Clients
-  **Escrow Protection**: Funds locked until work is delivered and approved
-  **Transparent Agreements**: Immutable on-chain job contracts and milestones
-  **Instant Settlement**: Release payment the moment you approve
-  **Multi-Currency**: Pay in USDC, XLM, or other Stellar assets

### For the Platform
-  **Smart Escrow**: Stellar claimable balances for conditional payment release
-  **Dispute Resolution**: Platform mediates and releases funds accordingly
-  **Low Fees**: Under 2% platform fee vs. 20% on traditional platforms
-  **Open & Interoperable**: API-first design for third-party integrations

##  Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Frontend (Next.js 14 App Router)            │
│         Web Dashboard + Mobile App (React Native)       │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                  Backend API (NestJS)                    │
│   Auth │ Users │ Jobs │ Contracts │ Payments │ Stellar  │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┴───────────┬──────────────┐
         │                       │              │
┌────────▼────────┐   ┌──────────▼─────┐   ┌───▼──────────┐
│  Stellar Node   │   │   PostgreSQL   │   │     IPFS     │
│  (Horizon API)  │   │  + Prisma ORM  │   │   / AWS S3   │
│                 │   │                │   │              │
│ • Escrow        │   │ • User data    │   │ • Contracts  │
│ • Payments      │   │ • Jobs         │   │ • Files      │
│ • USDC / XLM    │   │ • Milestones   │   │ • Deliverables│
└─────────────────┘   └────────────────┘   └──────────────┘
```

## 🛠️ Tech Stack

### Blockchain
- **Stellar SDK** (`@stellar/stellar-sdk`) — Payments and escrow
- **Horizon API** — Blockchain queries and transaction submission
- **Stellar Wallet** — JWT + wallet signature authentication

### Backend
- **NestJS** — Modular API server
- **PostgreSQL** — Relational database
- **Prisma** — ORM and migrations
- **JWT** — Authentication

### Frontend
- **Next.js 14** (App Router) — Web application
- **React Native** — Mobile app (Phase 3)
- **TailwindCSS** — Styling

### DevOps
- **Docker** — Containerization
- **GitHub Actions** — CI/CD
- **Vercel** — Frontend hosting
- **Railway** — Backend hosting

## 📦 Project Structure

```
stellance/
├── apps/
│   ├── web/                        # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/             # Login & register
│   │   │   └── (dashboard)/        # Jobs, contracts, payments, profile
│   │   ├── components/             # UI, wallet, jobs, payments
│   │   ├── hooks/                  # useStellarWallet, useEscrow, usePayments
│   │   └── lib/                    # stellar.ts, api.ts
│   │
│   └── api/                        # NestJS backend
│       ├── src/
│       │   ├── auth/               # Auth module
│       │   ├── users/              # Users module
│       │   ├── jobs/               # Jobs module
│       │   ├── contracts/          # Contracts module
│       │   ├── payments/           # Payments module
│       │   └── stellar/            # Core Stellar integration + escrow
│       └── prisma/                 # schema.prisma
│
├── packages/
│   ├── shared/                     # Shared types & utilities
│   └── stellar-utils/              # Reusable Stellar helpers
│
├── docs/                           # Architecture, API, Stellar integration
├── .github/workflows/              # CI/CD pipelines
├── docker-compose.yml
├── turbo.json                      # Turborepo monorepo config
└── README.md
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL
- Stellar testnet account ([Create one here](https://laboratory.stellar.org/#account-creator?network=test))

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/stellance.git
cd stellance
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment setup**
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

4. **Database setup**
```bash
cd apps/api && npx prisma migrate dev
```

5. **Run development servers**
```bash
npm run dev
```

Visit `http://localhost:3000` 🎉

### Environment Variables

**Backend (`apps/api/.env`)**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/stellance
JWT_SECRET=your_jwt_secret
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
ESCROW_SECRET_KEY=your_stellar_secret_key
```

**Frontend (`apps/web/.env.local`)**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_STELLAR_NETWORK=testnet
```

## 📚 Documentation

- [Architecture Overview](docs/architecture.md)
- [API Documentation](docs/api.md)
- [Stellar Integration Guide](docs/stellar-integration.md)
- [Contributing Guidelines](CONTRIBUTING.md)

## 🗺️ Roadmap

### Phase 1: MVP (Q1 2026)
- [ ] User registration & Stellar wallet connection
- [ ] Job posting and browsing
- [ ] Basic escrow (fund → approve → release)
- [ ] Payment history dashboard

### Phase 2: Core Features (Q2 2026)
- [ ] Milestone-based payments
- [ ] Dispute resolution system
- [ ] Freelancer reputation & reviews
- [ ] Multi-currency support (USDC, XLM, EURC)

### Phase 3: Scale (Q3–Q4 2026)
- [ ] Mobile app (React Native)
- [ ] Team / agency accounts
- [ ] API for third-party integrations
- [ ] Fiat on/off ramp integration
- [ ] 10,000+ active freelancers

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### How to Contribute
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

##  License

This project is licensed under the MIT License — see the [LICENSE](./LICENSE) file for details.

##  Team

- **Your Name** — Project Lead
- Open for contributors!

##  Acknowledgments

- [Stellar Development Foundation](https://stellar.org) — Blockchain infrastructure
- Freelancer communities worldwide — Domain expertise and feedback
- Open source community — Tools and libraries

##  Contact

- **Website**: [Coming Soon]
- **Email**: contact@stellance.io
- **Twitter**: [@StellanceHQ](https://twitter.com/stellancehq)
- **Discord**: [Join our community](https://discord.gg/stellance)

##  Links

- [Stellar Documentation](https://developers.stellar.org/)
- [Project Wiki](https://github.com/yourusername/stellance/wiki)
- [Bug Reports](https://github.com/yourusername/stellance/issues)

---

**Built with ❤️ to empower freelancers worldwide**

> *"Your work, your money, your terms."*
