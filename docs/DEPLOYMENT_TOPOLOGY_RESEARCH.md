# Deployment topology research

Research date: 2026-08-13

This comparison uses current primary provider and installed-framework documentation. Public prices
are USD list prices or planning estimates and must be refreshed in provider calculators before any
purchase. Region selection is a processing-location control, not a claim of complete Canadian
sovereignty; contracts, support access, backups, telemetry, and subprocessors still require review.

## Application requirements

The topology must preserve these existing facts:

- Next.js 16.3 Node runtime, React Server Components, Server Actions, streaming, static output, and
  ISR at 15 minutes and one day;
- PostgreSQL 18 semantics, checked-in forward migrations, forced RLS, `SET LOCAL ROLE`, transaction-
  local `app.current_user_id`, four auth tables, security-definer functions, and multiple narrow LOGIN
  executors;
- private exact birth/name/location and relationship data with Canadian-region preference;
- two or more application instances for production availability, without inconsistent ISR or tags;
- verified proxy identity, HTTPS, custom domains, private database/cache networking, shared route-
  specific abuse controls, immutable artifacts, secrets, rollback, and privacy-safe observability;
- SES API v2, SNS, and SQS in `ca-central-1`, plus Paddle webhook ingress and a future feedback worker;
- bounded process-local public calculation caches that may miss independently, but no cross-instance
  private cache and no stale fallback;
- low initial traffic and a startup-honest cost envelope, with a path to multi-AZ production.

The installed Next.js 16.3 self-hosting guide says a single persistent `next start` instance handles
ISR automatically. Multiple instances or ephemeral containers need a durable `cacheHandler`, disabled
in-memory cache, shared invalidation/tag coordination, a stable
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, and a `deploymentId`. A CDN must preserve the correct cache-key
variants and avoid caching private or `Set-Cookie` responses. These are launch gates.

## Candidate comparison

| Criterion           | AWS-native                                                                                                    | Azure-native                                                                                               | Vercel plus Supabase                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape               | CloudFront/WAF -> ALB -> ECS Fargate; RDS PostgreSQL; ElastiCache Valkey; SES/SNS/SQS; CloudWatch             | Front Door/WAF -> Container Apps; PostgreSQL Flexible Server; Azure Cache; Monitor; cross-cloud SES        | Vercel Montréal Fluid compute/ISR/WAF; Supabase Canada Central PostgreSQL; Vercel drains/observability                                                                                                           |
| Canadian region     | ECS Fargate, RDS, SES, and ElastiCache are available in Canada Central                                        | Container Apps and PostgreSQL Flexible Server are available in Canada Central                              | Vercel `yul1` and Supabase `ca-central-1` are available                                                                                                                                                          |
| PostgreSQL fit      | RDS supports PostgreSQL 18.4 and standard PostgreSQL roles/functions; exact migration proof still required    | Flexible Server supports PostgreSQL 18.4; exact role/RLS proof still required                              | Supabase's current platform track is PostgreSQL 17, creating version drift from the tested PG18 contract                                                                                                         |
| Next.js fit         | Full Docker/Node support, but the project must implement multi-instance cache/tag/version coordination        | Full Docker/Node support with the same self-hosting coordination work                                      | First-class Next.js/ISR, preview deploys, durable regional ISR, Fluid compute, low platform work                                                                                                                 |
| Private networking  | Native VPC between ECS, RDS, Valkey, endpoints, SES/SQS; no cross-cloud database path                         | Native VNet between app/database/cache, but SES and feedback remain cross-cloud                            | Vercel-to-database private connectivity is plan/product dependent; public pooled TLS is the simple path                                                                                                          |
| Abuse controls      | CloudFront/AWS WAF rate-based rules can aggregate by verified source or composite request keys                | Front Door WAF plus platform/network controls                                                              | DDoS/custom WAF is broad; managed rules/multi-region/SLA are Enterprise, and documented WAF rate limiting is plan-gated                                                                                          |
| Background work     | SQS-triggered Lambda or ECS worker aligns with the selected SES feedback architecture                         | Container Apps jobs are credible, but must consume AWS SNS/SQS or introduce an additional bridge           | `waitUntil`, queues/workflows, or external worker add another platform boundary; SES feedback still lands in AWS                                                                                                 |
| Backup/restore      | RDS automated PITR for 1-35 days plus manual snapshots; restore creates a new instance                        | Operational backups up to 35 days plus optional long-term Azure Backup; restore constraints need rehearsal | Supabase Pro daily backups retain seven days; PITR starts around USD 100/month and requires larger compute                                                                                                       |
| Deployment/rollback | ECR digest, Inspector, ECS rolling/circuit-breaker rollback, one-off migration task                           | ACR image, immutable Container Apps revisions, traffic split/rollback                                      | Git previews and atomic Vercel deployments are the strongest developer workflow                                                                                                                                  |
| Observability       | CloudWatch/CloudTrail/EventBridge/SNS are cohesive but require careful cost/PII controls                      | Azure Monitor/Log Analytics are cohesive but require the same privacy work                                 | Built-in observations are easy; durable drains are paid, and alert/SIEM retention still needs an owner                                                                                                           |
| Portability/exit    | Standard OCI, PostgreSQL, Valkey, OpenTelemetry; moderate AWS service coupling around edge/ops                | Standard OCI/PostgreSQL; moderate Azure edge/ops coupling and AWS email dependency                         | High Next.js platform convenience; greater platform cache/build/edge coupling and database version migration work                                                                                                |
| Planning envelope   | Staging roughly USD 100-250/month; minimum HA production roughly USD 300-700/month before support/tax/traffic | Similar rough order, USD 100-300 staging and USD 300-750 HA, plus cross-cloud email operations             | Base can begin near Vercel Pro USD 20 + Supabase Pro USD 25, but PITR (~USD 100), larger compute, drains, and Enterprise security/SLA can move required production well above USD 150/month or to custom pricing |
| Decision            | **Select**                                                                                                    | Credible fallback if Azure ownership/support is materially stronger                                        | Defer for prototype/marketing surfaces; reject as the private launch topology today                                                                                                                              |

The estimates are deliberately ranges, not quotes. They assume small databases and light traffic but
include the often-missed load balancer, cache, logs, backup, secrets, networking, and multi-instance
costs. The AWS Pricing Calculator must produce staging and production estimates with budgets/alerts
before approval. CloudFront flat-rate plans are worth comparing with pay-as-you-go: the Free and Pro
tiers bundle CDN/WAF/DDoS/DNS/TLS/log ingestion, while private VPC origins and SLA appear at higher
tiers and may not be economical at launch.

## Selected topology

Use one AWS account organization with separate non-production and production accounts. Deploy in
`ca-central-1`:

```text
Route 53 + ACM
       |
CloudFront + AWS WAF
       |
Application Load Balancer
       |
ECS Fargate service (2+ tasks across AZs in production)
       |----------------------|
RDS PostgreSQL 18       ElastiCache Serverless Valkey
       |
SES v2 -> configuration set -> SNS -> encrypted SQS -> feedback worker
       |
CloudWatch / EventBridge / alarms / privacy-reviewed log sinks
```

- Build one OCI image with Next.js `output: "standalone"`; store it in ECR by immutable digest and
  block promotion on high/critical application or image findings.
- CloudFront is the sole public hostname. Attach WAF route-specific rules. The origin accepts only
  CloudFront traffic through a reviewed private-origin plan or restricted ALB plus an origin-verification
  control. Do not trust arbitrary forwarded headers; set Better Auth's IP header/proxies from the
  verified CloudFront/ALB chain.
- Run ECS tasks in private subnets across at least two Availability Zones in production. The staging
  cost profile may use one task only while cache coordination is being proven; staging is not HA proof.
- Use RDS PostgreSQL 18 in private subnets. Production is Multi-AZ with 7-35 day PITR chosen from the
  recovery objective; staging may be Single-AZ. Provision the migration owner and each LOGIN executor
  separately. Do not use RDS Proxy until its session-pinning/pooling behavior passes the existing
  transaction-local role/RLS/pool-cleanup suite.
- Use ElastiCache Serverless for Valkey over TLS as a disposable coordination store for Next server
  cache/tag invalidation only. It is not a source of truth and contains no private profile input.
  Implement and test the installed Next.js cache-handler contract; set the in-memory cache to zero for
  multi-instance service. Use a stable Server Actions encryption key and immutable deployment ID.
- Store environment secrets in Secrets Manager, inject only into the task that needs them, and force a
  new deployment on rotation. Prefer workload roles and short-lived GitHub OIDC credentials; no static
  cloud access keys in GitHub or the application.
- Use RDS automated backups plus a pre-migration manual snapshot and separate-account backup copy where
  the approved Canadian recovery design supports it. Restore into an isolated database and run the
  real migration/isolation suite before production.
- Use CloudWatch structured fixed-label signals, ECS deployment events, RDS/ALB/ECS/queue/SES alarms,
  bounded retention, and a named on-call target. Never log birth inputs, names, locations, emails,
  session/capability values, webhook bodies/signatures, database URLs, or cache keys.

## Failure and capacity model

- One ECS task/AZ loss: ALB routes only to healthy tasks. Two tasks are the production minimum.
- Bad application revision: startup/readiness probes plus ECS deployment circuit breaker roll back to
  the last completed image; database compatibility must be forward-compatible first.
- Cache outage: ISR/shared invalidation may lose performance/coordination, but calculation/database
  truth must remain correct. Fail closed for corrupt entries and never use Valkey as durable state.
- RDS primary/AZ loss: production Multi-AZ failover; app pool reconnect behavior must be exercised.
- Migration failure: stop writes/traffic and use a reviewed forward-fix or the rehearsed restore path.
- SES/SQS outage: authentication delivery returns generic unavailable/reconciliation outcomes; it does
  not create sessions or silently use another provider.
- WAF/CloudFront misconfiguration: keep origin access restricted, indexing disabled, and a tested
  break-glass/rollback path. Never bypass security controls by exposing ECS directly.
- Traffic spike: CloudFront/WAF absorb/cache/block first; ECS service scales within a hard maximum; RDS
  connections, Valkey ECPUs, SES quotas, and spend budgets are explicit constraints.

At two application tasks, the Better Auth service alone can allocate up to 40 PostgreSQL connections
from its four pools, before public-share, webhook, migration, and operator capacity. The IaC goal must
measure and cap per-task pools, reserve operational headroom, and set an RDS maximum/task autoscaling
limit together. More tasks are not safe merely because ECS can start them.

## Exit strategy

The OCI image can move to another container platform. PostgreSQL exits through verified logical dump/
restore into an equivalent version, with roles/functions/migrations reconstructed from source. Valkey
is disposable and can be replaced by another Next-compatible cache handler. CloudFront/WAF/Route 53,
CloudWatch, Secrets Manager, and ECS definitions are infrastructure concerns, not domain dependencies.
SES and Paddle remain behind application adapters. Export logs/metrics only through privacy-reviewed
OpenTelemetry or fixed-schema sinks; never make AWS resource identifiers part of domain records.

## Primary sources

- [Next.js 16.3 self-hosting guide](../node_modules/next/dist/docs/01-app/02-guides/self-hosting.md)
- [AWS Fargate supported regions](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate-Regions.html)
- [AWS Fargate pricing](https://aws.amazon.com/fargate/pricing/)
- [ECS deployment circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html)
- [ECS Secrets Manager injection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html)
- [RDS PostgreSQL 18 releases](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/doc-history.html)
- [RDS automated backup and PITR](https://docs.aws.amazon.com/AmazonRDS/latest/gettingstartedguide/managing-backup-restore.html)
- [RDS PostgreSQL pricing](https://aws.amazon.com/rds/postgresql/pricing/)
- [ElastiCache Serverless/Valkey pricing](https://aws.amazon.com/elasticache/pricing/)
- [ElastiCache Serverless security/model](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.corecomponents.html)
- [AWS WAF rate-based rules](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based.html)
- [CloudFront flat-rate plans](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html)
- [ECR enhanced scanning](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning-enhanced.html)
- [Azure Container Apps overview](https://learn.microsoft.com/en-ie/azure/container-apps/overview)
- [Azure Container Apps revisions](https://learn.microsoft.com/en-us/azure/container-apps/revisions)
- [Azure PostgreSQL supported versions](https://learn.microsoft.com/en-us/azure/postgresql/configure-maintain/concepts-supported-versions)
- [Azure PostgreSQL backup/restore](https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore)
- [Vercel Montréal region](https://vercel.com/changelog/introducing-the-montreal-canada-vercel-region-yul1)
- [Vercel Fluid compute/pricing](https://vercel.com/docs/functions/usage-and-pricing)
- [Vercel Next.js/ISR](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Vercel WAF](https://vercel.com/docs/vercel-firewall)
- [Vercel Pro plan](https://vercel.com/docs/plans/pro-plan)
- [Supabase regions](https://supabase.com/docs/guides/platform/regions)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase backups/PITR](https://supabase.com/docs/guides/platform/backups)
- [Supabase PostgreSQL 17 platform notice](https://supabase.com/changelog?types=improvement)
