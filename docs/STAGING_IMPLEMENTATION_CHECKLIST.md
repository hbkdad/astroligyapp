# Staging implementation checklist

Status: planning only; no cloud resources exist

## Approval boundary

Documentation, local container/IaC scaffolding, policy tests, and dry validation are normal repository
changes. The following require a separate explicit user approval after a reviewed plan/cost estimate:

- create or modify AWS organization/accounts, IAM identity-center access, budgets, or support plans;
- register/transfer a domain or change DNS/certificates;
- create any VPC, endpoint/NAT, CloudFront, WAF, ALB, ECS, ECR, RDS, Valkey, KMS, secret, queue, SES,
  logging, backup, or monitoring resource;
- store a real credential or private value, request SES production access, verify a sender/domain,
  connect Paddle, or send an email/webhook;
- run a migration against a non-disposable database, deploy an image, enable public indexing, or
  expose a staging/production hostname.

## Decisions required before infrastructure code

- [ ] Name release, database, security/on-call, and rollback owners.
- [ ] Confirm separate non-production and production AWS accounts and `ca-central-1`.
- [ ] Approve an IaC tool and remote-state/locking/recovery model.
- [ ] Approve staging and production AWS Calculator estimates, monthly budgets, and anomaly thresholds.
- [ ] Set staging/production RPO, RTO, backup retention, restore-test frequency, and Canadian backup
      location/contract requirements.
- [ ] Choose domain/hostnames and establish who controls registrar, Route 53, certificates, and DMARC.
- [ ] Decide CloudFront flat-rate versus pay-as-you-go and private-origin versus restricted public ALB.
- [ ] Confirm one-task initial staging, then mandatory two-task production-rehearsal milestone.
- [ ] Decide whether authentication/billing/email features stay unavailable during first staging.

## Repository implementation package

- [ ] Add a production multi-stage Dockerfile using the pinned Node version, non-root runtime,
      `output: "standalone"`, deterministic build arguments, health check, and clean SIGTERM handling.
- [ ] Add `.dockerignore`; prove no `.env`, Git metadata, fixtures with private data, test output, cache,
      or developer artifacts enter the image.
- [ ] Add stable deployment ID and Server Actions encryption configuration with strict validation and
      redacted `.env.example` entries.
- [ ] Implement a versioned Next.js cache/tag handler for TLS Valkey, disable per-instance server cache,
      namespace by deployment, bound TTL/size, reject malformed entries, and prove fail-closed behavior.
- [ ] Add two-instance tests for ISR, tag invalidation, rolling version skew, Server Actions, public cache
      consistency, Valkey loss/corruption, and private no-store responses.
- [ ] Inventory every PostgreSQL pool, cap per-task connections, reserve migration/operator headroom,
      and add a deterministic connection-budget assertion tied to ECS min/max tasks.
- [ ] Add privacy-safe structured logging/metrics interfaces and redaction tests before an exporter.
- [ ] Add a worker entry point for authenticated SES feedback queue messages, bounded batches,
      visibility-timeout/idempotency behavior, DLQ/reconciliation, shutdown, and health/lag signals.
- [x] Add credential-free IaC modules and policy tests for accounts/providers, network, edge/WAF, ECR,
      ECS, RDS, Valkey, secrets references, SES/SNS/SQS, logs/alarms, and backups. GitHub OIDC remains
      deferred until an exact AWS account/role and plan-only CI trust policy receive separate approval.
- [ ] Add image SBOM, secret scan, ECR scan gate, IaC lint/plan/policy tests, and artifact digest output to
      CI without granting deployment permission to pull requests.

## Dry verification before resource approval

- [ ] `npm ci` and `npm run release:check` pass on the exact commit.
- [ ] Container runs read-only/non-root locally, handles SIGTERM, exposes only the application port,
      passes `/api/health`, and completes representative optimized browser smoke.
- [ ] IaC format/validate/lint/security/policy tests pass with no provider credentials or remote mutation.
- [ ] Generated plan contains no public database/cache/task, wildcard IAM, migration secret in runtime,
      long-lived CI key, unrestricted ingress/egress, unbounded retention, or missing encryption.
- [ ] Cost estimate and resource/count diff are attached to the approval request.

## Staging execution after explicit approval

- [ ] Create non-production resources only from the reviewed immutable IaC commit.
- [ ] Restore a disposable backup fixture and run legacy/latest migration plus 71-test database suite.
- [ ] Apply schema once through a one-off migration task; confirm the app role cannot migrate.
- [ ] Deploy one task with indexing/features disabled; verify TLS, proxy headers, cookies, cache headers,
      WAF size/rate rules, private networking, secret rotation, logs, and alarms.
- [ ] Scale to two tasks and prove ISR/tag/Server Action coordination, rolling rollback, pool headroom,
      Valkey outage, RDS failover/reconnect, queue retry/DLQ, and spend ceilings.
- [ ] Run the complete Goal 78 production-like smoke matrix with two synthetic accounts and current
      assistive technologies. Inspect logs/telemetry for private data.
- [ ] Re-run `npm run release:check`, invoke `release-check`, record exact evidence, and issue a new
      staging/production GO or NO-GO. Public indexing and production remain separate approvals.
