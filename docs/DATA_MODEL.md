# Data model

Status: accepted and expressed as a PostgreSQL 18 / Drizzle schema and checked-in migrations

The executable source is `src/db/schema.ts`; migration history is under
`drizzle/`. PostgreSQL is the portable database contract, while the managed
provider remains open. Private tables use forced row-level security keyed by a
transaction-local `app.current_user_id` setting and a constrained `app_user`
role. Application code must set that identity only from verified server-side
authentication.

## Principles

- Keep identity, private profile data, deterministic facts, interpretations, and delivery records separate.
- Store normalized source inputs and calculation versions needed to reproduce derived results.
- Avoid duplicating cheap derivations unless caching, historical reproducibility, or auditability justifies it.
- Scope every private aggregate by owner and enforce ownership on the server and in database policy where supported.
- Define retention, export, and deletion behavior before enabling production writes.

## Identity and profiles

### `user_account`

- `id`: application-owned opaque identifier
- `identity_provider_subject`: unique external identity reference
- `created_at`, `updated_at`, `deleted_at`

Do not store passwords when using an external identity provider.

### `profile`

- `id`, `owner_user_id`
- `display_name`
- `current_timezone`, optional current coordinates
- product preferences and notification defaults
- timestamps and deletion state

Private. Names and current location must not enter public routes or routine analytics.

### `birth_profile`

- `id`, `profile_id`
- normalized birth date and optional local time
- IANA timezone and resolution metadata
- optional coordinates plus coordinate source
- `birth_time_precision` and uncertainty metadata
- timestamps

Private and sensitive. Preserve whether time/location is user-supplied, resolved, approximate, or absent.

## Deterministic calculations

### `calculation_run`

- `id`, calculation kind, normalized input hash
- engine/provider/config versions
- requested and completed instants
- status and privacy-safe failure code

Provides provenance shared by chart, transit, Moon, and numerology results.

### `birth_chart`

- `id`, `birth_profile_id`, `calculation_run_id`
- house system and coordinate/timezone resolution metadata
- immutable creation timestamp; superseded-by link for recalculation

### `planet_position`

- `id`, `calculation_run_id`, body identifier
- normalized longitude and optional latitude, distance, and speed
- coordinate frame and units

Constrain longitude to `[0, 360)` after boundary validation.

### `house_cusp`

- `id`, `birth_chart_id`, house number, normalized longitude
- house system

### `aspect`

- `id`, source calculation/chart identifier
- source and target identifiers
- aspect type, exact angle, actual angle, orb
- applying/separating state and normalized strength

Interpretation prose does not belong in this table.

### `transit_event`

- `id`, `profile_id`, transiting body, natal target, aspect identifier
- enter-orb, exact, and exit-orb instants
- score-model version, heuristic strength, category references

### `lunar_event`

- `id`, `calculation_run_id`, event type
- start/exact/end instants and shared location scope when relevant
- phase angle, illumination, and normalized Moon position as applicable

## Numerology

### `numerology_profile`

- `id`, `profile_id`, normalized-input hash
- strategy and normalization versions
- result values plus structured calculation traces

### `numerology_cycle`

- `id`, `numerology_profile_id`, cycle type
- effective range, value, and trace

Keep different traditions and master-number conventions explicitly versioned.

## Context and interpretation

### `daily_context`

- `id`, `profile_id`, effective local date/timezone
- references to natal, sky, lunar, transit, and numerology sources
- score-model version, category scores, contributing signal references
- cache input/version hash

### `content_interpretation`

- stable interpretation key, locale, content version
- fact requirements and deterministic fallback template
- publication state and review metadata

### `daily_reading`

- `id`, `daily_context_id`, interpretation-library version
- optional AI model/prompt/schema versions
- validated output and fallback-used flag

AI text is downstream output and cannot replace calculation records.

## Compatibility, billing, and notifications

### `compatibility_report`

- `id`, owner, two private profile references
- versioned calculation references and category contributions
- explicit share state, random share-token hash, expiry/revocation timestamps

Never place raw birth data in the share token or public representation.

### `subscription`

- `id`, `user_account_id`
- provider-neutral entitlement plan key and status
- external provider references and period timestamps
- last applied provider event

### `notification_preference`

- `id`, `profile_id`, channel, event type
- opt-in state, timezone, frequency controls

### `notification_delivery`

- `id`, preference/event references, idempotency key
- scheduled/sent/failure timestamps and privacy-safe status

### `audit_event`

- opaque actor/resource references, action, timestamp, request identifier
- structured privacy-safe metadata

Do not log names, exact birth details, coordinates, secrets, or generated private readings by default.

## Initial index and lifecycle requirements

- Unique identity-provider subject per account.
- Owner/profile indexes on every private aggregate.
- Unique calculation cache key across normalized input and all version fields.
- Unique webhook provider/event identifier and notification idempotency key.
- Unique active share-token hash; revocation checked on every public access.
- Account deletion must remove or irreversibly anonymize private profiles, calculations, reports, shares, and notification data according to documented retention rules.
