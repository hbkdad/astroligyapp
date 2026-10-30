# Database role provisioning runbook

This runbook implements ADR 0024. It is provider-neutral and non-authorizing. It must first be rehearsed in a
disposable or isolated staging database with the exact managed PostgreSQL service and certificate chain.

## Inputs and separation

- Reviewed `config/database-role-policy.json` and exact application commit.
- PostgreSQL major 18 and all checked-in migrations.
- An isolated bootstrap administrator supplied by the selected provider.
- Separate, generated credentials for the migrator and each runtime login. Never place values in SQL files,
  arguments, Git, tickets, logs or evidence.
- Exact CA chain and DNS name used by every task with `sslmode=verify-full`.

The bootstrap administrator, migrator, owner and runtime logins are distinct. Runtime tasks never receive the
bootstrap or migration credential. The NOLOGIN owner never receives a credential.

## Baseline ordering

1. Confirm an empty target, PostgreSQL 18, encrypted storage, verified endpoint/DNS, backup and rollback owner.
2. Execute the generated bootstrap contract as the isolated provider administrator. It creates only the owner
   and migrator role shells with null passwords, assigns database ownership, revokes database access from
   `PUBLIC`, and installs bounded login defaults.
3. Inject the migrator credential through the provider's protected secret interface.
4. Apply the historical 16-migration baseline as the isolated bootstrap administrator. This is required by
   legacy SECURITY DEFINER ACL ordering and must be proven against the selected provider before production.
5. Execute the finalizer as the same administrator. It transfers only administrator-owned application objects
   one at a time, preserving non-owner privilege semantics; installs fail-closed owner default privileges;
   creates bounded runtime logins with null passwords; grants exact membership options; and removes any temporary
   migrator-to-owner grant.
6. Compare roles, memberships, owners, forced-RLS flags, policies, routine owners/ACLs, migration history and
   default privileges to disposable evidence. Reject any `PUBLIC` execution on application SECURITY DEFINER
   functions, any runtime ownership/administrative attribute, or any remaining application-role membership on
   the bootstrap administrator. Disable or remove the bootstrap credential through the provider after the
   baseline and retain only the provider's separately controlled break-glass process.
7. Inject runtime credentials separately, configure task-specific URLs, start replacement tasks and verify
   health/auth/two-owner isolation before admitting traffic.

## Future migration ordering

1. Back up and verify recovery evidence; review generated SQL and lock/rewrite risk.
2. Temporarily grant the migrator `app_database_owner` membership with `ADMIN FALSE, INHERIT FALSE, SET TRUE`.
3. Connect as the migrator with the owner role selected and the checked migration timeout defaults. Future
   migrations must not create roles or require superuser/provider-admin behavior.
4. Apply the exact checked-in migration once. Verify schema, owners, ACLs, policies, query plans and application
   compatibility.
5. Revoke the owner membership immediately and prove the migrator has no usable executor or owner authority.
   Perform this revocation in an administrator-owned `finally`/failure path even when migration or verification
   fails; a failed migration must never leave the JIT owner grant active.
6. Prefer a reviewed forward fix. Restore only through the ADR 0023 recovery procedure when its trigger is met.

## Verification

Run:

```text
npm run test:database-roles:contract
npm run test:database-roles
npm run test:database-recovery
npm run release:check
```

The drill must report six bounded logins, all 71 real database tests, separated ownership, revoked JIT migration
authority, `verify-full` success and wrong-chain rejection. It must leave no container or TLS volume behind.

## External NO-GO gates

- Exact managed-provider administrator capabilities and baseline migration parity.
- Provider CA chain, DNS/SAN match, rotation behavior and Node `pg` certificate handling.
- Secret-manager injection/rotation and task replacement/drain behavior.
- Production connection limits, reserved operator/migration capacity, alarms and saturation behavior.
- Any proxy/pooler transaction semantics. No proxy is selected by this runbook.
