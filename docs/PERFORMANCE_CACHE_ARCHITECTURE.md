# Performance and cache architecture

## Decision

The launch baseline uses three deliberately different reuse boundaries:

1. immutable owner-scoped PostgreSQL reuse for validated natal charts;
2. bounded process-local caches for shared public daily and lunar calculations; and
3. request-local provider memoization, with no cross-request cache, for private Today and timeline
   calculations.

No distributed cache, observability vendor, production host, or stale-data fallback is selected.
Process caches are optimizations only: each application instance starts empty and may calculate the
same public fact independently. A later shared cache must implement the existing interfaces and
preserve the same validation, expiry, version, privacy, and generic-failure rules.

## Inventory and budgets

| Flow                                 | Scope and identity                                                                                                                                                                | Lifetime/cap                                                                         | Deterministic work budget                                                                                                                    | Failure/invalidation                                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protected natal chart                | PostgreSQL row owned by internal account; SHA-256 identity covers owner, profile/revision, civil-time resolution, coordinates/source, chart/house/aspect/provider/config versions | Indefinite while source account/profile exists; deletion cascades                    | One generation under owner/input advisory lock; exact replay returns `cached`                                                                | Version/input change misses; stale profile conflicts; no cross-owner key                                                                                  |
| Public daily horoscope               | Global UTC date plus loader/entry/TTL, provider/data, aggregate/projection/read-model, lunar, aspect, sample/target, and interpretation versions                                  | 15 minutes, clamped at UTC rollover; 2 process entries; 15-minute route revalidation | One provider position request on miss, zero on hit; 12 read models revalidated on every hit                                                  | Expired/corrupt entries delete then regenerate; cache read/delete fails closed; write failure serves fresh data                                           |
| Public lunar date                    | Global canonical UTC date plus loader/entry/TTL, provider/data, calendar/phase/search, sampling/tolerance/iteration versions                                                      | 6 hours; 40 process entries; 6-hour route and daily sitemap revalidation             | Reference `2000-01-01` uses exactly 59 underlying position calls for 19 coarse observations plus refinements; zero new provider calls on hit | Expired/corrupt/version-drift entries delete then regenerate; source/read/delete failures are generic; write failure serves fresh data; no stale schedule |
| Protected Today                      | Owner-authorized saved profile/chart/revision, current instant, natal-local date, location, entitlement, and all calculation/content versions                                     | Request only                                                                         | Existing provider trace retained in the calculated aggregate                                                                                 | No cache until measured latency/cost justifies the private invalidation surface                                                                           |
| Protected timeline                   | Owner-authorized saved profile/chart/revision, trusted interval/scope/timezone, entitlement, and all engine/search/policy versions                                                | Request-local provider memoization only                                              | One 12-hour shared observation pass; aggregate records coarse observation count, provider call count, refined event count, and omissions     | Provider/search failure remains explicit; no partial or cross-owner reuse                                                                                 |
| Demo Moon/timeline/horoscope modules | Static local fixtures only                                                                                                                                                        | Module/build promise                                                                 | Build-time reuse only                                                                                                                        | Never treated as production public or private calculation cache                                                                                           |

Entry caps, provider-call counts, and cache outcomes are deterministic regression budgets. Wall-clock
budgets are deployment-dependent: local Goal 75 reference execution on 2026-08-13 completed the
real 59-call lunar calculation test in 15 ms, while the complete focused cache/performance suite
completed in 1.27 seconds. These observations are evidence, not portable service-level objectives.
An optimized local two-request HTTP smoke measured the lunar route at 215.75 ms cold and 49.35 ms
warm; the existing horoscope route reported a Next cache hit on both requests.
Production latency percentiles and memory bytes require the selected runtime and representative
traffic; they remain a deployment gate.

## Privacy-safe measurements

Calculation performance contract `1.0.0` accepts only:

- fixed flow (`public-daily` or `public-lunar`);
- bounded lowercase outcome;
- non-negative elapsed milliseconds; and
- optional non-negative provider position-call count.

The in-process sink aggregates count, total/max duration, and provider calls by flow/outcome. It has
no date, instant, URL, cache key, account, owner, profile, chart, birth, location, name, provider
error, or arbitrary label field. Sink validation/failure can never change calculation availability.
No metrics HTTP endpoint or external exporter is added. Protected flows retain calculation counters
inside their already-private result trace rather than entering the public aggregate sink.

## Cache integrity and concurrency

- Cache keys contain all result-changing engine/config/provider versions and no public input beyond
  the bounded UTC date.
- Public cache values are treated as untrusted. Exact entry fields and timestamps are checked, then
  the complete aggregate is revalidated through its read-model boundary before a hit is returned.
- Identical misses coalesce per process. The caller performing the calculation records provider
  calls; coalesced waiters do not double-count them.
- Memory caches evict the oldest inserted key at their declared cap. Expiry never permits stale
  serving. Cache write failure is non-fatal only after a complete fresh value passes validation.
- Authentication sessions and authenticated HTTP responses remain uncached. Private calculation
  reuse stays owner-scoped in PostgreSQL or request-local; public caches never accept private input.

## Promotion gates

Before choosing a distributed cache or production metrics exporter:

1. verify the deployment runtime, instance topology, cold-start behavior, memory limit, and trusted
   monotonic clock;
2. collect privacy-reviewed miss/hit/coalesced/failure counts and latency percentiles under
   representative traffic without adding high-cardinality labels;
3. demonstrate material provider cost or latency benefit over process-local behavior;
4. preserve cache-entry validation, explicit TTL/cap, atomic coalescing/locking, version-complete
   keys, account erasure, and fail-closed provider behavior; and
5. threat-model credentials, network access, poisoning, tenant isolation, retention, backups, and
   outage behavior before production mutation.
