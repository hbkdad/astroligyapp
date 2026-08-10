# ADR 0004: Provider-neutral authentication boundary

Status: accepted  
Date: 2026-08-09

## Context

Protected server work must map an externally verified session to an opaque
internal account ID, then scope every database transaction to that account.
Authentication providers differ in session storage, revocation, cookies,
password support, MFA, pricing, and operational ownership. Selecting one before
the sign-in requirements and deployment environment are settled would couple
the database authorization boundary to vendor session shapes.

Current primary documentation was reviewed for Auth.js, Better Auth, and Clerk.
Auth.js provides an open-source Next.js server integration. Better Auth supports
database-backed, cached-cookie, and stateless sessions, with different immediate
revocation properties. Clerk provides managed sessions and server-side session
state. Better Auth explicitly warns that cookie-existence checks are suitable
only for optimistic redirects and cannot authorize protected actions.

## Decision

Defer the provider selection and define a narrow `SessionVerifier` port. A
provider adapter must return one of five states: active, unauthenticated,
expired, revoked, or invalid. Only an active session with a non-empty opaque
subject and session ID, a past authentication instant, and a future expiry may
cross the boundary.

Map the verified external subject to `user_account.id` in privileged server-only
code. Do not expose or accept the external subject in browser-owned resource
identifiers. Open every private-data operation through
`withIdentityTransaction`, which begins a transaction, assumes the constrained
`app_user` role, sets `app.current_user_id` transaction-locally using a bound
parameter, runs the operation, and commits or rolls back before releasing the
connection.

Account bootstrap is an explicit privileged operation with a uniqueness-safe
upsert. A soft-deleted subject is not silently reactivated.

## Security invariants

- Cookie presence, client state, middleware redirects, and browser-supplied user
  IDs never authorize protected work.
- Revocation and signature verification belong inside the provider adapter and
  occur before account lookup or database access.
- Authentication failures and unavailable accounts return generic errors that
  do not disclose subjects or account existence.
- Database role and identity settings are transaction-local and verified not to
  leak through pooled connections.
- High-risk actions may later require a provider-specific recent-authentication
  or MFA assurance level without changing the persistence boundary.

## Consequences and remaining decision

The server and database authorization design can be tested before selecting or
configuring a provider. The final provider decision still requires sign-in
methods, MFA/passkey requirements, immediate revocation behavior, data residency,
pricing, email ownership, account recovery, deployment fit, and vendor-exit
evaluation. No authentication package, secret, callback route, or production
account is added by this ADR.
