# ADR 0008: Select Better Auth and live verified billing contact

Status: accepted
Date: 2026-08-12

## Context

ADR 0004 deliberately kept authentication behind `SessionVerifier`. Goal 54 now
composes that verified session with active internal-account resolution, a trusted
billing-contact resolver, and provider-neutral customer provisioning. Launch needs a
concrete authentication implementation and an authoritative email source without
letting browser profile data, cookies, checkout metadata, or webhook payloads establish
account ownership.

The repository currently uses Node 24 in CI, Next.js 16.3.0, React 19.2.8, Drizzle ORM
0.45.2, Drizzle Kit 0.31.10, PostgreSQL 18 for disposable verification, `pg` 8.23.0,
and Vitest 4.1.10. The managed PostgreSQL and deployment providers remain open
decisions, so authentication should not decide either by accident.

Primary documentation and registry metadata were reviewed on 2026-08-12. Pricing is
USD list pricing and must be rechecked before any purchase.

| Candidate                                                                | Current fit                                                                                                                                                                           | Verified email and sessions                                                                                                                                                                                          | Data/operations                                                                                                                                                                                                                                                                                            | Cost and exit                                                                                                                                                                                            | Decision                                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Auth.js / `next-auth` 4.24.15                                            | Registry peers include Next.js 16 and React 19; PostgreSQL adapters and database sessions exist.                                                                                      | Adapter users include `emailVerified`; database sessions can be revoked. Provider-specific verification still needs careful policy.                                                                                  | Self-hosted and open source, but the project joined Better Auth and explicitly recommends Better Auth for new projects while retaining Auth.js for security/urgent maintenance.                                                                                                                            | No hosted-auth fee and data is portable, but choosing a maintenance-path framework for a new application adds migration risk.                                                                            | Reject for new implementation.                                                |
| Better Auth 1.6.27                                                       | Registry peers exactly cover Next.js 16, React 19, Drizzle 0.45.2, Drizzle Kit 0.31.4+, `pg` 8, and Vitest 4; MIT licensed. Official Next.js 16 proxy/server integration exists.      | Database-backed sessions support expiry, freshness and immediate revoke; email/password can require verification before session creation; verified email change keeps the old address until the new one is verified. | Framework and core data are self-hosted in our PostgreSQL. Managed infrastructure/email is optional and not selected. Runtime region follows the eventual database/host choice, so Canadian operation is possible without a separate auth data-residency commitment.                                       | Framework is free/open source. Optional managed infrastructure is currently free or Pro $20/month, but is out of scope. Tables and user IDs remain exportable; a future provider adapter can replace it. | Select.                                                                       |
| Clerk / `@clerk/nextjs` 7.7.4                                            | Registry peers cover the current Next.js and React versions. Its managed Next.js SDK, prebuilt UI, session JWTs, reverification and account APIs are mature.                          | Primary email must be verified; signed tokens can carry email/factor-age claims; live Backend API reads and session removal are available.                                                                           | Fully managed identity reduces local work, but Clerk's DPA permits processing wherever it or subprocessors operate. Public material does not offer regional selection; this does not satisfy a Canada-controlled residency preference. The application would depend on Clerk availability and identifiers. | Hobby currently includes 50,000 MRU; Pro is $25 monthly or $20 annually plus overage. Export exists, but passwords/session state and UI flows increase exit work.                                        | Reject for launch portability/residency, retain as managed fallback.          |
| Supabase Auth / `@supabase/ssr` 0.12.4 + `@supabase/supabase-js` 2.112.3 | Official Next.js SSR support, asymmetric JWT verification, live `getUser`, PostgreSQL auth schema and Canada Central region. Current JS client requires Node 22+, which CI satisfies. | `email_confirmed_at` is explicit. `getClaims` proves token integrity but not immediate logout; `getUser` or a live `auth.sessions` check is required for sensitive immediate revocation.                             | Managed Auth is coupled to a Supabase project/database. Self-hosting is portable but requires the full Supabase operational stack, backups, hardening and upgrades. Selecting it now would pre-empt the separate managed PostgreSQL decision.                                                              | Free includes 50,000 MAU; Pro starts at $25/month with 100,000 MAU, then $0.00325/MAU. Platform-to-self-host migration is documented but invalidates sessions and carries operational cost.              | Defer; reconsider if Supabase is selected as the managed PostgreSQL platform. |

## Decision

Select exact Better Auth 1.6.27 as the launch authentication framework, subject to a
separate implementation goal and migration review. Do not use Better Auth managed
infrastructure, managed email, analytics, telemetry, stateless sessions, secondary
storage, or cookie session cache in the launch baseline.

Use database-backed sessions in a dedicated PostgreSQL `auth` schema. Better Auth's
generated Drizzle schema must be checked in and migrated through the repository's
normal forward-only migration process; never run its interactive schema mutation
against production. Its user ID is the external subject mapped to the existing opaque
`user_account.id`. Application authorization continues through
`withIdentityTransaction`; Better Auth user IDs never become resource IDs.

The launch sign-in surface is email/password with mandatory verification and password
reset. Social OAuth, passkeys, MFA, organizations, phone/SMS, magic links, anonymous
users, managed infrastructure and automatic account linking are deferred. This keeps
the first trust model narrow and avoids provider-email/linking ambiguity. MFA/passkey
support remains a release-hardening decision rather than an entitlement dependency.

## Session and request security profile

The implementation must use these invariants:

- Configure an explicit server-only base URL and exact trusted-origin allowlist for
  each environment. Never infer a production origin from untrusted forwarded headers.
- Keep Better Auth's CSRF, Fetch Metadata, origin, state, nonce and PKCE checks enabled.
  Do not set `disableCSRFCheck`, `disableOriginCheck`, broad wildcard origins, or
  cross-subdomain cookies.
- Use host-only `HttpOnly`, `Secure` production cookies with `SameSite=Lax`. Cookie
  presence may optimize redirects but never authorizes a protected operation.
- Use database-backed session validation for protected work with no stateless mode,
  cookie cache or secondary cache. Revocation/deletion must be visible on the next
  protected request rather than after a cached-token TTL.
- Start with seven-day maximum session expiry, one-day rolling update age and ten-minute
  freshness for billing/customer, email, password and deletion actions. Record exact
  `authenticatedAt` from the verified database session; do not fabricate freshness.
- Rotate `BETTER_AUTH_SECRET` using the documented plural-secret rollover mechanism.
  Secrets are server-only, environment-specific and never logged or placed in URLs.
- Keep built-in rate limiting enabled in production, add endpoint-specific limits for
  signup/signin/reset/verification, and trust only the final deployment proxy's client
  IP header. Rate limiting is defense in depth, not authorization.
- Do not cache authenticated responses or responses carrying `Set-Cookie`; apply
  private/no-store behavior to every auth and protected mutation response.

## Trusted billing-contact decision

Do not synchronize email into a second application billing-contact table. The trusted
contact resolver must perform a live least-privilege read of the Better Auth user row
identified by the already verified session subject and require all of the following:

1. the database session is active, unexpired and belongs to that user;
2. the mapped internal account is active;
3. the auth user exists and is not being deleted;
4. `emailVerified` is true; and
5. the current normalized email passes the application's strict billing-email shape.

Only the resolver may return `{email}` to Goal 54. Session-cookie claims, request
bodies, client profile objects, application profiles, OAuth access tokens, checkout
metadata and webhooks are never trusted contact sources. A dedicated runtime database
role/function should expose only the required user/session columns or one bounded
result; it must not grant billing code general read access to password/account/token
or verification tables.

Live lookup is chosen because a copied record can become stale after email change,
reverification, account deletion or administrative correction. A database/source
outage returns Goal 54's retryable `contact-source-unavailable`; it never falls back to
a cookie or cached email.

## Email, reverification and deletion lifecycle

- Signup creates no billable/trusted contact until verification succeeds. Configure
  `requireEmailVerification` and `sendOnSignUp`; do not auto-sign in an unverified user.
- Email change is disabled until the application implements the full flow. When
  enabled, require confirmation through the current verified email and verification
  of the new email; keep `updateEmailWithoutVerification` false. Revoke other sessions
  after a successful change and require a fresh session before billing work.
- Existing Paddle customer ownership never changes because email changes. Goal 52
  finds the immutable binding first. Updating an existing Paddle customer's contact
  email is a separate recent-authenticated reconciliation operation; it must never
  create or rebind a customer implicitly.
- Password reset revokes all other sessions. Password/email/customer/deletion actions
  require a session no older than ten minutes or a new verification ceremony.
- Account deletion first makes the internal application account unavailable, then
  revokes auth sessions and hard-deletes the Better Auth user through a recoverable,
  audited orchestration. Failure after either step is reconciliation-required. The
  eventual workflow must prove application-data cascade/retention, Paddle obligations,
  auth-row deletion, and retry behavior before public exposure.
- If the auth database is unavailable, protected work fails retryably. If the email
  sender is unavailable, new verification/change/reset cannot complete; existing
  verified database sessions and live contact reads continue without email fallback.

## Adapter and migration plan

The Better Auth adapter must implement `SessionVerifier` by validating the database
session and mapping:

- Better Auth user ID -> `subject`;
- Better Auth session ID -> `sessionId`;
- session creation instant -> `authenticatedAt`; a later explicit reverification
  ceremony must mint or persist new reviewed evidence before it can advance this
  timestamp; and
- session expiry -> `expiresAt`.

Missing, expired, revoked, deleted, malformed or mismatched rows map to the existing
explicit non-active states. Database/configuration exceptions remain unavailable
errors rather than authentication success. The trusted contact adapter implements the
live rules above. Neither adapter returns Better Auth database shapes to domain,
presentation or billing code.

Exit remains provider-neutral: retain `user_account.id` as the durable application
owner, export Better Auth users/accounts before migration, map replacement provider
subjects explicitly, revoke all old sessions, and require password reset when hash
compatibility cannot be proven. No application-owned resource key changes.

## Consequences and residual risk

This decision takes responsibility for auth database availability, migrations,
transactional email delivery, abuse prevention, secrets, backups and security updates.
It avoids a managed-identity outage/region dependency and preserves a future move to
Clerk, Supabase Auth or another `SessionVerifier` adapter. It does not authorize a
production account, credential, email provider, public auth route, migration, package
installation or deployment.

Open implementation risks are exact Better Auth schema review, role/RLS interaction,
transactional email provider selection, password policy/hash verification, account
bootstrap/deletion atomicity, recent-auth semantics, browser E2E and recovery testing.
No critical/high security finding is accepted by this ADR.

## Primary sources

- [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next)
- [Better Auth PostgreSQL adapter](https://better-auth.com/docs/adapters/postgresql)
- [Better Auth sessions](https://better-auth.com/docs/concepts/session-management)
- [Better Auth email](https://better-auth.com/docs/concepts/email)
- [Better Auth users and email change](https://better-auth.com/docs/concepts/users-accounts)
- [Better Auth security](https://better-auth.com/docs/reference/security)
- [Better Auth pricing](https://better-auth.com/pricing)
- [Auth.js repository and maintenance direction](https://github.com/nextauthjs/next-auth)
- [Clerk Next.js SDK](https://clerk.com/docs/reference/nextjs/overview)
- [Clerk session-token verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification)
- [Clerk reverification](https://clerk.com/docs/guides/secure/reverification)
- [Clerk pricing](https://clerk.com/pricing)
- [Clerk DPA](https://clerk.com/legal/dpa)
- [Supabase Next.js SSR server verification](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs)
- [Supabase users and confirmed email](https://supabase.com/docs/guides/auth/users)
- [Supabase sessions](https://supabase.com/docs/guides/auth/sessions)
- [Supabase regions](https://supabase.com/docs/guides/platform/regions)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase self-hosting](https://supabase.com/docs/guides/self-hosting)
