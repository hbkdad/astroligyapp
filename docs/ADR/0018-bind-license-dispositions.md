# ADR 0018: Bind accountable license dispositions without fabricating approval

Status: Accepted

Date: 2026-08-28

## Context

Goal 87 routed 27 application and 5 worker records to manual review. Twelve application records lacked
adjacent text but did have version-matched, commit-addressed publisher material. The rest include custom,
composite, copyleft, exception, missing-assertion, missing-full-text, or source-provenance gaps that an
automated gate must not reinterpret.

The release set also needs a future path for accountable human dispositions. Checking in an “approved”
fixture or treating an opaque hash as approval would be unsafe. The data model must support a real review
later while the repository contains synthetic fixtures only and current promotion remains blocked.

Authoritative material used for the mechanical reduction:

- [Edge Runtime exact release commit](https://github.com/vercel/edge-runtime/tree/440c123a37284d6a852ce453af810ad484ecfc01)
- [Sharp exact package commit](https://github.com/lovell/sharp/tree/1018449164723ba0203c1beffaba0e21f7829c18)
- [Next.js 16.3.0 provenance commit](https://github.com/vercel/next.js/tree/d73f5622e226358dcef8cf7a8a373333ff265ae7)
- [Node Redis exact package commit example](https://github.com/redis/node-redis/tree/ba1b90b9ce00f47af4330a1614c7fac6bcd94384)

## Decision

1. `config/release-license-materials.json` binds each accepted publisher text to the exact observed package
   name/version, locked artifact integrity, immutable 40-character Git commit URL, local evidence path,
   and normalized text SHA-256. A source, integrity, version, expression, path, or text mismatch fails.
2. Publisher text may reduce only “authoritative text unavailable” records whose declared SPDX identifier
   is already permitted by policy. It cannot override missing assertions, custom terms, copyleft/composite
   terms, conflicts, or prohibited identifiers.
3. Release-set schema 4 and artifact-manifest schema 3 add a disposition summary: trust, ledger hash,
   approved/rejected/remediation/undisposed counts, and total dispositions. With no ledger, the hash is null
   and every manual record is undisposed.
4. A disposition ledger must bind the exact repository commit, both policy/evidence hashes, every manual
   package identity/expression/source/integrity/text hash, independent opaque preparer/reviewer identities,
   review/expiry times, four mandatory re-review triggers, an evidence source, note reference, and outcome.
5. Repository test data is synthetic. The negative baseline uses `synthetic-fixture-only` trust and synthetic
   URNs; a positive contract case uses `.invalid` review URLs solely to exercise the accountable path. No
   ledger is checked in, and no fixture represents approval. A future real `accountable-human` ledger requires
   immutable HTTPS evidence records and is not created by this goal.
6. Promotion requires zero unresolved/prohibited results. If manual records exist, it additionally requires
   accountable-human trust, zero undisposed/rejected/remediation results, and a bound ledger hash.

## Consequences

- Application manual reviews fall from 27 to 15; the worker remains at 5 because its missing publisher
  text/provenance cases cannot be resolved without inference. Twenty records remain honestly manual.
- No legal conclusion, waiver, acceptance, approval, publisher contact, or external redistribution occurs.
- Any dependency, evidence, policy, distribution model, or expiry change forces re-review.
