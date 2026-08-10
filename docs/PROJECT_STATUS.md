# Project status

Last updated: 2026-08-09

## Current position

Status: Goal 8 complete; independent JPL fixtures and a positions-only candidate spike verified.

The project now has the portable application baseline plus a PostgreSQL 18
contract, Drizzle ORM/Kit, a typed 20-table normalized schema, checked-in SQL
migrations, forced row-level security on 19 private tables, a server-only
verified-session boundary, identity-scoped transactions, account bootstrap,
deterministic zodiac/aspect primitives, lunar phase geometry, a traceable
Pythagorean numerology strategy, and a strict ephemeris adapter validation
boundary. No production data, managed database,
authentication, billing, AI, notification, ephemeris, or deployment provider is
selected.

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
- [x] Goal 5: derive normalized lunar phase angle, eight phase sectors,
      approximate illumination, estimated mean-cycle age, waxing/waning state,
      and Moon zodiac position from supplied ecliptic longitudes.
- [x] Apply `lunar-validation` to exact anchors, both sides of sector boundaries,
      cycle wraparound, illumination extrema/monotonicity, invalid inputs, and
      explicit approximation limits.
- [x] Goal 6: implement versioned Pythagorean Life Path, Expression, Soul Urge,
      Personality, Birthday, Maturity, Personal Year, Personal Month, and
      Personal Day calculations with reconstructable traces.
- [x] Define explicit Latin Unicode normalization, unsupported-character
      failures, configurable Y treatment, and configurable 11/22/33 preservation.
- [x] Apply `numerology-validation` to A-Z mapping, master numbers, date
      components, leap/zero-containing dates, Unicode, punctuation, empty
      categories, and calendar boundaries.
- [x] Goal 7: add strict ephemeris request/result/error validation and reusable
      provider conformance tests covering completeness, normalization,
      metadata, documented failures, and no silent fallback.
- [x] Define versioned provider-independent UTC/location fixture inputs,
      coordinate conventions, source-capture rules, and provisional acceptance
      tolerances without fabricating astronomical expected values.
- [x] Compare Swiss Ephemeris, Astronomy Engine, JPL Horizons, and NAIF SPICE
      for license, runtime, operations, houses, and cost fit.
- [x] Accept ADR 0005 to defer selection behind concrete accuracy, house,
      deployment, operating-cost, and licensing approval gates.
- [x] Goal 8: install exact Astronomy Engine 2.1.19 as an unselected evaluation
      dependency and isolate it behind `EphemerisProvider`.
- [x] Capture 40 topocentric body/case comparisons from JPL Horizons API 1.3
      with complete request URLs, raw rows, versions, coordinates, and UTC inputs.
- [x] Pass every declared longitude, latitude, and longitudinal-speed tolerance;
      omit optional distance after it failed the independent distance budget.
- [x] Prove explicit sidereal and house capability failures, topocentric observer
      handling, package metadata, and shared conformance behavior.

## In progress

None. Start only the next goal below.

## Next goal

Goal 9 — complete ephemeris capability and house-system decision.

Deliverables:

1. Define the exact tropical/sidereal product requirement and supported house
   systems, including polar-location failure behavior.
2. Compare a separately validated house implementation or full-provider
   candidate against sourced cusp/angle fixtures; do not use JPL as a house
   oracle.
3. Decide whether a composed positions-plus-houses architecture is acceptable or
   whether one full provider is required.
4. Resolve the Swiss commercial-versus-AGPL approval only if Swiss remains the
   preferred complete candidate.
5. Record the selected capability boundary and fallback policy before natal or
   transit persistence begins.

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
- Next New/Full Moon times, rise/set, altitude/azimuth, and personal lunar
  transits remain deferred until validated time-series and location-aware
  provider capabilities exist. Mean-cycle age must not be used as an ephemeris.
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
| 2026-08-09 | JPL Horizons API 1.3 fixture capture               | 40 topocentric body/case results stored with request URLs and raw rows                        |
| 2026-08-09 | Astronomy Engine 2.1.19 focused suite              | 14/14 conformance, JPL tolerance, capability, and failure tests passed                        |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 126 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 93.04% statements, 88.09% branches, 100% functions, and 92.88% lines                          |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | `git commit` / `git push origin main`              | Foundation checkpoint `d224cc4` published to `origin/main`                                    |
| 2026-08-09 | NASA Science and USNO lunar documentation          | Eight-phase sequence, longitude anchors, illumination meaning, and 29.53059-day mean sourced  |
| 2026-08-09 | `npx vitest run tests/lunar-phase.test.ts`         | 23/23 focused lunar geometry tests passed                                                     |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, types, 56 tests, and production build                                |
| 2026-08-09 | `npm run test:coverage`                            | 98.03% statements/lines, 92.3% branches, and 100% functions                                   |
| 2026-08-09 | `npx vitest run tests/numerology.test.ts`          | 30/30 focused normalization, reduction, master-number, and cycle tests passed                 |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, types, 86 tests, and production build                                |
| 2026-08-09 | `npm run test:coverage`                            | 98.78% statements, 94.68% branches, 100% functions, and 98.74% lines                          |
| 2026-08-09 | GitHub repository orientation                      | Empty public `hbkdad/astroligyapp` configured as `origin`; authenticated as `hbkdad`; no push |
| 2026-08-09 | Auth.js, Better Auth, and Clerk primary docs       | Provider selection deferred; server-verified active-session port recorded in ADR 0004         |
| 2026-08-09 | `npm run test:database`                            | PostgreSQL 18 migration passed; 10/10 migration, isolation, auth, rollback, and pooling tests |
| 2026-08-09 | `npm run check`                                    | Passed formatting, ESLint, strict TypeScript, 33 tests, and Next.js production build          |
| 2026-08-09 | `npm run test:coverage`                            | 97.77% statements/lines, 90.9% branches, and 100% functions in scoped application/domain code |
| 2026-08-09 | `astro-validation` zodiac/aspect suite             | Exact boundaries, wraparound, symmetry, orb edges, closest match, and motion phases passed    |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | `astro-validation` ephemeris conformance suite     | 26/26 focused request, output, metadata, failure, and no-fallback tests passed                |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 112 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 92.38% statements, 87.61% branches, 100% functions, and 92.2% lines                           |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |

## Goal 7 astro-validation record

- Boundary: strict UTC `Z` instants, declared bodies, observer ranges, zodiac
  reference, coordinate origin, normalized ecliptic-of-date output, and exact
  provider/data provenance. Invalid requests fail before dispatch.
- Output policy: every requested body appears exactly once; non-finite or
  out-of-range values, mismatched metadata, unexpected fields, incomplete
  results, malformed error objects, and thrown provider diagnostics fail closed.
  Operational diagnostics are replaced by privacy-safe contract errors.
- Shared harness: every candidate must run request, complete-position,
  12-house-cusp, all documented error-code, thrown-failure, and no-silent-
  fallback cases. The fixture provider proves the harness only; its synthetic
  values are not astronomical evidence.
- Reference inputs: four versioned UTC/location cases cover J2000, modern,
  date-boundary, southern-hemisphere, and high-latitude behavior. Goal 8 has now
  supplied their reproducible JPL Horizons expected values.
- Decision: no provider or package was selected. ADR 0005 evaluates Astronomy
  Engine first for positions, keeps JPL Horizons as the independent reference,
  and retains Swiss Ephemeris behind explicit commercial-or-AGPL approval.

## Goal 8 astro-validation record

- Source: JPL Horizons API 1.3 (2025 June), quantities 20 and 31, UT instants,
  topocentric `coord@399` geodetic observers, IAU76/80 ecliptic-of-date output,
  and ten explicit target IDs. Every checked-in value retains its request URL
  and both one-minute raw source rows.
- Candidate: exact MIT-licensed `astronomy-engine` 2.1.19, 1.84 MB unpacked,
  isolated under infrastructure. No package type enters the domain contract and
  the application does not yet instantiate this provider in a production path.
- Accuracy: 40/40 body/case comparisons met `0.02°` longitude/latitude and
  `0.001°/day` one-minute forward speed budgets, including circular wraparound.
  Candidate distance exceeded the independent `0.000001 AU` budget in some
  cases, so the optional field is omitted rather than the tolerance being
  weakened.
- Capability: tropical geocentric/topocentric positions pass. Sidereal output
  and house cusps fail explicitly as unsupported. The package is not selected
  as the complete provider; Goal 9 must resolve house and sidereal requirements.

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

## Goal 5 lunar-validation record

- Inputs and units: provider-supplied apparent ecliptic solar and lunar
  longitudes in degrees are required. The calculation has no instant, timezone,
  observer location, atmosphere, rise/set, altitude, or provider assumption.
- Formula: phase angle is `(moonLongitude - sunLongitude + 360) % 360`.
  Eight labels use 45-degree sectors centered on the USNO primary anchors at
  `0`, `90`, `180`, and `270` degrees and the intermediate NASA phase sequence.
- Illumination: `(1 - cos(phaseAngle)) / 2` is exposed as an approximate
  geometric fraction. Tests use 12-decimal tolerance at New, quarters, and Full
  and prove monotonic increase/decrease on both halves of the cycle.
- Age: `phaseAngle / 360 * 29.53059 days` uses NASA's published mean synodic
  month and is explicitly an estimate, not a production ephemeris or event-time
  predictor.
- Provenance retrieved 2026-08-09: NASA Science `Moon Phases`, NASA GSFC
  `Eclipses and the Moon's Orbit`, and USNO `Phases of the Moon and Percent of
the Moon Illuminated`. No AI-derived or unsourced dated fixture was used.

## Goal 6 numerology-validation record

- Strategy: `pythagorean` version `1.0.0`, using component reduction for dates.
  The default preserves `11`, `22`, and `33` at every reduction; a strategy
  option reduces all masters for traditions that do not preserve them.
- Names: each original Unicode code point is NFKD-normalized, combining marks
  are removed, Latin A-Z is uppercased and mapped, whitespace/punctuation is
  ignored, and unsupported letters, numbers, or symbols fail explicitly with a
  code-point error. Empty normalized names or empty selected vowel/consonant
  categories fail.
- Vowels: `A E I O U`; Y is a consonant by default and can be configured as a
  vowel. No contextual-Y rule is claimed.
- Calendar basis: strict proleptic Gregorian `YYYY-MM-DD` plain dates with no
  instant or timezone conversion. Personal cycles change at the supplied local
  calendar year/month/day boundaries.
- Hand fixtures: `1990-07-15` reduces to Life Path 5 and Birthday 6;
  `Pythagoras` produces Expression 4, Soul Urge 8, Personality 5, and Maturity
  9 under default Y handling. The 2025 personal-year total 22 is preserved by
  the declared convention. Every result carries normalized tokens, operations,
  strategy ID, and version; no interpretive meaning is embedded.
