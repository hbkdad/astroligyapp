# Project status

Last updated: 2026-08-09

## Current position

Status: Goals 3 and 4 complete; auth-to-RLS boundary plus zodiac/aspect primitives verified.

The project now has the portable application baseline plus a PostgreSQL 18
contract, Drizzle ORM/Kit, a typed 20-table normalized schema, checked-in SQL
migrations, forced row-level security on 19 private tables, a server-only
verified-session boundary, identity-scoped transactions, account bootstrap,
and deterministic zodiac/aspect primitives. No production data, managed
database, authentication, billing, AI, notification, ephemeris, or deployment
provider is selected.

## Completed

- [x] Goal 0: inventory the initial workspace and establish the Codex control layer.
- [x] Move the master product specification and execution queue under `docs/`.
- [x] Add concise `AGENTS.md`, project Codex configuration, and eight validated repo skills.
- [x] Record the provider-neutral calculation boundary in ADR 0001.
- [x] Goal 1: select a single Next.js application baseline with explicit extraction triggers in ADR 0002.
- [x] Scaffold Next.js 16.3, React 19.2, Tailwind CSS 4, strict TypeScript, Prettier, ESLint, Vitest, coverage, and GitHub Actions CI.
- [x] Define framework-neutral `EphemerisProvider`, `NumerologyStrategy`, and `PersonalContext` contracts.
- [x] Define initial API boundaries and the normalized logical data model.
- [x] Verify current Swiss Ephemeris licensing materials without selecting or installing the provider.
- [x] Apply `astro-validation` to the ephemeris contract and add a contract test.
- [x] Goal 2: select PostgreSQL, Drizzle ORM/Kit, and `pg` as the portable
      persistence approach in ADR 0003 without selecting a managed provider.
- [x] Express the accepted logical model as 20 normalized tables with
      constraints, indexes, version fields, ownership paths, and deletion
      cascades.
- [x] Add two checked-in migrations: initial schema and private row security.
- [x] Add a disposable PostgreSQL 18 Docker path with no production credentials.
- [x] Verify default-deny and two-owner select/insert/update/delete isolation,
      derived-row isolation, constraints, indexes, cache uniqueness, and
      account-deletion cascades.
- [x] Apply the `database-migration` and `security-audit` workflows and record
      the findings below.
- [x] Goal 3: define the provider-neutral verified-session boundary in ADR 0004.
- [x] Map verified external subjects to opaque internal account IDs and add
      explicit uniqueness-safe account bootstrap that cannot reactivate deleted
      accounts.
- [x] Add transaction-scoped `app_user` role assumption and bound
      `app.current_user_id` propagation with commit, rollback, and pooled-state
      cleanup.
- [x] Verify unauthenticated, expired, revoked, invalid, wrong-account,
      rollback, pooling, bootstrap, and deletion behavior.
- [x] Goal 4: implement provider-neutral longitude normalization, zodiac mapping,
      minimal angular separation, data-driven aspects, orb strength, and
      applying/separating classification.
- [x] Apply `astro-validation` to exact boundaries, wraparound, symmetry, orbs,
      configuration failures, and motion classification.

## In progress

None. Start only the next goal below.

## Next goal

Goal 5 — deterministic lunar phase primitives.

Deliverables:

1. Calculate normalized lunar phase angle from validated solar and lunar
   ecliptic longitudes without an ephemeris-provider dependency.
2. Define explicit phase-sector boundaries, illumination, and Moon-age behavior
   with units and model limitations.
3. Test every 45-degree boundary, wraparound, invalid input, illumination
   extrema, and waxing/waning classification.
4. Keep event-time prediction deferred until an approved provider supplies
   time-series positions; do not approximate calendar events silently.
5. Use `lunar-validation` and record exact tolerances and provenance.

## Phase queue

| Phase | Scope                                                    | State       |
| ----- | -------------------------------------------------------- | ----------- |
| 1     | Infrastructure, architecture, database, auth, standards  | Complete    |
| 2     | Ephemeris abstraction, zodiac, aspects, Moon, numerology | In progress |
| 3     | Natal charts, transits, personal context, fixtures       | Pending     |
| 4     | Dashboard, Moon, numerology, chart, timeline UI          | Pending     |
| 5     | Interpretation library, daily reading, public horoscopes | Pending     |
| 6     | Compatibility and privacy-safe sharing                   | Pending     |
| 7     | Subscriptions, entitlements, notifications               | Pending     |
| 8     | SEO and useful public content                            | Pending     |
| 9     | Security, privacy, performance, accessibility, QA        | Pending     |
| 10    | Deployment and production verification                   | Pending     |

## Decisions

- Deterministic facts, interpretation rules, and AI prose are separate layers.
- All ephemeris access is provider-neutral from the first implementation.
- Swiss Ephemeris is a candidate, not a selected dependency. Professional or AGPL licensing must be explicitly resolved before a public integration.
- Product scoring is explainable, configurable, versioned, and explicitly non-scientific.
- The executable baseline is a single Next.js 16.3 App Router application using React 19.2, strict TypeScript, Tailwind CSS 4, and the default Node.js runtime.
- Use Vitest for deterministic unit/contract tests and GitHub Actions with Node 24 for CI.
- Use Server Components for internal reads, Server Actions for first-party mutations, and Route Handlers for external/public HTTP boundaries.
- Do not extract packages or services until an ADR 0002 extraction trigger is demonstrated.
- Authentication providers adapt to `SessionVerifier`; cookie presence and
  browser-owned identities never authorize protected server work.
- Longitudes normalize to `[0, 360)`. Zodiac and aspect calculations use
  provider-neutral degrees with no interpretation text or product weights.

## Blockers and risks

- Ephemeris provider selection remains blocked on final licensing approval, comparative fixtures, deployment fit, and operating-cost validation.
- Authentication, managed database, payment, AI, email, monitoring, and
  deployment providers remain intentionally undecided.
- Authentication-provider selection still requires sign-in methods, MFA or
  passkey requirements, account recovery, revocation semantics, pricing, data
  residency, email ownership, and deployment-fit decisions.
- Production database role provisioning, TLS, pooling, migration timeouts,
  backup/restore, and managed-provider parity remain release gates.
- Drizzle Kit has four moderate development-only audit findings through a legacy
  esbuild loader. There are no high/critical findings and the production
  dependency audit is clean; do not expose the migration tool as a network
  service, and recheck on every dependency update.
- Product name, branding, final plans, and pricing are not implementation blockers for the deterministic foundation.

## Evidence log

| Date       | Evidence                                           | Result                                                                                        |
| ---------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 2026-08-09 | Initial top-level inventory                        | Two Markdown source prompts only; no Git metadata                                             |
| 2026-08-09 | Official Codex guidance and repo skill validation  | Control paths confirmed; all eight skills passed `quick_validate.py`                          |
| 2026-08-09 | Runtime inventory                                  | Node 24.15.0, npm 11.12.1, Git 2.54.0                                                         |
| 2026-08-09 | Next.js official docs and npm registry             | Next 16.3.0 selected; project minimum Node raised to 20.19 for development-tool compatibility |
| 2026-08-09 | Astrodienst live price page and June 2026 contract | CHF 700 unlimited professional path documented; no purchase or provider selection             |
| 2026-08-09 | `npm run check`                                    | Passed Prettier, ESLint, strict TypeScript, 2 Vitest tests, and Next.js production build      |
| 2026-08-09 | `npm run test:coverage`                            | Passed; baseline runtime/contract coverage report generated                                   |
| 2026-08-09 | `npm audit --audit-level=high`                     | 0 vulnerabilities                                                                             |
| 2026-08-09 | Production runtime smoke                           | `/` and `/api/health` returned 200; health used `Cache-Control: no-store`                     |
| 2026-08-09 | `astro-validation` provider leak check             | No Swiss/provider-specific dependency or source coupling detected                             |
| 2026-08-09 | `git init -b main`                                 | Empty root repository initialized on `main`; no commit created                                |
| 2026-08-09 | Drizzle/pg primary-source and npm registry review  | Drizzle ORM 0.45.2, Kit 0.31.10, `pg` 8.23.0 selected; managed provider remains open          |
| 2026-08-09 | `npm run db:check`                                 | Checked-in migration journal and snapshots are internally consistent                          |
| 2026-08-09 | `npm run test:database`                            | PostgreSQL 18 migration passed; 7/7 constraint, index, cascade, and isolation tests passed    |
| 2026-08-09 | `npm run check`                                    | Passed formatting, ESLint, strict TypeScript, 2 unit/contract tests, and production build     |
| 2026-08-09 | `npm run test:coverage`                            | Passed; scoped baseline application/domain coverage remains 100%                              |
| 2026-08-09 | `npm audit --audit-level=high`                     | No high or critical findings; four accepted moderate Drizzle Kit development-tool findings    |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | GitHub repository orientation                      | Empty public `hbkdad/astroligyapp` configured as `origin`; authenticated as `hbkdad`; no push |
| 2026-08-09 | Auth.js, Better Auth, and Clerk primary docs       | Provider selection deferred; server-verified active-session port recorded in ADR 0004         |
| 2026-08-09 | `npm run test:database`                            | PostgreSQL 18 migration passed; 10/10 migration, isolation, auth, rollback, and pooling tests |
| 2026-08-09 | `npm run check`                                    | Passed formatting, ESLint, strict TypeScript, 33 tests, and Next.js production build          |
| 2026-08-09 | `npm run test:coverage`                            | 97.77% statements/lines, 90.9% branches, and 100% functions in scoped application/domain code |
| 2026-08-09 | `astro-validation` zodiac/aspect suite             | Exact boundaries, wraparound, symmetry, orb edges, closest match, and motion phases passed    |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |

## Goal 2 migration and security review

- Assets: identity references, profiles, exact birth inputs, deterministic
  calculations, readings, compatibility data, subscriptions, notifications,
  and privacy-safe audit metadata.
- Actors and trust boundary: the database owner applies migrations only;
  application requests use `app_user`; verified server authentication will set
  a transaction-local opaque user UUID; browsers never set database identity.
- Migration risk: initial empty schema, so no backfill, compatibility window,
  table rewrite, or production lock occurred. Applied migration files are
  immutable; recovery is backup restore or a reviewed forward-fix migration.
- Authorization result: default deny without identity passed. Owner A could not
  read, insert for, update, or delete Owner B records, including derived child
  data. No critical or high security finding remains.
- Residual risk: no production provider, production authentication adapter,
  managed connection pool, backup restore, public-share boundary, or deployment
  has been exercised. Production migration was intentionally not run.

## Goal 3 authentication and security review

- Assets and trust boundary: external subjects and sessions remain inside the
  server authentication adapter. Only opaque internal UUIDs reach private
  database policies. Protected entry points accept a `SessionVerifier` result,
  never cookie existence or browser-supplied ownership.
- Authorization result: unauthenticated, expired, revoked, invalid-date,
  oversized, and future-issued claims fail closed with the same generic error.
  Wrong-account reads return no rows. Failed mutations roll back, and a
  single-connection pool returns to its login role with no request identity.
- Database migration result: no schema or policy mutation was needed. Existing
  migrations remain immutable; the prior two-owner RLS suite still passes.
- Findings: no critical or high issue remains. No protected HTTP mutation,
  cookie, CSRF surface, callback, password, secret, auth package, or production
  provider exists yet, so those controls remain future provider-integration
  gates. The privileged account lookup/bootstrap pool must remain isolated from
  request-owned SQL.

## Goal 4 astro-validation record

- Contract: pure ecliptic longitude geometry in degrees. No time scale,
  timezone, observer, ephemeris provider, coordinate origin, or astronomical
  fixture is involved.
- Boundaries: `0`, every exact and just-below 30-degree sign boundary,
  `359.999999`, negative and multi-revolution input, angular zero wraparound,
  exact aspects, exact/inside/outside orbs, symmetry, and invalid configuration.
- Comparison behavior: containment uses exact numeric `<=` orb comparisons;
  normalization-only floating assertions use 12 decimal places. Motion phase is
  derived by comparing current orb with a 0.0001-day forward step when both
  longitudinal speeds are supplied; otherwise phase is `unknown`.
- Provenance: expected values come directly from the documented modular-angle
  formulas, not an AI or ephemeris fixture. Interpretations and product weights
  remain outside the calculation functions.
