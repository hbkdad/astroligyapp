# Credential-free CI release evidence

## Purpose

The release-candidate workflow retains the existing local release evidence for internal review while
deliberately holding no publishing or deployment authority. It is not the future promotion workflow.

The checked-in contract is `config/release-ci-policy.json`. Run `npm run test:ci-release-evidence` after
changing either workflow, the policy, evidence filenames, release schemas or CI permissions.

## Workflow invariants

- only `push` to `refs/heads/main` and `workflow_dispatch` in immutable repository ID `1329276081`;
- GitHub-hosted `ubuntu-24.04`, exact source/workflow commit and fixed job path;
- `GITHUB_TOKEN` permission is exactly `contents: read`;
- no pull-request target, environment, secret, OIDC token, attestation write, package write, deployment
  permission, cloud action, registry command or persisted checkout credential;
- every external action is an official `actions/*` repository pinned to a full 40-character commit SHA;
- the complete repository history is available to the existing Gitleaks scan; and
- `release:check` must finish before evidence binding or upload.

## Retained evidence

When `RELEASE_EVIDENCE_EXPORT_DIRECTORY` is set, the dual-artifact gate creates a new destination and copies
only the 16 filenames allowlisted by policy. They cover both artifact descriptors, SPDX inventories,
license evidence/notices, dual release set/statement, SLSA document/predicate, and the explicitly untrusted
local public key/signature/attestation bundles plus the non-authorizing license-review packet. The ephemeral private key and all secret or mutable working
material remain in the disposable directory and are deleted.

`ci:release:evidence` revalidates the release set and writes `ci-release-evidence.json`. The envelope binds
every retained file's byte length and SHA-256 plus the workflow/policy identity. It expires after 14 days,
matching requested artifact retention. Upload excludes hidden files, refuses overwrite and fails if evidence
is missing.

After downloading into a new directory from the run for the claimed commit, verify it from a checkout whose
policy and workflow match the envelope:

```powershell
npm run ci:release:verify -- C:\path\to\downloaded-evidence
```

The verifier rejects missing or extra entries, links, non-files, stale or future envelopes, mismatched
repository/workflow/run identity, altered permissions or approval, mixed release commits, and any byte/hash
change. A consuming approval system must also maintain used run keys and pass them as a comma-separated
`CI_RELEASE_SEEN_RUN_KEYS` value so replay is rejected.

## Interpretation

`credential-free-internal-candidate` means only that the evidence came from a validated, read-only workflow
context. `not-requested` approval and `promotionAuthorized: false` are mandatory. The local Cosign material
remains `local-ephemeral-untrusted`; there is no GitHub artifact attestation, transparency entry, registry
subject, AWS identity, environment approval or legal disposition.

Do not download this artifact and treat its presence as authorization. Verify the envelope, release set,
hashes, source commit, workflow commit, run identity and expiry. A run/attempt key already consumed by an
approval system must be rejected as replay.
