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
