# ADR 0019: Bind credential-free CI evidence before granting release identity

- Status: Accepted
- Date: 2026-08-29

## Context

The local dual-artifact gate proves reproducibility and evidence consistency but deletes its temporary
evidence. Goal 89 needs a reviewable CI candidate without turning CI into a publisher or silently creating
a trusted deployment identity. The repository still has 20 undisposed manual license records and two
unresolved assertions, so external redistribution remains blocked independently of CI quality.

Primary GitHub documentation reviewed on 2026-08-29 establishes these boundaries:

- full-length action commit SHAs are the only immutable action references;
- an explicitly declared permission sets every omitted `GITHUB_TOKEN` permission to `none`;
- artifact attestations require `id-token: write` and `attestations: write`, must be verified to provide
  security value, and are not recommended for frequent automated test builds;
- protected environments can restrict branches, require independent reviewers, prevent self-review and
  defer secret access, but no such repository setting is proven by workflow YAML; and
- repositories created after 2026-07-15 use owner-ID/repository-ID OIDC subjects by default. This public
  repository was created on 2026-08-09 and currently has repository ID `1329276081` and owner ID `93459210`.

## Decision

1. Add `.github/workflows/release-candidate.yml` for `main` pushes and explicit manual dispatch only. It
   runs on the fixed `ubuntu-24.04` GitHub-hosted label with `contents: read`; pull requests, environments,
   secrets, `id-token`, attestations, packages, deployments, cloud actions and registry commands are absent.
2. Pin Checkout 6.1.0, Setup Node 6.5.0 and Upload Artifact 6.0.0 to verified full commit SHAs. Checkout
   does not persist credentials and fetches full history for the existing Gitleaks history scan. Pin the
   ordinary CI workflow to the same checkout/setup actions and runner label.
3. Allow the already validated dual-artifact test to copy an exact public allowlist into ignored
   `release-evidence/` only when `RELEASE_EVIDENCE_EXPORT_DIRECTORY` is set. Never export the ephemeral
   private key, password, signing configuration, image archive, scanner database or build secret.
4. Define `astroligyapp.ci-release-evidence` schema 1 under policy `2026-08-29.1`. It binds immutable
   repository IDs, repository/ref/event, source and workflow commit, workflow path/ref/job, run/attempt,
   opaque actor ID, GitHub-hosted runner image, Node/npm/Docker versions, exact permissions, workflow hash,
   release-set hash and the path/hash/size of all 15 initially retained files. ADR 0021 extends the
   allowlist and envelope to 16 files by adding the non-authorizing license-review packet.
5. The envelope expires with the 14-day artifact retention period and has a unique repository/run/attempt
   replay key. Its approval is fixed to `not-requested`, environment is null, promotion is false, trust is
   `credential-free-internal-candidate`, and a changed workflow/policy/evidence file invalidates it.
6. Upload the directory as a GitHub Actions artifact with hidden files excluded, overwrite disabled and a
   14-day retention request. The upload artifact is review transport, not registry attachment, a trusted
   attestation, durable archival storage, approval or authorization to redistribute.

## Adversarial policy

The local contract rejects pull-request/target events, fork or recycled-name repository IDs, non-main refs,
mixed source/workflow commits, self-hosted runners, mutable or unexpected actions, persisted checkout
credentials, excessive token permissions, secrets, environments, cloud/registry commands, missing or
changed evidence, noncanonical or invalid release sets, changed approval state, expiry and replay.

## Deferred trusted promotion

No environment or OIDC setting is created by this ADR. A future separately approved promotion workflow
must first prove protected environment configuration, branch policy, independent reviewer and no-bypass
settings; then bind the immutable owner/repository IDs in the cloud trust policy and independently verify
trusted attestations. It must not reuse this envelope as apply authorization.

## Primary references

- [GitHub secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub workflow permission syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
- [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)
- [GitHub OIDC reference and immutable subjects](https://docs.github.com/en/actions/reference/security/oidc)
- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)

## Consequences

- A successful CI run can retain independently hashable internal release evidence without receiving a
  credential capable of publishing or deploying.
- GitHub artifact service availability and retention are operational dependencies, not security authority.
- External redistribution, staging apply and production remain NO-GO.
