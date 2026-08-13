# ADR 0010: Select an AWS Canada Central container topology

Status: accepted
Date: 2026-08-13

## Context

Goal 78 established a reproducible internal source release candidate but external promotion remains
blocked on a target host, database, backup, proxy, abuse controls, provider operations, observability,
and production-like verification. The application is a complete Next.js 16.3 Node service with ISR,
private PostgreSQL 18 data, multiple narrow database executors, SES/SNS/SQS email boundaries, Paddle
webhook ingress, and no selected deployment platform.

Current primary sources and the installed Next.js guide were reviewed on 2026-08-13. AWS-native,
Azure-native, and Vercel plus Supabase topologies are compared in
`docs/DEPLOYMENT_TOPOLOGY_RESEARCH.md`. Pricing is a planning range and must be recalculated before
purchase.

## Decision

Select an AWS-native topology in Canada Central (`ca-central-1`) for staging and the first production
candidate:

- Route 53 and ACM for DNS/certificates;
- CloudFront with AWS WAF as the only public edge;
- an Application Load Balancer in front of an ECS Fargate service;
- private RDS PostgreSQL 18, Single-AZ only for staging and Multi-AZ for production;
- ElastiCache Serverless for Valkey over TLS for disposable Next.js cache/tag coordination;
- ECR images by digest with Inspector scanning;
- Secrets Manager/KMS and workload roles;
- the already-selected SES v2, configuration set, SNS, encrypted SQS, and feedback worker;
- CloudWatch, CloudTrail, EventBridge, alarms, and budgets with privacy-reviewed schemas.

Use at least two ECS tasks across Availability Zones in production. Before that is allowed, implement
and verify a durable Next.js cache handler, cross-instance tag invalidation, disabled in-memory server
cache, a stable Server Actions encryption key, and an immutable deployment ID. Staging begins with one
task only to validate container/runtime/database behavior, then must pass a two-task coordination and
rolling-deployment exercise before it can represent production.

Do not use RDS Proxy initially. The application relies on transaction-local identity and role changes;
pooler session-pinning and cleanup must pass the real authorization suite before selection. Direct pool
budgets, RDS connection headroom, and ECS maximum task count are one jointly reviewed control.

This ADR selects architecture only. It does not create an AWS organization/account, accept terms,
purchase services, create resources, add secrets, change DNS, build infrastructure, migrate data, send
email, connect Paddle, enable indexing, or deploy.

## Why this topology

AWS is the only compared option that simultaneously preserves the tested PostgreSQL 18 contract,
keeps application/database/cache/email/feedback operations in one Canadian region and cloud, provides
standard OCI/Node execution, supplies shared edge abuse controls, and matches the already-accepted SES
boundary. Its operational burden is higher than Vercel, but that burden is explicit and testable.

Azure is a sound container/PostgreSQL 18 fallback, especially if the accountable operator already owns
Azure skills and support. It loses today because SES/SNS/SQS would remain in AWS, dividing IAM,
networking, alerts, incident response, and bills across clouds without a product benefit.

Vercel has the best native Next.js, preview, and ISR experience and now provides Montréal compute.
Supabase provides Canada Central. The combined topology is deferred because the managed database is on
the PostgreSQL 17 track rather than the tested 18 contract, private network/advanced WAF/SLA features
are plan-dependent, required PITR starts around USD 100/month, and SES feedback still needs AWS. It may
be reconsidered for public-only/marketing surfaces or after a complete PG18, role/RLS, private-
networking, backup, and cost proof.

## Security and privacy boundaries

- CloudFront is the public trust boundary; origin access is restricted and AWS WAF applies distinct
  rules to auth, recovery, share, webhook, calculation, and general content paths.
- Proxy/IP headers are trusted only for the verified CloudFront/ALB path. Direct origin requests fail.
- RDS, Valkey, tasks, and feedback queues are not publicly reachable. Database roles remain narrower
  than network access and production application tasks never receive migration-owner credentials.
- Secrets are injected only into the task/worker that needs them and rotated by a new immutable task
  revision. No long-lived GitHub AWS key is allowed; CI uses short-lived OIDC role assumption.
- CloudWatch/log sinks use fixed low-cardinality fields and exclude all private birth, name, location,
  relationship, email, session, share-token, webhook, signature, and credential material.
- Public indexing remains disabled through staging and the complete domain/canonical/search smoke.

## Deployment and migration order

1. Approve accounts, owners, region, cost calculators/budgets, recovery objectives, and service terms.
2. Implement/review infrastructure as code for networking, edge, registry, secrets references, RDS,
   Valkey, queues, tasks/workers, observability, and least-privilege roles. Create no resource from an
   unreviewed local command.
3. Build once with pinned Node/npm, `output: "standalone"`, stable deployment ID, SBOM, secret scan,
   application gate, and ECR image scan. Promote the digest, never a mutable tag.
4. Restore a backup fixture into staging; provision narrow roles; run legacy/latest migrations and the
   complete RLS/auth/billing/email/notification database suite.
5. Run one migration task using only the migration secret. Start the application with runtime secrets;
   keep indexing, delivery, checkout, and notification delivery unavailable.
6. Prove one-task behavior, then two-task cache/tag/Server Action coordination, rolling deployment,
   circuit-breaker rollback, RDS failover/reconnect, Valkey loss, queue retry/DLQ, and WAF limits.
7. Complete authenticated two-account, provider sandbox, privacy, browser, NVDA/VoiceOver, backup/
   restore, incident, headers/cache/TLS/proxy, and observability/on-call gates before any production GO.

## Cost and capacity

Use the AWS Pricing Calculator before approval. Planning envelopes are USD 100-250/month for a small
one-task/Single-AZ staging environment and USD 300-700/month for a minimum two-task/Multi-AZ production
environment, excluding tax, paid support, domain registration, material traffic, and optional higher
CloudFront tiers. Set monthly budgets and anomaly alerts before resource creation.

The application currently exposes at least 20 configured Better Auth PostgreSQL pool slots per task.
Two tasks therefore begin around 40 potential connections before other routes, migrations, and operator
headroom. Infrastructure implementation must measure and reduce/cap pools as needed; ECS autoscaling
must never exceed the database connection budget.

## Recovery, failure, and exit

ECS health checks and the deployment circuit breaker roll application revisions back only when the
database contract remains compatible. Applied migrations remain forward-only; a reviewed forward-fix
is preferred. RDS automated PITR/manual snapshots restore to a separate instance and must be rehearsed
with application smoke and RLS tests. No rollback claim exists until that succeeds.

Valkey is disposable: loss may reduce cache performance/coordination but cannot alter deterministic or
private database truth. SES/Paddle/cache/provider outages remain explicit unavailable/retry/
reconciliation outcomes without silent fallback.

Exit keeps the OCI image, PostgreSQL migrations/dump, and provider-neutral adapters. Replace AWS edge,
container, cache, secret, and observability resources with equivalents; rebuild roles/functions from
source; export only privacy-safe telemetry. Domain/calculation code does not import AWS infrastructure.

## Consequences and remaining gates

The application gains a coherent Canadian-region infrastructure target and a concrete path to close
every Goal 78 external blocker. It also accepts AWS operational complexity and requires new IaC,
container, shared-cache, queue-worker, connection-budget, restore, and monitoring work before staging.

| Goal 78 external NO-GO item          | Selected control or closure evidence                                                                                         | Owner state                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Host, TLS, proxy, and region         | CloudFront/WAF -> ALB -> private ECS in `ca-central-1`; exact forwarded-header and secure-cookie tests                       | Deployment owner must be named                   |
| Managed database and least privilege | Private RDS PostgreSQL 18, checked-in migrations, runtime roles, TLS, pool caps, and the existing RLS suite                  | Database owner must be named                     |
| Backup and recovery                  | Automated RDS PITR plus a separately rehearsed encrypted restore and measured recovery time/data loss                        | Recovery objectives and owner unresolved         |
| Shared abuse control                 | CloudFront/WAF rate and size controls before ALB, with application limits retained as defense in depth                       | Security/on-call owner must be named             |
| Multi-instance cache/runtime         | ElastiCache Serverless for Valkey plus a custom Next cache handler, stable action key, deployment ID, and two-task tests     | Application/platform owner must be named         |
| Authentication email                 | Existing SES adapter plus regional configuration set, SNS, encrypted SQS, feedback worker, alarms, and suppression exercise  | AWS account/domain and provider owner unresolved |
| Paddle ingress                       | CloudFront/WAF/ALB route with raw-body signature, replay, reconciliation, and live/test secret separation                    | Billing account and owner unresolved             |
| Observability and incidents          | Privacy-safe CloudWatch logs/metrics/events, alarms, bounded retention, dashboards, and escalation runbook                   | On-call owner and retention unresolved           |
| Authenticated end-to-end isolation   | Production-like HTTPS staging with two synthetic accounts, proxy/cookie checks, owner isolation, erasure, and rollback smoke | Test owner and staging identity setup unresolved |
| Assistive technology                 | Current keyboard/browser checks plus manual NVDA and one additional current AT/browser pass on the exact candidate           | Accessibility test owner unresolved              |
| Promotion authority                  | Immutable image/digest, exact manifest commit, cost/resource diff, gate evidence, and a separate production approval         | Accountable release owner unresolved             |

The next goal may implement reviewable infrastructure/configuration scaffolding, but resource creation
still requires explicit user approval after current calculator estimates, owners, AWS account structure,
domain strategy, recovery objectives, and IaC tool choice are recorded.

## Sources

See the complete primary-source list and comparison in `docs/DEPLOYMENT_TOPOLOGY_RESEARCH.md`.
