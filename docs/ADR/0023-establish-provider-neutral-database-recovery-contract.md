# ADR 0023: Establish a provider-neutral database recovery contract

- Status: Accepted
- Date: 2026-10-24
- Decision owners: Unassigned; this ADR authorizes local verification only

## Context

The application has sixteen forward-only Drizzle migrations, private tenant data protected by forced
row-level security, an isolated Better Auth schema, and fifteen application roles. A source backup alone
does not prove recovery: `pg_dump` covers one database, not cluster globals; ownership and role drift can
weaken RLS; and a successful `pg_restore` can still produce an incomplete or over-privileged target.

PostgreSQL 18 documents that `pg_dump` takes a consistent database snapshot without blocking ordinary
readers and writers, while cluster-wide objects such as roles must be handled separately. Custom-format
archives support flexible `pg_restore`, but a restore cannot recover information absent from the archive.
PostgreSQL also warns that restoring a dump executes SQL selected by source superusers, so dump input is a
trusted-code boundary rather than an inert data file. Row security can filter backup content, and roles with
superuser or `BYPASSRLS` attributes bypass policy enforcement. Forced RLS is therefore necessary but not
sufficient: runtime roles must also be constrained and must not own protected objects.

Primary references:

- [PostgreSQL 18 `pg_dump`](https://www.postgresql.org/docs/18/app-pgdump.html)
- [PostgreSQL 18 `pg_restore`](https://www.postgresql.org/docs/18/app-pgrestore.html)
- [PostgreSQL 18 `pg_dumpall`](https://www.postgresql.org/docs/18/app-pg-dumpall.html)
- [PostgreSQL 18 SQL-dump backup and restore](https://www.postgresql.org/docs/18/backup-dump.html)
- [PostgreSQL 18 row security policies](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)

## Decision

Adopt a provider-neutral, credential-free logical-recovery contract for PostgreSQL 18. The checked-in policy
at `config/database-recovery-policy.json` is executable release evidence, not a production configuration or
approval record.

The drill must:

1. create isolated source and target PostgreSQL 18 instances from the same digest-pinned image;
2. apply all journaled migrations to the source and seed only conspicuously synthetic two-owner application
   and authentication data;
3. capture a custom-format single-database archive with ownership omitted, plus a separate role inventory;
4. treat raw role SQL as inspection-only and never execute it; instead validate the exact allowlist and
   synthesize the fifteen required roles as `NOLOGIN` with no superuser, database creation, role creation,
   replication, or RLS-bypass capability;
5. bind PostgreSQL major version, migration set, archive bytes and role manifest to a canonical descriptor;
6. restore into a fresh target with `--exit-on-error --single-transaction --no-owner`;
7. require exact schema, migration history, table-count, forced-RLS, role, ownership and synthetic-row
   invariants; and
8. prove default-deny behavior, two-owner read/write isolation, rejected cross-owner insertion, and denied
   application access to the `auth` schema.

The drill rejects a wrong PostgreSQL major, migration-set drift, incomplete or tampered archives, descriptor
drift, unsafe role attributes, unexpected or missing roles, role passwords, restored application ownership,
target-admin membership in application roles, and cross-tenant access. Temporary archives, descriptors,
credentials and synthetic databases are deleted after the run and are never checked into Git.

The recovery planning values are deliberately non-authorizing assumptions:

| Assumption               | Initial value | Meaning                                                                     |
| ------------------------ | ------------: | --------------------------------------------------------------------------- |
| Recovery point objective |    15 minutes | Maximum intended data-loss window; requires future provider PITR/WAL proof  |
| Recovery time objective  |   120 minutes | Intended service-recovery window; requires timed production-like rehearsal  |
| Backup retention         |       14 days | Minimum planning window; requires approved storage and legal/privacy review |
| Restore-test cadence     |       30 days | Maximum interval between controlled restore exercises                       |

No value above is an SLA. Accountable database, privacy, security and release owners must accept or replace
the values before production and must prove them against the selected provider under realistic data volume.

## Recovery and failure boundaries

- Use restore for database loss, corruption, or a migration failure whose safe forward correction is not
  available. Stop writes first and explicitly account for data created after the selected recovery point.
- Prefer a reviewed forward-fix for an application defect or a compatible forward-only schema issue; never
  invent a down migration during an incident.
- Restore into a new isolated database. Do not overwrite the damaged source or direct traffic until every
  invariant and application smoke check passes.
- Reject an untrusted, mixed-version, incomplete, checksum-mismatched, role-drifted or partially restored
  candidate. A failed single-transaction restore is discarded rather than repaired ad hoc.
- A source operator with dump authority can influence executable restore content. Only an authenticated,
  authorized backup from the selected environment may enter the future production procedure, and operators
  must inspect its table-of-contents and role inventory before restore.

## Consequences

The repository gains deterministic evidence that its current logical schema, roles and RLS behavior survive
a clean PostgreSQL 18 restore without production credentials. `npm run release:check` now includes that proof.

This does **not** prove physical backup recovery, continuous WAL archiving, point-in-time recovery, encrypted
off-site storage, key recovery, provider snapshots, multi-region durability, production data volume, network
access, managed role provisioning, or the stated RPO/RTO. Those remain external release gates documented in
the operations runbook and release manifest.
