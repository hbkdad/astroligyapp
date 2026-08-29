# ADR 0021: Bind a non-authorizing dependency-license review packet

Status: Accepted

Date: 2026-08-29

## Context

ADR 0018 reduced the manual dependency scope to 20 records and defined a future accountable disposition
ledger. Reviewers still lacked a small deterministic input that enumerated only the exact unresolved scope
and bound it to the finalized release evidence. A document that carries names or decisions would create a
second approval system and risk mistaking generated evidence for authorization.

Four remaining missing-text cases now have exact version/integrity matches and immutable publisher sources:
the Next.js `client-only` compiled package and three AWS SDK v3 packages. These can be resolved mechanically
without interpreting custom or copyleft terms.

## Decision

1. Extend reviewed materials with the exact Next.js and AWS SDK bindings recorded in
   `config/release-license-materials.json`. Each binding remains subject to ADR 0018's exact identity,
   integrity, expression, immutable-source, local-path, and normalized-text-hash checks.
2. Export `license-review-packet.json` beside the public release evidence. It hashes the finalized schema-4
   release set, source commit/tree, each artifact's policy/material/evidence/notice scope, counts, and every
   manual record.
3. Fix packet trust to `review-input-only`, review status to `not-requested`, decisions to empty, and
   authorization to false. The validator and activation assertion can never turn this packet into
   redistribution authority.
4. Require three separated roles—evidence preparer, independent license reviewer, and release authorizer—
   but store no people or decisions in the packet. A real outcome belongs only in ADR 0018's independently
   stored accountable disposition ledger.
5. Expire packets after at most 30 days. Dependency identity/version/source/integrity, license expression or
   text, policy/material/evidence/notice hash, source commit/distribution model, and expiry trigger re-review.
6. Add the packet to the credential-free CI allowlist and envelope. Transport and hash binding do not confer
   trust or approval.

## Consequences

- The expected clean evidence scope falls from 20 to 16 manual records: application 15 to 14 and worker 5
  to 2. Two application assertions remain unresolved.
- Custom, composite, copyleft, review-only, missing-assertion, and remaining missing-text cases continue to
  require accountable human review. No terms are accepted and no legal conclusion is recorded.
- Any packet drift, missing/extra record, source mutation, stale scope, role collision, trust elevation,
  decision insertion, or authorization claim fails deterministically.
- External redistribution remains NO-GO.
