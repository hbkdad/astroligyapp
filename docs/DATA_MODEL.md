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
- integer mutation revision, timestamps, and deletion state

Private. Names and current location must not enter public routes or routine analytics.
Goal 68 constrains display/timezone lengths, coordinate pairing, and positive revisions. The
first protected UI hard-deletes a selected profile so its existing cascades remove private
birth/derived/share data; account erasure retains its broader tombstone workflow.

### `birth_profile`

- `id`, `profile_id`
- normalized birth date and optional local time
- IANA timezone and resolution metadata
- optional coordinates plus coordinate source
- `birth_time_precision` and uncertainty metadata
- timestamps

Private and sensitive. Preserve whether time/location is user-supplied, resolved, approximate, or absent.
Goal 68 fixes the accepted precision vocabulary to `date-only`, `approximate`, and `exact`,
requires local time only for approximate/exact input, and requires coordinates and their source
as a consistent pair. The initial UI records timezones and any coordinates as user supplied and
does not geocode or infer missing values.

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
- preserved-order complete private report JSON and report version
- explicit share state, random share-token digest, expiry/revocation timestamps
- optional preserved-order redacted public JSON, public version, and integrity digest

Never place raw birth data in the share token or public representation.

The share capability contract uses 32 cryptographically random bytes encoded as
canonical base64url. Store only its domain-separated SHA-256 digest. Public output
is a separately validated redacted projection with sequential public factor IDs;
it excludes private report children, calculation provenance, and internal IDs.
Expiry is exclusive at the stored instant, revocation is irreversible for that
grant, and access must recheck digest, explicit visibility, expiry, and revocation.

Both birth-profile references must resolve through profiles owned by the report
owner; owner ID alone is insufficient. Private operations use forced `app_user`
RLS. Anonymous resolution uses a separate NOLOGIN role with SELECT on only the
redacted payload and integrity-digest columns. Its forced-RLS policy also requires
the transaction-local canonical token digest, public state, no revocation, and an
unexpired timestamp. It cannot enumerate or select private report columns.

Payload columns use PostgreSQL `json`, not `jsonb`, because the validated report
contract currently requires exact serialized key order and these opaque payloads
are never queried internally. The public integrity digest is domain-separated from
the bearer-token digest and is verified before parsing stored public content.

### `subscription`

- `id`, `user_account_id`
- provider-neutral entitlement plan key and status
- external provider references and period timestamps
- last applied provider event

### `billing_customer_binding`

- immutable `id`, opaque `user_account_id`, bounded provider key, and bounded
  provider customer reference; no email, checkout/custom data, profile, or browser
  ownership claim
- globally unique provider/customer pair and one customer per owner/provider,
  preventing reuse across owners and ambiguous resolver results under concurrency
- owner-scoped `app_user` SELECT/INSERT only under forced RLS; no application update
  or delete privilege, and account deletion cascades the binding
- the public application role has no access. A NOLOGIN resolver role can execute
  only a bounded security-definer lookup. The function's separate NOLOGIN owner has
  column-only reads plus explicit resolver RLS policies and is not inherited by the
  application/migration login after installation
- resolution returns only the internal account UUID for an exact bound pair and
  only while that account is not soft-deleted

### `subscription_provider_event_receipt`

- subscription reference plus opaque provider/event identity
- domain-separated digest of the strict normalized event, occurrence time, and
  applied/no-change outcome
- append-only to `app_user`, forced-RLS through the owning subscription, unique by
  provider/event ID, and deleted only through subscription/account cascade
- no raw webhook body, signature, price, checkout value, or provider payload

### `authentication_email_delivery`

- service-only verification/reset purpose and matching local template version
- active rollover-key version plus separate domain-separated HMAC-SHA-256 digests of
  the opaque idempotency reference and complete validated request
- reserved/accepted/rejected/retry/reconciliation-required/suppressed state, bounded
  lease/completion/update timestamps, and an optional private bounded provider message
  reference only where the lifecycle permits it
- unique keyed reference digest serializes first reservation; the state/lease index
  supports abandoned-send recovery. An expired reservation becomes reconciliation-
  required and can never reopen or trigger a blind resend
- forced RLS grants one NOLOGIN authentication-email runtime role only SELECT, INSERT,
  and UPDATE. It cannot delete; `app_user`, Better Auth runtime/resolver roles, and
  public users receive no access
- no account/profile foreign key because signup verification precedes internal account
  creation. The table never stores recipient, capability URL/token, rendered content,
  raw idempotency reference, request payload, name, birth/profile data, or account ID
- retain rows for 30 days after their last update for replay/reconciliation, then remove
  them through an operator-only bounded maintenance job. Retain every HMAC rollover key
  for at least that full window; account deletion does not target this content-free,
  account-unlinked ledger

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
