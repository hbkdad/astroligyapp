# ADR 0016: Separate staging review from apply authorization

- Status: Accepted
- Date: 2026-08-25

## Context

The credential-free infrastructure and dual-artifact release gates can assemble a review package, but
they cannot prove a real AWS caller, registry attachment, trusted workflow identity, restore, alarm, or
runtime behavior. A checklist that mixes local evidence with live verification could accidentally make
a documentation approval look like authorization to provision resources.

Primary documentation reviewed on 2026-08-25 establishes several relevant boundaries:

- an OpenTofu saved plan can contain sensitive values in cleartext even when terminal output obscures
  them, so Git must retain only its SHA-256 and a deliberately redacted summary;
- AWS Pricing Calculator exports can be shared and updated estimates receive new links, so approval
  binds an export digest, date, assumptions, currency, and integer-cent limits rather than treating a
  mutable link as evidence;
- GitHub environments can require reviewers, prevent self-review, restrict deployment branches, and
  gate access to environment secrets, while AWS OIDC removes the need for long-lived CI credentials;
- Sigstore keyless verification must enforce certificate identity and issuer plus transparency evidence;
  and
- AWS Backup restore testing can measure restore completion and optionally record validation, but it is
  a live, billable operation rather than local documentary evidence.

## Decision

- Define `astroligyapp.staging-approval` schema 1 as an expiring, canonical review envelope. It binds
  staging, the exact 12-digit account, `ca-central-1`, release source/release-set digest, both immutable
  ECR subjects and independent predecessors, saved-plan/redacted-summary digests, change counts, cost
  assumptions and limits, a UTC change window, opaque owners, RPO/RTO/retention/restore cadence, data
  handling, and every documentary/live preflight gate.
- Keep contacts, plan/state contents, calculator URLs, credentials, secret values, provider payloads,
  private data, and signing material outside the envelope and Git. Monetary values use integer USD
  cents. The exact account is operational scope, not a redaction target.
- Permit a deterministic `mock-contract-only` preparation package generated from the checked-in
  credential-free fixture. It has no saved plan, calculator conclusion, documentary reviewers, live
  evidence, or apply authority and must fail both readiness assertions.
- Documentary readiness requires a current reviewed calculator export, a reviewed saved-plan hash with
  zero delete/replacement changes, all local gates, and four unique release/security/cost/rollback
  reviewers distinct from the requester. Their approval is explicitly `documentary-only`.
- Staging apply readiness additionally requires all 12 live gates and one separate authorizer who is
  neither the requester nor a documentary reviewer. Production cannot reuse a staging envelope.
- Bind every decision to a canonical SHA-256 of the complete statement, its external approval-record
  SHA-256, and a review time inside the active package interval. Reject field drift, tampering,
  missing/duplicate gates, mutable/cross-account artifacts, source/release/plan mismatch, stale or
  overlong validity, cost over budget, unsafe recovery targets, private-data permissions, self-review,
  reviewer reuse, destructive changes, and incomplete live evidence.

## Trust and authorization boundary

The schema is a verifier, not a credential or deployment command. A synthetically complete test fixture
proves validator behavior only. The repository contains no AWS account trust, GitHub environment,
required-reviewer configuration, OIDC role, ECR subject/referrer, Rekor entry, saved plan, calculator
export, live restore, or authorization to apply. Those facts must be captured after explicit approval
in an access-controlled evidence store outside Git.

## Primary references

- [OpenTofu plan command and saved-plan sensitivity](https://opentofu.org/docs/v1.10/cli/commands/plan/)
- [AWS Pricing Calculator estimate sharing and exports](https://docs.aws.amazon.com/pricing-calculator/latest/userguide/save-share-estimate.html)
- [GitHub deployment environments and required reviewers](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub OIDC for AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
- [Sigstore Cosign verification](https://docs.sigstore.dev/cosign/verifying/verify/)
- [AWS Backup restore testing](https://docs.aws.amazon.com/aws-backup/latest/devguide/restore-testing.html)

## Consequences

- The review package is deliberately short-lived and requires regeneration when plan, release, cost,
  change window, target, recovery, or gate evidence changes.
- A plan containing a delete or replacement is routed to a separate destructive-change review instead
  of being silently accepted by the baseline staging path.
- Real approval evidence cannot be checked into the public repository. Local CI can prove schema and
  policy behavior, while environment-specific controls remain external staging gates.
