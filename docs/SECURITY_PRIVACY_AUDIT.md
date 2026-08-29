# Security and privacy audit

### Goal 91 dependency-license review-packet audit

- **Assets and actors.** Protected assets are exact dependency evidence, review scope, future legal
  dispositions and release authority. Actors are the evidence preparer, independent license reviewer,
  release authorizer, CI transporter and promotion verifier.
- **Immutable evidence boundary.** Four missing-text gaps are bound only where exact package version,
  integrity, declared expression, immutable publisher commit and normalized local text hash agree. This
  reduces ambiguity without interpreting custom, composite, copyleft, missing, or conflicting terms.
- **Authorization separation.** The packet binds the finalized release-set hash and exact manual records,
  requires three distinct accountable roles and all re-review triggers, expires within 30 days, and fixes
  trust/status/decisions/authorization to review-input-only/not-requested/empty/false. It cannot activate
  redistribution or replace ADR 0018's accountable ledger.
- **Privacy and secrets.** Only public package, source and hash metadata is stored. Legal names, actor IDs,
  contacts, review prose, credentials, private keys and decisions are excluded.
- **Adversarial result and residual risk.** Tests reject scope/evidence drift, missing/extra records, mutable
  sources, stale packets, role collision, trigger removal, inserted decisions, trust elevation and secret
  fields. Sixteen records and two unresolved assertions are expected to remain; external redistribution is
  still NO-GO and no human legal conclusion exists.

### Goal 90 GitHub trust-readiness review

- **Assets and actors.** Protected assets are repository identity and ref integrity, required checks,
  release evidence, reviewer separation, future OIDC identity, attestation identity and promotion
  authority. Actors are repository administrators/writers, workflow initiators, environment reviewers,
  the GitHub-hosted runner, future cloud trust, verifier and promotion operator.
- **Read-only trust boundary.** Authenticated REST `GET` requests were reduced to numeric identity and
  security-control fields. The repository stores no API token, reviewer identity, secret, cloud role,
  provider payload or user data. No settings endpoint, environment, secret, OIDC/cloud trust, registry,
  AWS resource or production system was mutated.
- **Observed result.** Repository/owner IDs match policy and default workflow permission is read with
  workflow PR approval disabled. Zero rulesets, unprotected `main`, zero environments, unrestricted
  Actions without mandatory SHA pinning, and default non-immutable OIDC were also observed. A trusted
  artifact attestation is unproven. The deterministic decision is NO-GO with six gaps.
- **Authorization separation.** The desired policy and envelope bind active branch protection with no
  bypass, required CI/release checks, at least two distinct non-requester environment reviewers, prevented
  self-review, no admin bypass, immutable environment-scoped OIDC, successful unexpired/unconsumed release
  evidence, exact signer workflow and verified subject digest. Synthetic trust is permanently
  non-authorizing; the validator always rejects activation.
- **Adversarial result.** Tests reach and reject numeric identity/ref drift, weak/missing checks, mutable
  workflow identity, failed/stale/consumed/replayed evidence, permission expansion, insufficient/duplicate/
  self review, bypass, mutable OIDC/audience, wrong attestation source/signer/commit, unverified evidence,
  scope tampering, trust elevation and secret fields.
- **Residual risk — NO-GO.** GitHub's named status checks do not by themselves bind the triggering workflow
  or event, and environment execution needs only one configured required reviewer. A future authorized
  design must preserve exact workflow/run evidence and independent review above those platform semantics.
  No critical/high local finding remains, but repository protections, environment, immutable OIDC, trusted
  attestation, cloud trust, registry subjects and accountable license dispositions do not exist.

### Goal 89 credential-free CI evidence review

- **Assets and actors.** Protected assets are the exact source/workflow identity, dual-artifact evidence,
  release decision and future promotion authority. Actors are untrusted contributors, main-branch writers,
  manual dispatchers, the GitHub-hosted runner, artifact service, evidence verifier and future promoter.
- **Trust boundaries.** The workflow runs only in numeric repository ID `1329276081` on main push/manual
  events. Every action is full-SHA pinned, checkout drops credentials, token permission is exactly
  `contents: read`, and no environment, secret, OIDC, attestation/package/deployment write, cloud action or
  registry command is present. The artifact service transports evidence but grants no authority.
- **Integrity and replay.** Schema 1 binds repository/owner IDs, exact source/workflow SHA, ref/event/job,
  run/attempt/actor, GitHub-hosted runner image, tools, policy/workflow hashes, release-set hash and all 15
  file hashes/sizes. Expiry matches 14-day retention; repository/run/attempt is the replay key.
- **Secrets and privacy.** Only public dependency/build/release metadata is retained. The private Cosign
  key, password, build secret, saved plan/state, credentials and application user data are excluded. Hidden
  files are excluded from upload and the generated envelope rejects secret/environment authority claims.
- **Adversarial result.** Tests reject pull-request escalation, fork/repository mismatch, mutable actions,
  persisted credentials, mixed commits, excessive permissions, self-hosted runners, missing/tampered
  evidence, invalid release sets, changed approval, expiry and replay. No critical/high local finding remains.
- **Hosted result and residual risk.** Exact-commit hosted CI and release-candidate runs `33252479005` and
  `33252479006` passed. Downloaded artifact `9714878587` contained exactly the 15 bound files plus envelope
  and passed the strict verifier. GitHub repository settings remain separate, unproven external controls;
  YAML and one run do not prove environment/branch protection. Trust remains
  `credential-free-internal-candidate`, approval is not requested and promotion is false. External
  redistribution remains NO-GO due to 20 manual dispositions and two unresolved assertions.

### Goal 88 publisher-evidence and disposition-ledger review

- **Assets and actors.** Protected assets are release authorization, exact dependency evidence and future
  accountable review records. Actors are the evidence generator, independent preparer/reviewer, release
  verifier and promotion operator. No browser or application user participates.
- **Trust boundaries.** Publisher material is accepted only from an immutable Git commit and must match
  exact package version/integrity/expression plus checked text hash. Synthetic ledgers are explicitly
  untrusted and promotion-ineligible.
- **Authorization.** Manual records require independent opaque actors, exact dual-artifact scope, current
  expiry, complete one-to-one dispositions and zero rejected/remediation/undisposed outcomes. Policy,
  evidence, dependency or distribution changes force re-review.
- **Privacy and secrets.** Evidence contains public package/license metadata and opaque actor identifiers;
  no birth data, relationship data, credentials, private keys, legal names, emails, or review prose enters
  runtime images or routine logs.
- **Residual risk.** Twenty records remain manual and no accountable-human ledger exists. External
  redistribution, staging apply and production therefore remain NO-GO.

### Goal 87 dependency-license evidence review

- **Scope.** Release evidence and promotion authorization only; no authentication, user data, production
  system, registry, credential or network service was changed.
- **Fail-closed behavior.** Missing assertions/text, custom terms, non-allowlisted identifiers and conflicts
  route to manual review; prohibited identifiers fail; external redistribution requires zero unresolved,
  manual and prohibited results.
- **Integrity.** Exact npm version/source/SRI, enclosing Next.js identity, dpkg evidence, Node distribution
  text, installed license text, policy, evidence and notices are digest-bound. Adversarial mutation checks
  cover all bound fields.
- **Privacy and secrets.** Evidence is package metadata and public license material only. It is generated
  outside runtime images and checked by the existing release boundary.
- **Residual risk.** Automated classification is not legal advice. All manual-review results require an
  accountable human disposition before external redistribution.

### Goal 86 staging-approval boundary audit

- **Assets and actors.** Protected assets are release/plan scope, AWS target, cost and recovery limits,
  evidence pointers, review decisions, and apply authority. Actors are the requester; release, security,
  cost, and rollback reviewers; an independent apply authorizer; future protected CI; and AWS operators.
- **Trust boundaries.** The repository produces only a deterministic `mock-contract-only` package.
  Saved plan/state, calculator export/link, contacts, credentials, provider payloads, live reports, and
  approvals stay in an access-controlled external store. The envelope contains exact scope, opaque
  principal IDs, redacted values, and SHA-256 pointers; no verifier invokes AWS, GitHub, Sigstore, DNS,
  OpenTofu, or a registry.
- **Closed — documentary authority confusion.** Structural validity, documentary readiness, and staging
  apply readiness are separate assertions. Four unique reviewers cannot include the requester;
  documentary authorization remains a required `documentary-only` literal. Apply requires all 12 live
  gates and a fifth principal independent from the requester and documentary reviewers. Production is
  not an accepted target. Every decision binds the complete statement scope, an external approval-record
  hash, and an in-window timestamp; evidence changes invalidate earlier review.
- **Closed — stale, mixed, or unsafe evidence.** The canonical scope binds an exact account/region,
  source/release set, both immutable subjects/predecessors, saved-plan/redacted-summary hashes, safe
  change counts, fresh calculator evidence and limits, UTC window, owners, recovery, data handling, and
  every gate. Tests reject tampering, stale/expired scope, mutable/cross-account subjects, missing or
  duplicate gates, deletes/replacements, over-budget cost, self-review, reviewer reuse, absent Rekor,
  and incomplete apply authority.
- **Closed — sensitive evidence leakage.** Saved plans are ignored and prohibited because they may
  contain cleartext sensitive values. The schema rejects contact addresses and secret-like material;
  synthetic-only data, indexing disabled, and no private routine logs are immutable policy fields.
- **Residual staging risks — NO-GO.** No real plan, calculator export, accountable roster, environment
  protection, OIDC role, ECR referrer, Rekor proof, IAM/KMS simulation, state recovery, restore, DNS/TLS,
  alarm delivery, accessibility smoke, or rollback rehearsal exists. No critical/high local finding is
  open, but no staging apply is authorized.

### Goal 85 dual-artifact evidence audit

- **Assets and actors.** Protected assets are source/image/SBOM identity, promotion authorization,
  signing identity, build secrets, registry subjects/referrers, and rollback history. Actors are a local
  developer, future protected CI workflow, registry/AWS operator, verifier, and runtime operator.
- **Trust boundaries.** Local Docker builders and scanners can prove consistency but are not trusted
  release identities. The test uses a random Cosign key with networking disabled, records only public
  key/bundle hashes as `local-ephemeral-untrusted`, and deletes all evidence. No Rekor, OIDC, registry,
  AWS, KMS, production account, or deployment is contacted.
- **Closed — artifact substitution.** Schema 2 requires exactly the application and worker with one
  source revision, distinct immutable image identities, exact repository names, independent SPDX/scan
  evidence, and independent rollback predecessors. Missing worker, mixed revision, mutable/wrong
  repository reference, duplicate digest, changed SBOM, failed scan, and rollback-to-current tests fail.
- **Closed — bundled dependency ambiguity.** Every worker `node_modules` bundle input maps to an exact
  npm lock path, version, HTTPS registry source, SHA-512 integrity, and reviewed license. The SBOM maps
  root-to-dependency relationships and is scanned; evidence and build tooling are absent from runtime.
- **Closed — secret/personal-data leakage.** Release schema rejects secret-like fields, build secrets are
  never serialized, signing passwords are random process environment only, evidence is disposable, and
  the artifact path consumes committed source/lock metadata rather than account or birth data.
- **Residual staging risks — NO-GO.** A local private key proves no durable identity or trusted time.
  Protected GitHub OIDC identity/issuer, Rekor inclusion, ECR subject/referrer retention, AWS IAM/KMS,
  current remote scans, cost, operator ownership, and deployment/rollback verification remain required.
  No critical/high local finding is open; external promotion remains blocked.

Audit date: 2026-08-25

## Scope and trust boundaries

| Surface                                                             | Data/trust boundary                                                             | Current controls                                                                                                                                                                                                               | Residual production gate                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Public pages, guides, horoscope, lunar dates, robots/sitemap/assets | No account input; reviewed public calculation/content                           | Strict route parameters, validated provider/read models, bounded caches, global browser headers, fail-closed indexing                                                                                                          | Final domain/TLS/cache/CDN verification; strict CSP rollout                                  |
| Account pages and Server Actions                                    | Cookie session, private profiles, charts, Today, timeline, preferences, erasure | Server-only DTO/action boundaries, exact allowlisted form contracts, canonical same-origin reconstruction, live session/owner/entitlement checks, RLS, no-index                                                                | Production proxy/origin/cookie verification; shared abuse control                            |
| Better Auth HTTP                                                    | Passwords, session cookies, verification/reset tokens                           | Exact method/path/body/query/origin/fetch-site allowlists, 4 KiB/64-header bounds, stripped forwarding ambiguity, package CSRF/origin checks, secure host-only production cookies, no-store, restrictive CSP, generic failures | Replace process-memory rate limits for multi-instance deployment; live TLS/proxy/email tests |
| Paddle webhook                                                      | Signed billing events and provider IDs                                          | POST/JSON/body/header bounds, exact raw bytes, five-second signed timestamp tolerance, SDK signature verification, durable event digest/idempotency/state machine, no-store, restrictive CSP                                   | Live Paddle endpoint/secret rotation and edge request-size/rate controls                     |
| Opaque compatibility share                                          | Public projection behind 256-bit token                                          | Canonical 43-character token, generic 404, active/expiry/revocation checks, privacy-minimized projection, four-request process concurrency gate, no-store/no-referrer/no-index/no-script CSP                                   | Distributed aggregate abuse control and production logs that exclude tokens                  |
| Health                                                              | Version/status only                                                             | No secret/database detail, no-store, global browser headers                                                                                                                                                                    | Hosting health-check policy                                                                  |
| Database                                                            | Birth/name/profile/chart/relationship/billing/auth/email/notification data      | Separate NOLOGIN roles, forced RLS, transaction-local opaque owner, constrained schemas, owner-aware cache identities, cascaded erasure, durable replay controls                                                               | Managed PostgreSQL, backups/restores, network policy, credentials, migration rehearsal       |
| External email/ephemeris/billing adapters                           | Provider credentials and responses                                              | Server-only typed adapters, exact versions/config, bounded inputs/outputs, generic UI failures, no secrets in fixtures/logs                                                                                                    | Real credentials, regional infrastructure, DNS/signatures, provider outage exercises         |

## Findings and disposition

### Goal 84 feedback-worker deployment audit

- **Assets and actors.** The assets are the feedback database credential, HMAC key ring, signed SNS
  envelope, source queue, suppression ledger, receipt state, and aggregate operational signals. The
  runtime actor is one dedicated ECS task role; image pull/log/secret injection belongs to a separate
  execution role; migration, DLQ inspection/redrive, email dispatch, and human operations remain
  separate actors.
- **Trust boundaries and entry points.** The worker has no HTTP listener or inbound security-group
  rule. Its only runtime inputs are exact injected secrets, ECS relative task credentials, the exact
  regional SQS queue, the exact SNS certificate host, and TLS PostgreSQL. The existing authenticated
  envelope, bounded body, idempotent database, replay, ordering, and content-free logging controls are
  unchanged.
- **Closed — alternate credential and endpoint injection.** Production startup now rejects static
  access/session keys, profiles/shared files, full credential URIs/tokens, web identity/role override,
  alternate AWS endpoints, and EC2 metadata endpoint override. It disables EC2 instance metadata and
  requires the ECS-injected relative credential path. Tests cover accepted and rejected configurations.
- **Closed — workload privilege coupling.** The worker uses a separate immutable image, task role,
  execution role, secrets set, security group, log group, service, and ECR repository. The task policy
  contract requires exactly receive/delete/change-visibility/get-attributes on the exact source queue;
  send, purge, DLQ receive, redrive, SES, SNS, migration, and broad secret permissions are absent.
- **Closed — container and failure leakage.** The artifact is non-root/read-only, has no port, shell,
  npm, source, or extra runtime files, and logs only fixed aggregate fields or one fixed startup error.
  Tests cover unsafe configuration, extra-field removal, pool closure, replay/outages, process health,
  and bounded `SIGTERM`; the exact-commit gate performs vulnerability and secret scans.
- **Residual staging gates.** Local mocked plans cannot prove AWS's effective IAM evaluation, KMS key
  policies, credential endpoint behavior, NAT routing, certificate TLS, RDS identity, secret rotation,
  CloudWatch privacy, or alarm delivery. TCP 443 NAT egress is broad at the network layer because the
  SQS API and SNS signing-certificate HTTPS endpoint are external; an approved staging review must
  evaluate SQS VPC endpoints and any egress-filtering control without breaking certificate validation.
  IAM simulation and observed denial tests are mandatory before enabling email.

The Goal 84 audit found no unresolved critical or high local finding. Its decision is GO for the
credential-free repository baseline and NO-GO for AWS staging or production until the residual gates
are evidenced under explicit approval.

### Closed in Goal 76

- **Medium — inconsistent baseline browser headers.** Only auth, webhook, and share responses had a
  complete common baseline. One central versioned policy now applies `no-referrer`, `nosniff`,
  frame denial, same-origin resource/opener isolation, disabled unused browser capabilities, and
  disabled DNS prefetch to every Next.js path. Sensitive route policies remain later overrides.
- **Low — duplicated sensitive-response policy.** Auth, Paddle, share, and framework rules now
  compose the same immutable no-store/browser/CSP constants, preventing silent drift. Existing
  route-specific content types and robot controls remain separate.

### Accepted or deferred

- **Strict CSP for interactive Next.js documents.** Auth/webhook JSON and the standalone share
  document already use blocking CSP. The installed Next.js 16.3 guide states that nonce CSP
  requires per-request dynamic rendering; applying it globally would discard the measured static
  and ISR architecture. Do not use a weak `unsafe-inline` policy merely to claim CSP. Evaluate
  nonce versus build-time script hashes on the chosen host, first in report-only mode, then run
  every public/account flow before enforcement.
- **HSTS.** Intentionally absent until the production domain, HTTPS redirect, certificate,
  subdomain ownership, and rollback plan are verified. Adding preload or `includeSubDomains`
  locally could create an inaccurate production claim and an operational lockout risk.
- **Abuse controls.** Better Auth's selected baseline uses process-memory route limits and the
  public share route has process-local concurrency control. These are useful local bounds, not
  multi-instance production rate limits. Select an edge/shared mechanism only with the actual
  proxy identity model; never trust arbitrary forwarded client IP headers.
- **Dependency advisory.** `npm audit --omit=dev` reports four moderate findings in Drizzle Kit's
  development-only esbuild loader chain. npm offers a breaking forced downgrade. Do not apply it
  blindly; track an upstream compatible resolution and keep the development server unexposed.
- **Cross-origin isolation compatibility.** `Cross-Origin-Opener-Policy: same-origin` matches the
  current no-social-login/no-popup baseline. Re-test and deliberately adjust it before adding an
  OAuth popup, hosted checkout popup, or cross-origin window integration.

No critical or high finding remains in the reviewed local baseline. This is not a production
penetration test and does not verify cloud IAM, DNS, TLS, CDN/WAF, database networking, secret
storage, backup restoration, provider dashboards, or real multi-user browser traffic.

## Central response policy

Global policy applies to all routes and assets through Next.js `headers()`:

- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Cross-Origin-Resource-Policy: same-origin`
- `Cross-Origin-Opener-Policy: same-origin`
- `Permissions-Policy` denying camera, microphone, geolocation, payment, and browsing topics
- `X-DNS-Prefetch-Control: off`

Auth, webhook, and opaque-share responses additionally use private `no-store`, legacy cache
defense in depth, and blocking `default-src 'none'` CSP variants. Later matching Next.js rules
override the global values, as documented by the installed framework. `poweredByHeader` remains
disabled. The policy adds no CORS permission, HSTS, HPKP, obsolete XSS header, CSP report endpoint,
external origin, or user-derived header value.

## Current guidance reviewed

- Installed Next.js 16.3 `headers`, Content Security Policy, and data-security guides under
  `node_modules/next/dist/docs/`.
- [OWASP HTTP Headers Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)
- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)
- [OWASP Cross-Site Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [OWASP Transport Layer Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html)

## Production release checks

1. Verify exact canonical and auth origins, trusted proxy hops/IP headers, HTTPS redirects, cookie
   flags, and absence of attacker-controlled forwarding influence.
2. Run two real accounts through ownership isolation, session revocation, password reset, erasure,
   share publish/revoke/expiry, billing replay, and notification preference/delivery isolation.
3. Inspect headers and caching on every route class, 404/405/413/429/500 responses, static assets,
   redirects, and responses carrying `Set-Cookie`; confirm sensitive responses are never cached.
4. Select shared abuse controls with route-specific identity/budgets for sign-in, sign-up, recovery,
   verification, webhook, share lookup, expensive calculations, and outbound email.
5. Rehearse backup/restore and forward-only migrations; scan artifacts/logs/analytics/error capture
   for birth data, names, exact locations, emails, tokens, signatures, cookies, and cache keys.
6. Trial a strict document CSP in report-only mode without storing private URLs or tokens in reports;
   remove violations before enforcement and re-check static/ISR performance.
