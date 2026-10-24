# ADR 0022: Use Webpack for release-artifact reproducibility

Status: Accepted

Date: 2026-08-30

Amended: 2026-10-24 for Next.js 16.4.3 `preview-props.json`

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
   digests. Do not ignore or retry content drift. Sort only the keys of Next's semantically unordered app route
   and client/server reference map records after hosted/local evidence and installed framework source identify
   compiler completion/traversal insertion order as their cause. Next.js 16.4.3 additionally emits the same
   random preview credentials in `server/preview-props.json`; validate its exact three-field hexadecimal
   shape and replace only those values with the preview metadata already derived from the protected build
   key. Normalize root and standalone copies, including the JavaScript projections, and no other unexplained
   output.
4. Set Next's typed `experimental.cpus` control to one only when the release-container build supplies the
   fail-closed `NEXT_RELEASE_REPRODUCIBLE_BUILD=true` marker. Next 16.4.3's static export uses this value as
   its worker count. Ordinary Turbopack builds leave the marker absent and retain framework-default
   parallelism. This serializes RSC emission instead of rewriting or discarding differently ordered payload
   rows.
5. Derive timeline interpretation `preparedAt` from the already validated aggregate `composedAt` rather than
   reading the wall clock during static rendering.
6. On a mismatch, compare layers and emit bounded byte excerpts only for the six public root/timeline static
   outputs. Reject the exact build secret and secret-like text, and hash long opaque tokens before logging.

## Consequences

- Release artifacts use a slower but explicitly selected Next.js compiler path; local development and the
  ordinary production build check retain Turbopack coverage.
- Reproducibility evidence remains fail-closed and byte-for-byte. The diagnostic changes evidence quality,
  not the acceptance rule.
- Next 16.3's Webpack `PagesManifestPlugin` iterates `compilation.entrypoints.values()` and writes
  `app-paths-manifest.json` without sorting object keys. `app-path-routes-manifest.json` inherits that order.
  Its `FlightClientEntryPlugin` and `FlightManifestPlugin` likewise serialize traversal-populated Server Action
  and per-route client-reference maps directly. Canonicalizing these exact records and projections changes no
  value or payload.
- Next 16.4.3's only observed post-upgrade drift was `server/preview-props.json`; both random 32/64/64-hex
  copies correspond exactly to the preview values already normalized in `prerender-manifest.json`. The
  normalizer rejects missing, extra, malformed or non-hex fields before writing the same HMAC-derived values.
- After the preview file was stabilized, the next exact-build comparison exposed the existing asynchronous
  RSC row-order race in the six root/timeline HTML/RSC outputs. Because those are application payloads, they
  are not post-processed. Release-only single-worker static export removes the scheduling input at the cost
  of slower image builds; exact byte comparison remains the proof.
- A future return to Turbopack requires repeated exact-commit Linux/BuildKit evidence and an ADR update; a
  successful retry alone is insufficient.
- This decision does not publish, deploy, or change GitHub/AWS settings.
