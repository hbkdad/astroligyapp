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
