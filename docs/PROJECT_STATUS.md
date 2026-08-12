# Project status

Last updated: 2026-08-11

## Current position

Status: Goal 35 complete; phase-one, synastry, and Whole Sign overlay results now compose into one validated symmetric compatibility-fact aggregate.

The project now has the portable application baseline plus a PostgreSQL 18
contract, Drizzle ORM/Kit, a typed 20-table normalized schema, checked-in SQL
migrations, forced row-level security on 19 private tables, a server-only
verified-session boundary, identity-scoped transactions, account bootstrap,
deterministic zodiac/aspect primitives, lunar phase geometry, a traceable
Pythagorean numerology strategy, and a strict ephemeris adapter validation
boundary. Astronomy Engine 2.1.19 plus Whole Sign strategy 1.0.0 is selected for
the launch ephemeris boundary, and the natal engine now composes validated
placements, houses, and aspects with complete calculation provenance. Bounded
transit, lunar, station, and explicit numerology events can now be composed into
one immutable timeline-fact aggregate. No production data, managed database,
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

- [x] Goal 35: accept only exact, version-matched phase-one, synastry, and
      house-overlay result shapes and independently revalidate their facts.
- [x] Bind canonical Sun placements to the phase-one zodiac pair and require the
      overlay placement sources to be exact privacy-minimized synastry projections.
- [x] Preserve all child facts and provenance in one deeply immutable symmetric
      aggregate while excluding raw birth/profile inputs and relationship claims.
- [x] Goal 34: reuse the validated canonical relationship-chart boundary to
      project each chart's ten bodies into the other chart's Whole Sign houses.
- [x] Produce twenty versioned bidirectional overlay facts with stable IDs/order,
      exact house/cusp identity, provider/strategy trace, and no provider call.
- [x] Verify every house, exact/just-below cusps, zodiac wrap, reversed-input byte
      symmetry, corrupt charts/cusps, immutability, and raw birth-input exclusion.
- [x] Goal 33: revalidate two complete natal-chart results at the synastry
      boundary and canonicalize privacy-minimized chart fact sources.
- [x] Evaluate every ordered cross-chart body pair through a declared, versioned
      aspect policy with stable IDs, exact geometry, phase, strength, and trace.
- [x] Verify all 100 pairs, reversed-input byte symmetry, exact/inside/edge/
      outside orbs, wraparound, closest aspects, every phase, corrupt charts,
      deterministic ordering, immutability, and raw birth-input exclusion.
- [x] Goal 32: define a provider-neutral, versioned compatibility strategy over
      validated zodiac signs and traced deterministic numerology results.
- [x] Produce only canonical sign/element/modality and Life Path/Expression pair
      facts, equality flags, master-number counts, versions, and operation trace.
- [x] Verify every ordered sign and supported numerology-value pair, reverse-input
      symmetry, exact classification tables, malformed/version-drift failures,
      immutability, provenance, claims boundaries, and private-token exclusion.
- [x] Goal 31: instantiate the selected local Astronomy Engine adapter behind a
      server-only current-reading factory with exact provider/data expectations,
      trusted system UTC clock, injected test seams, and a two-entry process cache.
- [x] Replace the fixed historical route source with all twelve current UTC
      readings under a declared 900-second ISR policy matching the loader TTL.
- [x] Map source/cache/clock failures into deliberate generic UI states and
      verify current dates, concurrency, rollover, cache hits, invalid paths,
      noindex metadata, responsive UI, local-only network, and response privacy.
- [x] Goal 30: add a server-only public loader that derives the UTC plain date
      from an injected clock and accepts no browser date, observer, account, or profile.
- [x] Define a version-complete bounded cache key/entry contract with 15-minute
      default TTL, UTC rollover, strict cached-aggregate revalidation, miss
      coalescing, FIFO eviction, and explicit hit/miss/expiry/invalidation/write states.
- [x] Verify concurrent calls, date rollover, content-version isolation, poisoned
      entries, cache failures, provider version drift, generic errors, deep
      immutability, all twelve models, and absence of private output/logging.
- [x] Goal 29: map only the complete Goal 28 aggregate into a versioned,
      immutable public horoscope read model with no provider or calculation in React.
- [x] Statically generate twelve allowlisted `/horoscope/[sign]` local-demo paths
      with clear fact/reflection separation, source trace, claims disclaimer, and
      deliberate loading, unavailable, error, empty, and unsupported states.
- [x] Verify every route, invalid-sign 404/noindex behavior, keyboard skip flow,
      44px sign controls, desktop/mobile/200% text, reduced motion, local-only
      resources, and clean valid-route browser consoles.
- [x] Goal 28: compose one canonical UTC-noon geocentric tropical sky for a
      strict plain date into twelve immutable, ordered public Sun-sign models.
- [x] Use explicit tropical sign midpoints, shared lunar geometry, stable
      sign-scoped fact IDs, and separate deterministic fact/reflection templates.
- [x] Reject every non-date input before provider dispatch, preserve complete
      provider/calculation/aspect/library provenance, and fail on version drift,
      malformed provider output, unsupported templates, or unsafe claims.
- [x] Goal 27: extend the Today source/read model with Goal 24 timeline records,
      preserving stable IDs, source versions, chronology, and instant/window shape.
- [x] Feature the first event after the reading instant and show the following
      three facts without duplication, with a direct link to the full timeline.
- [x] Cover empty and dense previews, invalid versions/order/IDs, all dashboard
      states, semantic dates, keyboard flow, mobile/200% text, and reduced motion.
- [x] Goal 26: map six traced Pythagorean core results and three explicit
      personal-cycle boundaries into an immutable numerology read model and page.
- [x] Preserve master-number policy, normalized tokens, reduction operations,
      strategy/version, local date/timezone, and stable source IDs without adding
      traditional meaning or arithmetic in React.
- [x] Verify deterministic numerology regressions, states, keyboard-expandable
      traces, semantic cycle table, mobile/200% text, reduced motion, and console;
      browser review found and fixed enlarged-text section-heading overflow.
- [x] Goal 25: map a validated personal-lunar snapshot and Goal 23 lunar facts
      into one immutable Moon read model without calculation in React.
- [x] Add `/moon` with current phase/sign, explicitly approximate illumination
      and mean-cycle age, exact positional geometry, personal lunar aspects, the
      next sign ingress, four refined primary phases, and full source trace.
- [x] Represent loading, unavailable, locked, error, empty, and ready states;
      explicitly omit rise/set until a location-aware provider exists instead of
      substituting plausible times.
- [x] Verify JPL/USNO-backed lunar regressions, keyboard skip flow, semantic
      table, mobile/desktop, 200% text, reduced motion, and zero console errors;
      browser review found and fixed enlarged-text Moon-card overflow.
- [x] Goal 24: map only the validated Goal 23 aggregate into a versioned,
      immutable timeline read model with unchanged source IDs, occurrence shapes,
      deterministic ordering, and calculation/search version references.
- [x] Add a responsive `/timeline` route with distinct instant/window cards,
      deterministic All/Transit/Moon/Station/Cycle filters, a synchronized complete
      table equivalent, visible trace, and loading/locked/error/empty states.
- [x] Verify keyboard filtering, 44px controls, 390px mobile, 200% text, reduced
      motion, desktop/mobile visuals, production hydration, and zero console errors;
      browser review found and fixed enlarged-text header overflow.
- [x] Goal 23: compose validated personal transit windows, lunar events,
      planetary stations, and explicit numerology boundaries into one versioned,
      immutable timeline-fact aggregate over a half-open display interval.
- [x] Preserve complete source results and provenance while normalizing instant/
      window occurrences, stable identifiers, chronological ordering, and an
      explicit type/identifier tie policy without recalculation.
- [x] Require numerology UTC instants to prove local midnight on their declared
      plain date and IANA timezone; reject malformed, out-of-range, duplicate,
      cross-version, trace-inconsistent, or internally inconsistent inputs.
- [x] Goal 22: define bounded, versioned station-retrograde and station-direct
      searches for Mercury through Pluto from provider-supplied longitude speed.
- [x] Require the requested positive-to-negative or negative-to-positive speed
      crossing, refine it to a declared time tolerance, and retain before/after
      motion plus every provider evaluation and version.
- [x] Fail before dispatch for Sun/Moon, malformed intervals, invalid sampling,
      and missing provenance; fail explicitly for absent speed, wrong/incomplete/
      multiple crossings, provider failure, trace changes, and under-refinement.
- [x] Match all six independently tabulated 2000 Mercury retrograde/direct
      stations through Astronomy Engine 2.1.19 within fixed 30-minute and
      0.2-degree tolerances.
- [x] Goal 21: define bounded, versioned searches for Moon sign ingress and the
      four primary Moon-minus-Sun longitude phase anchors.
- [x] Refine only increasing crossings through validated provider observations,
      require samples on both sides, and retain every evaluated instant,
      longitude, provider calculation timestamp, and search/provider version.
- [x] Cover all twelve exact 30-degree ingress boundaries, zodiac wrap, all four
      primary phase anchors, direction, ambiguity, provenance, provider failure,
      trace consistency, and declared-precision exhaustion.
- [x] Match USNO Astronomical Applications API v4.0.1 January 2000 New, First
      Quarter, Full, and Last Quarter times through Astronomy Engine 2.1.19
      within the fixed 10-minute acceptance tolerance.
- [x] Goal 20: define a bounded, versioned personal transit-event search over
      the existing provider, natal-target, and major-aspect boundaries.
- [x] Require one complete inactive-active-exact-active-inactive bracket and
      refine start, peak, and end to an explicit time tolerance without
      interpolating or inventing an unobserved provider fact.
- [x] Retain every provider-evaluated instant, longitude, calculation timestamp,
      provider/data version, natal trace, aspect policy, and search policy.
- [x] Fail before dispatch for invalid requests and return explicit failures for
      incomplete, exactless, ambiguous, inconsistent-provider, unavailable, and
      under-refined searches.
- [x] Goal 19: map a validated natal-chart aggregate into a versioned,
      immutable presentation model without ephemeris, zodiac, house, or aspect
      calculation in the presentation layer.
- [x] Render a responsive tropical Whole Sign SVG with sign, house, body,
      aspect, ASC/DSC, and MC/IC layers plus complete placement and aspect tables.
- [x] Preserve exact chart facts and calculation/provider versions while making
      all ten planet markers keyboard-focusable links to authoritative details.
- [x] Verify sourced JPL/Swiss fixture tolerances, exact layout boundaries,
      mobile/desktop presentation, keyboard flow, 200% text, reduced motion,
      horizontal table scrolling, and optimized production hydration.
- [x] Goal 18: map the Goal 17 payload boundary into a versioned, immutable
      presentation model with no calculation, scoring, or interpretation in
      React components.
- [x] Replace the architecture placeholder with responsive Today, Moon,
      strongest-signal, category, numerology, fact/reflection, and trace panels.
- [x] Add explicit loading, locked, error, empty, and success states plus score
      text equivalents, claims disclaimers, keyboard skip/details operation,
      visible focus, and reduced-motion behavior.
- [x] Use only explicitly labeled synthetic local demo data; no private birth,
      account, persistence, entitlement, or production provider data is loaded.
- [x] Correct duplicated “natal Natal” renderer copy and bump the deterministic
      interpretation library to 1.1.0 with focused regression coverage.
- [x] Goal 17: compose immutable context, deterministic interpretation output,
      explainable categories, and strongest signals into one versioned payload.
- [x] Recheck effective time, ordered fact coverage, child provenance versions,
      unknown references, duplicate contributions, and split-section versions.
- [x] Select at most five existing contributions by documented absolute impact,
      confidence, category, source-fact, and rule ordering.
- [x] Goal 16: add a separately versioned, deeply frozen product configuration
      for ten initial interpretive categories and deterministic fact selectors.
- [x] Derive bounded 0-100 scores while retaining configured baseline, raw
      total, confidence formula, source fact IDs, and every contributing rule.
- [x] Validate categories, rule IDs, template/selector schemas, bounds, safe
      rationales, and complete known-fact coverage before evaluation.
- [x] Label model and results as non-scientific product heuristics and keep AI,
      persistence, entitlements, notifications, delivery, and UI out of scope.
- [x] Goal 15: render validated projection/template pairs into visibly separate
      factual and tradition-framed plain-text sections without recalculating or
      inventing facts.
- [x] Apply an invariant label, boolean, and six-decimal-maximum number policy
      while preserving raw structured parameters unchanged.
- [x] Reject missing, extra, non-finite, unsupported, unsafe-markup, mismatched,
      duplicate, and inconsistent runtime data before interpolation.
- [x] Preserve source fact, projection, context, library, locale, and renderer
      versions in every section and return a fixed deterministic fallback for
      unsupported templates without AI.
- [x] Goal 14: project every combined-context fact exactly once into a stable
      specific interpretation key, template family, source fact ID, tradition,
      and unchanged structured parameters.
- [x] Add a versioned English-Canada deterministic template library with
      separate factual and tradition-framed interpretation sections.
- [x] Validate unsafe deterministic, medical, financial, legal, safety, and
      relationship directives plus malformed placeholders and custom-library
      bypass attempts.
- [x] Return structured supported/unsupported render data without composing
      prose, selecting AI, scoring categories, persisting content, or delivering
      a reading.
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

Goal 36 — implement compatibility category scoring behind an injected policy.

Deliverables:

1. Define a versioned, provider-neutral scoring-policy contract whose category
   IDs, baseline, bounds, fact selectors, contribution values, and confidence
   rules are injected; do not select production weights in this goal.
2. Evaluate only a validated Goal 35 aggregate, retain every matched source fact
   and rule in an explainable trace, and return bounded deeply immutable results.
3. Verify symmetry, deterministic ordering, exact boundary/clamp behavior,
   unmatched facts, duplicate/unknown selectors, malformed policies, version
   drift, misleading claims, and complete provenance.
4. Label every result as a non-scientific product heuristic. Add no production
   policy, relationship prediction, interpretation prose, persistence, sharing
   URL, UI, AI, entitlement, notification, provider call, schema change, or deployment.

## Phase queue

| Phase | Scope                                                    | State       |
| ----- | -------------------------------------------------------- | ----------- |
| 1     | Infrastructure, architecture, database, auth, standards  | Complete    |
| 2     | Ephemeris abstraction, zodiac, aspects, Moon, numerology | Complete    |
| 3     | Natal charts, transits, personal context, fixtures       | Complete    |
| 4     | Interpretation, dashboard, and natal-chart foundation    | Complete    |
| 5     | Timelines, daily/public readings, retention content      | Complete    |
| 6     | Compatibility and privacy-safe sharing                   | In progress |
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

- Production-host deployment fit and performance for the selected composed
  ephemeris provider remain release gates.
- Rise/set, altitude/azimuth, and personal lunar aspect windows remain deferred
  until validated location-aware capabilities exist. Primary phase and Moon-sign
  ingress searches now use positional provider evaluations; mean-cycle age is
  not used as an event ephemeris. Public current-date routing is locally verified,
  while eventual production-host runtime and cache behavior remain release gates.
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
| 2026-08-09 | Station-event focused/cross-layer suite            | 71/71 motion, provider, transit-window, source, trace, direction, and failure tests passed    |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 330 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 95.64% statements, 92.07% branches, 100% functions, and 96.47% lines                          |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | `astro-validation` station gate                    | Direct/retrograde hand crossings refined within 1 second; direction/speed failures passed     |
| 2026-08-09 | Independent Mercury station acceptance             | 6/6 2000 stations matched within fixed 1,800-second and 0.2-degree tolerances                 |
| 2026-08-09 | Lunar-event focused/cross-layer suite              | 109/109 ingress, phase, lunar, zodiac, provider, trace, source, and failure tests passed      |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 314 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 95.77% statements, 92.09% branches, 100% functions, and 96.48% lines                          |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | `lunar-validation` hand-boundary gate              | 12 ingresses and 4 primary phase anchors refined within 1 second; wrap/direction passed       |
| 2026-08-09 | USNO API v4.0.1 phase acceptance                   | 4/4 January 2000 events through Astronomy Engine were within fixed 600-second tolerance       |
| 2026-08-09 | Transit-event focused/cross-layer suite            | 54/54 search, transit, natal, zodiac, aspect, source, trace, and failure tests passed         |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 284 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 95.79% statements, 91.83% branches, 100% functions, and 96.34% lines                          |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | `astro-validation` event-window gate               | Hand start/peak/end within 1 second; wrap/square boundaries and explicit failures passed      |
| 2026-08-09 | Astronomy Engine/JPL-near event search             | J2000 instant bracketed; Venus-natal-Mars peak refined below 0.001 degrees                    |
| 2026-08-09 | Natal-chart focused/cross-layer suite              | 89/89 read-model, geometry, source-tolerance, natal, house, zodiac, and aspect tests passed   |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 273 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 96.27% statements, 92.45% branches, 100% functions, and 96.33% lines                          |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | `astro-validation` chart gate                      | JPL positions within 0.02 degrees; Swiss ASC/MC within 0.01 degrees; layout boundaries passed |
| 2026-08-09 | `ui-quality` chart browser gate                    | Desktop/mobile, keyboard links, scroll tables, 200% text, reduced motion, and overflow passed |
| 2026-08-09 | Optimized natal-chart production browser           | 200 response, zero console errors/warnings, zero external resources, and zero page overflow   |
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
| 2026-08-09 | Dashboard focused suite                            | 8/8 Goal 17 adapter, mapper, semantic, state, empty, and fail-closed UI tests passed          |
| 2026-08-09 | UI cross-layer regression suite                    | 45/45 dashboard, renderer, projection, and reading tests passed                               |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 256 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 95.94% statements, 91.91% branches, 100% functions, and 96.01% lines                          |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | `ui-quality` browser gate                          | Desktop/mobile visuals, keyboard, 200% text, reduced motion, and zero-overflow passed         |
| 2026-08-09 | Optimized production browser                       | 200 response, local icon, nine resources, zero console errors or warnings                     |
| 2026-08-09 | Daily-reading focused suite                        | 6/6 composition, ordering, coverage, version, and duplicate tests passed                      |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 246 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 95.77% statements, 91.83% branches, 100% functions, and 95.71% lines                          |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | Category-engine focused suite                      | 13/13 formula, trace, bounds, schema, immutability, and failure tests passed                  |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 240 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 95.92% statements, 92.18% branches, 100% functions, and 95.75% lines                          |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | Interpretation renderer focused suite              | 16/16 formatting, provenance, fallback, and fail-closed tests passed                          |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 227 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 95.95% statements, 92.5% branches, 100% functions, and 95.78% lines                           |
| 2026-08-09 | `npm audit --omit=dev`                             | 0 production dependency vulnerabilities                                                       |
| 2026-08-09 | Interpretation focused suite                       | 14/14 projection, library, unsupported, and claim-safety tests passed                         |
| 2026-08-09 | `npm run check`                                    | Passed formatting, lint, strict TypeScript, 211 tests, and production build                   |
| 2026-08-09 | `npm run test:coverage`                            | 95.75% statements, 92.32% branches, 100% functions, and 95.59% lines                          |
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

## Goal 14 interpretation and claim-safety record

- Commands: `npx vitest run tests/interpretation.test.ts`, `npm run check`,
  `npm run test:coverage`, and `npm audit --omit=dev`.
- Projection: every ordered immutable context fact produces exactly one stable
  specific key, generic template-family key, original source fact ID,
  astrology/numerology tradition, and raw structured parameters. Coverage or
  key duplication fails closed; no fact is recalculated, rounded, or altered.
- Library: `personal-reflection-en-ca` 1.0.0 supplies six generic template
  families for natal placements, natal aspects, transits, lunar phase,
  personal-lunar aspects, and numerology values. Fact and interpretation fields
  remain distinct single-line plain-text templates with declared placeholders.
- Unsupported policy: absent templates return structured `unsupported-key`
  results. Unknown/malformed placeholders, undeclared or unused fact
  parameters, HTML-like characters, duplicate keys, invalid identifiers,
  mismatched template/tradition responses, and unsafe custom-library responses
  fail validation.
- Claim safety: factual templates reject meaning/prediction language.
  Interpretation templates require explicit astrology or numerology tradition
  framing and reject certainty plus medical, financial, legal, safety, and
  deterministic relationship directives. The checked examples include the
  prohibited claims in the master specification. Rules and AI boundaries are
  recorded in `docs/CONTENT_SAFETY.md`.
- Output: projection/library/context/locale versions and a preparation timestamp
  accompany deep-frozen structured render items. Prose interpolation, AI,
  category scoring, persistence, entitlements, and delivery remain absent.

## Goal 15 deterministic renderer record

- Commands: `npx vitest run tests/interpretation-renderer.test.ts`,
  `npm run check`, `npm run test:coverage`, and `npm audit --omit=dev`.
- Input boundary: rendering consumes only validated Goal 14 structured render
  data. It revalidates templates, projection/template/tradition matching,
  unsupported results, unique projection keys, the unsupported-key index, and
  provenance metadata before interpolation.
- Formatting policy: numbers use invariant decimal notation with at most six
  fractional digits and normalize negative zero; booleans render as yes/no;
  identifier labels are deterministically title-cased while version values are
  preserved. The raw primitive parameter map is copied unchanged into output.
- Failure policy: missing, extra, non-finite, unsupported runtime types, control
  characters, markup-significant characters, malformed provenance, duplicate
  items, inconsistent unsupported indexes, unsafe templates, and mismatched
  resolutions fail closed. The renderer evaluates no HTML or executable input.
- Output: every fact, interpretation, or unsupported fallback section carries
  its source fact, projection key/version, template key, context version,
  library ID/version, locale, and renderer 1.0.0. Facts and tradition-framed
  copy remain separate deep-frozen fields.
- Fallback and scope: an unsupported template emits the fixed sentence “No
  deterministic interpretation is available for this item.” with provenance.
  No AI adapter, category score, persistence, entitlement, notification,
  delivery, or UI behavior was added.

## Goal 16 category-engine record

- Commands: `npx vitest run tests/category-scores.test.ts`, `npm run check`,
  `npm run test:coverage`, and `npm audit --omit=dev`.
- Model boundary: the deeply frozen `personal-category-baseline` 1.0.0
  configuration owns its categories, selectors, impacts, confidence values,
  and rationales under `src/config/`; astronomy, numerology, context, and prose
  modules do not import it.
- Formula: each category starts at the configured baseline, retains the exact
  sum of matched rule impacts and unbounded raw score, then exposes
  `clamp(round(rawScore), 0, 100)`. Confidence is the absolute-impact-weighted
  mean of contributing rule confidence, or zero without factors. Formula 1.0.0
  and both formulas accompany output.
- Traceability: each result contains the product-heuristic label, configured
  baseline, contribution total, raw and displayed scores, confidence, unique
  source fact IDs, and every matched rule ID, projection key, impact,
  confidence, and rationale.
- Failure policy: invalid or duplicate categories/rules, unknown categories,
  template families or selector parameters, invalid/non-finite bounds, empty
  selectors, unsafe text, missing/unknown/duplicate fact projections, and
  non-finite arithmetic fail closed.
- Scope: the model is explicitly an interpretive product heuristic, not a
  scientific measurement. It changes no source fact or rendered prose and adds
  no AI, persistence, entitlement, notification, delivery, or UI behavior. See
  `docs/CATEGORY_MODEL.md`.

## Goal 17 daily-reading composition record

- Commands: `npx vitest run tests/daily-reading.test.ts`, `npm run check`,
  `npm run test:coverage`, and `npm audit --omit=dev`.
- Payload: reading version 1.0.0 combines the existing immutable context,
  rendered fact/tradition sections, explainable category results, and strongest
  signals without recalculating or copying a source fact.
- Consistency: effective time, ordered fact coverage, context/projection/library/
  locale/renderer/score-model/formula versions, child-section provenance,
  known category references, unique interpretation keys, and unique
  contributions are checked again at assembly.
- Signal policy: at most five existing category contributions are ordered by
  absolute impact descending, confidence descending, category, source fact ID,
  then rule ID. Each signal retains its complete contribution trace and category
  score; no new influence is inferred.
- Scope: no AI, persistence, entitlement, notification, delivery, HTTP, or UI
  behavior was added.

## Goal 35 compatibility fact aggregate record

- Commands: focused phase-one/synastry/overlay/aggregate suites; `npm run check`;
  `npm run test:coverage`; `npm audit --omit=dev`; and `git diff --check` through
  the `astro-validation` and `security-audit` procedures.
- Boundary: `composeCompatibilityFacts` accepts only Goal 32/33/34 result shapes.
  It reconstructs each public projection, rejects unknown fields, revalidates the
  exact phase-one comparison trace, recomputes every cross-chart aspect and every
  bidirectional Whole Sign overlay, and maps all failures to one generic error.
- Cross-result identity: both chart sides must retain identical chart-engine and
  position-provider provenance. Overlay placements must exactly equal synastry
  placements after speed is deliberately removed. Canonical Sun longitudes are
  converted through the existing tropical zodiac primitive and must equal the
  canonical phase-one sign pair.
- Symmetry/completeness: canonical child ordering is retained, so reversing all
  source subjects produces byte-equivalent output. Tests reject lost, duplicated,
  or reordered phase traces, synastry aspects, and overlays; child version drift;
  shared-provider/placement drift; sign mismatch; and altered claims. The result
  retains all three deeply frozen children plus exact fact counts and versions.
- Privacy/security: the strict projection rejects extra fields, including an
  injected birth date. Output contains no birth instant, timezone, observer,
  coordinate source, numerology tokens, name, account/profile identity, category
  weight, interpretation, or score. Derived relationship facts remain private and
  no HTTP, auth, persistence, logging, cache, or sharing boundary was added. No
  critical or high finding remains.
- Evidence: 34 test files and 498 tests passed; coverage was 94.37% statements,
  91.44% branches, 99.66% functions, and 95.15% lines. The aggregate composer had
  93.22% statement, 88.76% branch, 100% function, and 93.45% line coverage. The
  optimized build passed and the production dependency audit found zero
  vulnerabilities.
- Scope: no scoring policy/weight, interpretation, persistence, share token/URL,
  UI, AI, entitlement, notification, provider call, schema change, production
  service, or deployment was added.

## Goal 34 cross-chart house-overlay record

- Commands: focused overlay/synastry/natal suites; `npm run check`;
  `npm run test:coverage`; `npm audit --omit=dev`; and `git diff --check` through
  the `astro-validation` and `security-audit` procedures.
- Boundary: `HouseOverlayEngine` calls the Goal 33 reusable validation and
  canonicalization boundary, not an ephemeris adapter. Both complete natal charts
  are therefore rechecked for strict request/provider metadata, canonical tropical
  placements, zodiac/house consistency, Whole Sign/engine/policy versions, and
  exact natal-aspect completeness before overlay calculation. Boundary failures
  map to one generic overlay error.
- Geometry/identity: the fixed canonical directions are chart A bodies into chart
  B cusps, then chart B bodies into chart A cusps, each in the ten-body order.
  `findHouseNumber` owns normalized wrap and half-open cusp containment. Every fact
  retains source side/body/longitude plus target side/house/exact cusp; stable IDs
  include both sides, body, and house. Exactly twenty unique facts are returned.
- Astro validation: tests exercise all twelve exact cusps and values 0.000001°
  below each cusp, including the 270° first-cusp/zodiac-wrap transition; every
  house number; both directions; unique deterministic order; incomplete/version-
  drift charts; cusp loss/order corruption; and inconsistent placement houses.
  Expected houses come directly from the declared half-open Whole Sign geometry;
  no celestial fixture, provider call, tolerance change, or interpretation exists.
- Symmetry/provenance/privacy: reversing input charts produces byte-equivalent
  output. Trace retains chart engine, position and house provider/data versions,
  coordinate conventions, Whole Sign strategy, ten source longitudes, and twelve
  cusps, and is deeply frozen. Private instant, timezone/source, observer location,
  provider calculation timestamps, subject labels, and input order are excluded
  and never logged. Derived placements/cusps remain private relationship data and
  require a later redacted share projection. No critical or high finding remains.
- Evidence: 33 test files and 480 tests passed; coverage was 94.58% statements,
  91.66% branches, 99.63% functions, and 95.37% lines. The overlay engine had 100%
  statement/branch/function/line coverage. The optimized build passed and the
  production dependency audit found zero vulnerabilities.
- Scope: no provider call, category weight, interpretation, persistence, share
  token/URL, UI, AI, entitlement, notification, schema change, or deployment was
  added.

## Goal 33 cross-chart synastry aspect record

- Commands: focused synastry/natal suites; `npm run check`;
  `npm run test:coverage`;
  `npm audit --omit=dev`; and `git diff --check` through the
  `astro-validation` and `security-audit` procedures.
- Boundary: `SynastryAspectEngine` accepts two existing `NatalChart` results and
  one declared aspect policy; it has no provider dependency. Before comparison it
  revalidates strict UTC/provider metadata, ten canonical tropical placements,
  normalized longitudes, zodiac/house consistency, twelve cusps, Whole Sign and
  engine/policy versions, and exact completeness/order of recomputed natal aspects.
  All invalid inputs fail with one generic error.
- Geometry: the engine evaluates the canonical 10 x 10 cross-body matrix with
  existing minimal-angle and closest-aspect functions in ecliptic-of-date tropical
  degrees. Each match retains exact/actual angle, orb, maximum orb, normalized
  strength, and applying/separating/stationary/unknown phase. Stable IDs and output
  order use canonical chart sides followed by canonical body order.
- Symmetry/provenance: chart sources are canonically sorted by their complete
  privacy-minimized fact trace, so reversing distinct or identical inputs produces
  byte-equivalent output. Trace includes chart-engine and position-provider/data
  versions, coordinate conventions, and all ten longitudes/speeds needed to
  reproduce both matches and absences. The result and every nested collection are
  deeply frozen.
- Astro validation: tests cover all 100 ordered body pairs; exact square, just
  inside, exact maximum orb, and just outside; 359°/1° wraparound; overlapping
  closest-aspect selection; all four motion phases; stable unique identity; and
  malformed, incomplete, duplicate, zodiac/house/aspect, provider, and version
  corruption. Expected geometry is formula-derived at 12-decimal precision; no
  new celestial fixture or loosened tolerance was introduced. Existing validated
  Zollikon chart structure supplies the full natal contract only.
- Security review: private instant, timezone/source, observer coordinates, house
  data, provider calculation timestamps, input order, and arbitrary subject labels
  are not returned or logged. The output contains derived placements and speeds,
  which remain private relationship data and require an explicit redacted public
  projection before any future share route. There is no HTTP/auth/cache/persistence
  entry point yet, so CSRF, ownership, rate-limit, and token controls are not
  applicable in this goal. No critical or high finding remains.
- Evidence: 32 test files and 470 tests passed; coverage was 94.53% statements,
  91.64% branches, 99.63% functions, and 95.32% lines. The new synastry engine had
  100% statement/function/line and 96% branch coverage. The optimized build passed
  and the production dependency audit found zero vulnerabilities.
- Scope: no provider call, house overlay, category weight, interpretation,
  persistence, share token/URL, UI, AI, entitlement, notification, schema change,
  or deployment was added.

## Goal 32 phase-one compatibility fact record

- Commands: `npx vitest run tests/compatibility.test.ts tests/numerology.test.ts`;
  `npm run check`; `npm run test:coverage`; `npm audit --omit=dev`; and
  `git diff --check` through the `astro-validation`, `numerology-validation`, and
  `security-audit` procedures.
- Contract: `CompatibilityStrategy` accepts two facts-only subjects with one
  canonical tropical sign plus traced Life Path and Expression results. The
  phase-one strategy/result and zodiac classification policy are independently
  identified and versioned. Pythagorean source ID/version expectations are
  configurable and validated before comparison.
- Zodiac facts: the declared twelve-sign element/modality table is complete.
  Output canonicalizes signs by zodiac order and elements/modalities by stable
  text order, then reports equality only. It performs no longitude, coordinate,
  time, ephemeris, aspect, house, score, or interpretation calculation.
- Numerology facts: supported values are ordinary reductions 1–9 and configured
  masters 11/22/33. Input value/master consistency, source strategy/version,
  token shape, trace shape, and final trace result are validated. The comparison
  reports sorted Life Path/Expression value pairs, equality, and master count;
  it performs no reduction and changes no Pythagorean convention.
- Symmetry/privacy/claims: all 144 ordered sign pairs and 144 ordered supported
  value pairs produce exactly equal output when inputs reverse. Results are
  deeply frozen and contain versions plus five reconstructable comparison steps.
  Raw numerology tokens/traces, names, dates, subject labels, and input order are
  not copied. The output explicitly states it is not a relationship score,
  prediction, or advice. No critical or high security finding remains.
- Evidence: 31 test files and 445 tests passed; coverage was 94.22% statements,
  91.36% branches, 99.61% functions, and 95.04% lines. The optimized build passed
  and the production dependency audit found zero vulnerabilities.
- Scope: no profile/birth loading, persistence, share token/URL, synastry aspect,
  house overlay, category weight, interpretation, UI, AI, entitlement,
  notification, provider call, or deployment was added.

## Goal 31 current public route integration record

- Commands: focused current-loader/route/read-model suites; `npm run check`;
  `npm run test:coverage`; `npm audit --omit=dev`; `git diff --check`; optimized
  response inspection; and Playwright CLI review through `security-audit` and
  `ui-quality` procedures.
- Server boundary: one `server-only` factory selects local Astronomy Engine
  2.1.19 with exact `astronomy-engine-model-2.1.19` data expectation, a trusted
  system clock, 15-minute TTL, and a maximum two-entry process cache. Provider,
  clock, cache, expectation, and TTL remain injectable for deterministic tests.
- Routing/ISR: all twelve allowlisted sign paths load the same current UTC-date
  aggregate and select one immutable model. Next.js prerenders them with a
  literal 900-second ISR interval; the optimized manifest and response headers
  reported 900 seconds, and repeated responses reported `x-nextjs-cache: HIT`.
  Unknown signs remain closed by `dynamicParams = false` and returned 404/noindex.
- Concurrency/failure/privacy: twelve concurrent route-state loads produced one
  provider calculation. Existing loader tests retain cache expiry, invalidation,
  and UTC-midnight rollover coverage. Source failure maps to unavailable;
  cache/clock or lost-coverage failure maps to error; every path uses only the
  generic public message. Responses set no cookie and browser inspection found
  no local/session storage, external request, account/profile/birth input, or log.
- UI/accessibility: the page labels the current UTC date, 12:00 UTC sample,
  bounded regeneration, and no-index preview. Desktop 1440px and mobile 390px
  screenshots were inspected; mobile and 200% text had no horizontal overflow.
  The skip link focused main, reduced motion changed smooth scrolling to auto,
  and the optimized valid route produced zero console errors or warnings.
- Security result: the assets are public shared-sky facts only; the route is a
  read-only statically cached GET with no auth, mutation, private discriminator,
  managed store, browser-controlled date, analytics, or secret. No critical or
  high finding remains. Production-host ISR/process lifetime remains a release
  verification gate.
- Evidence: 30 test files and 428 tests passed; coverage was 94.09% statements,
  91.15% branches, 99.60% functions, and 94.93% lines. The production dependency
  audit found zero vulnerabilities.
- Scope: no managed cache/storage, persistence, schema/canonical metadata,
  analytics, AI, entitlement, notification, external network provider,
  production service, or deployment was added.

## Goal 30 current public loader and cache record

- Commands: `npx vitest run tests/public-daily-loader.test.ts`; focused public
  aggregate/read-model regressions; `npm run check`; `npm run test:coverage`;
  `npm audit --omit=dev`; and `git diff --check` through the `security-audit`
  procedure.
- Loader: version 1.0.0 has a zero-argument `loadCurrent` boundary. It derives a
  strict plain date only from an injected valid `Date`, requests the canonical
  Goal 28 UTC-noon sky, validates declared provider ID/version/data version, and
  returns the complete aggregate plus all twelve Goal 29 models. No browser date,
  observer, user, account, profile, cookie, header, URL, or log enters the path.
- Cache: entry 1.0.0 is keyed by UTC date, bounded TTL, loader/entry/aggregate/
  read-model/projection/lunar versions, sampling/target conventions, exact aspect
  configuration/policy, public library ID/version/locale, and expected provider/
  data versions. The in-memory implementation accepts 1–64 entries (default 8),
  evicts oldest entries, and stores no secret or personal discriminator.
- Integrity/concurrency: every cache hit rechecks exact entry fields/timestamps
  and passes the aggregate through all twelve strict read-model validators.
  Malformed entries are deleted then regenerated; expired entries regenerate;
  simultaneous identical misses share one provider calculation. Keys isolate
  library changes and UTC rollover. Results and cache-hit aggregates are deeply
  frozen.
- Failure/security: invalid clocks and provider metadata fail closed. Provider,
  cache-read, and cache-delete details map to one generic public message. A cache
  write failure returns fresh data with explicit `write-skipped` status. Tests
  injected private cache/upstream markers and confirmed none reached output.
  No critical or high finding remains; future route integration must preserve
  noindex, generic errors, bounded process state, and zero browser-controlled date.
- Evidence: 29 files and 423 tests passed; coverage was 94.06% statements,
  91.13% branches, 99.60% functions, and 94.89% lines. The optimized build still
  prerendered only the existing fixed demo routes, and the production dependency
  audit found zero vulnerabilities.
- Scope: the loader is not wired to HTTP. No route behavior, managed cache,
  persistence, indexing/schema/canonical, analytics, AI, entitlement,
  notification, external network provider, production service, or deployment
  was added.

## Goal 29 public daily-reading presentation record

- Commands: focused public aggregate, renderer, read-model, route, state, and
  corruption suites; `npm run check`; `npm run test:coverage`;
  `npm audit --omit=dev`; `git diff --check`; and Playwright CLI inspection of
  the optimized production build through the `ui-quality` procedure.
- Boundary: public horoscope read model 1.0.0 accepts only public aggregate 1.0.0
  and one canonical tropical sign. It rechecks strict date/UTC-noon identity,
  ten-body geocentric tropical sky trace, all twelve ordered sign models,
  midpoint targets, shared lunar geometry, transit identity/order, aspect
  definitions, complete rendered fact coverage, and matching provenance before
  deeply freezing display data.
- Content/UI: every source fact is one ordered card with explicit “Calculated
  fact” and “Tradition-framed reflection” regions or the fixed unsupported
  fallback. The page declares the historical January 1, 2000 local demo,
  non-personal midpoint convention, noon UTC sample, no-index state, complete
  versions, and non-prediction/advice disclaimer. Loading, unavailable, error,
  empty, unsupported, and ready states are deliberate.
- Routing/security: `generateStaticParams` allowlists exactly twelve sign paths;
  `dynamicParams = false` returns a real 404 plus noindex for unknown signs. All
  valid paths are static, read-only, and noindex/nofollow/noarchive. There are no
  cookies, sessions, user dates, birth/profile/account/observer inputs, dynamic
  provider calls, persistence, logs, analytics, mutations, secrets, or external
  resources. No critical or high finding remains; a future current-date loader
  still requires bounded caching/coalescing and generic failure handling.
- Browser/UI quality: all twelve paths returned 200 with the matching H1/current
  sign and clean consoles. The skip link focused `main`; every sign control was
  44px. Desktop 1440x1000, mobile 390x844, and 200% root text had no horizontal
  overflow. Reduced motion produced auto scrolling and near-zero transitions.
  Visual inspection confirmed readable hierarchy, clear layer separation, and
  wrapped source IDs. Invalid-sign navigation returned 404 and noindex.
- Browser corrections: the first pass exposed ISO dates humanized as spaces and
  eleven eager sign-page prefetches. Validated plain-date parameters now retain
  `YYYY-MM-DD`; sign and duplicate home-link prefetches are disabled. The final
  initial network has no alternate-sign page request.
- Evidence: 28 files and 414 tests passed; coverage was 93.99% statements,
  90.94% branches, 99.58% functions, and 94.72% lines. The optimized build
  prerendered all twelve sign paths, and the production dependency audit found
  zero vulnerabilities.
- Scope: routes still use one local fixed historical calculation. No current or
  production provider call, indexing/schema/canonical, persistence, analytics,
  AI, entitlement, notification, managed service, or deployment was added.

## Goal 28 public daily-reading fact record

- Commands: `npx vitest run tests/zodiac-aspects.test.ts
tests/lunar-phase.test.ts tests/public-daily-readings.test.ts`;
  interpretation and renderer regressions; `npm run check`;
  `npm run test:coverage`; `npm audit --omit=dev`; and `git diff --check`.
- Contract: public aggregate 1.0.0 accepts exactly one strict proleptic Gregorian
  `YYYY-MM-DD` value and deterministically samples `12:00:00Z`. It requests all
  ten bodies once in the geocentric tropical ecliptic-of-date frame and retains
  provider/data/calculation, aspect-policy, projection, library, locale, and
  sampling versions. No observer or location is supplied.
- Sign model: all twelve canonical signs retain zodiac order and use the
  midpoint at `15 + 30n` degrees as an explicit non-personal comparison target.
  Current bodies are compared through major-aspects 1.0.0. One shared
  Moon-minus-Sun phase result is cloned under sign-scoped IDs; no birth chart,
  individualized transit, score, or event date is inferred.
- Content boundary: public-reflection-en-ca 1.0.0 renders factual astronomy and
  tradition-framed general reflection as distinct sections. Missing templates
  return the fixed unsupported fallback. Unsafe deterministic, medical, legal,
  financial, relationship, or safety claims fail through the existing template
  validator; library metadata drift during composition also fails closed.
- Astro/lunar validation: exact sign-midpoint conjunction identity, declared
  major-aspect provenance, normalized provider longitudes, all-sign ordering,
  shared 36-degree lunar geometry, and the selected Astronomy Engine 2.1.19
  adapter passed. Existing boundary suites cover every 30-degree edge, angular
  wraparound, exact/inside/outside orbs, all eight lunar sectors, illumination,
  and cycle wrap. Existing JPL Horizons and USNO records remain the independent
  adapter/event regressions; no AI-derived astronomical expected value was added.
- Security/privacy: the allowlist rejects effective instants, birth date/time/
  location, names, observer coordinates, account/profile IDs, and unknown fields
  before dispatch. Output inspection found no private field, influence score,
  prediction, route, log, storage, analytics, or account boundary. No critical
  or high security finding remains; a future public HTTP route still requires
  deliberate caching, rate limiting, generic errors, and indexing policy.
- Evidence: 27 files and 404 tests passed; coverage was 94.36% statements,
  90.86% branches, 99.55% functions, and 95.07% lines. The optimized build
  passed and the production dependency audit found zero vulnerabilities.
- Scope: no route, SEO metadata, persistence, analytics, AI, entitlement,
  notification, production provider call, managed service, or deployment was
  added.

## Goal 27 Today timeline preview record

- Boundary: `DashboardReadingSource` now requires timeline read model 1.0.0.
  Assembly validates its version, unique IDs, timestamps, ordering, and source
  versions, then copies only Goal 24 display facts at or after the reading instant.
- Selection: the first upcoming fact is the explicit next event; the following
  three facts form the preview. IDs, dates, instant/window kinds, occurrence text,
  and source versions are unchanged. React performs no search or calculation.
- UI/states: the featured card includes the full start/exact/end window and source
  ID; three compact cards retain chronology and shape, with a 44px link to the
  complete timeline. Existing loading/locked/error states and a new empty preview
  remain deliberate. The duplicated featured/preview item found in browser review
  was removed.
- Browser: semantic snapshot exposed the featured transit followed by year-cycle,
  New Moon, and month-cycle facts. Skip-link keyboard flow focused `main`; at
  390px normal and 200% text the document stayed 375px wide; reduced motion used
  auto scrolling; source IDs wrapped intact; Chromium reported zero errors.
- Evidence: 26 files and 378 tests passed; coverage was 94.17% statements,
  90.71% branches, 99.53% functions, and 94.91% lines. The optimized static build
  passed and the production dependency audit found zero vulnerabilities.
- Scope: no persistence, notification, entitlement, public sharing, AI,
  production provider, analytics, or deployment behavior was added.

## Goal 26 personal numerology presentation record

- Boundary: numerology read model 1.0.0 consumes six Pythagorean 1.0.0 core
  results and Goal 23 personal year/month/day boundary facts, rechecking strategy,
  values, tokens, operations, chronology, identity, and timezone-bearing sources.
- Convention: component reduction preserves 11, 22, and 33; Y is a consonant;
  strict Gregorian plain dates and caller-proven Toronto midnights define cycles.
  Unknown Unicode remains an explicit strategy failure. No meaning copy is mixed
  into the arithmetic presentation.
- UI/browser: `/numerology` exposes six expandable token/operation traces and a
  complete cycle table with loading/unavailable/locked/error/empty/ready states.
  Keyboard trace expansion passed. At 390px, 200% text with a seven-step trace
  initially exposed heading overflow; the stacked fix passed with no page
  overflow. Reduced motion resolved to auto and Chromium had zero console errors.
- Evidence: 26 files and 378 tests passed; coverage was 94.22% statements,
  90.80% branches, 99.52% functions, and 94.97% lines. The static route passed
  the optimized build; production dependency audit found zero vulnerabilities.
- Scope: no interpretation, AI, persistence, entitlement, notification, public
  sharing, production provider, or deployment behavior was added.

## Goal 25 personal Moon presentation record

- Commands: Moon read-model, personal-lunar, lunar-event, lunar-phase, and Goal 23
  timeline focused suites; `npm run check`; `npm run test:coverage`;
  `npm audit --omit=dev`; `git diff --check`; and real Chromium checks through
  `lunar-validation`, `ui-quality`, and Playwright.
- Boundary: Moon read model 1.0.0 consumes one personal-lunar snapshot 1.0.0 and
  lunar facts from timeline composition 1.0.0. It rechecks phase/illumination/age
  ranges, Moon-only personal aspects, provenance versions, upcoming chronology,
  unique event IDs, and event-search versions before immutable display mapping.
- Current facts: the local J2000 demo displays provider-supplied tropical Moon
  longitude plus derived Moon-minus-Sun phase geometry, Moon sign, illumination
  trend, approximate geometric illumination, and estimated mean-cycle age. The
  latter two remain visibly qualified and never supply an event instant.
- Upcoming facts: the page derives the next requested sign target from the
  validated current Moon sign, then uses `LunarEventSearch` provider observations
  for that ingress and January 2000 New, First Quarter, Full, and Third Quarter.
  The existing USNO v4.0.1 fixed 10-minute acceptance suite and stored JPL J2000
  positional tolerance suite remained green; no calendar estimate replaced them.
- Personal facts and omission: three current Moon-to-natal aspects reuse the
  transit engine and existing stable personal-lunar IDs without natal
  recalculation. Moonrise/set is explicitly unavailable because no location-aware
  provider, atmosphere convention, or high-latitude failure boundary is selected.
- Accessibility/browser: loading, unavailable, locked, error, empty, and ready
  states are explicit; the decorative phase graphic is hidden from accessibility
  APIs and complete facts appear in text/list/table form. Skip-link keyboard flow
  focused `main`; 390px had no overflow; 200% text initially exposed Moon-card
  overflow, which was fixed and reverified at 390px. Reduced motion resolved to
  `auto`; desktop/mobile visuals were inspected; Chromium had zero console errors.
- Evidence: 25 files and 370 tests passed; coverage was 94.56% statements,
  91.11% branches, 99.50% functions, and 95.37% lines. The static `/moon` route
  passed the optimized build and the dependency audit found zero vulnerabilities.
- Scope: no rise/set fabrication, interpretation, score, persistence, entitlement
  decision, notification, public sharing, production provider, AI, or deployment
  behavior was added.

## Goal 24 timeline presentation record

- Commands: timeline read-model, Goal 23 composer, dashboard, and natal-chart
  focused suites; `npm run check`; `npm run test:coverage`; `npm audit --omit=dev`;
  `git diff --check`; and real Chromium checks against development and optimized
  production servers through the `ui-quality` and Playwright workflows.
- Boundary: timeline read model 1.0.0 consumes only a Goal 23 timeline 1.0.0
  aggregate, rechecks interval, IDs, source versions, display range, and published
  time/type/ID ordering, then maps unchanged source references into display text.
  React performs no astronomy, numerology, event search, score, or interpretation.
- Interaction: All, Transits, Moon, Stations, and Personal cycles are client-only
  visibility filters. They preserve source order and synchronously update the
  semantic ordered list, live count, pressed state, and complete table equivalent.
- States and provenance: loading, locked, error, empty, and ready are explicit.
  Every event shows an instant or start/exact/end window and its stable source ID;
  the trace discloses composition/search/numerology versions. Demo events are
  calculated locally at build time from existing versioned adapters and fixtures.
- Accessibility/browser: keyboard Tab/Enter filtering passed; controls retain a
  44px minimum; 390px had no horizontal page overflow; 200% root text scaling
  initially exposed header overflow, which was fixed and reverified at 375px
  document width inside a 390px viewport. Reduced-motion changed scroll behavior
  from smooth to auto. Desktop and mobile visuals were inspected, and table
  overflow stays inside a named keyboard-focusable region.
- Production/evidence: 24 files and 361 tests passed; coverage was 94.77%
  statements, 90.99% branches, 99.46% functions, and 95.60% lines. The static
  `/timeline` route passed the optimized build, production filtering, document
  width, and zero-console-error checks; the dependency audit found zero
  vulnerabilities. No remote fonts, images, or visualization library were added.
- Scope: no persistence, entitlement decision, notification, public sharing,
  production provider call, AI, or deployment behavior was added.

## Goal 23 unified timeline-fact composition record

- Commands: timeline, transit-event, lunar-event, station-event, and numerology
  focused suites; `npm run check`; `npm run test:coverage`; `npm audit --omit=dev`;
  and `git diff --check`.
- Contract: timeline facts 1.0.0 accepts one explicit half-open UTC interval plus
  existing validated Goal 20-22 event results and optional explicit numerology
  boundary requests. Output normalizes transit start/peak/end windows and lunar,
  station, or numerology instants without changing the complete cloned source.
- Numerology boundary: the caller supplies the strict Gregorian local date, UTC
  instant, IANA timezone, and timezone-resolution source. Composition proves the
  instant is local midnight on that date, requires January 1 for a personal year
  and day 1 for a personal month, then invokes the explicit versioned strategy.
  No timezone, date, or missing boundary is inferred.
- Ordering and identity: facts sort by occurrence start, then the published type
  order, then English identifier ordering. Existing astronomy IDs remain intact;
  numerology IDs include kind, local date, and timezone. Duplicates fail closed.
- Validation: source search versions, event/input identities, strict transit
  ordering, display range, provider trace, evaluation counts/uniqueness, lunar
  targets, station direction identity, numerology strategy/result trace, boundary
  kind/date/timezone, and local-midnight consistency are checked at assembly.
- Evidence: 23 files and 353 tests passed; coverage was 95.42% statements,
  91.79% branches, 100% functions, and 96.22% lines; the optimized production
  build passed and the production dependency audit found zero vulnerabilities.
- Scope: no interpretation, score, UI, persistence, entitlement, notification,
  public sharing, provider request, or deployment behavior was added.

## Goal 22 station and retrograde event-search record

- Commands: station-event, Astronomy Engine provider, ephemeris-conformance,
  and transit-event focused suites; `npm run check`;
  `npm run test:coverage`; and `npm audit --omit=dev`.
- Contract: station search 1.0.0 supports Mercury, Venus, Mars, Jupiter, Saturn,
  Uranus, Neptune, and Pluto. Input declares station-retrograde or station-direct,
  bounded UTC interval, coordinate provenance, integer sampling/refinement, and
  iteration cap. Searches allow at most 400 days, seven-day-or-finer steps, and
  2,048 initial samples. Sun and Moon fail before dispatch.
- Motion boundary: station-retrograde requires provider speed above zero before
  and below zero after; station-direct requires the inverse. Bisection asks the
  provider for every midpoint until the time tolerance is met, then reports the
  observed point with smallest absolute speed plus its signed bracket. Longitude
  sampling is never substituted for missing provider speed.
- Provider convention: Astronomy Engine 2.1.19 supplies tropical ecliptic-of-date
  longitude speed in degrees/day from a one-minute forward coordinate difference.
  Existing JPL fixture coverage accepts that speed within 0.001 degrees/day.
- Trace/failure policy: output retains direction, longitude/zodiac, speed,
  before/after bracket, provider/data versions, search policy, and every evaluated
  instant, longitude, speed, and calculation timestamp. Missing speed, incomplete,
  reverse, endpoint, multiple, inconsistent-provider, unavailable, and
  under-refined searches return explicit non-success results. Output is frozen.
- Independent source: Richard Nolle's GMT 1901-2000 Mercury station table supplies
  all six 2000 SR/SD instants and tropical longitudes. Astronomy Engine matched
  each within fixed 1,800-second and 0.2-degree tolerances. Source retrieved
  2026-08-09; fixture preserves the URL, convention, values, and tolerances.
- Scope: no inferred-speed fallback, interpretation, category, score, timeline
  composition/UI, persistence, entitlement, notification, production provider
  call, or deployment was added.

## Goal 21 lunar event-search record

- Commands: lunar-event, lunar-phase, personal-lunar, zodiac/aspect, and
  ephemeris-conformance focused suites; `npm run check`;
  `npm run test:coverage`; and `npm audit --omit=dev`.
- Contract: lunar search version 1.0.0 accepts either a canonical target Moon
  sign or New/First Quarter/Full/Third Quarter phase, a bounded UTC interval,
  coordinate provenance, integer sample/tolerance values, and bounded refinement
  iterations. Intervals are capped at 62 days, daily-or-finer samples, and 2,048
  initial observations.
- Geometry: sign ingress targets exact multiples of 30 degrees. Primary phases
  target normalized provider-supplied Moon-minus-Sun ecliptic longitude at 0,
  90, 180, and 270 degrees. Only increasing signed crossings qualify. Exact
  endpoint, skipped-sign, reverse, missing, or multiple crossings do not produce
  an event.
- Refinement/trace: bisection performs provider calls until the requested time
  tolerance is met and returns the first observed point on or after the crossing.
  Output retains derived phase/sign geometry, angular error, every evaluated
  instant and longitude, provider calculation times/versions, and search policy;
  it is deeply frozen. Mean-cycle Moon age is never used to find an event.
- Hand validation: all 12 zodiac ingresses and all four primary phase anchors
  cross exact wrap-aware boundaries and refine within one second. Tests also
  cover topocentric provenance, reverse/endpoint crossings, malformed requests,
  ambiguity, provider failure, provider trace changes, and refinement exhaustion.
- Independent source: USNO defines primary phases at apparent Moon-minus-Sun
  longitude 0/90/180/270 degrees. Its Astronomical Applications API v4.0.1
  January 2000 UT results are checked in with request/definition URLs and a fixed
  600-second tolerance. Astronomy Engine 2.1.19 matched all four events. Source
  retrieved 2026-08-09.
- Scope: no mean-age timing, rise/set, altitude, personal lunar aspect window,
  station, interpretation, score, timeline composition/UI, persistence,
  entitlement, notification, production provider call, or deployment was added.

## Goal 20 transit event-window search record

- Commands: `npx vitest run tests/transit-event-window.test.ts` with transit,
  natal, zodiac, and aspect regressions; `npm run check`;
  `npm run test:coverage`; and `npm audit --omit=dev`.
- Contract: search version 1.0.0 accepts one supported transiting body, canonical
  natal body/ASC/MC target, configured aspect, explicit UTC interval, coordinate
  provenance, integer sample step, integer refinement tolerance, and bounded
  iteration count. Intervals are capped at 366 days and 2,048 initial samples.
- Algorithm: provider observations must expose one complete inactive-active-
  inactive run and one exact signed branch crossing. Bisection refines orb entry,
  exact peak, and orb exit independently. A result is returned only when the
  three instants are strictly ordered and every bracket meets the declared time
  tolerance; provider values are never interpolated.
- Trace: output retains the target and aspect definition, start/peak/end
  observations, provider/data/calculation versions, natal input and metadata,
  aspect/search versions, sample/tolerance limits, and every evaluated instant,
  longitude, and provider calculation timestamp. Output is deeply frozen.
- Validation: a linear 2-degree/day fixture proves 1.5-day entry, 5.5-day exact,
  and 9.5-day exit to one second. Tests cover the 359-to-0 conjunction wrap, a
  square branch, malformed/provenance inputs, incomplete and exactless windows,
  multiple events, changing provider versions, provider failure, zero-orb
  policy, and refinement exhaustion.
- Source check: the real Astronomy Engine 2.1.19 adapter brackets the existing
  JPL-near J2000 Venus-to-natal-Mars conjunction, contains the independently
  checked J2000 sample, and refines the closest point below 0.001 degrees.
- Scope: this service produces calculation facts only. It adds no event scoring,
  category, interpretation, timeline composition, UI, persistence, entitlement,
  notification, production provider call, or deployment behavior.

## Goal 19 natal-chart visualization record

- Commands: focused chart, natal, house, zodiac, and aspect suites;
  `npm run check`; `npm run test:coverage`; `npm audit --omit=dev`; and
  Playwright CLI inspection against development and optimized production builds.
- Presentation boundary: natal-chart read model 1.0.0 accepts only a validated
  `NatalChart`, rechecks body/cusp/aspect completeness and normalized facts,
  retains the complete calculation/provider trace, and deep-freezes the result.
  The mapper and React component perform display geometry and formatting only.
- Source validation: the checked-in Zollikon demo was regenerated through
  Astronomy Engine 2.1.19 and Whole Sign 1.0.0. All ten longitudes remain within
  the fixed 0.02-degree JPL Horizons tolerance; ASC/MC remain within the fixed
  0.01-degree Swiss Ephemeris 2.10.3.5 tolerance; cusps match the source fixture.
- Geometry and semantics: the 600-unit wheel declares 0 degrees Aries at top
  with longitude increasing clockwise. Exact cardinal points, the 359.999-degree
  edge, invalid normalized inputs, all layers, 10 linked planet markers, 12
  houses/signs, 14 aspects, complete data tables, and failure states are tested.
- Accessibility/UI: desktop 1440x1000 and mobile 390x844 screenshots were
  inspected. The skip link moves focus to the main content; keyboard focus and
  activation move from each SVG planet to its exact placement row. Tables expose
  labeled focusable horizontal scroll regions. At 390px and at 200% root text
  there was zero page overflow; reduced-motion emulation disabled smooth scroll.
- Production correction: React development diagnostics exposed multi-node SVG
  aspect tooltip titles, which browsers flatten before hydration. Each title is
  now one deterministic string. The chart timestamp also uses explicit UTC
  formatting. A fresh optimized browser reported zero errors/warnings, all 10
  planet links, both tables, zero external resources, and zero page overflow.
- Scope: this is a sourced local visualization fixture, not a saved user chart.
  No private birth loading, persistence, sharing, entitlements, interpretation,
  scoring, notifications, production provider calls, or deployment was added.

## Goal 18 dashboard and UI-quality record

- Commands: `npx vitest run tests/dashboard-read-model.test.tsx`, focused
  interpretation/daily-reading regression suites, `npm run check`,
  `npm run test:coverage`, `npm audit --omit=dev`, and Playwright CLI browser
  inspection against both dev and optimized production servers.
- Presentation boundary: dashboard read model 1.0.0 accepts the Goal 17 payload
  through `sourceFromDailyReading`, performs display-only date/label/number
  formatting, and deep-freezes the result. React receives no calculation engine,
  provider, score model, interpretation library, birth input, or private account
  data.
- UI: the responsive server-rendered dashboard contains Today, Moon, strongest
  signals, numerology, category meters, visibly separated calculated facts and
  tradition reflections, version trace, claims disclaimer, and a local-demo
  badge. Native headings, landmarks, lists, definition lists, meters, details,
  and text alternatives preserve meaning without color or the Moon graphic.
- State/accessibility coverage: ready, loading, locked, error, and empty states
  are deliberate. At 390px there was zero horizontal overflow; 200% root text
  scaling also had zero overflow. Keyboard testing focused the skip link, moved
  focus to `main`, and opened the version trace. Reduced-motion emulation changed
  root scrolling to `auto`; focus indicators and 44px interactive targets are
  explicit. Core foreground, muted, accent, and mint contrast ratios against the
  dark background were 17.18:1, 9.16:1, 10.41:1, and 10.40:1 respectively;
  muted text against raised surfaces was 8.55:1.
- Visual/performance review: desktop 1440x1000 and mobile 390x844 full-page
  screenshots were inspected. The page uses CSS only, no remote font/image or
  blocking visualization library. The final optimized production browser loaded
  nine resources with zero console errors/warnings and a local SVG icon.
- Content correction: UI inspection exposed duplicated “natal Natal” copy in
  transit and personal-lunar facts. The templates now rely on the already
  qualified target label, interpretation library version is 1.1.0, and focused
  regressions cover both template families.
- Scope: all displayed values are explicitly synthetic local demo data. No
  production persistence, auth loading, public birth data, entitlement, AI,
  notification, or deployment behavior was added.

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
