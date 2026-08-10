---
name: security-audit
description: Audit changes involving authentication, authorization, private birth or relationship data, public shares, billing, webhooks, AI, notifications, uploads, logs, or external APIs. Use before merging security-sensitive features and at release gates; do not use as a substitute for functional tests.
---

# Security audit

## Procedure

1. Define assets, actors, trust boundaries, entry points, external providers, and the new or changed data flow.
2. Review server-side authentication, resource ownership, entitlement checks, object-level authorization, validation, output encoding, CSRF relevance, session/cookie settings, and rate limits.
3. Test cross-account access with two users and unauthenticated access where applicable. Test opaque share tokens, revocation, enumeration resistance, and absence of raw private data in URLs.
4. Review secrets, environment separation, logs, analytics, error messages, caches, AI prompts, notifications, exports, backups, and deletion for birth and relationship data leakage.
5. For billing or webhooks, verify signatures, event freshness where supported, idempotency, replay handling, out-of-order transitions, and server-owned entitlements.
6. Run dependency and static checks already supported by the repository, plus focused adversarial tests for changed boundaries.
7. Report findings by severity with file/evidence, exploit condition, impact, minimal remediation, and verification status. Record accepted residual risk.

## Validation gate

- No critical or high finding remains unresolved without explicit acceptance.
- Ownership and entitlement tests fail closed.
- Public output contains only intentionally public fields.
- Logs and errors avoid secrets and unnecessary personal data.

## Prohibited shortcuts

- Do not claim security from lint or a happy-path browser test alone.
- Do not trust browser-supplied user, plan, price, or ownership identifiers.
- Do not test against production accounts or destructive live paths without explicit approval.
