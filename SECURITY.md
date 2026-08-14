# Security Policy

## Supported Versions

Stellance is under active development. Security fixes are applied to the latest version on the `main` branch.

| Version | Supported |
|---------|-----------|
| `main` (latest) | ✅ |
| Older commits | ❌ |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

To report a vulnerability, email the maintainers directly or open a [GitHub Security Advisory](https://github.com/stallance/stellances/security/advisories/new) (private disclosure).

Include:

1. A description of the vulnerability and its potential impact
2. Steps to reproduce (or a proof-of-concept)
3. Affected component (backend API, frontend, smart contract, or CI)
4. Any suggested fix you have in mind (optional)

We aim to acknowledge reports within **48 hours** and provide a resolution timeline within **7 days** for critical issues.

## Scope

In scope for reports:

- Authentication and session management (`stellance/backend/src/auth/`)
- Input validation and injection vulnerabilities (API, smart contract)
- Stellar transaction handling and escrow logic
- Secrets or credentials exposed in code or CI logs

Out of scope:

- Theoretical vulnerabilities without a proof of concept
- Denial-of-service attacks against the testnet demo
- Issues in third-party dependencies that are already publicly disclosed upstream

## Security Practices

This project uses:

- **argon2** for password hashing
- **JWT** with short-lived access tokens (15m) and rotating refresh tokens stored as SHA-256 + pepper hashes
- **httpOnly cookies** for refresh token transport
- **Helmet** and strict CORS in the API
- **class-validator** with `whitelist: true` to reject unexpected fields
