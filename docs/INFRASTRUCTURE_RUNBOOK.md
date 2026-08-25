# Credential-free infrastructure runbook

## Scope and hard boundary

`infra/aws` is a planning baseline for ADR 0010. The only approved command in Goal 81 is
`npm run test:infrastructure`. It copies the configuration to a disposable directory, strips inherited
AWS and OpenTofu encryption environment variables from child processes, initializes with
`-backend=false`, uses mocked providers, and deletes the disposable copy. It never initializes the S3
backend, contacts AWS, produces a real account plan, or applies resources.

Do not run `tofu init`, `tofu plan`, `tofu apply`, import, destroy, state migration, AWS login, or an AWS
CLI command from this repository until a separate approval names the exact account, environment,
owners, cost ceiling, state location, recovery targets, change window, and reviewed commit. A staging
approval does not authorize production. Apply requires a second approval after the exact saved plan and
calculator estimate are reviewed; production requires another environment-specific approval.

## Toolchain and local gate

The gate uses the image digests recorded in ADR 0011: OpenTofu 1.12.5, AWS provider 6.59.0, TFLint
0.64.0, Conftest 0.69.0, and Trivy 0.73.0. Docker and Node/npm are the only host requirements.

```powershell
npm run test:infrastructure
```

It checks formatting, lock-file integrity, backend-disabled initialization, schema validation, five
mock-plan contracts, TFLint, Rego policy over every real Terraform file, an eight-failure unsafe fixture,
high/critical Trivy findings, static CI key absence, and repository-specific invariants. The AWS-managed
KMS keys used for bounded SNS/SQS payloads are intentional; customer-managed keys and their service
policies are a post-account hardening decision. The public ALB is intentional but accepts only the AWS
managed CloudFront origin prefix list over TLS. Application internet egress is limited to TCP 443 through
NAT because JPL, Paddle, SES, and AWS APIs are external dependencies; all-protocol egress is prohibited.

## Environment and state contracts

- Use separate AWS accounts for staging and production and pass the exact 12-digit ID. The provider
  rejects every other account.
- Keep workloads in `ca-central-1`; only the CloudFront WAF provider uses `us-east-1` as AWS requires.
- Copy the appropriate redacted file under `infra/aws/environments`; never fill or commit the example.
  Only secret ARNs and KMS key ARNs belong in variables. Secret values and notification endpoints do not.
- Build and scan the independently promotable application and feedback-worker images first. Supply
  only their exact ECR `@sha256:` references plus the common 40-hex source revision and schema-2
  release-set SHA-256; mutable tags, using the web image for the worker, or mixed revisions fail.
- Preserve SPDX, SLSA, signature, and verification bundles as OCI 1.1 referrers to each immutable
  subject after remote promotion is approved. Include referrer storage/retention/replication in the ECR
  cost and lifecycle review; local ephemeral bundles are not acceptable deployment trust evidence.
- Supply `TF_ENCRYPTION` from the approved secret delivery path. Never put its passphrase/key in HCL,
  tfvars, command history, CI logs, or state. Losing the key makes encrypted state unrecoverable.
- Bootstrap state separately from the application stack. The bucket must be in Canada Central, have
  versioning, default encryption, complete public-access blocking, TLS-only access, recovery/retention,
  and a dedicated least-privilege state role. Use native S3 lockfiles. Do not share state across accounts.
- Preserve the state bucket, every version, lock recovery procedure, and encryption key during disaster
  recovery. Test recovery with non-production state before authorizing application resources.

## Dependency and apply order after approval

1. Bootstrap and independently review the state account/bucket/role and encryption-key recovery.
2. Initialize only the approved environment backend, verify caller account/region, and produce a saved,
   redacted plan from the reviewed commit without applying it.
3. Re-run the local and release gates; review every create/update/delete, IAM statement, public path,
   retained resource, calculated monthly cost, and provider checksum.
4. Apply network and registry; then data, messaging, compute, edge, observability, and backup modules.
5. Keep indexing and SES sending disabled. Configure DNS, certificates, secret values, alarm subscribers,
   and email identity records only under their separately approved procedures.
6. Run database restore/migration/RLS, two-task runtime, queue/DLQ, failover, rollback, WAF, privacy,
   accessibility, and incident gates before any promotion decision.

## Calculator input inventory

Create independent AWS Pricing Calculator estimates for staging and production. Record date, currency,
region, pricing model, tax/support exclusions, traffic assumptions, and estimate URL/export. Include:

| Service                       | Staging baseline                                                    | Production baseline / sensitivity                                                            |
| ----------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| NAT Gateway                   | 1 gateway, hourly plus processed GB                                 | 2 gateways; model processed GB and VPC endpoint alternative                                  |
| ALB                           | 1 internet-facing ALB                                               | 1 ALB; requests, new/active connections, processed bytes and LCUs                            |
| ECS Fargate                   | app: 1 x86 task, 0.5 vCPU/1 GiB; worker: 1 x86 task, 0.5 vCPU/1 GiB | app: minimum 2, 1 vCPU/2 GiB; worker: minimum 2, 0.5 vCPU/1 GiB; model both maxima and hours |
| ECR                           | two artifact repositories, storage and enhanced scanning            | retention capped at 30 images per repository; scan frequency and transfer                    |
| RDS PostgreSQL 18             | Single-AZ `db.t4g.small`, 20 GiB gp3, max 100 GiB                   | Multi-AZ, 50 GiB gp3, max 500 GiB; backup, I/O, PI and connection headroom                   |
| ElastiCache Serverless Valkey | max 2 GB / 1,000 ECPUs                                              | max 10 GB / 5,000 ECPUs; measured data/ECPU hours                                            |
| CloudFront and WAF            | compare pay-as-you-go and current flat-rate option                  | requests, transfer, managed rules, rate rules, logging and origin traffic                    |
| SES/SNS/SQS                   | sandbox/disabled sending, bounded feedback traffic                  | send volume, events, queue polling/visibility/delete requests, DLQ retention and transfer    |
| CloudWatch                    | 30-day logs, metrics, alarms                                        | chosen 30-365 day retention, ingestion, alarms, dashboards and queries                       |
| KMS/Secrets Manager           | data/log/backup keys plus referenced runtime secrets                | key count, rotations, API calls, secret count and rotation frequency                         |
| AWS Backup                    | daily RDS recovery points and vault lock                            | 14+ day production retention, snapshot size, cross-account copy sensitivity                  |
| Data transfer                 | modest internet and inter-AZ assumptions                            | CloudFront origin, NAT, inter-AZ, backup copy and provider API traffic                       |

The earlier planning envelopes—USD 100-250/month staging and USD 300-700/month production—are not a
quote. Approval requires current calculator exports plus AWS Budgets and anomaly thresholds below the
named owner’s ceiling.

## Release evidence to retain

Keep the reviewed commit/digest, provider lock file, redacted variables, calculator exports, saved-plan
hash, policy/release logs, approval identity/time/scope, applied resource summary, smoke/restore evidence,
and rollback decision. Never retain state, plan files, credentials, secret values, private user data, or
full provider payloads in Git or routine logs.
