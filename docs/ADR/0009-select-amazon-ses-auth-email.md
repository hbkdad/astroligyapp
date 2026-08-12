# ADR 0009: Select Amazon SES for authentication email

Status: accepted
Date: 2026-08-12

## Context

Better Auth requires transactional delivery for address verification and password
reset before a public authentication flow can be exposed. These messages carry a
single-use capability URL, so delivery is part of the authentication boundary rather
than a general notification feature. Goal 57 compares current providers and fixes the
privacy, identity, DNS, retry, suppression, and failure contract before installing a
client, creating an account, changing DNS, or sending email.

Primary documentation and registry metadata were reviewed on 2026-08-12. Prices are
public list prices, normally USD, and must be rechecked before purchase or production
approval.

| Candidate                                                   | Regional/data position                                                                                                                                                                                                   | Delivery and security controls                                                                                                                                                                                                                                                                              | Cost, maintenance, and exit                                                                                                                                                                                                                                                               | Decision                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Resend / `resend` 6.19.0                                    | Regional sending is available, but Resend documents that account data, email metadata, logs, and API records remain stored in the United States regardless of sending region.                                            | SPF/DKIM domains, suppression events, native 24-hour idempotency keys, and Svix-signed at-least-once webhooks are strong developer controls.                                                                                                                                                                | Free is 3,000 messages/month with a 100/day limit; Pro starts at USD 20 for 50,000. The API is easy to replace, but the documented US metadata boundary does not meet the preferred Canada operation posture.                                                                             | Reject for launch.                           |
| Postmark / `postmark` 5.1.0                                 | Public material does not establish a Canadian processing region. Message content and activity are retained for 45 days by default; the add-on supports 7–365 days, while aggregate statistics are retained indefinitely. | Transactional streams, confirmed senders, DKIM, suppression, and bounce/complaint handling are mature. Postmark explicitly does not sign webhook requests; Basic Auth and IP allowlisting are recommended, which is weaker than an authenticated queue or signed event boundary.                            | A developer tier permits 100 test messages. Straightforward SMTP/API exit is possible, but retention and webhook assurance are weaker for this use.                                                                                                                                       | Reject for launch.                           |
| Amazon SES API v2 / future `@aws-sdk/client-sesv2` 3.1108.0 | SES exposes API, SMTP, and feedback endpoints in Canada Central (`ca-central-1`). This is a Canadian regional service boundary, not a claim of Canadian corporate sovereignty or guaranteed end-to-end residency.        | IAM-scoped API access, Easy DKIM, SPF/custom MAIL FROM, DMARC, configuration-set events, regional account suppression, and AWS-native SNS-to-SQS delivery avoid a public webhook. Production access and sender/domain verification are explicit gates. SES does not provide a general send idempotency key. | As of the July 2026 pricing change, new accounts start on Essentials at USD 0.16/1,000 outbound messages plus data transfer; Pro and a-la-carte options differ. The standards-based domain, local templates, provider-neutral port, and exportable suppression state keep exit practical. | Select Canada Central.                       |
| Cakemail transactional API/SMTP                             | Cakemail states that Canadian customer data is hosted on Canadian servers and offers Canada-based English/French support.                                                                                                | Domain authentication and transactional API/SMTP are advertised, but public documentation does not yet provide enough precise evidence for send idempotency, signed webhook/event delivery, suppression export, API rate/production controls, SDK maintenance, or authentication-message incident handling. | Canadian operation and support are valuable. A technical/security review and contractual DPA/retention confirmation are required before relying on it for authentication capabilities.                                                                                                    | Defer as the preferred sovereignty fallback. |

## Decision

Select Amazon SES API v2 in `ca-central-1` for verification and password-reset
delivery. When implementation begins, pin exact `@aws-sdk/client-sesv2` 3.1108.0;
do not install it as part of this decision. Use the regional API endpoint only and do
not use the SES global endpoint or SMTP credentials.

This decision does not create an AWS account, accept a paid plan, request production
access, verify an identity, mutate DNS, create a queue, install a package, expose a
route, or send an email. Those remain separately reviewable gates. If Canadian
corporate sovereignty becomes a hard requirement, reopen this ADR and complete the
Cakemail technical/security and contract review before implementation.

## Provider-neutral dispatch contract

The application-facing port accepts exactly this conceptual immutable input:

```ts
type AuthenticationEmailRequest = Readonly<{
  version: "1.0.0";
  purpose: "verify-email" | "reset-password";
  recipient: string;
  actionUrl: string;
  templateVersion: string;
  idempotencyReference: string;
}>;
```

The port validates an exact normalized email address; one HTTPS absolute application
URL on the configured canonical origin and allowlisted purpose path; a supported local
template version; and an opaque bounded idempotency reference. Extra fields fail
closed. The request cannot contain a name, birth/profile data, account ID, provider
identity, arbitrary subject/body, metadata, tags, or credentials.

The outward result contains only a version, one of `accepted`, `rejected`, `retry`,
`reconciliation-required`, or `suppressed`, and a stable identity-free code. It never
returns the recipient, URL/token, provider message ID, provider payload, credential,
exception, or suppression detail. The same exclusions apply to logs, metrics, traces,
error monitoring, and audit events.

## Sender, DNS, and content boundary

- Use a dedicated authentication subdomain of the eventual product domain. The exact
  names remain blocked on product-domain selection; the intended shape is
  `security@auth.<product-domain>` with custom MAIL FROM
  `bounce.auth.<product-domain>`.
- Configure SPF for the custom MAIL FROM domain, 2048-bit Easy DKIM for the sender
  identity, and aligned DMARC. Begin DMARC at `p=none` only while validating aggregate
  reports, then move to `quarantine` and ultimately `reject` before launch approval.
- Links use only the canonical application origin, never an SES, tracking, or shortened
  host. Disable open tracking, click tracking, and link rewriting for authentication
  messages.
- Render versioned text and HTML templates locally. Provider-hosted templates are not
  authoritative. Templates contain generic security copy and no user name, birth
  data, profile detail, or reason that confirms an account exists.
- Encode locale in an allowlisted template version, beginning with `en-CA`; add a
  separately reviewed `fr-CA` version before claiming bilingual support. Locale is not
  inferred from recipient or provider data.

## Idempotency, retries, and outage behavior

SES has no general client-supplied send idempotency key. The implementation must use a
durable local delivery ledger keyed by the opaque `idempotencyReference` and a
domain-separated keyed fingerprint of the validated request. It must reserve the
reference before sending and privately bind a successful SES message identity to the
attempt. Reuse with the same fingerprint returns the existing safe disposition; reuse
with different content is a conflict and requires reconciliation.

Only a failure proven to occur before provider acceptance may retry automatically. A
timeout, connection loss, malformed success, or crash around provider acceptance is
`reconciliation-required`; never blindly resend the same capability. A later explicit
user request creates a new Better Auth capability and a new idempotency reference,
subject to the existing anti-abuse limits.

Public signup, verification-resend, forgotten-password, and reset-request responses
must remain timing- and content-equivalent whether the account exists, is verified, is
suppressed, or delivery fails. A provider outage fails the Better Auth callback
generically and does not create an authenticated session or claim delivery. No fallback
provider or SMTP path silently sends the capability.

## Feedback, suppression, and least privilege

- Require a configuration set on every send. Publish bounce, complaint, reject,
  delivery, delay, and rendering-failure events through same-region SNS to an encrypted
  SQS queue. There is no public feedback webhook.
- Process events at least once and deduplicate using bounded provider message/event
  identities. Bounce and complaint update a local minimal suppression decision and the
  regional SES account-level suppression list; an operator-only reviewed path is
  required to reverse suppression.
- Do not retain message bodies, action URLs, tokens, or plaintext recipients in the
  delivery ledger. Store only purpose/template versions, keyed fingerprints, safe
  state, bounded timestamps, and private opaque provider identifiers needed for event
  correlation. The implementation goal must resolve how the ephemeral plaintext
  request reaches SES without entering durable storage.
- Use a dedicated workload IAM role permitted only to send from the verified
  authentication identity with the required configuration set in `ca-central-1`.
  Feedback ingestion receives only the queue permissions it requires. No long-lived
  SMTP password, broad SES administrator policy, or browser credential is permitted.
- Apply application endpoint limits in addition to Better Auth and SES account limits.
  Suppression, throttling, quota exhaustion, sandbox restrictions, and provider failure
  map to fixed private dispositions, not provider details.

## Retention and exit

Our persistence remains provider-neutral and content-free. Operational retention for
delivery receipts, event identities, keyed recipient fingerprints, and suppressions
must be fixed before the first production send and included in account deletion and
legal-retention design. AWS processing and retention must be confirmed in the executed
DPA/service terms; selecting a region alone is not a retention promise.

Exit requires replacing only the adapter, rotating credentials, updating authenticated
sender DNS, and migrating the minimal suppression state. Local template versions,
application URLs, idempotency references, Better Auth callbacks, and public responses
must not depend on SES message IDs or payload schemas.

## Consequences and remaining gates

SES gives the project mature delivery controls and a Canadian regional boundary while
preserving a small application-facing port. It also adds AWS IAM, sandbox approval,
quota, DNS, queue, event-processing, and operational reconciliation work. The absence
of native send idempotency makes the conservative local ledger mandatory.

Before a live send, separately approve the AWS account and current pricing, verify
regional service terms/DPA, select the product domain, apply SPF/DKIM/DMARC/custom MAIL
FROM records, request production access, provision SNS/SQS and IAM, set retention and
suppression operations, run mailbox-provider delivery tests, and complete a security
and release review. No one of those gates is implied by this ADR.

## Sources

- [Amazon SES regions and endpoints](https://docs.aws.amazon.com/general/latest/gr/ses.html)
- [Amazon SES pricing](https://aws.amazon.com/ses/pricing/)
- [Amazon SES IAM controls](https://docs.aws.amazon.com/ses/latest/dg/control-user-access.html)
- [Amazon SES DMARC authentication](https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dmarc.html)
- [Amazon SES feedback notifications](https://docs.aws.amazon.com/ses/latest/dg/monitor-sending-activity-using-notifications.html)
- [Amazon SES event destinations](https://docs.aws.amazon.com/ses/latest/dg/event-publishing-add-event-destination.html)
- [Resend pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing)
- [Resend sending regions and storage](https://resend.com/docs/dashboard/domains/regions)
- [Resend idempotent send API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests)
- [Postmark pricing](https://postmarkapp.com/pricing/)
- [Postmark retention](https://postmarkapp.com/support/article/how-does-the-retention-add-on-work)
- [Postmark webhook security](https://postmarkapp.com/developer/webhooks/webhooks-overview)
- [Cakemail for Canadian businesses](https://www.cakemail.com/solutions/email-marketing-for-canadian-businesses)
- [Cakemail next-generation API overview](https://www.cakemail.ca/blog/post/cakemail-next-gen-apis-easier-safer-and-wiser)
