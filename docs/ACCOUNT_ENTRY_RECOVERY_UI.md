# Account entry and recovery UI

Status: Goals 65-68 local implementation accepted on 2026-08-13.

## Scope

The account surface is a first-party browser client for the reviewed Goal 64 public
authentication contract. It adds no Better Auth route, provider capability, private product
read, live email, external resource, credential, production mutation, or deployment behavior.
Goals 66-67 add explicit first-party activation and deletion mutations over the already
accepted Goal 62 and Goal 63 internal workflows.

The routes are:

| Page                       | Public operation                                      |
| -------------------------- | ----------------------------------------------------- |
| `/account`                 | `GET /api/auth/get-session`, `POST .../sign-out`      |
| `/account/sign-in`         | `POST /api/auth/sign-in/email`                        |
| `/account/sign-up`         | `POST /api/auth/sign-up/email`                        |
| `/account/forgot-password` | `POST /api/auth/request-password-reset`               |
| `/account/verify-email`    | `POST /api/auth/send-verification-email`              |
| `/account/reset-password`  | `POST /api/auth/reset-password` after link navigation |
| `/account/profiles`        | Private server read and create/update/delete Actions  |

The `/account` page also exposes one Next.js Server Action, not a public Better Auth route.
Its form has no named fields. The action ignores React's client-supplied prior state, copies
only the bounded cookie from framework headers, and re-verifies the complete Goal 62 session,
bootstrap, active-account, and identity-readiness chain before returning a four-state UI
projection.

The verified account view also exposes a visually separated danger zone. Its Server Action
accepts only the fixed version, exact `DELETE MY ACCOUNT` phrase, and current password. The
action ignores prior view state, reconstructs canonical origin/fetch metadata, forwards only
the bounded cookie, and returns only deleted/authenticate/authorize/retry/reconcile. A terminal
deleted or reconcile result replaces the session presentation; no browser state authorizes the
operation.

After server account readiness succeeds, the overview links to `/account/profiles`. The profile
route still performs its own live session, active-account, row-ownership, and entitlement checks;
the link and browser session projection grant no access. See `PRIVATE_PROFILE_BOUNDARY.md`.

All pages are no-indexed and inherit `no-referrer`. Browser requests use same-origin
credentials, no-store caching, explicit JSON only where the Goal 64 endpoint requires it,
and error on redirects. The client parser accepts only exact status/field shapes with
status-code agreement. Extra fields, invalid JSON/content type, redirects, network errors,
or malformed projections become one local `unavailable` state.

## Trust and privacy boundary

- The browser session projection contains only name, normalized email, and current email
  verification state. It changes presentation only. Every private read or mutation must
  independently verify the live server session, internal owner, and authorization.
- Passwords are read from uncontrolled form fields only for one request and cleared after
  validation or completion. They are never React state, URL data, storage, logs, or rendered
  feedback.
- Email is normalized locally for the strict request contract. Signup, reset request, and
  verification request use generic completion text that does not disclose account presence.
- A reset link credential is captured into one component-local reference, and the full query
  is synchronously replaced before interaction. It is not rendered, hidden in a form, or
  written to local/session storage. Accepted or rejected use clears the reference. A
  rate-limited or unavailable attempt retains it only in memory for an explicit retry because
  completion was not confirmed.
- Shared navigation reacts to the public session projection and session-change events. It is
  not an authorization guard and cannot trigger bootstrap, deletion, profile, billing, or
  entitlement work.
- The account activation control is only a presentation trigger. It sends no owner, subject,
  account, email, profile, entitlement, plan, or redirect. The action accepts only a fresh
  server-verified session and returns no ID or internal failure code.
- The deletion form uses `current-password` autocomplete, clears entered credentials after an
  attempt, disables double submission, focuses fixed failure feedback, and never submits an
  owner, subject, account, email, redirect, billing reference, or provider identifier.

## Interaction and accessibility contract

Forms use native labels, email/password input types, required/minimum/maximum constraints,
and password-manager autocomplete tokens (`username`, `current-password`, `name`, `email`,
and `new-password`). Pending controls are disabled and labelled; success uses a polite status;
application failures use an assertive focus target. Native invalid controls receive browser
focus. Every interactive control is at least 44 CSS pixels, focus indicators are visible, and
the skip link moves focus to the account main landmark.

The layout has no horizontal page overflow at 1280px desktop, 390px mobile, or 390px with a
200% root text size. Reduced-motion preference changes smooth scrolling to `auto`. Forms and
session states have semantic headings, regions, definition lists, navigation names, labels,
and live status roles; meaning does not depend on colour. Foreground, muted, accent, mint,
error, and success text have at least 7.91:1 contrast against the raised dark surface.

## Verification

- `tests/account-interface.test.tsx` uses JSDOM plus Testing Library/user-event to exercise
  exact response parsing, session navigation, signup/signin, verification-required recovery,
  generic rejection, rate limiting, unavailable retry, password reset retry/use-once behavior,
  focus, autocomplete, password clearing, empty browser storage, and token/identifier absence.
- Account activation tests cover the zero-field Server Action, hostile prior state/form/header
  exclusion, bounded cookie projection, exact safe results, malformed service output,
  checking/focus/retry/reconcile UI, closed process state, and separate account-pool config.
- Account deletion tests cover exact ordered intent, hostile/duplicate/file fields, bounded
  cookie-only forwarding, wrong-password privacy, fixed projections, pending/focus/credential
  clearing, terminal deletion/reconciliation, closed runtime behavior, and the full disposable
  PostgreSQL rollback/concurrency/retention/share-removal lifecycle.
- The existing Goal 64 and disposable PostgreSQL integration suites retain backend proof for
  actual signup, email verification, sign-in, session, sign-out, rate limiting, reset, session
  revocation, and data isolation.
- Playwright CLI inspected the optimized application at 1280x900 and 390x844, plus 200% text
  and reduced motion. Screenshots are local under `output/playwright/`. The only browser
  console error was the expected fixed `503` session request because production auth/email
  configuration is deliberately absent from this local checkpoint; the UI exposed Retry.

## Remaining release gates

Live configured browser journeys still require production-like PostgreSQL roles, trusted
proxy rewriting, shared abuse limiting, log/trace redaction for capability URLs, SES/SNS/SQS
resources and credentials, real delivery/recovery tests, monitoring, and deployment review.
MFA/passkey scope remains a later release-hardening decision. Protected chart generation is the
next application boundary; profile UI state must not authorize calculation or provider work.
