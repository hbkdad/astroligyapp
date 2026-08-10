---
name: release-check
description: Determine production readiness for a release candidate across repository state, configuration, migrations, calculations, security, privacy, billing, SEO, accessibility, performance, observability, and rollback. Use before every staging promotion or production release; do not use to bypass missing specialist validation.
---

# Release check

## Procedure

1. Identify the exact commit or artifact, target environment, included migrations, feature flags, external dependencies, and rollback owner/path. Understand unrelated working-tree changes.
2. Run the repository's real format/lint, typecheck, unit, integration, end-to-end, and production-build commands. Treat timeouts and skipped suites as not passing.
3. Require evidence from astronomy, lunar, numerology, migration, security, UI, and SEO validation when their surfaces changed.
4. Verify environment-variable documentation, secret separation, migration order, auth, two-user isolation, entitlements, webhook signatures/idempotency, notification opt-in/unsubscribe, deletion/export, and public-share privacy as applicable.
5. Smoke-test critical production-like flows at mobile and desktop widths, including failure states and reduced motion.
6. Verify canonical/robots/sitemap behavior, error tracking, privacy-safe logs, health signals, alert ownership, backups where applicable, and rollback or forward-fix steps.
7. Produce a release decision: `GO`, `NO-GO`, or `GO WITH ACCEPTED RISK`. List exact evidence, skipped gates, owner, and follow-up. Update `docs/PROJECT_STATUS.md`.

## Release gate

- Use `GO` only when all applicable gates pass and no unresolved critical/high risk remains.
- Use `NO-GO` when a required check fails, times out, is missing, or cannot be evidenced.
- Use accepted risk only when the user or accountable owner explicitly accepts a bounded non-critical risk.

## Prohibited shortcuts

- Do not equate a successful build with production readiness.
- Do not hide skipped checks in prose or call a timeout a pass.
- Do not deploy, migrate production, or change live services without explicit approval.
