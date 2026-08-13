# Runtime deployment contract

Status: locally verified; no cloud resources or live credentials exist

## Artifact

The production artifact is an OCI image built from `Dockerfile`. Its Node.js base is pinned by tag and
multi-platform digest to Node 24.15.0 on Debian Bookworm slim. The build uses `npm ci`, Next.js
standalone output, an immutable non-secret deployment ID, and a BuildKit secret mount for the Server
Actions encryption key. The key is available only to `next build`; it is not a build argument, copied
file, image environment value, or committed fixture.

The runtime image contains only the standalone trace, public assets, static chunks, and two startup
scripts. npm, Corepack, Yarn, package-manager entry points, source/tests/docs, Git data, local output,
and environment files are absent. The runtime runs as the upstream `node` user, with an exec-form Node
entrypoint and HTTP health check. The disposable topology additionally enforces a read-only root,
16 MiB `/tmp`, no added Linux capabilities, and `no-new-privileges`.

The pinned base initially contained fixable 2026 GnuTLS findings. The runtime stage installs exact
Debian `libgnutls30` `3.7.9-2+deb12u7` and removes package managers not needed to serve the app. A
pinned Trivy 0.73.0 image is the local high/critical vulnerability and secret gate.

## Required runtime configuration

- `NEXT_DEPLOYMENT_ID`: 7-128 URL-safe characters; identical for every task in one immutable release.
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`: canonical base64 encoding of exactly 16, 24, or 32 random
  bytes; supplied at build and runtime through separate secret delivery.
- `NEXT_SHARED_CACHE_ENABLED=true`: required by the production container.
- `NEXT_SHARED_CACHE_URL`: `rediss://` in any deployed environment. Plain `redis://` is accepted only
  for localhost, an IP literal, or Docker DNS name `valkey` with the explicit local-only flag.
- cache prefix, connection timeout, and entry TTL are bounded and reject malformed configuration.
- `APP_TASK_MAX_COUNT`, `DATABASE_MAX_CONNECTIONS`, and `DATABASE_RESERVED_CONNECTIONS` must prove
  `task maximum * 32 current pool slots + reserve <= database maximum` before startup.

The 32-slot figure is the current per-task worst-case sum: Better Auth 8, account 4, authentication
email 4, feedback 4, Paddle 8, and public compatibility share 4. It is deliberately conservative;
changing any pool requires changing and retesting the assertion. Migrations and operator access use
the reserved headroom, never an application task pool.

## Shared cache boundary

`cache-handler.cjs` implements the stable singular Next.js `cacheHandler`, which owns ISR, server
response, patched fetch, and path/tag revalidation. This application does not currently use a
`use cache` directive, so the separate plural streaming `cacheHandlers` API has no consumer and is
not configured.

During `next build`, the handler delegates to the exact installed Next.js filesystem handler so
pre-rendered pages are packaged normally without contacting Valkey. At runtime it uses Redis protocol
through the pinned `redis` 6.2.1 client and falls back read-only to packaged build entries on a miss or
cache outage. Runtime writes are external only.

- entry and tag keys are SHA-256 digests under a validated namespace; raw URLs/tags are not keys;
- V8 serialization preserves the Buffer and Map values used by the installed Next.js contract;
- entries are atomic Redis values, limited to 10 MiB, versioned, bounded by TTL, and validated on read;
- corrupt/oversized runtime entries are misses and are deleted;
- tag invalidation writes shared timestamps, and every instance compares entry creation time against
  explicit and soft-tag timestamps;
- read/write connection failures log only a fixed optional debug message with no URL, key, or data;
- failed runtime writes lose cache reuse but do not replace database/calculation truth;
- on Valkey loss, packaged ISR remains available, but fresh distributed invalidation is unavailable.
  This degraded state must alarm in staging/production and blocks claims of current revalidation.

The handler intentionally imports the installed framework filesystem implementation only for its
build artifact and read-only packaged fallback. Next.js remains exactly pinned; any framework upgrade
must rerun the complete image/two-instance gate and re-review this internal boundary.

## Disposable topology and verification

`docker-compose.runtime.test.yml` contains two application instances, PostgreSQL 18, and Valkey 8.1.9,
all bound to local/disposable state. `npm run test:runtime` creates a random synthetic encryption key,
builds the image, starts the topology, and verifies:

- both tasks are healthy, non-root, read-only, and serve the same pre-rendered route;
- the deployment ID appears in Next.js HTML and asset cache-busting URLs;
- browser security headers remain present, `X-Powered-By` remains absent, spoofed forwarding headers do
  not affect output, and an invalid opaque share stays private/no-store and generic;
- one process writes an encoded entry that the other reads, then the second invalidates a tag and the
  first observes a miss;
- pre-rendered content and shallow health remain available after Valkey stops;
- SIGTERM ends the direct Node process within the ten-second Docker deadline without SIGKILL;
- the topology is removed, including disposable volumes, in a `finally` path.

Final Goal 80 evidence:

- `npx vitest run tests/runtime-configuration.test.ts tests/shared-cache-handler.test.ts`: 2 files,
  11 tests passed;
- `npm run test:runtime`: image build and the complete two-instance topology passed;
- `npm run scan:runtime`: zero fixable high/critical OS or Node package findings and no detected image
  secret with pinned Trivy 0.73.0;
- `npm run release:check`: see the Goal 80 record in `docs/PROJECT_STATUS.md`.

## Remaining production gates

This is not staging evidence. The test does not prove CloudFront/ALB source restrictions, TLS Valkey,
RDS failover, real transaction pools under load, old/new image routing, ECR scanning, signed artifact
promotion, current AWS limits, or live alarms. The health endpoint remains shallow liveness. The first
AWS-like environment must add readiness outside this route and repeat the two-instance, proxy/cookie,
RLS, cache loss, rolling revision, and restore tests before any external GO decision.
