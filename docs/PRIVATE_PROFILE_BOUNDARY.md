# Protected private profile boundary

Status: Goal 68 baseline plus Goal 70 birth-name extension accepted on 2026-08-13.

## Scope

`/account/profiles` is a dynamic, no-index Server Component route for authenticated private
display and birth data. It reads through a cookie-only server adapter and exposes create,
update, and explicit delete Server Actions. It adds no public profile route, geocoder,
location inference, chart calculation, provider call, analytics event, external resource,
credential, production mutation, purchase, or deployment behavior.

The versioned `1.1.0` aggregate contains only:

- opaque profile and birth-profile identifiers plus an integer revision;
- a normalized 1-80 character display name;
- an optional normalized 1-160 character full birth name, stored privately and never inferred
  from the display name;
- current and birth IANA timezones;
- a canonical birth date from 1800 through the trusted current date;
- date-only, approximate, or exact local-time precision, with time required only for the
  latter two;
- an optional latitude/longitude pair bounded to six decimals and valid geographic ranges.

Coordinates are accepted only as a complete user-supplied pair. The stored resolution,
coordinate-source, and uncertainty metadata records that provenance; the application never
infers missing time or location.

## Authorization and entitlement

Every read and mutation re-verifies a recent live email-verified Better Auth session, resolves
the active internal account independently, and enters a transaction as `app_user` with
`app.current_user_id`. Browser owner, subject, account, plan, feature, and entitlement fields
are rejected or absent. Forced row-level security remains the object-authorization boundary.

One active profile is the free/personal baseline. Creating another profile requires a current
server-evaluated `multiple_profiles` entitlement. A transaction-scoped advisory lock keyed by
the internal owner serializes capacity checks and inserts so concurrent requests cannot bypass
the limit. The browser receives only the resulting boolean needed to render the create form; it
cannot supply or override an entitlement decision.

Updates and deletes require the opaque owned profile/birth-profile pair and current revision.
Rows are locked before mutation. A stale revision becomes a fixed conflict result, while a
missing or cross-owner pair becomes the same fixed authorization result. Profile deletion is a
hard delete so existing foreign-key cascades remove birth data, derived records, compatibility
reports, and public shares.

## Migration 0012

Migration `0012_secret_sentinels.sql` is additive and must deploy before the Goal 68 runtime.
It adds `profile.revision integer default 1 not null` and checks for:

- bounded display name and current timezone;
- paired current coordinates and revision greater than zero;
- bounded birth timezone;
- the fixed time-precision vocabulary and time/precision consistency;
- paired birth coordinates and coordinate-source consistency.

PostgreSQL can apply the constant revision default without an application backfill. Constraint
creation scans the two private tables and takes normal `ALTER TABLE` locks, so production
deployment should inspect existing-row validity and schedule the short migration before
enabling the route. The prior application has no profile write endpoint and remains compatible
with the new default/checks. If an unexpected legacy value blocks deployment, the safe recovery
is to leave the old runtime active, correct only the identified invalid row through an approved
private-data procedure, and rerun the forward migration; do not edit the checked-in migration.

Migration `0014_absurd_the_order.sql` adds nullable `birth_profile.birth_name` plus a bounded
length check. It is backward-compatible with existing rows. A null name keeps the profile
usable for natal charts but produces an explicit incomplete state for calculations that need
name numerology; unsupported characters fail rather than being approximated.

## Privacy and UI behavior

Raw names, birth dates/times, timezones, and coordinates are rendered only on the authenticated
private route. They are not placed in URL paths, query strings, analytics, routine logs, error
messages, public fixtures, or public-share payloads. The client receives a minimal DTO rather
than database rows, identity subjects, sessions, account UUIDs, subscriptions, provider
references, resolution internals, preferences, timestamps, or deletion state.

The UI explains irreversibility, uncertainty, and optional location handling; provides an
empty state and entitlement state; uses semantic labels, fieldsets, details, status/alert
feedback, 48-pixel controls, and explicit delete confirmation; disables pending resubmission;
and makes no claim that saving a profile has generated a chart.

## Verification

- Contract tests cover Unicode normalization, Gregorian/date boundaries, IANA timezones,
  local-time precision, paired coordinates, six-decimal limits, UUID/revision validation, and
  exact projections.
- Action/composition tests cover cookie-only forwarding, prior-state ignorance, exact ordered
  forms, hostile/duplicate/reordered/file fields, live-session owner derivation, fixed safe
  results, malformed dependencies, and post-success route revalidation.
- Repository and disposable PostgreSQL tests cover action-to-RLS persistence, two owners,
  concurrent profile limits, advanced entitlement, stale revisions, update/delete, rollback,
  cascades, generated constraints, migration upgrade, and the owner-index query plan.
- UI tests and real Chrome inspection cover empty/limit/success/error/pending states, typed
  deletion, keyboard order, focus, long names, mobile/desktop layout, 200% zoom, reduced motion,
  and private-field text equivalents.
