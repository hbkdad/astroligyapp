# ADR 0007: Select Paddle for the first billing verification adapter

- Status: Accepted
- Date: 2026-08-11

## Context

The launch product needs recurring Personal and Advanced subscriptions, but the
domain and persistence layers are intentionally provider-neutral. The first
provider decision should minimize early global tax and billing operations while
preserving a replaceable webhook boundary. This decision covers verified
subscription-state ingestion only. It does not approve a live account, prices,
checkout, a public webhook endpoint, production credentials, or deployment.

Primary sources were reviewed on 2026-08-11 for Canada availability, public
pricing, merchant-of-record responsibility, webhook verification, and supported
Node tooling.

| Candidate     | Public operating model and pricing                                                                                                                                                                                                                                                                                    | Verification and launch fit                                                                                                                                                                                                                                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe        | Canadian domestic cards are 2.9% + CA$0.30. Direct use leaves the seller responsible for tax registration and filing; Tax and Billing are separately priced. Managed Payments adds a 3.5% merchant-of-record fee to Payments fees.                                                                                    | Mature official Node support and raw-body `Stripe-Signature` verification with a five-minute default tolerance. Direct processing is cheaper, but the initial tax/compliance burden is greater; Managed Payments is materially more expensive at current public rates.             |
| Paddle        | Merchant of record at 5% + 50 cents per checkout transaction with payments, subscription billing, tax compliance, fraud/chargeback protection, and payment-related buyer support included. Paddle supports software suppliers outside its explicit sanctions list, and documents local CAD payouts to Canadian banks. | Official Node SDK verifies `Paddle-Signature` over the raw body and enforces a five-second replay tolerance. Complete subscription entities, stable event/customer/subscription/price IDs, lifecycle events, and RFC 3339 occurrence times map cleanly into the existing boundary. |
| Lemon Squeezy | Merchant of record at 5% + 50 cents, with tax calculation, filing, subscriptions, and billing support included; some international or other edge fees can apply.                                                                                                                                                      | Signed `X-Signature` webhooks and retries are documented. Its comparable merchant-of-record economics are credible, but Paddle has the stronger first-party typed Node SDK and a more explicit timestamp/freshness contract for this adapter.                                      |

Sources:

- [Stripe Canada pricing](https://stripe.com/en-ca/pricing)
- [Stripe Node webhook verification](https://docs.stripe.com/webhooks?lang=node)
- [Paddle pricing](https://www.paddle.com/pricing)
- [Paddle supported supplier countries](https://www.paddle.com/help/legal/sanctions/which-countries-are-supported-by-paddle)
- [Paddle Canadian payout information](https://www.paddle.com/help/manage/get-paid/is-there-a-fee-taken-for-payouts)
- [Paddle webhook signature verification](https://developer.paddle.com/webhooks/about/signature-verification/)
- [Paddle subscription provisioning guidance](https://developer.paddle.com/build/subscriptions/provision-access-webhooks/)
- [Paddle subscription event types](https://developer.paddle.com/api-reference/event-types/list-event-types/)
- [Paddle Node quickstart](https://developer.paddle.com/get-started/quickstart/node/)
- [Lemon Squeezy pricing](https://www.lemonsqueezy.com/pricing)
- [Lemon Squeezy webhook requests](https://docs.lemonsqueezy.com/help/webhooks/webhook-requests)

## Decision

Select Paddle as the first billing provider behind `BillingProviderAdapter` and
pin the official server SDK `@paddle/paddle-node-sdk` at 3.10.0. The choice is
based on early-stage operating fit, not permanent domain coupling: at present,
the equal public Paddle/Lemon Squeezy base rate buys merchant-of-record tax and
billing operations, while Paddle supplies the clearest supported Node
verification path. Stripe remains the leading future direct-processing option
if scale makes seller-managed tax/compliance and lower transaction fees the
better tradeoff.

The adapter has these fixed rules:

1. A server-supplied destination secret and explicit Personal/Advanced Paddle
   price-reference allowlists are required at construction. Secrets and live
   price IDs are not checked into the repository.
2. The raw UTF-8 body and lower-cased `paddle-signature` header pass through the
   official SDK. The wrapper also requires exactly one current `ts` and `h1`,
   rejects timestamps more than five seconds old or in the future relative to
   Goal 48's trusted receipt time, and never logs the secret or raw body.
3. Only `subscription.created`, `subscription.updated`, `subscription.activated`,
   `subscription.trialing`, `subscription.past_due`, `subscription.paused`,
   `subscription.resumed`, and `subscription.canceled` are accepted.
   `subscription.imported`, transaction events, and every other event fail closed.
4. Dedicated lifecycle events must agree with their documented status. Status
   must be one of trialing, active, past due, paused, or canceled. The payload
   must contain one quantity-one recurring item whose exact `pri_` reference is
   configured. Multiple items and unknown products fail closed for the initial
   two-plan product model.
5. Paddle `evt_`, `ctm_`, and `sub_` references and a complete increasing billing
   period are required. Because Paddle documents the current period as `null` after
   pause or cancellation, those two access-reducing states use the required
   subscription start plus `paused_at` or `canceled_at` as the internal access-ending
   period. RFC 3339 instants are normalized to the internal millisecond UTC
   representation before Goal 46 validation and persistence.
6. Customer ownership is not inferred from webhook data. Goal 48's internal
   provider/customer resolver remains the sole bridge to an opaque account ID;
   an unmapped valid customer cannot mutate subscription state.

## Consequences

The application has a provider-selected verification adapter while entitlement,
transition, receipt, and persistence contracts remain provider-neutral. A future
Stripe, Lemon Squeezy, or other adapter can replace it without changing those
layers.

Paddle onboarding and product approval remain external production gates. Before
checkout or a public webhook route is enabled, the team must create separate
sandbox/live destinations, inject secrets through the deployment environment,
configure actual price IDs, verify account/product acceptance, exercise Paddle's
webhook simulator, and review current fees and terms again.

The selected SDK currently documents and implements one `h1` verification path;
Paddle says multiple `h1` values may appear with future secret rotation. This
adapter deliberately rejects that future format until the pinned SDK and adapter
are reviewed together. Server clock synchronization is operationally required
because the official five-second tolerance is intentionally narrow.
