# Protected notification boundary

Goal 72 establishes private notification preferences and deterministic candidate
materialization without selecting or invoking a general delivery provider.

## Trust boundary

- The browser posts only an exact versioned profile selection or preference replacement.
  Verified contact, owner, plan, natal chart, birth date, timezone, timeline interval, and
  calculated facts remain server-owned.
- Every operation repeats live-session resolution, internal-account resolution, forced-RLS
  ownership, profile revision, and centralized `alerts` entitlement checks.
- The public projection exposes settings and a bounded candidate history, but no contact,
  owner ID, calculation-run ID, preference ID, idempotency digest, or stored audit identity.

## Preference and materialization contracts

- Preference contract `1.0.0` supports email as a channel declaration, seven Goal 71 event
  families, explicit consent, 0/60/360/1440-minute lead times, and optional quiet hours in
  the server-owned natal timezone. Email delivery is explicitly `provider-unavailable`.
- A replacement writes all event-family rows at one positive revision. Optimistic revision
  checks prevent lost updates; withdrawal cancels every active candidate from an older
  preference revision.
- Materialization contract `1.0.0` accepts only validated Goal 71 facts. It stores complete
  profile/chart/preference/event/interval/config/provider audit identity. Its SHA-256
  idempotency digest excludes only volatile provider calculation time and scheduled time, so
  concurrent equivalent calculations converge while their full provenance remains stored.
- Lead time is clamped to the trusted interval start. Quiet-hour resolution uses the natal
  IANA timezone; nonexistent or ambiguous DST boundaries fail explicitly. A candidate delayed
  beyond its event is omitted, while a zero-lead future event may occur exactly at its
  scheduled instant.

## Delivery lifecycle

Candidates begin in `pending-provider` and cannot be delivered by this goal. The pure lifecycle
contract permits an explicit future provider approval to queue a candidate, then at most four
attempts with deterministic 1-, 5-, and 30-minute retry delays. Sent, exhausted-failure, stale,
and canceled states are terminal. PostgreSQL constraints mirror the transition invariants.

Any future delivery worker must add a reviewed provider adapter, verified server-owned contact
lookup, suppression/complaint handling, atomic due-row claiming, distributed concurrency proof,
operational monitoring, provider feedback reconciliation, and release approval. It must never
reinterpret or regenerate event facts.

## Migration and privacy

Migration `0015_serious_synch` adds nullable versioned columns so legacy rows and old application
writes remain valid during overlap. New writes are constrained by contract and materialization
version. Existing owner RLS and cascades remain unchanged; disposable PostgreSQL tests prove
two-owner denial, concurrency deduplication, revision conflict, consent withdrawal, and account
erasure.
