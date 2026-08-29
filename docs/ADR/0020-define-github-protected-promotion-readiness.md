# ADR 0020: Define GitHub protected-promotion readiness without granting authority

- Status: Accepted
- Date: 2026-08-29

## Context

Goal 89 created credential-free, non-promoting release evidence. A future promotion boundary needs stronger
repository controls, independent review, immutable workload identity and verified GitHub attestations. A
workflow file cannot prove that external repository settings or cloud trust exist, and a successful build
artifact cannot grant its own promotion authority.

Primary GitHub documentation reviewed on 2026-08-29 establishes that rulesets can require pull requests and
status checks and may define bypass actors; required status-check names do not identify their triggering
workflow or event. Protected environments can require reviewers and prevent self-review, while administrator
bypass must be disabled separately. Repository APIs expose rulesets, branch protection, environments, Actions
policy/default permissions and OIDC subject customization. Attestations only provide security value after
cryptographic verification and signer/source policy evaluation.

The authenticated, read-only API snapshot captured on 2026-08-29 observed repository ID `1329276081`, owner
ID `93459210`, public visibility and `main` as the default branch. It also observed zero rulesets, no `main`
branch protection, zero environments, all Actions allowed without mandatory SHA pinning, read-only default
workflow permission with pull-request approval disabled, and default non-immutable OIDC subject mode. No
published subject or trusted GitHub artifact attestation exists to verify.

## Decision

1. Store only the reduced fields needed for trust evaluation in
   `docs/evidence/github-trust-readiness.snapshot.json`. Each control is explicitly `observed`, `unavailable`
   or `unproven`; denial or absence is never converted into a positive claim.
2. Accept `config/github-protected-promotion-policy.json` as desired state, not deployed configuration. It
   binds numeric owner/repository IDs, `main`, exact workflow paths/jobs, required CI and release checks,
   selected full-SHA actions, read-only default workflow permissions and no workflow PR approval.
3. Require a protected `production` environment with at least two distinct independent reviewers, prevented
   self-review, no administrator bypass and the protected main ref. This deliberately exceeds GitHub's
   one-of-six required-reviewer execution semantics by requiring separate review evidence in the eventual
   promotion contract.
4. Require immutable repository-ID OIDC subject
   `repo:hbkdad@93459210/astroligyapp@1329276081:environment:production` and audience
   `sts.amazonaws.com`. These strings are a future trust contract; this ADR does not create an identity
   provider or AWS role.
5. Require successful, unexpired, unconsumed Goal 89 evidence for the same immutable source/workflow commit,
   plus a cryptographically verified attestation bound to repository ID, subject digest, source commit and
   exact signer workflow.
6. The synthetic envelope is permanently `synthetic-non-authorizing`, fixes activation to false, contains no
   credential, and cannot be promoted by the validator. A later explicitly approved goal must re-read live
   settings and independently authorize any configuration or deployment.

## Adversarial policy

Reject recycled repository names with different numeric IDs, non-main refs, mutable workflow references,
failed/stale/consumed release evidence, changed run keys, privilege expansion, insufficient/duplicate/self
review, bypass, default or mutable OIDC subjects, audience drift, wrong signer/source/digest, unverified
attestations, scope tampering, synthetic trust elevation and embedded secrets.

## Primary references

- [GitHub ruleset rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
- [GitHub rulesets REST API](https://docs.github.com/en/rest/repos/rules)
- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub deployment-environment REST API](https://docs.github.com/en/rest/deployments/environments)
- [GitHub Actions permissions REST API](https://docs.github.com/en/rest/actions/permissions)
- [GitHub Actions OIDC REST API](https://docs.github.com/en/rest/actions/oidc)
- [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)

## Consequences

- The current repository is deterministically NO-GO for protected promotion even though its existing
  credential-free release workflow remains useful.
- The desired contract is reviewable and adversarially testable before any privileged setting is changed.
- Staging apply, production, registry publishing, external redistribution and cloud trust remain NO-GO.
