# ADR 0003: PostgreSQL and Drizzle persistence

Status: accepted
Date: 2026-08-09

## Context

The logical model contains private birth, relationship, reading, billing, and
notification data. It needs portable PostgreSQL semantics, reviewable
migrations, deterministic constraints, server-owned row isolation, and tests
that require no production credentials. The managed database and
authentication providers are not yet selected.

## Decision

Use PostgreSQL as the database contract, Drizzle ORM 0.45.2 for typed access,
Drizzle Kit 0.31.10 for checked-in SQL migrations, and `pg` 8.23.0 for the Node
runtime. Do not use schema push as the normal workflow.

Use a constrained `app_user` database role and forced row-level security for
all private tables. The request owner is carried in the transaction-local
`app.current_user_id` setting. Only verified server authentication may set it.
The database owner remains a migration and maintenance identity, never an
application request identity.

Run migration tests against the official PostgreSQL 18 container with an
in-memory temporary filesystem. The test path applies the exact checked-in SQL
to an empty database and verifies constraints, indexes, cascades, default-deny
behavior, and two-owner isolation.

## Invariants and deployment sequence

- Private rows cannot cross account boundaries through direct or derived tables.
- Deterministic data retains input hashes and engine, provider, configuration,
  scoring, or content versions as applicable.
- Account deletion cascades through private profile and calculation aggregates.
- Public content is read-only to the application role; public compatibility
  access will use a separate deliberately scoped boundary later.
- Provision migration privileges and the runtime role before applying the two
  initial migrations, then deploy application code that always opens an
  identity-scoped transaction.

This is an initial empty-schema migration, so there is no compatibility window,
backfill, table rewrite, or production locking risk yet. No production migration
is authorized by this ADR.

## Recovery

The recovery model is restore from backup or apply a reviewed forward-fix
migration. Applied migration files are immutable. Before production, test the
target provider's backup/restore process, role provisioning, pooling behavior,
TLS, and migration lock/timeout controls.

## Consequences

The project remains portable across managed PostgreSQL providers and gains
database-enforced isolation before authentication UI exists. Drizzle Kit has a
development-only moderate advisory in a transitive legacy esbuild loader; it is
not shipped in the production dependency graph or exposed as a network service.
The risk is recorded and must be rechecked on upgrades. No high or critical npm
advisory is present.
