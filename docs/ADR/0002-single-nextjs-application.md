# ADR 0002: Begin with a single Next.js application

Status: accepted

Date: 2026-08-09

## Context

The product needs a web application, server-side orchestration, public pages, authenticated experiences, external webhooks, and several deterministic domain engines. No implementation or independent deployment requirement exists yet. Starting with a workspace or separate service would add release, build, and contract overhead before runtime constraints are known.

## Decision

Begin with one Next.js App Router application using strict TypeScript and the default Node.js runtime. Preserve explicit domain, application, and infrastructure module boundaries inside `src/`.

Use Server Components for internal reads, Server Actions for first-party mutations, and Route Handlers only for public APIs, external clients, webhooks, health endpoints, or HTTP-cacheable resources. Domain modules cannot import Next.js, React, persistence, billing, auth, notification, or AI modules.

Do not enable Edge runtime by default. Ephemeris native-library or process requirements will be isolated in an infrastructure adapter and may later justify a separate service or package.

## Extraction triggers

Extract a workspace package or service only when at least one condition is demonstrated:

- The calculation engine needs a different runtime, language, native dependency, or scaling profile.
- Multiple applications need the same versioned domain library.
- Independent release cadence or fault isolation materially reduces risk.
- Build measurements show the single application is an actual bottleneck.

## Consequences

- The first baseline is small and can be verified end to end.
- Logical boundaries must be enforced through imports, tests, and review rather than package-manager walls.
- A future extraction remains possible because provider and domain contracts are framework-neutral.
