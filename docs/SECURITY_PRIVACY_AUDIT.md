# Security and privacy audit

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
