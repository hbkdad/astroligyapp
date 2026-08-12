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
- House calculation: Astronomy Engine supplies local geometric angles and a
  provider-neutral, versioned strategy derives cusps. Tropical Whole Sign is
  the only launch strategy; unsupported systems fail explicitly. See ADR 0006.
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
- `LunarEventSearch`: provider-neutral application service for one requested
  Moon-sign ingress or primary phase in a bounded UTC interval. It searches
  validated Moon or Sun/Moon positions for one increasing signed crossing and
  refines only through further provider observations. Mean-cycle age never
  supplies an event time; incomplete, reverse, ambiguous, inconsistent, or
  under-refined searches fail explicitly with every evaluation retained.
- `StationEventSearch`: provider-neutral application service for one requested
  direct-to-retrograde or retrograde-to-direct longitudinal-speed crossing. It
  requires provider-supplied degrees/day, refines a signed bracket through
  provider observations, and retains the complete bracket/evaluation trace.
  Longitude differences never replace absent speed; wrong-direction, incomplete,
  ambiguous, inconsistent, and under-refined searches fail explicitly.
- `NatalChartEngine`: application-level deterministic composition of all ten
  validated positions, Whole Sign angles/cusps, zodiac placements,
  planet-in-house assignments, and unique major aspects. The result retains the
  resolved UTC instant, IANA timezone and source, coordinates and source,
  coordinate origin, provider metadata, and calculation-policy versions; it
  contains no interpretation, score, AI, or persistence behavior.
- `TransitSnapshotEngine`: application-level comparison of a validated current
  sky against canonical natal planet, Ascendant, and Midheaven targets. It
  returns instantaneous major-aspect facts and preserves natal/current
  provenance. Geocentric snapshots omit location; topocentric snapshots require
  an observer and coordinate source. Weighting, interpretation, persistence,
  and notification remain outside this engine.
- `TransitEventWindowSearch`: separate provider-neutral application service for
  one explicitly requested personal aspect over a bounded UTC interval. It
  requires a complete sampled window and exact signed branch crossing, then
  refines entry/peak/exit with provider evaluations only. All evaluated instants
  and calculation versions remain in the result; incomplete, ambiguous,
  inconsistent, or under-refined searches fail explicitly.
- `PublicDailyReadingEngine`: application-level composition of one canonical
  UTC-noon geocentric tropical sky for a strict Gregorian plain date into twelve
  ordered sign-model readings. Each sign uses its tropical midpoint as an
  explicitly declared non-personal comparison target, reuses the same lunar
  geometry, and maps facts to a separate versioned public interpretation
  library. Only a date is accepted; birth, profile, observer, account, scoring,
  AI, persistence, routing, and delivery concerns are excluded. Provider,
  calculation, aspect, projection, library, locale, and sampling conventions
  remain in the deeply frozen result.
- `PublicDailyReadingLoader`: server-only orchestration over an injected trusted
  UTC clock, provider expectation, public engine, and bounded cache contract. It
  accepts no request data, builds a version-complete date/configuration key,
  validates cached aggregates through all twelve read models, coalesces identical
  misses, and expires entries by bounded TTL or UTC rollover. Source and cache
  details map to generic public failures; cache write failure is an explicit
  fresh-result status. Routes remain outside this boundary.
- `composeTimelineFacts`: provider-free, deep-frozen composition of validated
  personal transit windows, lunar events, planetary stations, and explicit
  numerology year/month/day boundaries over one half-open UTC display interval.
  It retains complete source results, normalizes instant/window occurrences,
  proves supplied numerology instants are local midnight in their declared IANA
  timezone, and enforces stable identity and chronological/type/ID ordering.
  Interpretation, scoring, UI, persistence, entitlements, and notifications stay
  downstream.
- `derivePersonalLunarSnapshot`: provider-free derivation from a validated
  transit snapshot. It combines current Sun/Moon phase geometry and Moon zodiac
  placement with the existing Moon-to-natal planet/ASC/MC aspects, while
  retaining lunar, transit, natal, provider, and aspect-policy provenance.
  Approximate illumination and mean-cycle age remain labeled estimates; event
  prediction and location-dependent rise/set data are absent.
- `composePersonalContext`: provider-free, deep-frozen composition of the natal,
  transit, personal-lunar, and complete deterministic numerology results. It
  verifies cross-component provenance and resolves the numerology calendar date
  from the current UTC instant in the natal IANA timezone. Stable fact IDs are
  calculation references only; interpretation, category weighting, AI,
  entitlements, persistence, and delivery remain downstream concerns.
- Interpretation projection: every context fact maps exactly once to a stable,
  specific interpretation key, a generic template-family key, and raw
  structured parameters. The versioned deterministic library keeps factual and
  tradition-framed sections separate, validates claim safety even for custom
  library implementations, and returns explicit unsupported-key results. It
  does not render prose or invoke AI. See `docs/CONTENT_SAFETY.md`.
- `renderInterpretations`: application-level, versioned, deterministic
  plain-text rendering from validated projection/template pairs. It requires an
  exact declared-parameter match, uses invariant primitive formatting, rejects
  unsafe markup and malformed values, and emits fact and tradition sections
  with complete source/library/locale/renderer provenance. Unsupported
  templates return a fixed non-AI fallback record instead of invented content.
- `calculatePersonalCategoryScores`: application-level matching of validated
  fact projections against a separately versioned product configuration. Every
  bounded 0-100 heuristic retains its baseline, raw contribution sum,
  confidence formula, source fact IDs, and complete contributing-rule trace.
  Model changes cannot affect calculation facts or interpretation prose. See
  `docs/CATEGORY_MODEL.md`.
- `composeDailyReading`: versioned application payload combining the immutable
  context, deterministic rendered sections, category traces, and a stable
  top-five signal ordering. It rechecks fact coverage and all child versions;
  no persistence, delivery, AI, or UI concern enters the composition boundary.
- Dashboard presentation: `sourceFromDailyReading` narrows the Goal 17 payload
  into a versioned, immutable read model before React rendering. Components
  perform no calculations, scoring, or interpretation. The current page uses
  explicitly labeled synthetic local data only and provides semantic text
  equivalents for category meters and the decorative Moon graphic.
  Goal 27 additionally requires a Goal 24 timeline read model: the mapper validates
  identity/version/order, selects facts at or after the reading instant, exposes
  the first as `nextEvent`, and maps the following three into `timelinePreview`
  without recalculation or duplication.
- Timeline presentation: `toTimelineReadModel` accepts only a Goal 23 timeline
  aggregate, rechecks its version, interval, identity, range, source trace, and
  published ordering, then maps immutable instant/window display records. The
  client filters only visibility while preserving item order; the ordered cards
  and synchronized table are equivalent representations. The `/timeline` route
  uses explicitly labeled local calculated demo data and performs no calculation
  in React.
- Moon presentation: `toMoonReadModel` accepts one validated personal-lunar
  snapshot plus Goal 23 lunar facts, rechecks lunar ranges, Moon-only personal
  aspects, chronology, identity, and source versions, then produces immutable
  current/aspect/upcoming display records. The `/moon` route calculates only its
  explicit local demo before presentation. Approximate illumination and
  mean-cycle age stay labeled, provider-refined event times remain distinct, and
  location-dependent rise/set is unavailable rather than inferred.
- Numerology presentation: `toNumerologyReadModel` accepts only version-matched,
  traced Pythagorean core results plus Goal 23 cycle-boundary facts. It preserves
  normalized tokens, operations, master-number flags, local dates/timezones, and
  stable IDs in immutable display records; React performs no reduction and adds
  no traditional meaning.
- Public horoscope presentation: `toPublicHoroscopeReadModel` accepts only the
  complete Goal 28 aggregate plus one canonical sign, rechecks date/sample,
  all-sign order and identity, shared lunar geometry, transit order, provider and
  content versions, exact fact coverage, and claims-safe renderer provenance.
  Twelve allowlisted `/horoscope/[sign]` paths are statically generated and
  incrementally revalidated every 900 seconds from one current UTC aggregate.
  A server-only factory owns the selected local adapter, exact version
  expectation, trusted clock, and bounded process cache. The paths remain
  noindex; React receives only the immutable read model and performs no
  calculation, interpretation, scoring, personalization, or provider access.
- Natal-chart presentation: `toNatalChartReadModel` accepts only a validated
  `NatalChart`, rechecks normalized facts and trace completeness, and maps them
  into a versioned immutable SVG/table model. `pointAtLongitude` owns only the
  declared visual coordinate system; it is not ephemeris or zodiac logic. The
  chart component provides a complete table representation and keyboard links
  from each SVG body to its exact placement row.
- Compatibility facts: `CompatibilityStrategy` is provider-neutral. Phase-one
  comparison accepts canonical tropical signs plus traced, version-matched
  numerology results and returns only symmetric sign/element/modality and Life
  Path/Expression pair facts. It validates but never republishes numerology
  tokens or traces that can contain names or dates. `SynastryAspectEngine`
  independently revalidates two natal results, strips raw birth/house inputs,
  canonicalizes the remaining versioned placement facts, and evaluates the full
  cross-body aspect matrix without provider access. `HouseOverlayEngine` reuses
  that validation/canonicalization boundary and maps both canonical ten-body sets
  into the opposite chart's Whole Sign cusps. Both derived placement and cusp
  traces remain private relationship data. `composeCompatibilityFacts` strictly
  revalidates all three result types, proves the overlay placements are the exact
  speed-minimized synastry sources, binds canonical Sun signs to the phase-one
  pair, and preserves the complete facts in a symmetric immutable aggregate.
  `calculateCompatibilityCategoryScores` independently revalidates that aggregate
  and evaluates only an injected, versioned policy. Category bounds, baselines,
  selectors, impacts, confidence, and rationales remain configuration; every
  matched contribution retains its source fact ID. There is no implicit default
  policy, and results are explicitly non-scientific product heuristics.
  The initial policy is frozen configuration with five master-spec categories,
  conservative symmetric aspect pairs, selected house overlays, and small
  phase-one matches; changing its version or weights cannot alter Goal 35 facts.
  Relationship claims, persistence, and public sharing remain separate later layers.
- Domain services: zodiac conversion, aspect detection, lunar classification, natal charts, transits, and combined context.
- Repositories: persistence contracts expressed in domain types, implemented by infrastructure adapters.
- Optional AI explanation remains deferred behind future validated input/output
  schemas and cannot replace the deterministic renderer.
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

- Runtime and deployment verification for the selected composed ephemeris
  adapter on the eventual production host.
- Authentication and managed PostgreSQL providers.
- Coordinate and timezone resolution providers for user-entered locations.
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
- Ephemeris: exact Astronomy Engine 2.1.19 for tropical positions and local
  angles, composed with Whole Sign strategy 1.0.0. No silent house-system
  fallback; exact poles fail explicitly. See ADR 0006.
