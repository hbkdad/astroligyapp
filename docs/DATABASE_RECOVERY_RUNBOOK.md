# PostgreSQL recovery runbook

Runbook version: 1.0.0

This runbook implements ADR 0023. It is inactive for production until a target environment and accountable
database, privacy, security, release and incident owners are named. It authorizes no provider purchase,
credential creation, production access, write freeze, restore, cutover or data deletion.

## Credential-free rehearsal

Run from a clean checkout with Docker available:

```text
npm run test:database-recovery
```

The command creates digest-pinned PostgreSQL 18 source and target containers, applies all migrations, seeds
two synthetic owners, creates and validates a temporary custom archive and role inventory, restores the
target, verifies schema/data/ownership/RLS invariants, then removes the containers and temporary material.
It must fail closed. Do not retain its archive or adapt it to use a real database URL.

## Before a production-like rehearsal

1. Record the immutable source commit, migration range, PostgreSQL server/tool major, target environment,
   accountable owners, incident/change reference, declared RPO/RTO and selected recovery point.
2. Confirm private networking, TLS verification, encrypted backup storage and keys, retention/immutability,
   PITR/WAL state, capacity, monitoring and an isolated restore target. Keep credentials and connection
   strings out of tickets, chat, logs and evidence.
3. Verify the backup belongs to the expected environment and database. Record provider object/version IDs,
   checksums and times without recording private rows or secrets.
4. Stop if the backup is incomplete, outside retention, from another PostgreSQL major, missing required
   globals, checksum-invalid, untrusted, or unable to meet the approved recovery point.

## Restore ordering

1. Isolate a new target. Do not overwrite the source and do not permit application traffic.
2. Use the target PostgreSQL major and compatible client tools. Record exact versions.
3. Inspect the archive table of contents and the separate globals/role inventory as untrusted input. Never
   execute raw `pg_dumpall` role output. Reject passwords, LOGIN where not explicitly approved, superuser,
   `BYPASSRLS`, database/role creation, replication, unexpected roles or unexpected memberships.
4. Recreate only the reviewed NOLOGIN role allowlist. Provision LOGIN executors later through the separate
   least-privilege process; do not make them object owners.
5. Create the empty database under the recovery/migration owner. Restore the custom archive with no source
   ownership, exit on first error and one transaction. Discard a partial or failed target.
6. Verify archive checksum, exact migration history, deterministic schema snapshot, expected table counts,
   all forced-RLS flags, object ownership, role attributes/memberships and absence of role passwords.
7. With synthetic owners, prove default-deny, owner A/B read and update isolation, rejected cross-owner
   insert, and denied auth-schema access. Run `npm run test:database` and the applicable auth, billing, email,
   notification and account-erasure smoke checks against the isolated target.
8. Measure elapsed restore and verification time and compare it with the approved RTO. Estimate or measure
   the data-loss interval against the approved RPO. A planning value is not proof.
9. Obtain the required incident/change approvals before any DNS, routing or application cutover. Continue
   monitoring RLS denials, database errors, migration state, queue replay and private-data-safe telemetry.

## Recovery choice

- Use a reviewed forward-fix when the live database remains authoritative and the defect can be corrected
  without discarding accepted writes.
- Use backup/PITR restore for unrecoverable corruption, loss, or an unsafe migration. Freeze writes and make
  the lost-write interval explicit before selecting a recovery point.
- An application-only rollback is permitted only when the previous artifact is compatible with every
  migration already applied.
- Never improvise SQL, remove RLS, grant bypass/superuser privileges, edit migration history, or accept a
  partly restored target to shorten an incident.

## Evidence and cleanup

Retain only private-data-free operational evidence: source commit, PostgreSQL/tool versions, migration range,
provider backup identifiers, checksums, timestamps, invariant results, elapsed time, approvals and incident
reference. Do not retain archives, extracted rows, role passwords, URLs, keys or routine SQL output in Git or
general logs. Delete disposable targets and temporary material after the approved evidence is secured.

## External gates still required

The local drill does not prove provider snapshot/PITR restoration, WAL continuity, encryption/key recovery,
off-site or regional durability, network access, production role provisioning, storage/capacity at real
volume, monitoring/alerting, privacy retention/deletion, or the 15-minute RPO and 120-minute RTO. Exercise
those controls in the selected managed environment before staging or production promotion.
