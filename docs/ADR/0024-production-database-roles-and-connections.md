# ADR 0024: Production database roles and connection safety

Status: accepted
Date: 2026-10-30

## Context

The application already uses forced row-level security and narrow NOLOGIN executor roles, but a production
database needs separately credentialed logins, durable object ownership, bounded connections, verified TLS,
safe session defaults and a migration path that cannot be reused by the application. PostgreSQL 18 separates
role membership into `ADMIN`, `INHERIT` and `SET` options. Role-specific settings apply when a login session
starts and are not re-applied by `SET ROLE`, so timeout limits belong on each LOGIN role.

The checked-in baseline migrations also contain a legacy bootstrap constraint. Several migrations create
NOLOGIN owner roles, transfer SECURITY DEFINER functions to them, revoke the migration session's membership,
and only then issue final `REVOKE ... FROM PUBLIC` and executor `GRANT` statements. An ordinary non-superuser
migrator cannot issue those final ACL changes after losing owner membership; PostgreSQL warns and leaves the
default public function privilege. The disposable drill proves this path must not be represented as safe.

## Decision

Accept policy `astroligyapp.database-role-policy` version 1:

- `app_database_owner` is NOLOGIN, NOINHERIT, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION and
  NOBYPASSRLS. It owns the database and ordinary application objects after bootstrap. `PUBLIC` receives no
  database privilege, and owner-scoped defaults remove `PUBLIC` access to future functions, tables and sequences.
- `app_database_migrator` is a bounded LOGIN with no administrative attributes. For future migrations an
  administrator grants it temporary `SET TRUE`, `INHERIT FALSE`, `ADMIN FALSE` membership in the owner role;
  the grant is removed immediately after the migration. Credentials come only from an external secret manager.
- The existing 16-migration baseline is applied once by an isolated provider bootstrap administrator because
  of its legacy ACL ordering. The finalizer transfers ordinary objects individually, preserving non-owner ACL semantics.
  It never uses `REASSIGN OWNED`, `DROP OWNED`, `CASCADE` or broad ACL reconstruction. Managed-provider ability
  to execute this exact baseline remains a pre-production evidence gate.
- Six bounded runtime logins receive only the executor memberships in the checked policy. Memberships used by
  explicit transaction-local `SET ROLE` have `INHERIT FALSE`, `SET TRUE`, `ADMIN FALSE`. The Better Auth HTTP
  login inherits only `app_auth_runtime` because the library accesses its four auth tables directly; it has
  `INHERIT TRUE`, `SET FALSE`, `ADMIN FALSE` and owns no objects.
- Runtime login defaults are `statement_timeout=15s`, `lock_timeout=2s`,
  `idle_in_transaction_session_timeout=10s`, and `transaction_timeout=60s`. The migrator receives 10-minute,
  5-second, 30-second and 15-minute limits respectively. Application connection pools remain bounded by the
  checked task/database capacity contract.
- Every production database URL uses the exact expected login and `sslmode=verify-full`. A non-TLS URL is
  accepted only for loopback or the local `postgres` test hostname with `DATABASE_ALLOW_INSECURE_LOCAL=true`. The production
  startup validator rejects wrong logins, missing credentials, fragments, duplicate/weaker SSL modes,
  connection-parser authority overrides, startup role options and unverified remote connections.
- Do not select RDS Proxy or another transaction pooler yet. Any proxy must separately prove transaction-local
  role/GUC cleanup, prepared-statement behavior, connection budgets and certificate verification.

## Credential and rotation procedure

Provision role attributes and memberships without passwords. Inject each generated credential directly from
the selected secret manager using a channel that does not expose it in Git, command history, process output or
routine logs. Rotate one login at a time: create the new secret version, update the database credential through
the provider's protected interface, update only the corresponding task secret, replace tasks, verify new
connections and old-session drainage, then revoke the old version. Rotation does not alter memberships,
ownership or migrations.

## Verification and consequences

The disposable PostgreSQL 18 drill applies the real baseline, executes all 71 database tests, transfers
ownership without changing non-owner function privileges, proves a future owner-scoped migration transaction, and checks all
runtime attributes/memberships. Runtime logins cannot create roles, schemas or tables; no runtime or migrator
role owns application objects. Pool reuse clears transaction-local roles and identity GUCs. A synthetic
self-signed localhost chain proves `verify-full`, and a different CA is rejected. No certificate, key, password,
archive or database survives the drill.

This ADR does not authorize a provider, account, credential, proxy, production migration or deployment.

## Primary sources

- [PostgreSQL 18 CREATE ROLE](https://www.postgresql.org/docs/18/sql-createrole.html)
- [PostgreSQL 18 GRANT](https://www.postgresql.org/docs/18/sql-grant.html)
- [PostgreSQL 18 ALTER ROLE](https://www.postgresql.org/docs/18/sql-alterrole.html)
- [PostgreSQL 18 default privileges](https://www.postgresql.org/docs/18/sql-alterdefaultprivileges.html)
- [PostgreSQL 18 client timeouts](https://www.postgresql.org/docs/18/runtime-config-client.html)
- [PostgreSQL 18 SSL support](https://www.postgresql.org/docs/18/libpq-ssl.html)
- [PostgreSQL row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html)
- [PostgreSQL function security](https://www.postgresql.org/docs/18/perm-functions.html)
- [PostgreSQL role membership catalog](https://www.postgresql.org/docs/18/catalog-pg-auth-members.html)
