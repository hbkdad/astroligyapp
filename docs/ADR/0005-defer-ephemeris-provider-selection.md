# ADR 0005: Defer ephemeris provider selection

- Status: Accepted
- Date: 2026-08-09

## Context

The provider-neutral contract is ready for implementations, but candidate
selection still spans licensing, runtime packaging, reference-data operations,
house calculations, performance, and cost. Structural conformance can be
verified now; numerical acceptance needs independently captured reference
values.

## Decision

Do not select or install a production ephemeris provider in this goal.

Adopt the strict validation wrappers and reusable conformance suite as the
mandatory boundary for every candidate. Use the versioned fixture coordinates
and JPL Horizons query policy to capture independent planetary expected values
during the first adapter spike.

Evaluate Astronomy Engine first as a time-boxed positions-only candidate because
it has a native JavaScript distribution and permissive MIT license. This is an
evaluation order, not a provider selection. Its lack of documented astrological
house-cusp support means it cannot satisfy the complete product contract alone
without a separately validated house implementation.

Keep Swiss Ephemeris as the full-featured astrology candidate, but require an
explicit AGPL-compatible distribution decision or approval of the current
professional-license path before installing or coupling to it. JPL Horizons is
the independent planetary reference and possible remote candidate, not an
assumed synchronous production dependency. NAIF SPICE remains a scientific
toolkit candidate with substantially higher native integration and kernel
operations cost.

## Approval blockers

Selection requires all of the following:

1. Reproducible expected values captured from the declared independent source.
2. A candidate adapter passing conformance and accuracy tolerances without
   silent fallback.
3. Verified house-system support or a separately reviewed house algorithm.
4. Target Windows development and Linux deployment packaging, latency, data
   update, and failure-mode evidence.
5. Confirmed license, redistribution/server terms, and operating cost.
6. Explicit approval before choosing the Swiss commercial or AGPL path.

## Consequences

Natal, transit, event-time, rise/set, and location-aware lunar work remains
behind the provider boundary. The application may continue with deterministic
provider-independent work, but it must not present synthetic conformance data as
astronomical accuracy evidence.

## Goal 8 evaluation outcome

Astronomy Engine 2.1.19 is retained as an exact-version, unselected evaluation
dependency. Its isolated adapter passes structural conformance and all 40 JPL
longitude, latitude, and longitudinal-speed comparisons at the predeclared
tolerances. It omits distance after that field failed the distance budget and
explicitly rejects houses and sidereal output.

This evidence is sufficient to continue evaluating it for tropical positions,
but not to select it as the complete production provider. The original house,
sidereal, operating-model, and final provider approval blockers remain.
