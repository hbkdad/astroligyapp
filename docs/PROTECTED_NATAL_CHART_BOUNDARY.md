# Protected natal chart boundary

Status: accepted Goal 69 implementation baseline.

## Private command and read projection

The generation command version is `1.0.0`. It accepts exactly `version`, opaque
`profileId`, opaque `birthProfileId`, and the current positive profile `revision`. Birth date,
time, timezone, coordinates, owner identity, subscription state, provider choice, and
calculation configuration are never accepted from the browser. Every input is loaded through
the live internal owner and forced-RLS transaction.

The protected read projection contains only the opaque resource references required by the
form, display name, time precision/readiness, a server-derived generation permission, and an
optional validated chart read model. Private birth inputs never enter URLs, analytics, or
routine logs.

## Civil-time resolution

`resolveCivilTime` version `1.0.0` maps a canonical Gregorian date and minute plus an IANA
timezone to one of three outcomes:

- `unique` returns the exact UTC instant and historical UTC offset;
- `ambiguous` returns every ordered candidate during a clock fold and generates no chart;
- `nonexistent` identifies a clock gap and generates no chart.

The implementation uses the installed runtime's IANA timezone database through `Intl`, scans
the bounded surrounding offset window, supports non-hour and historical second offsets, and
never applies a preferred-offset or gap-shifting guess. Date-only profiles and profiles missing
either coordinate are separately unavailable. Approximate times remain explicitly labeled.

## Authorization, entitlement, and calculation

Both read and generation repeat Better Auth live-session verification and resolve the active
internal account independently. The calculation repository then assumes `app_user`, sets the
transaction-local account identity, selects and locks the owned profile aggregate, verifies the
submitted revision, and evaluates the centralized `natal_chart` entitlement from persisted
subscription state. A browser-supplied plan or ownership claim cannot affect the decision.

Only a unique civil instant and complete user-supplied coordinate pair reach `NatalChartEngine`
`1.0.0`, using accepted Astronomy Engine `2.1.19`, tropical topocentric positions, and Whole
Sign strategy `1.0.0`. No network provider, geocoder, fallback, AI, or interpretation is used.

## Persistence and cache identity

The canonical SHA-256 input identity includes contract/config version, owner and profile
resources, profile revision, resolved UTC instant and offset, timezone, coordinates, and
coordinate source. An owner/input advisory lock serializes duplicate generation. Migration
`0013_powerful_nick_fury` adds owner identity to the existing cache key while preserving its
kind/input/engine/provider/config prefix, and changes the chart-to-run foreign key to cascade so
account erasure remains possible after charts exist.

One transaction persists the source profile revision, completed calculation run, chart aggregate, 10 planet positions,
12 house cusps, and all configured major aspects. Resolution metadata stores the resolver,
input provenance, chart engine, position/house provider data versions, house strategy, aspect
policy, angles, coordinate origin, and sources. Any failure rolls everything back. An exact
replay returns the existing completed run.

## Migration operations

The migration drops and recreates one unique index and one foreign key. Apply during a
controlled window after checking for long-running calculation writes and monitoring lock wait
time. Deploy the new writer only after the migration. If it fails, keep generation disabled and
ship a reviewed forward fix; do not drop accepted charts or restore the old restrictive delete
path. Back up before applying. No production migration is performed by this goal.

## Presentation and claims

The authenticated profile page exposes empty, locked, stale-chart, date-only, coordinate-missing,
ambiguous-time, nonexistent-time, calculating, provider-unavailable, conflict, cached, and
success states. Existing verified charts remain readable when generation is locked. Tables are
the authoritative text representation; provenance is expandable. Astrology remains an
interpretive tradition, and configured aspect strength is labeled as a heuristic rather than a
scientific measurement.
