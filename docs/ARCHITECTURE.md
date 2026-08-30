# Architecture

## Runtime dependency-license evidence

ADR 0017 adds a release-only license-evidence boundary outside both runtime images. The raw SPDX inventory
is correlated with npm lock source/integrity, exact enclosing Next.js package identity, dpkg evidence, the
digest-pinned Node distribution license, and installed license files. A versioned fail-closed policy produces
hashed evidence and notice artifacts; schema-4 dual-release evidence binds those hashes and decision counts.
Manual or prohibited results block external redistribution without changing application runtime behavior.
ADR 0018 extends this boundary with exact publisher-material bindings and an outside-image disposition
ledger. The ledger is authorization evidence, not calculation or runtime state. Schema-4 release evidence
binds its trust/hash/counts and invalidates review after dependency, policy, evidence, distribution-model,
or expiry change. Checked-in synthetic trust is permanently promotion-ineligible.

ADR 0019 adds a credential-free CI evidence boundary above the local release set. The main-only workflow
has read-only repository permission, full-SHA action pins and no environment, OIDC, attestation, package,
registry or cloud authority. Its expiring schema-1 envelope binds immutable repository IDs, workflow/source
commit, runner/tool identity and every retained evidence hash while fixing promotion authority to false.

ADR 0021 adds a deterministic review-input boundary between generated license evidence and ADR 0018's
future accountable ledger. The packet binds the finalized release set and exact manual-record scope, expires
within 30 days, declares separated review roles and re-review triggers, and is permanently non-authorizing.
It stores no reviewer identity, decision, contact information, credential, or legal conclusion.

ADR 0022 separates the ordinary Next.js Turbopack build check from the release-artifact compiler boundary.
The Docker release uses the explicit Webpack path after observed intermittent static HTML/RSC drift, while
the two-uncached-build manifest/config equality gate remains unchanged. Secret-safe public-output diagnostics
improve failures without normalizing or accepting different bytes.

ADR 0020 adds a read-only repository trust-observation boundary and a desired protected-promotion contract.
Observed, unavailable and unproven controls remain distinct. The checked synthetic envelope binds numeric
repository identity, active no-bypass branch rules, successful release evidence, split protected-environment
review, immutable environment-scoped OIDC and verified attestation identity, but is permanently
non-authorizing. No workflow, repository setting, environment, cloud trust or registry subject implements it.

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

Release promotion uses the schema-4 dual-artifact set extended through ADRs 0015, 0017 and 0018. The application and feedback worker
remain independently deployable and independently rollback-capable, but a release set is valid only when
both immutable images and their SPDX evidence bind the same exact source revision. Local ephemeral
Cosign evidence is labelled untrusted; a future remote promotion must verify protected workflow identity,
transparency evidence, OCI referrers, and predicate policy before either ECS task definition changes.

ADR 0016 adds an expiring schema-1 staging-approval envelope above the release set and saved plan. A
credential-free preparation package can expose redacted plan/cost inputs but has no approval authority.
Documentary readiness requires four split reviewers and still cannot apply; live environment evidence
plus a fifth independent staging authorizer is a separate gate. The envelope stores hashes, exact scope,
and opaque principal IDs only—never plan/state contents, calculator links, contacts, credentials, secret
values, or private user data. Production cannot reuse a staging envelope.

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
- Better Auth adapter: exact 1.6.27 uses four Drizzle-owned tables in the isolated
  `auth` schema, database sessions only, and a ten-minute recent-session requirement
  for billing work. Separate execute-only account/contact roles keep application and
  billing code away from auth rows, tokens, hashes, and verification records.
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
- `PersonalTimelineEngine`: request-scoped orchestration over one shared coarse
  all-body observation pass plus the existing validated transit, lunar, and station
  refiners. The server supplies a half-open UTC interval, authoritative saved birth
  date/timezone, and entitlement-derived scope. Forecast is capped at 14 days and
  advanced calendar at 45 days; omissions and truncation are explicit. Request-local
  memoization avoids repeated provider observations without persisting private input.
- Protected personal timeline: `/account/timeline` accepts only an exact opaque
  profile/birth-profile/revision POST. Live session resolution, identity-scoped RLS,
  chart revision/provenance, and centralized `forecast`/`full_transit_calendar`
  decisions run before calculation. The same aggregate supplies Goal 70's nearest
  events. No private identifier enters URLs, routine logs, analytics, or public cache.
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
  in React. Supported transit, primary-phase, and numerology facts pass through the
  existing versioned deterministic interpretation library; station and ingress facts
  expose an explicit unsupported message instead of invented prose.
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
  `projectCompatibilityContent` revalidates the exact aggregate, accepted policy,
  and recomputed scores, then maps each contribution once into a fact-family key,
  category/tone reflection key, and minimal structured parameters. It composes no
  prose and excludes policy rationale and raw relationship inputs.
  The compatibility en-CA library validates complete key/schema coverage and safe
  single-line templates. `renderCompatibilityContent` resolves factual and
  reflection sections independently, applies invariant six-decimal formatting,
  emits provenance-bearing fixed fallbacks, and never recalculates a source fact.
  `composeCompatibilityReport` reconstructs every prior layer with its declared
  policy/library, requires exact equality, and publishes the complete immutable
  children plus category/contribution and rendered/unsupported section accounting.
  `toCompatibilityReadModel` reconstructs that report once more at the presentation
  boundary, then emits only display-ready category summaries, paired factual and
  tradition-reflection items, trace labels, accounting, and the claims disclaimer.
  The static compatibility route consumes this immutable model; React owns no
  calculation, scoring, projection, rendering-template, provider, or private-input
  dependency.
  `projectPublicCompatibilityShare` separately reconstructs the complete report and
  emits only selected scores, confidence, factor counts, rendered fact/reflection
  copy, locale, and disclaimer. It replaces internal factor IDs with sequential
  public IDs and omits chart geometry, calculation provenance, source/rule IDs,
  account/profile data, raw inputs, and token state.
- Compatibility share capabilities: a server-only cryptographic boundary generates
  256-bit opaque base64url tokens. Only a domain-separated SHA-256 digest enters
  storage. Immutable grants carry explicit public/private state, canonical expiry,
  and revocation; validation and constant-time digest matching precede every access.
- Compatibility persistence: `CompatibilityReportRepository` runs every private
  operation inside the existing `app_user` identity transaction. Complete Goal 40
  reports use preserved-order PostgreSQL `json` because reconstruction is byte-
  exact; public payloads are separately projected, versioned, integrity-digested,
  and stored as preserved-order `json`. The raw bearer is returned once and never
  stored. Publish/revoke/delete are owner-scoped and account deletion cascades.
- Public database read: the NOLOGIN `app_share_reader` role receives column-level
  SELECT only for the redacted payload and its non-secret integrity digest. A
  transaction-local canonical token digest feeds a forced-RLS policy that admits
  only the matching public, unrevoked, unexpired row. The role cannot select the
  private report, token digest, owner/profile references, or general table rows.
  No `SECURITY DEFINER` or `BYPASSRLS` dependency is used.
- Public compatibility HTTP: `/match/[token]` is a Node Route Handler that rejects
  noncanonical capabilities before storage access, admits at most four concurrent
  process-local lookups, and maps every miss/failure to the same generic 404. It
  renders escaped static HTML directly so the capability never enters React Server
  Component or client payloads. Responses are private/no-store, noindex,
  no-referrer, frame-denied, script-free under strict CSP, and load only the local
  standalone stylesheet. Distributed edge rate limiting remains a deployment
  control; it must not retain or log raw capabilities.
- Domain services: zodiac conversion, aspect detection, lunar classification, natal charts, transits, and combined context.
- Repositories: persistence contracts expressed in domain types, implemented by infrastructure adapters.
- Optional AI explanation remains deferred behind future validated input/output
  schemas and cannot replace the deterministic renderer.
- Entitlements: nineteen versioned feature keys are configured once into exact
  inherited Free, Personal, and Advanced sets. The server-only policy accepts
  only strict provider-neutral state plus an injected trusted clock and returns
  immutable feature decisions. `trialing` and `active` grant within a start-
  inclusive/end-exclusive period; `canceled` retains access only until that end;
  `past_due`, `paused`, future, expired, malformed, unknown, or version-drifted
  state fails paid access closed. Browser plan/status claims must never be passed
  to this policy; a future authenticated repository boundary supplies the state.
- Subscription transitions: provider adapters must first normalize signed upstream
  events into a strict v1 event containing only an opaque event ID, occurrence
  instant, internal plan key, normalized status, and canonical period. The pure
  server-only engine applies a complete status matrix. Exact replay is duplicate;
  older events are stale; different events at the same instant conflict. Canceled
  is terminal for one provider subscription and cannot extend its access window.
  Access-reducing past-due, paused, or canceled updates may shorten a period so a
  defensive ordering rule never preserves stale paid access. Paused/canceled
  provider payloads may restore an earlier subscription-lifetime start only when
  their exact access-ending instant does not extend the current end. Only the strict
  plan/status/period projection reaches `EntitlementPolicy`.
- Subscription persistence: two additive nullable fields keep legacy/overlap writes
  safe while marking only reconstructable v1 transition rows. A forced-RLS receipt
  ledger stores opaque provider/event identity, a domain-separated normalized-event
  digest, occurrence time, and outcome; `app_user` can only select/insert it, never
  mutate history. `SubscriptionRepository` serializes one provider/subscription
  identity with a transaction advisory lock, applies Goal 46 under the owner-scoped
  transaction, and atomically updates state plus receipt. Unique provider/event
  receipts make idempotency durable beyond the current last-event column. Legacy
  rows remain readable only as unverified and produce no entitlement state until a
  separately designed resynchronization path exists.
- Billing webhook orchestration: the server-only Goal 48 boundary accepts exactly a
  non-empty raw byte body and bounded header record, snapshots a trusted receive
  instant, lowercases unique safe header names, and passes cloned bytes to one
  configured adapter. Only a strict verified provider identity plus Goal 46 event
  can trigger server-side owner resolution and Goal 47 persistence. Verification
  rejects return one generic 400; transient adapter/clock/owner/database failures
  return a generic retryable 503; processed/no-change outcomes acknowledge with 200. State/identity conflicts acknowledge under a separate safe code to prevent
  unbounded provider retries and require aggregate operational reconciliation.
  Dispositions never contain raw body, header/signature, provider/customer/
  subscription/event identity, entitlement state, or exception text.
- Paddle verification adapter: ADR 0007 selects Paddle only for the first signed
  subscription-event adapter. Exact SDK 3.10.0 verifies the untouched UTF-8 body;
  the wrapper independently enforces the documented five-second receipt window in
  both directions, accepts eight explicit subscription lifecycle event types, and
  maps one quantity-one recurring `pri_` reference from injected Personal/Advanced
  allowlists. Dedicated events must agree with status, identifiers and billing
  periods are validated and normalized. Active-like states require Paddle's current
  period; paused/canceled states, whose current period is documented as null, use
  the subscription start plus exact access-ending transition time. Every unknown
  event/product/shape fails closed. No API key, checkout, route, or account inference
  enters this layer.
- Billing customer ownership: a provider-neutral immutable binding is created only
  inside an authenticated `app_user` owner transaction. Global provider/customer and
  owner/provider uniqueness make first binding idempotent and all reuse ambiguous to
  another owner. Webhooks resolve the exact verified provider/customer pair through
  one NOLOGIN role and one security-definer function that returns only an active
  account UUID. The execution role cannot read the binding/account tables, while the
  function's isolated NOLOGIN owner has only the required columns and RLS policies.
  Email, checkout metadata, webhook custom data, profile IDs, and browser claims are
  never ownership evidence.
- Paddle webhook HTTP ingress: one Node.js Route Handler is the bounded transport
  adapter for the verified pipeline. It validates media type, declared and streamed
  body size, and header cardinality before forwarding only the exact raw bytes and
  `paddle-signature`; browser cookies, authorization, debug, and tracing headers are
  discarded. A process-scoped service owns a bounded PostgreSQL pool and composes the
  strict server-only configuration, Paddle verifier, least-privilege owner resolver,
  subscription writer, and clock. Configuration or dependency failure returns only
  a sanitized retryable response. Framework and handler headers enforce no-store,
  anti-framing, content-type sniffing, referrer, and permissions restrictions. No
  outbound Paddle API call, checkout, or customer provisioning occurs at ingress.
- Billing customer provisioning: a server-only provider-neutral orchestrator accepts
  only a verified internal `AccountId` and server-trusted normalized contact. It
  checks the immutable binding first, single-flights one owner/provider in-process,
  delegates lookup/create/ambiguous-result reconciliation to a provider adapter, and
  binds only its validated customer reference. Paddle has no general client-supplied
  idempotency keys, so the abstraction does not claim create idempotency; concrete
  adapters must lookup before creation and re-query after ambiguous failures. Safe
  results expose only ready/reject/retry/reconcile codes and never identity or PII.
- Paddle customer adapter: the exact SDK 3.10.0 customer resource is injected behind
  the Goal 52 contract. The adapter queries active customers by exact normalized
  email with a two-result bound, accepts only one canonical `ctm_` match, and creates
  once only when none exists. Create sends email alone, with no ownership custom
  data. Every potentially ambiguous create failure or malformed success is followed
  by one lookup; no unique proof means manual reconciliation, never blind retry.
- Authenticated billing application service: the only composition order is verified
  session, active internal account, trusted server contact, then Goal 52 provisioning.
  The service does not inspect browser bodies/queries/cookies for owner or email and
  short-circuits every failed trust step. Vendor-neutral verifier, account, and
  contact ports keep authentication selection outside billing. Fixed versioned
  outcomes contain no session, subject, account, contact, provider, or customer data.
  The Better Auth implementation calls the official live session API, resolves the
  internal account through `app.resolve_active_auth_account`, and reads only one
  verified email through `app.resolve_verified_auth_contact`. Both SQL functions
  recheck deletion/ownership; contact also rechecks session ID, subject, expiry,
  freshness, and current `email_verified` state.
- Account deletion: a strict internal same-origin command requires a recent verified
  Better Auth session, an independently resolved active internal owner, explicit canonical
  intent, and current-password reauthentication. The browser never selects the subject or
  owner. One execute-only database function rechecks all identity state under a separate
  NOLOGIN/NOINHERIT owner and serializes on the internal account tombstone.
- Deletion lifecycle: the transaction erases profiles and nested birth/numerology/
  compatibility/share data, calculation runs, owner audit events, auth verification
  values, and the Better Auth user with session/account cascades. It then soft-deletes the
  internal account so bootstrap cannot recreate it. A failure rolls the whole local
  lifecycle back; concurrent and replayed execution converges on the same terminal state.
- Retention boundary: subscription and billing bindings remain for external-provider
  reconciliation and force a reconciliation-required result. Content-free email-feedback
  receipts and keyed recipient suppression remain independent safety ledgers. Their future
  owner/maintenance expiry procedures must be explicit; account deletion cannot silently
  weaken suppression or claim external billing deletion.
- Public authentication HTTP: the dynamic Node.js catch-all does not expose Better Auth's
  complete adapter. A project-owned allowlist admits only reviewed email/password,
  verification/reset, cookie-session read, and sign-out paths, while current-password proof
  stays server-only. Request validation precedes lazy service construction; unsafe paths,
  methods, origins, callbacks, forwarding headers, shapes, and sizes never reach auth or the
  database.
- Auth HTTP output: public responses are purpose-specific projections. Session and auth
  identifiers, bearer/session tokens, request IP/user-agent, provider details, recovery
  tokens, and exceptions never cross the boundary. Same-origin redirects and session
  cookies are preserved under no-store, no-referrer, anti-frame, and non-CORS headers.
- Auth HTTP runtime: one lazy process service owns bounded pools for the isolated auth,
  delivery-ledger, and feedback/suppression roles plus the regional SES client. Build and
  construction make no external call. The current memory limiter is a local safety seam,
  not proof of distributed production abuse control; ingress IP trust, shared limiting,
  sensitive-URL log redaction, browser E2E, and live recovery remain release gates.
- Account entry UI: six no-index first-party pages call only the reviewed public auth
  operations and parse exact privacy projections. The shared session display is advisory
  presentation, never authorization. Passwords remain uncontrolled and are cleared after
  attempts; reset credentials live only in a component reference and are removed from the
  URL before interaction. Internal bootstrap is now a separate zero-field Server Action;
  deletion, private reads, billing, and entitlements remain separate server-authorized
  compositions. See
  `ACCOUNT_ENTRY_RECOVERY_UI.md`.
- Account activation: the `/account` Server Action ignores prior client state, rejects every
  named form field, copies only one bounded cookie header from Next.js request state, and
  delegates to the Goal 62 workflow. The workflow re-verifies a recent live email-verified
  session, bootstraps through an execute-only role, independently resolves the active owner,
  and proves `app_user` readiness. Only ready/authenticate/retry/reconcile reaches React.
  A separate bounded account pool uses `AUTH_ACCOUNT_DATABASE_URL`; it shares no Better Auth
  direct-table or email-delivery authority.
- Account deletion presentation: a separate `/account` danger-zone Server Action accepts only
  ordered version/confirmation/current-password fields, ignores prior view state, reconstructs
  canonical origin and same-origin fetch metadata, and forwards only a bounded cookie into the
  Goal 63 workflow. The account executor additionally holds the execute-only
  `app_account_deletion` role and receives no direct deletion-table grants. Only fixed
  deleted/authenticate/authorize/retry/reconcile states reach React. The UI clears the password
  after each attempt and replaces session presentation only after confirmed local deletion,
  including the reconciliation-required terminal outcome.
- Protected private profiles: dynamic `/account/profiles` reads and mutations copy only the
  bounded session cookie into a server-only composition, re-verify the live session, resolve the
  internal owner, and use forced-RLS `app_user` transactions. The repository evaluates
  `multiple_profiles` through the central entitlement policy inside the same advisory-locked
  create transaction. Integer revisions protect update/delete from lost writes. Only minimal
  private DTOs and fixed action states cross into React; owner/account/subject/plan state,
  database rows, resolution metadata, and provider references remain server-only. See
  `PRIVATE_PROFILE_BOUNDARY.md`.

## Data and cache principles

- Version natal cache keys by normalized birth input, house system, provider version, and engine version.
- Cache shared sky and lunar facts globally at an explicit time resolution.
- Cache personal context by profile, date/time bucket, location, and all calculation/config versions.
- Store derived data only when latency, auditability, or cost justifies it; retain the trace needed to reproduce it.
- Define deletion, retention, and cascade behavior before storing private birth or relationship data.

The implemented cache inventory, deterministic work budgets, corruption/expiry behavior,
privacy-safe aggregate measurement contract, and distributed-cache promotion gates are recorded in
`docs/PERFORMANCE_CACHE_ARCHITECTURE.md`.

The cross-surface HTTP header policy, threat-boundary inventory, findings, CSP/HSTS decisions, and
production security gates are recorded in `docs/SECURITY_PRIVACY_AUDIT.md`.

## Verification architecture

- Unit: pure deterministic boundaries, reductions, scores, schemas, and failure cases.
- Contract: every provider adapter against shared provider tests.
- Integration: persistence, auth boundaries, webhook idempotency, and cache versioning.
- End-to-end: account, private profile, chart, report, entitlement, compatibility, and deletion flows.
- Visual/accessibility: responsive critical pages, keyboard, reduced motion, text equivalents, and contrast.

## Open decisions

- Runtime and deployment verification for the selected composed ephemeris
  adapter on the eventual production host.
- Exact AWS account structure, domain strategy, recovery objectives, observability vendor/export,
  infrastructure-as-code tool, and calculator-backed staging/production budgets. AWS Canada Central
  is the accepted deployment region and service topology, but no account, production access,
  infrastructure, DNS, credentials, or retention operations have been provisioned. Better Auth
  remains a self-hosted framework rather than managed infrastructure. See ADR 0010.
- Coordinate and timezone resolution providers for user-entered locations.
- Production browser end-to-end runner and observability stack. Local critical journeys use
  JSDOM interaction tests plus Playwright CLI inspection without adding a runtime dependency.

## Baseline decisions

- Application: Next.js 16.3 App Router, React 19.2, strict TypeScript, and Tailwind CSS 4.
- Runtime: Node.js 24.15.0, pinned in `.nvmrc` and used in CI.
- Testing: Vitest for deterministic unit/contract tests and JSDOM critical-workflow tests;
  Playwright CLI is the local real-browser inspection path. A production CI browser runner
  remains a release decision.
- Quality: Prettier, ESLint with Next.js Core Web Vitals and TypeScript rules, strict `tsc`, production build, and GitHub Actions CI.
- API style: Server Components for internal reads, Server Actions for first-party mutations, and Route Handlers for external/public HTTP contracts.
- Deployment: AWS Canada Central behind CloudFront/WAF and an ALB, with portable Next.js standalone
  containers on ECS Fargate, RDS PostgreSQL 18, and shared Valkey coordination. Production requires
  at least two application tasks and proof of distributed ISR/tag invalidation, stable Server Action
  encryption, deployment skew protection, bounded database pools, rollback, and cache-outage
  behavior. RDS Proxy remains deferred until transaction-local role/RLS tests prove it safe. No live
  resources exist. See ADR 0010 and `docs/STAGING_IMPLEMENTATION_CHECKLIST.md`.
- Runtime artifact: a digest-pinned Node 24.15.0 build stage and Distroless no-OpenSSL Debian 13
  runtime produce standalone output with an ephemeral Server Actions build secret, start as non-root,
  validate deployment/cache/connection
  budgets, and uses the singular Next.js cache handler for shared ISR/tag state in Valkey. Build-time
  filesystem caching preserves packaged pre-rendered pages; runtime writes are external, validated,
  bounded, and digest-keyed. See `docs/RUNTIME_DEPLOYMENT_CONTRACT.md`.
- Persistence: PostgreSQL 18 contract, Drizzle ORM/Kit, `pg`, checked-in SQL
  migrations, forced row-level security, and real disposable PostgreSQL tests.
  See ADR 0003.
- Authentication: exact Better Auth 1.6.27 installed for self-hosted database sessions
  in an isolated PostgreSQL schema. Protected work remains behind `SessionVerifier`;
  trusted billing email is read live only from the verified auth user row through
  execute-only roles. The minimal public route and account entry/recovery UI are exposed;
  protected internal-account work remains unexposed.
  No managed auth infrastructure is selected. See ADR 0008.
- Internal account bootstrap: a recent live Better Auth database session with current
  `emailVerified: true` is the only identity source. The orchestration invokes a dedicated
  execute-only security-definer function, independently resolves the active mapping, and
  proves identity-scoped transaction readiness before returning a fixed identity-free
  result. Deleted mappings do not reactivate and browser identity fields are ignored. One
  first-party zero-field Server Action invokes the workflow; it is not part of the public
  Better Auth HTTP router and exposes no internal identity.
- Authentication email: Amazon SES API v2 is selected behind a provider-neutral
  dispatch/result contract, using only the `ca-central-1` regional endpoint. The strict
  v1 request/result validators, two fixed local `en-CA` templates, and Better Auth
  callback seam are implemented. Only the injected reference factory sees the raw
  framework token; the dispatcher receives a frozen validated request and every unsafe
  outcome fails generically. The SES adapter pins `@aws-sdk/client-sesv2` 3.1108.0,
  dedicated SPF/DKIM/DMARC/custom-MAIL-FROM identity, required configuration-set
  events, and same-region SNS-to-SQS feedback. The durable service-only delivery ledger now
  reserves separate versioned HMAC reference/request digests, supports retained-key
  rollover, serializes concurrency, and turns abandoned/late work into reconciliation
  without storing recipient, capability, content, or account identity. The concrete
  dispatcher uses a single-attempt injected regional client and only local Simple
  content after durable reservation and keyed suppression lookup. An injected feedback
  processor now validates the fixed regional SNS envelope plus six SES configuration-set
  outcome families, delegates signature authenticity, and writes content-free HMAC-deduplicated
  receipts and permanent-bounce/complaint suppression through a separate least-privilege
  role. A bounded SQS worker now verifies SNS v2 RSA-SHA256 signatures through an exact regional
  HTTPS certificate boundary, extends visibility, and deletes only after durable acknowledgement;
  credential-free doubles exercise partial failures and replay. A separate minimal non-root,
  read-only, no-listener worker artifact and private Fargate service use distinct execution/task roles,
  an exact source-queue policy, exact worker secrets, four database connections per task, a 90-second
  stop timeout, minimum one staging/two production tasks, and backlog-per-running-task scaling capped
  at four. The web and worker artifacts remain independently promotable. Raw payloads, recipients,
  diagnostics, signatures, receipt handles, and IPs are discarded. No account, DNS, credential,
  live queue poll, resource mutation, or live send exists. See ADRs 0009, 0013, and 0014.
- Ephemeris: exact Astronomy Engine 2.1.19 for tropical positions and local
  angles, composed with Whole Sign strategy 1.0.0. No silent house-system
  fallback; exact poles fail explicitly. See ADR 0006.

## Protected natal chart boundary

Protected natal generation builds on the private-profile boundary as documented in
`docs/PROTECTED_NATAL_CHART_BOUNDARY.md`. Civil time is resolved deterministically before the
accepted natal engine is invoked; ambiguous/nonexistent times are explicit terminal readiness
states. Complete chart facts and provenance are written atomically behind owner RLS and a
server-side `natal_chart` entitlement check.

## Protected personalized Today boundary

Dynamic `/account/today` selection posts only an opaque profile/birth-profile pair and current
revision. The server repeats verified-session resolution, forced-RLS ownership, chart-revision,
and centralized `personalized_daily_reading` plus `personal_transits` checks. It then derives a
current transit snapshot, Moon facts, all nine Pythagorean results for the natal timezone's
trusted local date, interpretations, configured heuristic scores, and a minimal dashboard read
model. Browser fields never supply birth data, timezone, plan, provider, or calculated facts.

The first implementation calculates on demand. It intentionally does not persist a nominal
daily snapshot because current sky geometry changes continuously and no historical-reading
product contract yet justifies that private derived record. The fixed-clock composition remains
reproducible from the saved natal provenance and version trace; future caching must introduce an
explicit time bucket and complete cache identity before changing this rule. See
`docs/PERSONAL_TODAY_BOUNDARY.md`.

## Protected notification boundary

Dynamic `/account/alerts` posts only exact opaque profile and preference commands. The server
repeats live-session, owner, forced-RLS, profile-revision, chart, and centralized `alerts`
entitlement checks before storing versioned consent or materializing validated Goal 71 facts.
Contact destination, owner, plan, natal timezone, calculation identity, and facts are never
browser-controlled. Candidates remain inert in `pending-provider`; no general delivery provider
or production worker is selected. See `docs/NOTIFICATION_BOUNDARY.md`.

## Public SEO boundary

Canonical origin and indexing permission are server-owned release configuration. Disabled is the
default and produces a complete robots crawl deny plus an empty sitemap. Enabled mode requires
HTTPS and exposes only reviewed reference guides plus the 12 strict sign routes. Every included
page shares the same canonical, robots, sitemap, visible-breadcrumb, and sanitized JSON-LD
contracts. Demo, private, account, API, and opaque-share surfaces are excluded; dynamic date or
number expansion requires standalone validated utility first. See `docs/SEO.md`.

The public lunar-date extension admits only the current UTC date through 30 days ahead. A shared
geocentric Sun/Moon observation pass supplies UTC-noon geometry and brackets candidate crossings;
the existing lunar search refines event times. A bounded server-only cache keys the complete
date/provider/engine/search policy and coalesces concurrent loads. Unsupported dates 404 and
provider failures remain no-index without partial facts. See `docs/PUBLIC_LUNAR_CALENDAR.md`.
