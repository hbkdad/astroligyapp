# Project status

Last updated: 2026-08-09

## Current position

Status: Goal 13 complete; the immutable combined personal-context fact aggregate is implemented and verified.

The project now has the portable application baseline plus a PostgreSQL 18
contract, Drizzle ORM/Kit, a typed 20-table normalized schema, checked-in SQL
migrations, forced row-level security on 19 private tables, a server-only
verified-session boundary, identity-scoped transactions, account bootstrap,
deterministic zodiac/aspect primitives, lunar phase geometry, a traceable
Pythagorean numerology strategy, and a strict ephemeris adapter validation
boundary. Astronomy Engine 2.1.19 plus Whole Sign strategy 1.0.0 is selected for
the launch ephemeris boundary, and the natal engine now composes validated
placements, houses, and aspects with complete calculation provenance. No
production data, managed database,
authentication, billing, AI, notification, location-resolution, or deployment
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

## Recently completed

- [x] Goal 13: compose the natal chart, current transit snapshot, personal lunar
      snapshot, and all nine deterministic numerology results into one
      deep-cloned, deep-frozen fact aggregate.
- [x] Enforce cross-component natal/transit/lunar provenance plus the numerology
      calendar date resolved from the current UTC instant in the natal IANA
      timezone.
- [x] Generate stable unique references for natal placements/aspects, transit
      aspects, lunar phase/personal aspects, and numerology facts.
- [x] Keep prose, interpretation keys, category weights, scoring, AI,
      persistence, entitlements, and delivery outside the aggregate.
- [x] Goal 12: derive current lunar phase/sign facts and Moon-to-natal
      planet/ASC/MC aspects from one validated transit snapshot without another
      provider request or natal recalculation.
- [x] Preserve the lunar, transit, aspect-policy, provider, and complete natal
      provenance needed to reproduce the snapshot.
- [x] Match JPL-derived J2000 Moon-minus-Sun geometry within the combined source
      tolerance and reuse the existing exact phase-boundary suite.
- [x] Keep illumination and mean-cycle age explicitly approximate; defer event
      searches, rise/set, scoring, interpretation, persistence, and alerts.
- [x] Goal 11: compare every validated current body against canonical natal
      planets plus Ascendant and Midheaven targets using the versioned major
      aspect policy.
- [x] Preserve the current sky input/result, natal input/metadata, transit engine
      version, complete aspect definitions, orb, strength, and motion phase.
- [x] Require observer/source provenance for topocentric snapshots and require
      location-free inputs for geocentric snapshots.
- [x] Limit the result to instantaneous facts; do not fabricate start, peak, or
      end windows and do not add scores, categories, prose, persistence, or
      notification behavior.
- [x] Goal 10: build a provider-neutral natal-chart aggregate for all ten
      supported celestial bodies, Whole Sign houses, zodiac placements,
      planet-house placements, and unique major aspects.
- [x] Preserve the resolved UTC instant, IANA timezone and resolution source,
      geodetic observer and coordinate source, coordinate origin, house system,
      provider/data metadata, and chart/house/aspect policy versions.
- [x] Add one combined Zollikon acceptance case with JPL Horizons positions and
      independently published Swiss Ephemeris 2.10.3.5 house angles/cusps.
- [x] Keep interpretations, AI, scoring, database access, and persistence out of
      the natal calculation path.
- [x] Goal 9: select tropical positions plus composed Whole Sign houses as the
      first-release ephemeris capability boundary.
- [x] Derive Ascendant and Midheaven through Astronomy Engine 2.1.19 local
      coordinate rotations and keep cusp derivation in a versioned,
      provider-neutral strategy.
- [x] Match the published Swiss Ephemeris 2.10.3.5 angle fixture within the
      fixed 0.01° tolerance and cover all sign boundaries and wraparound.
- [x] Reject sidereal and unimplemented house systems explicitly; support high
      latitudes but return `data-unavailable` at exact geographic poles without
      substituting a different system.

## In progress

None. Start only the next goal below.

## Next goal

Goal 14 — build the deterministic interpretation-key projection and library contract.

Deliverables:

1. Map validated context facts to versioned interpretation keys without
   changing, inventing, or recalculating any astronomical/numerological value.
2. Define a deterministic template-library contract with explicit factual and
   tradition-framed interpretation sections plus unsupported-key behavior.
3. Add claim-safety rules that prohibit medical, legal, financial, safety, or
   deterministic relationship directives and keep AI entirely optional.
4. Return structured render data before prose composition; do not add category
   scoring, persistence, entitlements, or delivery yet.

## Phase queue

| Phase | Scope                                                    | State    |
| ----- | -------------------------------------------------------- | -------- |
| 1     | Infrastructure, architecture, database, auth, standards  | Complete |
| 2     | Ephemeris abstraction, zodiac, aspects, Moon, numerology | Complete |
| 3     | Natal charts, transits, personal context, fixtures       | Complete |
| 4     | Interpretation and personal dashboard foundation         | Next     |
| 5     | Interpretation library, daily reading, public horoscopes | Pending  |
| 6     | Compatibility and privacy-safe sharing                   | Pending  |
| 7     | Subscriptions, entitlements, notifications               | Pending  |
| 8     | SEO and useful public content                            | Pending  |
| 9     | Security, privacy, performance, accessibility, QA        | Pending  |
| 10    | Deployment and production verification                   | Pending  |

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

- Production-host deployment fit and performance for the selected composed
  ephemeris provider remain release gates.
- Next New/Full Moon times, rise/set, altitude/azimuth, and personal lunar event
  windows remain deferred until validated time-series and location-aware
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
| 2026-08-09 | Personal context focused suite                     | 6/6 composition, immutability, timezone, mismatch, ID, and numerology validation tests passed |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 197 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 95.59% statements, 92.07% branches, 100% functions, and 95.42% lines                          |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | Personal lunar focused suite                       | 5/5 reuse, JPL phase, provenance, and malformed-snapshot tests passed                         |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 191 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 95.01% statements, 90.68% branches, 100% functions, and 94.82% lines                          |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | `npx vitest run tests/transit-snapshot.test.ts`    | 9/9 transit snapshot tests passed; dual-source and failure cases covered                      |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 186 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 94.84% statements, 90.44% branches, 100% functions, and 94.64% lines                          |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | JPL Horizons natal fixture capture                 | 10/10 Zollikon topocentric body rows stored with URLs, raw one-minute rows, UTC, and observer |
| 2026-08-09 | `npx vitest run tests/natal-chart.test.ts`         | 9/9 composition, provenance, dual-source fixture, no-speed, and provider-failure tests passed |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 177 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 94.24% statements, 89.27% branches, 100% functions, and 94.01% lines                          |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | Whole Sign focused deterministic suite             | 46/46 strategy, conformance, reference-angle, polar, and explicit-failure tests passed        |
| 2026-08-09 | pysweph / Swiss Ephemeris 2.10.3.5 reference       | ASC and MC matched the published two-decimal values within the fixed 0.01 degree tolerance    |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 158 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 93.2% statements, 88.09% branches, 100% functions, and 93.04% lines                           |
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

## Goal 9 astro-validation record

- Contract: UTC instants, geodetic longitude east-positive, degrees, tropical
  ecliptic-of-date longitudes normalized to `[0, 360)`, topocentric local
  angles, Whole Sign cusps, Astronomy Engine 2.1.19, and strategy 1.0.0.
- Reference: published pysweph tutorial output backed by Swiss Ephemeris
  2.10.3.5 for 1997-09-30 14:00 UTC at 47.33 N, 8.58 E. Expected Ascendant
  290.44° and Midheaven 230.38° use a fixed 0.01° tolerance because the source
  is rounded to two decimals. Cusp one begins at 270° and advances by exact
  30° increments.
- Boundaries: every exact 30° sign boundary, each boundary minus 1e-9°, zero,
  359.999999°, negative input, and more than one revolution are covered. All
  output cusps remain normalized.
- Failure policy: sidereal output and every non-Whole-Sign system fail as
  unsupported. Whole Sign works at tested latitude 89°; exact +/-90° returns
  `data-unavailable`. No Porphyry or other silent fallback exists.
- Decision: ADR 0006 selects composed Astronomy Engine positions/local angles
  plus a provider-neutral Whole Sign strategy. Swiss installation and licensing
  are not required for the launch boundary.

## Goal 10 astro-validation record

- Contract: input retains a strict UTC instant, valid IANA timezone and its
  resolution source, east-positive geodetic observer and coordinate source,
  selected geocentric/topocentric position origin, tropical zodiac, and Whole
  Sign system. Output degrees remain normalized to `[0, 360)`.
- Composition: all ten provider-validated bodies are restored to canonical
  order, mapped to zodiac positions and houses, then compared once per unique
  body pair using the versioned major-aspect policy. Applying/separating state
  uses provider speeds when both exist and is explicitly `unknown` otherwise.
- Reproducibility: output retains chart engine 1.0.0, Whole Sign strategy 1.0.0,
  major-aspect policy 1.0.0 with its complete definitions, both provider
  metadata records, the normalized birth inputs, and a calculation timestamp.
- Reference: 1997-09-30 14:00 UTC at 47.33 N, 8.58 E combines ten newly captured
  JPL Horizons API 1.3 topocentric ecliptic-of-date position rows with the
  published Swiss Ephemeris 2.10.3.5 Ascendant 290.44 degrees, Midheaven 230.38
  degrees, and exact Whole Sign cusps. Fixed tolerances remain 0.02 degrees for
  planetary longitude and 0.01 degrees for the two-decimal house angles.
- Boundaries and failures: house assignment covers cusp equality, values just
  below cusps, zero wraparound, negative input, more than one revolution,
  unequal cusp arcs, invalid cusp order, invalid timezone/source provenance,
  invalid aspect configuration, missing speeds, and both position and house
  provider failures. No partial or fabricated chart is returned.
- Scope: no natal persistence, interpretation, AI, product weighting, or score
  calculation was introduced.

## Goal 11 astro-validation record

- Contract: a strict current UTC instant and explicit geocentric or topocentric
  origin feed one validated all-body position request. Topocentric requests
  require an east-positive geodetic observer plus coordinate source;
  geocentric requests omit both. Output remains tropical ecliptic-of-date
  degrees normalized to `[0, 360)`.
- Targets: each current body is compared in canonical order against all ten
  canonical natal bodies plus stable `natal:angle:ascendant` and
  `natal:angle:midheaven` identifiers. Each current/target pair appears at most
  once.
- Motion: natal planets and angles are fixed targets, so phase classification
  uses current provider speed against zero target speed. Missing current speed
  remains `unknown` through the shared aspect contract; no motion is invented.
- Reproducibility: the snapshot retains its current input, complete validated
  current `PositionResult`, natal input and calculation metadata, transit engine
  1.0.0, major-aspect policy 1.0.0, complete orb definitions, and calculation
  timestamp.
- Reference: the published/captured 1997 Zollikon natal fixture is compared with
  the JPL Horizons API 1.3 J2000 Greenwich current fixture. All current
  longitudes retain the fixed 0.02-degree provider tolerance. Robust cross-case
  checks include transiting Venus conjunct natal Mars and transiting Neptune
  sextile natal Pluto; their expected orbs use a 0.05-degree aggregate budget
  because each endpoint has its own 0.02-degree source tolerance.
- Boundaries and failures: wraparound conjunctions cover applying and separating
  motion; exact angle aspects, invalid/missing/duplicate natal targets, invalid
  natal angles, invalid observer provenance, explicit geocentric behavior, and
  current-provider failure are covered. No partial facts or event-window
  approximation is returned.
- Scope: start/peak/end searches, weights, scores, categories, interpretation,
  persistence, notification, and AI remain absent.

## Goal 12 lunar-validation record

- Commands: `npx vitest run tests/personal-lunar-snapshot.test.ts`,
  `npm run check`, `npm run test:coverage`, and `npm audit --omit=dev`.
- Source boundary: no new astronomy request occurs. The snapshot reuses the
  transit result's provider-validated tropical, topocentric,
  ecliptic-of-date Sun and Moon longitudes plus its already calculated
  Moon-to-natal aspects. Natal placements are referenced, never recalculated.
- Geometry: phase angle remains normalized Moon minus Sun longitude in degrees.
  Phase label, Moon sign, approximate illuminated fraction, estimated mean-cycle
  age, cycle progress, and waxing/waning state come from lunar phase engine
  1.0.0. Exact anchors, both sides of classification boundaries, zero
  wraparound, monotonic illumination samples, and non-finite inputs remain in
  the shared lunar suite.
- Reference: JPL Horizons API 1.3 J2000 Greenwich rows give Sun 280.368801
  degrees and Moon 223.0845542 degrees, producing source phase angle
  302.7157532 degrees. The aggregate acceptance budget is 0.04 degrees because
  each endpoint retains the fixed 0.02-degree provider tolerance. The result is
  waning crescent with the Moon in tropical Scorpio.
- Reproducibility: personal lunar version 1.0.0, lunar phase engine 1.0.0,
  transit engine/version/timestamp, complete aspect policy, current provider
  metadata, transit input, and natal input/calculation metadata are retained.
- Failure policy: mismatched current instant/origin/zodiac metadata and missing
  or duplicate Sun/Moon positions throw before any derived result. No plausible
  replacement is generated.
- Approximation and scope: illumination is geometric and Moon age uses the
  explicitly labeled mean synodic month. Neither is an event ephemeris. Next
  phases, rise/set, altitude/azimuth, aspect windows, scores, interpretations,
  persistence, notifications, and AI remain absent.

## Goal 13 context and numerology validation record

- Commands: `npx vitest run tests/personal-context.test.ts
tests/numerology.test.ts tests/personal-lunar-snapshot.test.ts`,
  `npm run check`, `npm run test:coverage`, and `npm audit --omit=dev`.
- Composition: the aggregate accepts existing validated natal, transit, and
  personal-lunar components and caller-supplied numerology results. It performs
  no astronomy request and changes no upstream calculation value.
- Consistency: transit natal input/metadata must match the supplied natal chart;
  the supplied lunar phase, Moon position, lunar aspects, provider metadata,
  transit metadata, aspect policy, and natal provenance must reproduce from the
  supplied transit snapshot. Mismatches fail instead of being silently replaced.
- Numerology convention: all nine required results use one Pythagorean strategy
  ID/version. The existing version 1.0.0 convention preserves configured
  11/22/33 values, uses the existing explicit Latin normalization and default
  consonant-Y policy, and retains non-empty tokens and reduction traces. No
  arithmetic or normalization rule changed.
- Calendar basis: cycle results are selected for the local calendar date of the
  current UTC instant in the natal IANA timezone. The fixture proves that
  2000-01-01 02:00 UTC resolves to 1999-12-31 in America/Toronto; a UTC-date
  Personal Day is rejected for that context.
- Output: context version 1.0.0 retains every complete component plus strategy
  provenance, generates ordered unique calculation fact IDs, clones the input
  graph, and recursively freezes the clone. Equal deterministic inputs yield
  equal ordered fact IDs even though calculation timestamps differ.
- Scope: the IDs have no embedded meaning. Interpretation, explanation keys,
  categories, heuristic scores, AI, persistence, entitlements, and delivery
  remain absent.

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
