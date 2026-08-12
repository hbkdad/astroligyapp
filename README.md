# Personal Cosmic Calendar

A deterministic astrology, lunar, and numerology intelligence platform. Astronomical and numerological facts are calculated and versioned before any rule-based interpretation or optional AI explanation is applied.

## Requirements

- Node.js 20.19 or newer
- npm 11 or a compatible npm version
- Docker Engine with Compose for disposable PostgreSQL integration tests

## Commands

```powershell
npm install
npm run dev
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run db:check
npm run test:database
npm run build
npm run check
```

`npm run check` is the application gate. `npm run test:database` starts an
isolated PostgreSQL 18 container, applies checked-in migrations, runs ownership
and constraint tests, and removes the container. It uses local fixture
credentials only and does not read `DATABASE_URL`.

## Project guidance

Read these in order before substantial work:

1. `AGENTS.md`
2. `docs/PROJECT_STATUS.md`
3. `docs/GOAL_QUEUE.md`
4. `docs/MASTER_BUILD_SPEC.md`
5. `docs/ARCHITECTURE.md` and accepted ADRs

PostgreSQL and Drizzle are the portable persistence contract. Self-hosted Better Auth is
selected behind an explicit email/password HTTP allowlist, Astronomy Engine is selected
behind the provider-neutral ephemeris boundary, Paddle is selected only for verified
subscription-event ingestion, and Amazon SES Canada Central is selected behind the
authentication-email adapter. Managed database/deployment, live provider resources,
credentials, AI, general notification, and production deployment remain unselected or
unprovisioned; see `docs/PROJECT_STATUS.md` for current gates.
