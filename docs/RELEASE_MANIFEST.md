# Release candidate manifest

- Manifest version: 1.0.0
- Candidate: `0.1.0-rc.1`
- Target: internal, non-production release candidate
- Production promotion: blocked until the gates in this document are closed

The exact source candidate is the Git commit containing this manifest. Record it with
`git rev-parse HEAD` in the release evidence; never identify a release only by a mutable branch.
`package-lock.json` is the dependency artifact and all database migrations under `drizzle/` are
part of the candidate.

## Runtime and build

| Item                 | Candidate value                  | Policy                                                                |
| -------------------- | -------------------------------- | --------------------------------------------------------------------- |
| Application          | `personal-cosmic-calendar` 0.1.0 | Private package; no registry publication                              |
| Node.js              | 24.15.0 from `.nvmrc`            | CI and release operators use the pinned version                       |
| npm                  | 11.12.1 from `packageManager`    | Install only with `npm ci` for a candidate                            |
| Next.js / React      | 16.3.0 / 19.2.8                  | Standalone OCI image and two-instance local runtime verified          |
| TypeScript / Vitest  | 5.9.3 / 4.1.10                   | Strict compilation and deterministic test gate                        |
| PostgreSQL           | 18 test baseline                 | RDS PostgreSQL 18 selected; instance/backup resources not provisioned |
| Drizzle ORM / Kit    | 0.45.2 / 0.31.10                 | Checked-in forward migrations; no schema push                         |
| Astronomy            | Astronomy Engine 2.1.19          | Local launch adapter behind `EphemerisProvider`                       |
| Authentication       | Better Auth 1.6.27               | PostgreSQL sessions and verified email/password only                  |
| Billing ingress      | Paddle SDK 3.10.0                | Signed webhook adapter only; no live account or checkout              |
| Authentication email | AWS SES v2 SDK 3.1108.0          | Adapter selected; infrastructure and credentials absent               |
| Shared cache client  | Redis 6.2.1                      | Valkey protocol boundary; no managed cache provisioned                |

The local build produces `.next/` and a standalone OCI image from the digest-pinned Dockerfile. The
image, two-instance disposable topology, and vulnerability/secret scan are locally verified, but no
registry artifact, signature, AWS account/resource, or deployment command exists. Remote SBOM/
provenance attachment and immutable ECR digest promotion remain implementation and approval gates.

## Included database contract

The candidate includes migrations `0000_strong_mandroid.sql` through
`0015_serious_synch.sql` (16 files) and their Drizzle journal. They define 25 public tables, four
isolated Better Auth tables, forced owner RLS on private public-schema tables, narrow NOLOGIN roles,
security-definer lookup/erasure functions, durable webhook/email/notification ledgers, and forward-
compatible subscription/profile/notification upgrades.

Migration invariants:

- apply the immutable files in journal order with the migration owner only;
- provision LOGIN executors separately and grant only the documented NOLOGIN role memberships;
- never use `drizzle-kit push` as a release path;
- run both legacy-upgrade and latest-schema tests before promotion;
- take and restore-verify a provider backup before production migration;
- prefer a reviewed forward-fix. Restore is the disaster-recovery path, not an untested down script.

## HTTP and indexing surface

| Class            | Surface                                                                         | Release behavior                                                          |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Public content   | home, astrology guide, Moon guide/calendar, Life Path guide, 12 horoscope paths | Calculated/read-model boundaries; indexing remains fail-closed by default |
| Demonstrations   | chart, Moon, numerology, timeline, compatibility                                | Local/sourced demos; page-level no-index where documented                 |
| Account          | overview, entry/recovery/verification, profiles, Today, timeline, alerts        | Dynamic/private; cookie session, server authorization, no-index           |
| APIs             | Better Auth catch-all, health, Paddle webhook                                   | Auth and webhook are bounded/no-store; health is shallow liveness only    |
| Capability share | `/match/[token]`                                                                | Generic failures, no-store/no-referrer/no-index, script-free CSP          |
| Search controls  | `robots.txt`, `sitemap.xml`                                                     | One server-owned origin/indexing gate; disabled until host verification   |

When enabled, the sitemap contains exactly 46 reviewed URLs: three guides, 12 signs, and the current
UTC date plus 30 lunar dates. Demo, account, API, and opaque-share URLs are excluded.

## Server environment contract

No variable in this table may use a `NEXT_PUBLIC_` prefix. The application validators reject the
documented secret families when exposed as public variables.

| Group              | Variables                                                                                                                                                                          | Release requirement                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Core database      | `DATABASE_URL`                                                                                                                                                                     | Migration owner URL only for migration jobs; runtime URL must be least-privilege for its route         |
| Public origin      | `PUBLIC_SITE_ORIGIN`, `PUBLIC_SITE_INDEXING_ENABLED`                                                                                                                               | Exact HTTPS origin; keep indexing `false` until canonical/TLS/search checks pass                       |
| Auth databases     | `BETTER_AUTH_DATABASE_URL`, `AUTH_ACCOUNT_DATABASE_URL`, `AUTH_EMAIL_DATABASE_URL`, `AUTH_EMAIL_FEEDBACK_DATABASE_URL`                                                             | Separate LOGIN executors with only reviewed role memberships; TLS required                             |
| Auth/session       | `BETTER_AUTH_SECRETS`, `BETTER_AUTH_BASE_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `BETTER_AUTH_IP_HEADER`, `BETTER_AUTH_TRUSTED_PROXIES`                                               | Versioned secret rollover, exact origins, verified proxy chain, production secure cookies              |
| Email idempotency  | `AUTH_EMAIL_IDEMPOTENCY_KEYS`, `AUTH_EMAIL_IDEMPOTENCY_LEASE_SECONDS`                                                                                                              | 32-byte base64url keys; retain prior keys through ledger retention                                     |
| SES/email feedback | `SES_AUTH_EMAIL_REGION`, `SES_AUTH_EMAIL_FROM`, `SES_AUTH_EMAIL_CONFIGURATION_SET`, `SES_AUTH_EMAIL_FEEDBACK_TOPIC_ARN`, `SES_AUTH_EMAIL_IDENTITY_ARN`, `AUTH_EMAIL_FEEDBACK_KEYS` | ca-central-1 identity/DNS/IAM plus authenticated SNS/SQS ingestion worker                              |
| Paddle             | `PADDLE_WEBHOOK_SECRET`, `PADDLE_PERSONAL_PRICE_REFERENCES`, `PADDLE_ADVANCED_PRICE_REFERENCES`                                                                                    | Exact notification secret and non-overlapping canonical live/test price IDs for the chosen environment |

`.env.example` is the redacted operator template. There is no required `AUTH_CONTACT_DATABASE_URL`:
customer-contact resolution is not wired to a production checkout/provisioning entry point in this
candidate, and unused credentials must not be provisioned speculatively.

## Data classification and retention

- Restricted: password/session/reset/verification material, secrets, webhook signatures, opaque
  share capabilities, exact birth time/location, full names, relationship profiles, and email.
- Private account data: profiles, charts, readings, compatibility reports, subscriptions,
  notification preferences/candidates/history, and audit identity.
- Public reviewed data: guide copy, zodiac/phase/numerology definitions, sanitized horoscope/lunar
  output, public SEO metadata, and explicitly projected active share documents.
- Routine logs, metrics, URLs, cache keys, fixtures, and error responses must not contain restricted
  or private values. Account erasure and share revocation remain required smoke tests.

## External dependencies and operational state

| Dependency            | Current state                                                | Production gate                                                                                         |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Astronomy Engine      | Installed local calculation dependency                       | Preserve exact version/fixtures and provider metadata                                                   |
| PostgreSQL            | RDS PostgreSQL 18 topology selected; disposable suite passes | Provision only after approval; network/IAM; pool sizing; PITR; backup/restore rehearsal                 |
| Better Auth           | Installed, configured through strict server boundary         | Real HTTPS/proxy/cookie/email and two-account isolation tests                                           |
| AWS SES/SNS/SQS       | Adapter and feedback contracts exist                         | Account, verified domain, DKIM/SPF/DMARC, IAM, queue consumer, alarms, suppression/retry exercise       |
| Paddle                | Signed webhook contract exists                               | Account/products, endpoint, secrets, edge limits, replay/reconciliation, customer provisioning decision |
| Notification delivery | Candidates remain `pending-provider`                         | Select provider/worker or keep user-facing delivery explicitly unavailable                              |
| Hosting/CDN/WAF       | AWS Canada topology selected in ADR 0010; unprovisioned      | Approved account/budget/IaC; TLS/domain, limits, shared abuse, cache/header verification                |
| Observability/on-call | No vendor/exporter/owner selected                            | Privacy-reviewed logs/errors/metrics, dashboards, alerts, escalation owner and retention                |

## Health, performance, and feature controls

`GET /api/health` returns only static service/version liveness and `Cache-Control: no-store`; it does
not claim database, SES, Paddle, queue, DNS, or provider readiness. The selected host must supply a
separate readiness policy and alarms. Public performance metrics are fixed-label and process-local;
there is no external exporter. Public caches are bounded process-local optimizations and contain no
private inputs. The only environment feature gate is public indexing; entitlements are server-owned
database policy, not browser or environment claims.

## Release decision

- Internal source release candidate: **GO** after `npm run release:check`, optimized Chromium smoke,
  and the specialist evidence referenced by `docs/PROJECT_STATUS.md` pass on the exact commit.
- External staging or production promotion: **NO-GO**. No accountable owner has accepted risk, and
  the host/database/backup, shared abuse control, live provider, observability, authenticated E2E,
  and assistive-technology gates above are unresolved.

This split is intentional: the application can be a reproducible release candidate without
pretending that absent production infrastructure has been verified.
