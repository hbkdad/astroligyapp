---
name: database-migration
description: Plan, implement, and verify schema or data migrations involving user profiles, charts, calculations, readings, compatibility, billing, notifications, or audit data. Use for every database mutation or row-level authorization change; do not use for read-only query analysis.
---

# Database migration

## Procedure

1. Inspect the current schema, migration history, database provider, constraints, row-level policies, data volume, and deployment sequence.
2. State invariants, affected private data, compatibility window, locking/rewrite risk, backfill plan, rollback or forward-fix plan, and observability signals.
3. Prefer additive expansion before contractive cleanup. Separate schema changes, backfills, and destructive removal when deployments may overlap.
4. Make migrations deterministic and idempotent only where the framework expects it. Never hide partial failure.
5. Test on a disposable database from the real previous schema, including representative existing rows, missing values, duplicates, ownership boundaries, and rollback/forward recovery.
6. Verify indexes and query plans for material access paths. Recheck authorization and deletion cascades using at least two distinct users when applicable.
7. Record exact commands, before/after schema evidence, row counts, policy checks, and deployment ordering in `docs/PROJECT_STATUS.md`.

## Validation gate

- Existing supported application versions remain safe during the declared window.
- Private rows cannot cross account boundaries.
- Reproducibility/version fields and deletion behavior survive the migration.
- A realistic recovery path is documented and tested where feasible.

## Prohibited shortcuts

- Do not edit an already-applied migration.
- Do not run destructive production SQL or broad cleanup without explicit approval and exact target verification.
- Do not place service credentials or real private birth data in fixtures or logs.
