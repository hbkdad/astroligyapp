# Architecture

Status: accepted baseline; persistence approach selected and managed providers remain open.

## System shape

```text
User and public inputs
        |
        v
Boundary validation and normalization
        |
        +--------------------+
        |                    |
        v                    v
EphemerisProvider      NumerologyStrategy
        |                    |
        v                    v
Deterministic astronomy, lunar, natal, transit, and numerology engines
        |
        v
Normalized PersonalContext with calculation traces and versions
        |
        v
Rule-based interpretations and configurable heuristic scores
        |
        +--------------------+
        |                    |
        v                    v
Deterministic fallback   Optional schema-validated AI explanation
        |                    |
        +----------+---------+
                   v
        API, UI, reports, timeline, notifications, and public pages
```

## Non-negotiable boundaries

1. Domain engines are pure where practical and do not import UI, database, auth, billing, notification, or AI modules.
2. Provider adapters validate and normalize external output before domain code receives it.
3. Persisted results carry input hashes or equivalent reproducibility metadata plus engine, provider, interpretation, and score-model versions.
4. Interpretation keys refer to deterministic facts; prose cannot create new facts.
5. Public resources use opaque identifiers and deliberately selected public fields. Private birth data never appears in routes or shared payloads.
6. Entitlements and resource ownership are decided server-side through centralized policy.

## Code boundaries

The first release uses one Next.js App Router application with internal module boundaries. Extract packages or services only under the triggers recorded in ADR 0002.

```text
src/
  app/                         routes and server entry points
  components/                  accessible presentation components
  domain/
    astro/                     zodiac, aspects, natal, transits
    lunar/                     phases and personal lunar context
    numerology/                strategies, normalization, traces
    context/                   normalized combined context
    interpretation/            keys, templates, output schemas
    entitlements/              provider-neutral feature policy
  infrastructure/
    ephemeris/                 EphemerisProvider adapters
    persistence/               repositories and database adapters
  db/                          Drizzle schema and PostgreSQL connection factory
    auth/                      identity adapter and authorization
    billing/                   billing adapter and webhook handling
    notifications/             delivery adapters and idempotency
  config/                      versioned weights and feature definitions
tests/
  fixtures/                    sourced deterministic fixtures
```

## Core interfaces

- `EphemerisProvider`: normalized celestial positions, houses, and provider metadata; no interpretation.
- `SessionVerifier`: provider-neutral server verification returning explicit
  active, unauthenticated, expired, revoked, or invalid session state.
- `withIdentityTransaction`: maps an internal account UUID into a constrained,
  transaction-local PostgreSQL role and RLS identity.
- `NumerologyStrategy`: traceable calculations under an explicitly selected convention.
- `PythagoreanNumerology`: versioned component reduction, configurable master
  numbers and Y policy, explicit Latin-name normalization, and traceable core
  and personal-cycle results.
- Zodiac and aspect primitives: provider-neutral normalized-degree geometry,
  configurable orbs, structured strength, and optional motion phase.
- Lunar phase primitives: Moon-minus-Sun ecliptic longitude geometry, explicit
  eight-sector labels, approximate illuminated fraction, mean-cycle age, and
  Moon zodiac position without calendar-based event prediction.
- Domain services: zodiac conversion, aspect detection, lunar classification, natal charts, transits, and combined context.
- Repositories: persistence contracts expressed in domain types, implemented by infrastructure adapters.
- `InterpretationRenderer`: deterministic template rendering with optional AI adapter behind validated input/output schemas.
- `EntitlementPolicy`: centralized server-side capability checks independent of billing provider plan names.

## Data and cache principles

- Version natal cache keys by normalized birth input, house system, provider version, and engine version.
- Cache shared sky and lunar facts globally at an explicit time resolution.
- Cache personal context by profile, date/time bucket, location, and all calculation/config versions.
- Store derived data only when latency, auditability, or cost justifies it; retain the trace needed to reproduce it.
- Define deletion, retention, and cascade behavior before storing private birth or relationship data.

## Verification architecture

- Unit: pure deterministic boundaries, reductions, scores, schemas, and failure cases.
- Contract: every provider adapter against shared provider tests.
- Integration: persistence, auth boundaries, webhook idempotency, and cache versioning.
- End-to-end: account, private profile, chart, report, entitlement, compatibility, and deletion flows.
- Visual/accessibility: responsive critical pages, keyboard, reduced motion, text equivalents, and contrast.

## Open decisions

- Runtime and deployment constraints for ephemeris adapters beyond the default Node.js application runtime.
- Authentication and managed PostgreSQL providers.
- Initial house system and coordinate/timezone resolution providers.
- Browser end-to-end runner and observability stack.

## Baseline decisions

- Application: Next.js 16.3 App Router, React 19.2, strict TypeScript, and Tailwind CSS 4.
- Runtime: Node.js, with a project minimum of 20.19 and Node 24 in CI.
- Testing: Vitest for deterministic unit and contract tests; browser runner deferred until the first user workflow.
- Quality: Prettier, ESLint with Next.js Core Web Vitals and TypeScript rules, strict `tsc`, production build, and GitHub Actions CI.
- API style: Server Components for internal reads, Server Actions for first-party mutations, and Route Handlers for external/public HTTP contracts.
- Deployment: platform-agnostic Node.js server contract; no hosting provider selected.
- Persistence: PostgreSQL 18 contract, Drizzle ORM/Kit, `pg`, checked-in SQL
  migrations, forced row-level security, and real disposable PostgreSQL tests.
  See ADR 0003.
