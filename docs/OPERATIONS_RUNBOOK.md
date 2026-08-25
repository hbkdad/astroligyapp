# Operations and release runbook

Runbook version: 1.0.0

This runbook is inactive until a target environment, accountable release owner, database owner,
security/on-call owner, and rollback owner are named. It authorizes no deployment, purchase,
production migration, DNS change, secret creation, or provider mutation.

## 1. Freeze and identify the candidate

1. Require a clean tracked worktree. Ignore only reviewed local artifacts such as `output/`.
2. Record `git rev-parse HEAD`, branch/tag, `package.json` version, lockfile checksum, migration range,
   target environment, release owner, database owner, on-call owner, and rollback owner.
3. Confirm the candidate contains `docs/RELEASE_MANIFEST.md` and no later unreviewed migration.
4. Use Node from `.nvmrc`; verify npm matches `packageManager`; run `npm ci`.
5. Run `npm run release:check`. A timeout, skipped command, failed migration, high/critical advisory,
   or missing specialist evidence is a stop condition, not an accepted pass.

## 2. Review configuration without exposing secrets

1. Create environment secrets through the selected platform's secret manager from `.env.example`.
   Never paste values into tickets, chat, logs, shell history, browser variables, or build artifacts.
2. Confirm database URLs use TLS and distinct LOGIN executors. The migration URL is unavailable to
   the application runtime. Verify role membership against the checked-in SQL.
3. Confirm the auth base URL and trusted origins are exact HTTPS origins with no path/query/fragment.
   Trust forwarded IP headers only from the selected proxy addresses.
4. Verify descending secret/key versions, uniqueness, entropy, rollover retention, and emergency
   revocation procedures for auth, email idempotency, email feedback, and Paddle.
5. Keep `PUBLIC_SITE_INDEXING_ENABLED=false` until the final host and search checklist pass.
6. Run the existing configuration test suites with redacted synthetic values. Do not add a generic
   configuration dump or health response that can echo secrets.

## 3. Prepare and migrate PostgreSQL

1. Confirm supported PostgreSQL version, regional placement, encryption, private networking,
   connection limits, statement/lock timeouts, monitoring, point-in-time recovery, and retention.
2. Take a pre-migration backup and restore it into an isolated rehearsal database. Record times,
   checksums/provider IDs, and the operator; never store connection strings in the evidence.
3. Against the restored rehearsal, run the legacy-upgrade path and then the complete latest-schema
   database suite. Verify RLS remains forced and two test owners cannot cross-read or mutate.
4. Put writes into the selected maintenance/drain mode. Apply `npm run db:migrate` once with the
   migration owner. Inspect migration history and application/database errors before restoring traffic.
5. Run schema/RLS/auth/billing/email/notification smoke checks with synthetic accounts. A partial
   migration, unexpected lock, role drift, or failed isolation check stops promotion.

There are no down migrations. For an application-only failure, roll back to the last artifact only
when its database contract is forward-compatible with every applied migration. Otherwise ship a
reviewed forward-fix. Restore the pre-migration backup only under the disaster-recovery decision,
after stopping writes and accounting for data created after the backup.

## 4. Configure external services

### Authentication and email

- Verify HTTPS cookies (`Secure`, `HttpOnly`, `SameSite=Lax`), CSRF/origin rejection, session
  revocation, password reset, email verification, and generic enumeration-safe responses.
- Verify SES identity, DKIM/SPF/DMARC, configuration set, least-privilege IAM, account sending state,
  suppression behavior, idempotency lease recovery, SNS signature validation, SQS redrive policy,
  feedback reconciliation, and alarms. Apply the dedicated
  `docs/AUTH_EMAIL_FEEDBACK_WORKER_RUNBOOK.md`; local worker code does not authorize live polling.

### Billing

- Verify Paddle environment, products/prices, customer-ownership provisioning design, endpoint URL,
  raw-body preservation, notification secret rotation, five-second timestamp behavior, replay,
  stale/conflict outcomes, reconciliation queue/owner, and edge size/rate controls.
- Test plan transitions and entitlements with provider sandbox events before any live secret is used.

### Shared abuse controls

- Configure route-specific shared limits for sign-in, sign-up, recovery, verification, share lookup,
  webhook ingress, expensive calculations, and outbound email. Derive client identity only from the
  verified proxy chain. Process-memory limits are defense in depth, not the production control.

## 5. Deploy the application artifact

1. Build once under the pinned runtime. Produce and record the immutable artifact digest and SBOM
   using the chosen platform; scan for secrets and private fixture data.
2. Deploy with indexing disabled and no user traffic. Confirm runtime/region/instance topology,
   memory/concurrency limits, graceful shutdown, connection pool budgets, clock synchronization,
   request/body limits, HTTPS redirect, certificate chain, and DNS.
3. Verify headers and caching for public, account, auth, webhook, share, errors, redirects, assets,
   and all `Set-Cookie` responses. Trial public document CSP in report-only mode before enforcement.
   Add HSTS only after HTTPS/subdomain ownership and rollback are proven; do not preload casually.
4. Configure liveness separately from dependency readiness. `/api/health` is deliberately shallow.
   Establish privacy-safe error, latency, availability, queue, database, email, webhook, cache, and
   saturation signals with named alert thresholds and an on-call destination.

## 6. Production-like smoke matrix

Run at desktop and 390px mobile widths, keyboard-only, reduced motion, and the supported browser
matrix. Use synthetic accounts and no real birth data.

1. Public: guides, all route templates, current horoscope, lunar date boundaries, 404s, canonicals,
   robots/sitemap with indexing disabled, and provider-unavailable behavior.
2. Auth: register, verify, sign in/out, wrong password, recovery/reset, expired/replayed tokens,
   rate limits, session refresh/revocation, and multi-device behavior.
3. Ownership: two accounts create/edit/delete profiles and charts; prove neither can read, mutate,
   share, bill, alert, export, or erase the other's resources.
4. Product: chart generation, Today, forecast/full timeline entitlement boundaries, compatibility
   share create/view/revoke/expire, alert opt-in/quiet hours/withdrawal, and provider failures.
5. Billing/email: signed sandbox webhook replay/ordering/conflict and authentication email accepted,
   duplicate, suppressed, retry, feedback, and reconciliation paths.
6. Privacy: export strategy, account deletion, cascade verification, log/error/analytics inspection,
   referrer/cache checks on capabilities, and no private identifiers in public URLs.
7. Accessibility: current NVDA plus Chrome/Firefox and VoiceOver plus Safari for navigation, forms,
   validation, chart/table relationship, filters, status announcements, zoom, and forced colors.

## 7. Search launch

Only after domain/TLS/redirect/cache checks and content review:

1. set exact `PUBLIC_SITE_ORIGIN` and keep indexing false for a final preview;
2. verify every intended canonical, all 46 sitemap URLs, page robots, and excluded private/demo URLs;
3. verify Search Console ownership and submit the sitemap plan;
4. enable indexing in one reviewed configuration change, deploy, and repeat robots/sitemap/canonical
   checks. Roll back the flag immediately if private/demo URLs become indexable.

## 8. Incident and rollback actions

| Condition                               | Immediate action                                                                                 | Recovery evidence                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Auth/session anomaly                    | Stop account mutations; revoke/rotate affected sessions/secrets; preserve privacy-safe evidence  | Two-account isolation, revocation, cookie/origin tests        |
| Database isolation or migration failure | Stop writes/traffic; do not improvise SQL; invoke database/rollback owners                       | RLS suite, migration history, forward-fix or approved restore |
| Email abuse/outage                      | Pause dispatch; retain durable idempotency/feedback state; protect suppression list              | Queue depth, retry/reconciliation, synthetic delivery         |
| Webhook abuse/state conflict            | Keep signature verification; apply edge limit; reconcile durable conflict without replay loops   | Receipt/state audit and signed sandbox replay                 |
| Capability leakage                      | Revoke affected shares; purge permitted caches/log references; rotate only relevant capabilities | Generic 404, no-store/referrer, log scan                      |
| Calculation regression                  | Disable affected presentation/traffic path; never substitute fabricated facts                    | Version/fixture regression and provider trace                 |
| Accessibility regression                | Block promotion or roll back the affected UI artifact                                            | Axe plus keyboard/AT/browser evidence                         |

## 9. Close the release

Record the exact commit/artifact, migration result, smoke evidence, dependency report, accepted risks,
owners, incident links, and release decision in `docs/PROJECT_STATUS.md` or the external release
record. A `GO WITH ACCEPTED RISK` requires the accountable user's explicit acceptance of a bounded,
non-critical risk. Never silently convert a missing gate into an accepted risk.
