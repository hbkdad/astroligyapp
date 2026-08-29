# GitHub trust-readiness evidence

## Purpose

Goal 90 evaluates whether the repository could safely host a future protected promotion workflow without
changing any external setting. It does not create that workflow or grant publishing, cloud or deployment
authority.

The desired-state contract is `config/github-protected-promotion-policy.json`. The reduced read-only API
observation is `docs/evidence/github-trust-readiness.snapshot.json`. ADR 0020 records the decision and its
current GitHub documentation basis.

## Evidence states

- `observed`: the named GET endpoint returned a representation. The validator still checks whether its
  fields satisfy policy.
- `unavailable`: access, plan support or transport prevented observation. This is not evidence that the
  control exists.
- `unproven`: no suitable subject or cryptographic evidence was available to test. This is always NO-GO.

The 2026-08-29 snapshot observed the correct public, non-fork repository identity, but no ruleset, no main
branch protection and no environment. Actions are enabled for all actions and do not require full-SHA pins.
Default workflow token permission is read and workflow PR approval is disabled. OIDC uses the default,
non-immutable subject mode. Artifact-attestation verification is unproven.

## Commands

```powershell
npm run test:github-trust-readiness
npm run github:trust:verify
```

The adversarial test must pass. The live-snapshot verifier currently exits `2` by design and prints the six
NO-GO findings. Exit `2` is not a broken test; it prevents automation from confusing a valid snapshot with
a ready repository.

## Recapture procedure

Use authenticated, read-only GET requests for the repository, repository rulesets, `main` branch
protection, environments, Actions permissions, default workflow permissions and repository OIDC subject
customization. Pin the REST API version. Reduce responses to the schema's exact allowlisted fields and
review the diff before replacing the snapshot. Do not store headers, tokens, actor names, reviewer rosters,
URLs containing private identifiers, secrets or raw provider responses.

Attestation readiness cannot be inferred from settings. It requires a real immutable subject and
cryptographic verification that constrains repository ID, source commit, subject digest, issuer and exact
signer workflow. Until such a subject exists under an approved publishing goal, keep that observation
`unproven`.

## Non-authorization

The synthetic protected-promotion envelope is deliberately fixed to `synthetic-non-authorizing` and
`activationAllowed: false`. It demonstrates the future configuration contract only. Never treat its scope
hash, a green contract test, a successful release-candidate run or an uploaded Actions artifact as approval
to mutate GitHub, configure OIDC/cloud trust, publish an image, apply infrastructure or deploy.
