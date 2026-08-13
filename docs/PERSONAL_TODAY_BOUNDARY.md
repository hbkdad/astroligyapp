# Protected personalized Today boundary

Status: Goal 70 local implementation accepted on 2026-08-13.

## Request and authorization

`/account/today` is dynamic and no-index. Its Server Action accepts exactly contract version
`1.0.0`, an opaque profile ID, opaque birth-profile ID, and positive revision in a fixed field
order. It copies only a bounded session cookie into the internal request. Owner identity, birth
facts, timezone, plan, entitlements, provider selection, score input, and interpretations are
always re-read or composed server-side.

The request re-verifies the live session, resolves the opaque internal account, enters an
identity-scoped `app_user` transaction, re-reads the owned profile and latest completed natal
chart, rejects stale revisions, and evaluates both `personalized_daily_reading` and
`personal_transits` through the central entitlement policy. A cross-owner or missing reference
has the same generic authorization outcome.

## Deterministic composition

One trusted UTC instant drives the transit provider request and natal-timezone local date.
Astronomy Engine 2.1.19 supplies validated topocentric current positions through the existing
`EphemerisProvider`; the transit engine compares those facts with the saved natal aggregate.
The lunar snapshot is derived from that same transit snapshot without a second provider call.

The private full birth name and birth date produce Life Path, Expression, Soul Urge,
Personality, Birthday, Maturity, Personal Year, Personal Month, and Personal Day through
Pythagorean strategy 1.0.0. Display name is never substituted for birth name. Unsupported name
characters and missing birth names return incomplete instead of silently changing convention.
The existing context, deterministic interpretation, category heuristic, daily-reading, empty
timeline, and dashboard projection boundaries complete the minimal read model. AI cannot
calculate or alter any fact.

## Storage and states

Current geometry is calculated on demand and is not inserted into `daily_context` or
`daily_reading`. A cache would need an explicit time bucket and complete profile, natal,
provider, engine, timezone, interpretation, and scoring versions; no present latency or
historical contract justifies introducing that invalidation surface. The saved natal chart
remains the reproducible long-lived input.

The UI exposes explicit authenticate, retry/unavailable, empty, locked, incomplete, stale,
conflict, pending, and ready outcomes. Only the ready dashboard model reaches the shared
presentation component, labeled “Private calculated data”; public demo labeling and routes are
not reused. Private identifiers appear only in the authenticated POST form, never in a URL,
analytics event, routine log, or displayed trace.

## Verification

- Unit and composition tests cover exact commands/projections, hostile over-posting, bounded
  cookie forwarding, auth/entitlement outcomes, all nine numerology facts, unsupported Unicode,
  fixed UI states, and private-ready labeling.
- Disposable PostgreSQL tests cover migration compatibility and checks, both entitlement
  requirements, two-owner denial, missing names/charts, stale charts, revision conflicts,
  fixed-clock idempotency, and Toronto local-midnight rollover.
- Focused astro, transit, lunar, context, numerology, reading, and dashboard suites pass against
  their existing deterministic fixtures and versions.
- The optimized production build exposes `/account/today` dynamically with `noindex, nofollow`.
  Desktop and 390px browser inspection found no horizontal overflow or console warnings; the
  private unavailable state and shared ready dashboard were inspected, while a live
  authenticated ready flow remains a production-environment gate.
