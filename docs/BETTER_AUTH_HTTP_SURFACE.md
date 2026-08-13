# Better Auth HTTP surface review

Reviewed version: Better Auth 1.6.27

Review date: 2026-08-12
Public base path: `/api/auth`

## Review basis

The authoritative inventory is the exact installed package, especially
`dist/api/routes/index.d.mts`, each file under `dist/api/routes/`, and
`dist/integrations/next-js.mjs`. The stock Next.js adapter exports GET, POST, PATCH, PUT,
and DELETE directly to the complete package router. This project does not export that
adapter because it would make the public surface depend on every enabled or future package
endpoint.

## Selected public contract

| Method | Path                       | Purpose                                      | Public response                          |
| ------ | -------------------------- | -------------------------------------------- | ---------------------------------------- |
| POST   | `/sign-up/email`           | Create an unverified email/password identity | Fixed `accepted`                         |
| POST   | `/sign-in/email`           | Authenticate and set the session cookie      | Fixed `authenticated` or safe failure    |
| POST   | `/request-password-reset`  | Request an anti-enumerating recovery email   | Fixed `accepted`                         |
| GET    | `/reset-password/:token`   | Consume the email link and redirect locally  | Same-origin redirect only                |
| POST   | `/reset-password`          | Consume a token and replace the password     | Fixed `accepted`; all sessions revoked   |
| POST   | `/send-verification-email` | Request an anti-enumerating verification     | Fixed `accepted`                         |
| GET    | `/verify-email`            | Consume a verification token                 | Same-origin redirect only                |
| GET    | `/get-session`             | Read cookie-backed current-user state        | Safe user projection without identifiers |
| POST   | `/sign-out`                | Revoke the current session and clear cookie  | Fixed `accepted`                         |

All paths above are relative to `/api/auth`. POST requires the exact canonical origin,
`Sec-Fetch-Site: same-origin`, JSON where applicable, strict endpoint-specific fields, and
a bounded 4 KiB body. GET session reads require a same-origin fetch. Verification and reset
links allow top-level cross-site navigation but require exact token/query forms and a
relative same-origin callback. Unknown paths return fixed 404; wrong methods return fixed
405 with the path's single allowed method.

Verification JWT structure is screened before dispatch and any token carrying Better
Auth's `updateTo` or `requestType` email-change claims is rejected. This prevents the
selected verification endpoint from becoming an accidental change-email surface even if a
legacy or separately minted change-email link exists.

The wrapper strips host/protocol/original-URL forwarding ambiguity before dispatch. It
rejects bearer authorization and method override, bounds header count/name/value size, and
never forwards browser-owned account, subject, user, session, role, provider, image, or
redirect-origin fields. Responses are no-store, non-CORS, anti-frame, no-referrer, and
projected. Public JSON never contains Better Auth user/session IDs, session tokens,
IP/user-agent data, recovery tokens, provider errors, or exceptions. Cookies remain
`HttpOnly`, `SameSite=Lax`, root-path, and `Secure` in production.

## Deliberately non-public package endpoints

- Social/OAuth: `/sign-in/social`, `/callback/:id`.
- Account/provider: `/list-accounts`, `/link-social`, `/unlink-account`,
  `/get-access-token`, `/refresh-token`, `/account-info`.
- Broad session management: POST `/get-session`, `/list-sessions`, `/revoke-session`,
  `/revoke-sessions`, `/revoke-other-sessions`, `/update-session`.
- User mutation: `/update-user`, `/change-password`, `/set-password`, `/change-email`,
  `/delete-user`, `/delete-user/callback`.
- Package diagnostics/navigation: `/ok`, `/error`.

`auth.api.verifyPassword` remains a server-only call used by the independently protected
account-deletion workflow. Internal account bootstrap and deletion are not Better Auth
public endpoints. Bootstrap is exposed separately through a first-party zero-field Server
Action that re-verifies the complete Goal 62 trust chain. Change-email and package
delete-user remain disabled in configuration;
the transactional local deletion workflow is authoritative.

## Runtime composition and residual gates

The App Router catch-all is dynamic on the Node.js runtime. Its process service lazily
loads four separate server-only PostgreSQL URLs (Better Auth, account workflow, email delivery
ledger, and feedback/suppression), rollover secrets, canonical origin/proxy policy, and the selected SES
Canada Central adapter. Construction makes no network call. The SES client, bounded pools,
idempotency repository, suppression resolver, and auth handler are process-scoped and
closable.

The current Better Auth limiter is in-memory and per process. Production requires either a
reviewed shared limiter/edge control or proof that the deployment topology cannot multiply
the configured limits. The ingress proxy must overwrite the configured client-IP header and
match the explicit trusted-proxy list. Access logs, tracing, analytics, support tooling, and
error capture must redact verification/reset token query and path values. Live configured
browser E2E, recovery UX, real proxy behavior, live SES/SNS resources, credentials, and
production recovery testing remain later gates.
