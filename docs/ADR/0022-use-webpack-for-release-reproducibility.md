# ADR 0022: Use Webpack for release-artifact reproducibility

Status: Accepted

Date: 2026-08-30

## Context

Goal 91 CI run `33266047047` built the application twice from the same archived commit, fixed deployment ID,
source epoch, base-image digests, lockfile, and Server Actions key. Attempt 1 produced different OCI manifests:
only application layer 19 differed, and the changed files were the prerendered `/` and `/timeline` HTML, RSC,
and full-segment RSC outputs. The unchanged attempt 2, the parallel credential-free release workflow, local
Docker reproduction, and repeated direct builds passed. This is intermittent rather than an accepted input.

Next.js 16.3 uses Turbopack by default but its installed CLI explicitly supports `next build --webpack`.
Upstream issue [vercel/next.js#63201](https://github.com/vercel/next.js/issues/63201) remains open and records
intermittently different outputs from identical production builds. The project must build once and promote
the same digest; retrying until two outputs happen to match is not an acceptable release control.

The static demo call graph also contained one wall-clock read when projecting timeline interpretations. That
timestamp was not a deterministic fact and did not belong in a pure read-model path.

## Decision

1. Keep `npm run build` on the framework default Turbopack path for ordinary application verification.
2. Add `npm run build:release` as exactly `next build --webpack` and require the production Dockerfile to use
   it. The artifact gate rejects a missing or changed release script and any fallback to the default build.
3. Continue requiring two independent uncached OCI builds to have identical configuration IDs and manifest
   digests. Do not ignore, normalize, or retry content drift.
4. Derive timeline interpretation `preparedAt` from the already validated aggregate `composedAt` rather than
   reading the wall clock during static rendering.
5. On a mismatch, compare layers and emit bounded byte excerpts only for the six public root/timeline static
   outputs. Reject the exact build secret and secret-like text, and hash long opaque tokens before logging.

## Consequences

- Release artifacts use a slower but explicitly selected Next.js compiler path; local development and the
  ordinary production build check retain Turbopack coverage.
- Reproducibility evidence remains fail-closed and byte-for-byte. The diagnostic changes evidence quality,
  not the acceptance rule.
- A future return to Turbopack requires repeated exact-commit Linux/BuildKit evidence and an ADR update; a
  successful retry alone is insufficient.
- This decision does not publish, deploy, or change GitHub/AWS settings.
