# API contracts

Status: initial boundary map

## Delivery rules

- Use React Server Components for authenticated first-party reads whenever no external HTTP contract is needed.
- Use Server Actions for authenticated first-party mutations with server-side validation, ownership checks, and entitlement checks.
- Use Route Handlers for external clients, webhooks, health endpoints, downloads, share links, and cacheable public calculation resources.
- Keep Route Handlers thin. They validate transport input, call application services, and map domain results to versioned response schemas.
- Use the default Node.js runtime. Any adapter that requires another runtime must be isolated and justified by ADR.

## Initial implemented route

### `GET /api/health`

Purpose: process-level readiness without database, private data, provider, or secret disclosure.

Response `200`:

```json
{
  "status": "ok",
  "service": "personal-cosmic-calendar",
  "architectureVersion": "1"
}
```

The response uses `Cache-Control: no-store`.

## Planned application boundaries

These names express responsibilities, not committed public URLs.

| Boundary                    | Transport                          | Authentication     | Responsibility                                                         |
| --------------------------- | ---------------------------------- | ------------------ | ---------------------------------------------------------------------- |
| Profile commands            | Server Actions                     | Required           | Create, update, export, and delete private profiles                    |
| Chart queries               | Server Components                  | Required           | Read stored, versioned chart results owned by the user                 |
| Chart calculation           | Application service                | Required           | Normalize input, invoke provider, derive facts, and persist atomically |
| Daily context query         | Server Component                   | Required           | Resolve cached or calculated personal context                          |
| Public sky/Moon data        | Route Handler or static generation | Public             | Return shared versioned facts with explicit cache policy               |
| Compatibility commands      | Server Actions                     | Required           | Create reports without exposing partner data                           |
| Shared compatibility report | Route Handler/page                 | Opaque token       | Return only explicitly public report fields                            |
| Billing webhook             | Route Handler                      | Provider signature | Apply idempotent subscription events                                   |
| Notification job            | Internal application service       | Service identity   | Schedule preference-aware, timezone-aware delivery                     |

## Implemented compatibility persistence boundary

`CompatibilityReportRepository` is server-only. Its private methods require a
verified opaque `AccountId` and execute under
the transaction-local `app_user` role:

- `create(owner, profiles, report)` validates and stores a complete Goal 40 report;
- `findOwned(owner, reportId)` returns only an owned, revalidated report;
- `deleteOwned(owner, reportId)` deletes only an owned report and any share state;
- `publishOwned(owner, reportId, expiresAt)` returns one new raw bearer while
  persisting only its digest and the Goal 42 redacted payload;
- `revokeOwned(owner, reportId)` makes the capability private and clears public copy;
- `resolveActivePublic(token)` returns only a validated active redacted payload or
  `null` for malformed, unknown, expired, revoked, or deleted capabilities.

The public resolver assumes `app_share_reader` in a local transaction, sets only a
canonical digest context, and can select only the redacted payload and integrity
digest through forced RLS. Stored integrity failure is an internal error; Goal 44's
transport maps every unavailable case to one generic public response.

## Implemented public compatibility transport

`GET /match/[token]` accepts only a canonical 43-character, 256-bit base64url
capability. A malformed value is rejected before repository work. An active value
returns a versioned read model rendered as escaped, script-free HTML; the raw token,
digest, owner/profile references, private report, and calculation provenance never
enter the document. Missing, expired, revoked, deleted, overloaded, integrity-
invalid, and infrastructure-failed lookups all return the identical generic 404.

The response is private/no-store and applies noindex/nofollow/noarchive/nosnippet,
no-referrer, strict no-script/no-connect CSP, frame denial, same-origin resource
policy, and restricted permissions. There is no canonical metadata, analytics,
outbound link, client bundle, or token-bearing application log. A four-lookup
process-local concurrency gate bounds repository pressure; a deployment edge may
add distributed rate limiting without recording raw capabilities.

## Error contract

External JSON endpoints will use a stable envelope once the first endpoint requiring input is implemented:

```json
{
  "error": {
    "code": "stable_machine_code",
    "message": "Safe user-facing summary",
    "requestId": "opaque-correlation-id"
  }
}
```

Never include stack traces, secrets, provider credentials, private birth data, or raw upstream errors. Validation details must be field-scoped and safe to disclose.

## Versioning and idempotency

- Version public response schemas before incompatible changes.
- Include calculation and provider versions in calculation resources.
- Require idempotency keys or provider event IDs for retried external mutations.
- Define cache keys from normalized inputs plus all calculation/config versions.

## Implemented entitlement decision boundary

`EntitlementPolicy.check(subscriptionState, feature, trustedClock)` is server-only
and provider-neutral. The accepted subscription projection contains only its schema
version, `personal` or `advanced` plan key, normalized status, and canonical period
instants. It contains no provider/customer/subscription reference, price, checkout,
or browser value. `null` represents the Free baseline.

Every immutable decision records the policy/state versions, feature, allow/deny,
effective tier, reason, evaluation instant, and paid-access end. Exact v1 feature
allocation is validated when the policy is created, so feature changes require a
declared code/version update. A future authenticated repository must source state;
request bodies, query parameters, cookies, or client stores never establish plan or
status.

## Implemented subscription transition boundary

`applySubscriptionEvent(currentState, normalizedEvent)` is a server-only pure
function between a future signature-verifying provider adapter and persistence. A
normalized event contains its schema version, opaque safe event ID, canonical
occurrence instant, internal paid plan key, normalized status, and canonical period.
It contains no signature, secret, price, checkout value, or browser field.

The result is immutable and explicitly reports `applied`, `duplicate`, `stale`,
`conflict`, `invalid-transition`, `invalid-event`, or `invalid-current-state`.
Different event IDs at the same instant conflict rather than using arbitrary lexical
ordering. Cancellation is terminal for one provider subscription. Reactivation must
arrive as a separately authorized subscription lifecycle, not an event that revives
a canceled record. Paused or canceled access-reduction may carry an earlier provider
subscription start only while shortening or retaining the prior end; this supports
providers whose current billing period becomes null without extending access.

`SubscriptionRepository.applyNormalizedEvent(owner, providerIdentity, event)` is
the implemented persistence boundary. It validates bounded normalized identity,
serializes concurrent first delivery, applies the pure transition under `app_user`,
and writes state plus an append-only domain-digested event receipt atomically. Exact
replay returns duplicate even after later transitions; same event identity with
different normalized content conflicts. Cross-owner provider/subscription collisions
return one generic internal conflict, and only the strict Goal 45 entitlement state
is returned. Webhook signature/provider adapters remain subsequent boundaries.

`processBillingWebhook(rawEnvelope, dependencies)` is the implemented provider-
neutral orchestration boundary. It accepts a maximum 256 KiB non-empty byte body
and at most 64 bounded, uniquely lowercased headers, then supplies cloned bytes and
a trusted receive instant to one server adapter. The adapter alone owns signature,
freshness, payload parsing, lifecycle allowlisting, and provider-to-internal plan
mapping. Owner lookup and persistence cannot run until its exact verified result is
revalidated.

The only outward dispositions are safe frozen `{statusCode, disposition, code}`
records: processed/conflict acknowledgements (200), generic request/verification/
contract rejection (400), or adapter/clock/owner/persistence retry (503). They do
not echo adapter rejection reason, raw body, signature, provider identity, customer
or subscription references, event IDs, entitlement state, or internal exceptions.

`createPaddleBillingProviderAdapter(configuration)` is the first concrete Goal 48
adapter. Its versioned server configuration contains one destination webhook secret
and nonempty, disjoint Personal/Advanced `pri_` allowlists. The returned provider key
is `paddle`. It uses official SDK 3.10.0 to verify the exact raw UTF-8 body and
`paddle-signature`, requires the signature timestamp to be within five seconds of
the trusted receipt instant, and returns only the provider-neutral verified/rejected
contract. Eight declared subscription lifecycle events are supported. Complete
`evt_`, `ctm_`, `sub_`, status, one recurring item, configured price, and an
increasing period are required. Active/trialing/past-due states use the current
billing period. Paddle's documented null-period paused/canceled states instead use
the subscription start and exact pause/cancel time, ending access safely. Provider
RFC 3339 values are converted into the internal canonical millisecond UTC form; no
provider payload or credential is returned or logged.

`BillingCustomerBindingRepository.bind(ownerId, identity)` creates one immutable
provider/customer ownership binding under the owner's `app_user` transaction. Exact
replay returns `existing`; a different customer for the owner's provider or reuse of
the pair by another owner throws the same generic conflict. `findForProvider` returns
only the frozen provider/customer identity visible to that owner. Both methods reject
extra fields and unsafe references before SQL.

`BillingCustomerOwnerResolver.resolveOwner(provider, customerReference)` implements
the narrow Goal 48 resolver. It opens a transaction, assumes only
`app_billing_resolver`, and calls `app.resolve_billing_customer_owner(text,text)`.
That role has no table privileges. The bounded security-definer function returns one
opaque account UUID or null and filters soft-deleted accounts; malformed privileged
results, database/rollback failure, and pool state are never translated into a user
identity or reflected response.

`POST /api/webhooks/paddle` is the only implemented billing HTTP ingress. It runs in
the Node.js runtime, accepts exactly `application/json` with optional UTF-8 charset,
rejects declared or streamed bodies above 256 KiB, caps the incoming header count at
64, and projects only `paddle-signature` into the verified orchestration boundary.
Cookies, authorization values, tracing headers, and arbitrary provider headers are
not retained or forwarded. The process-scoped service composes the strict server-only
environment loader, Paddle verifier, least-privilege owner resolver, subscription
writer, trusted clock, and bounded PostgreSQL pool.

Responses are fixed privacy-safe JSON: acknowledged processing/conflict uses 200,
invalid media or request shape uses 400/413/415, unavailable dependencies use 503,
and unsupported methods use 405. Responses are no-store and carry defensive content,
framing, referrer, and permissions headers. Missing or malformed configuration fails
closed without disclosing which value failed. No Paddle API key, customer creation,
checkout operation, or outbound provider call is part of this route.

`BillingCustomerProvisioner.provision({ownerId, contact})` is the provider-neutral
pre-checkout customer boundary. `ownerId` must be the opaque `AccountId` obtained
after the verified-session/account-resolution boundary; the provisioner also checks
its UUID shape at runtime. `contact.email` is exact-shape, normalized server-trusted
input. Browser account IDs, profile IDs, checkout metadata, webhook custom data, and
provider payloads are not accepted as ownership evidence.

The provisioner checks the Goal 50 binding before provider work and single-flights
same-process requests for one owner/provider. Its adapter contract is deliberately
`findOrProvisionCustomer`, not an idempotent `create`: Paddle documents that its API
does not support client-supplied idempotency keys for arbitrary operations. A
provider adapter must therefore lookup before creation and reconcile an ambiguous
create before returning one confirmed safe customer reference. The orchestrator then
binds that reference through the immutable repository. Fixed ready/reject/retry/
reconcile results contain no owner, email, provider, customer reference, exception,
or provider detail. No public HTTP or Server Action exposes this boundary yet. ADR
0008 now selects Better Auth for a future adapter, but this contract imports no vendor.

`createPaddleCustomerProviderAdapter(client)` implements that find-or-provision
contract against the exact Paddle Node SDK 3.10.0 customer resource shape. It lists
`active` customers using the exact email filter and a two-result page, accepts only
one normalized-email match with a canonical `ctm_` ID, and skips create when that
match exists. With no match it sends only `{email}`—never internal owner/profile IDs
or `customData`—and validates the create response.

Definite Paddle email rejection codes map to `invalid-contact`. Duplicate, network,
authentication, malformed-response, or other potentially ambiguous create results
trigger one exact re-query. Only one proven active match becomes `ready`; zero,
multiple, malformed, archived, wrong-email, invalid-ID, or failed re-query returns
`reconciliation-required`. The adapter never makes a second create attempt and never
reflects SDK error data.

`provisionBillingCustomerForRequest(request, dependencies)` is the unexposed
authenticated application boundary. It verifies the request through `SessionVerifier`,
resolves the active opaque account from that verified session, and obtains billing
contact from a `TrustedBillingContactResolver(session, ownerId)`. It never parses the
request body, query, cookie, profile, or browser state for owner ID or billing email.
Only after all three server trust steps succeed does it call `BillingCustomerProvisioner`.

The versioned result is restricted to `ready`, `authenticate`, `reject`, `retry`, or
`reconcile` plus a fixed code. Authentication rejection and verifier unavailability,
missing/invalid contact and contact-source outage, account failure, provisioning
failure, and reconciliation remain distinguishable without returning subject,
session, owner, email, provider, customer, exception, or entitlement data. No route,
Server Action or contact storage is selected by this contract. The Better Auth 1.6.27
adapter now validates a live database session with a ten-minute billing freshness
limit. Execute-only database functions then resolve the active internal account and
one current verified email; raw auth rows, password/token fields, cookie claims, and
duplicated contact storage remain outside the contract. No public route exposes it.

## Selected authentication-email dispatch boundary

`AuthenticationEmailDispatcher.dispatch(request)` is a server-only, provider-neutral
port. Its exact immutable request is limited to schema version
`1.0.0`, `verify-email` or `reset-password` purpose, one normalized recipient, one
absolute action URL on the configured canonical application origin and purpose path,
one allowlisted local template version, and one opaque idempotency reference. It does
not accept names, account/profile IDs, arbitrary subject/body, provider metadata,
tags, credentials, or browser-supplied identity.

The only safe dispositions are `accepted`, `rejected`, `retry`,
`reconciliation-required`, and `suppressed`, each with a stable identity-free code.
No result, log, metric, trace, or exception may expose recipient, action URL/token,
provider message ID/payload, credentials, suppression detail, or request fingerprint.
Better Auth and public auth responses remain anti-enumerating across every outcome.

`validateAuthenticationEmailRequest` rejects extra fields, non-normalized or non-ASCII
addresses, noncanonical origins, non-HTTPS URLs, purpose/path/template mismatch,
missing/duplicate/extra query fields, malformed reset capabilities, and callback
destinations outside the canonical application origin. `renderAuthenticationEmail`
then produces only the fixed local `en-CA` text/HTML version for the validated purpose;
it excludes recipient and idempotency data and HTML-escapes the capability URL.

The Better Auth callback seam is also implemented. It supplies the raw framework token
only to an injected idempotency-reference factory, then validates and freezes the
resulting dispatch request. The raw token never enters the dispatcher. Only an exact
`accepted` result completes the callback; invalid input, malformed results, any other
disposition, and all dependency errors become one generic delivery-unavailable error.

ADR 0009 selects a future Amazon SES API v2 adapter in `ca-central-1`, pinned at
`@aws-sdk/client-sesv2` 3.1108.0 when implemented. It must use local versioned
text/HTML templates, a dedicated authenticated sender domain, no tracking or link
rewriting, and a required configuration set. Bounce/complaint and related feedback
will arrive through same-region SNS to encrypted SQS, never a public webhook.

Because SES has no general send idempotency key, a durable local ledger must reserve
the opaque reference before provider work and compare a domain-separated keyed
request fingerprint. Exact replay returns its existing safe state; a content collision
or an ambiguous provider outcome requires reconciliation and must not trigger a blind
resend. Durable storage may not contain a plaintext recipient, action URL/token,
rendered body, or provider payload. Goal 58 implements the port, validator, renderer,
and callback seam only; no concrete dispatcher, idempotency factory/ledger, SDK, route,
credential, external resource, DNS record, or live delivery exists.
