# Release artifact and promotion runbook

## Dependency-license precondition

Before any external image redistribution, validate the evidence/notice/policy/materials bundle for both
artifacts and require zero `unresolvedCount` and `prohibitedCount`. A successful local artifact build or
immutable registry digest is not sufficient. Preserve the generated SPDX, license-evidence JSON and notice
index outside the runtime image and attach them to the same immutable release subject. Do not publish while
any manual record lacks a current accountable disposition.

If manual records have accountable dispositions, require an unexpired `accountable-human` ledger bound to
the exact source commit and both evidence/policy hashes. Reject `none` or `synthetic-fixture-only` trust,
self-review, missing or extra package dispositions, stale scope, rejected/remediation outcomes, and any
undisposed record. Dependency, evidence, policy, distribution-model, or expiry change requires a new review.
The promotion call must receive the ledger hash returned by validation against the exact evidence documents;
a matching hash asserted only inside the release set is not sufficient.

The generated `license-review-packet.json` is a bounded handoff to those reviewers, not a ledger. Verify its
release-set hash, record completeness, 30-day maximum validity, separated-role requirements, and re-review
triggers. Its fixed `review-input-only` trust, empty decisions and false authorization can never waive the
accountable-ledger requirement.

## Local evidence gate

Run `npm run test:release-artifacts` only from a clean tracked worktree. The command first runs the
application and worker evidence gates against the same exact `HEAD`. Each gate archives the tree twice,
performs two independent uncached `linux/amd64` builds with rewritten timestamps, and requires both
matching image-configuration IDs and matching OCI manifest digests. The worker gate also
exports its bundle/metafile from the non-runtime `evidence` target. The command then validates the
combined schema-4 release set.

The application gate uses one random in-memory Server Actions key for
both builds and derives Next preview metadata from that key with separate HMAC contexts. The key and
its hash are never written to the evidence directory or logs.

The ordinary `npm run build` keeps Next.js 16.3's default Turbopack coverage. Release images use the explicit
`npm run build:release` Webpack boundary selected in ADR 0022 after intermittent Turbopack prerender drift.
Never replace the two-build comparison with retries. If manifests differ, the gate compares changed layers
and may print only secret-screened, token-redacted excerpts for the public root/timeline static outputs.
The post-build step derives preview metadata from the protected build key and sorts only the keys of
`app-paths-manifest.json` and `app-path-routes-manifest.json` in root and standalone output. Next 16.3 writes
those semantically unordered records in compiler-completion order; no route value or other build output is
normalized.

The gate then:

1. checks OCI revision, creation time, license, platform, and non-root identity;
2. scans the complete committed Git history and exact archived source tree with digest-pinned Gitleaks;
3. scans the final image for high/critical fixed and unfixed vulnerabilities plus embedded secrets with
   digest-pinned Trivy;
4. creates normalized SPDX 2.3 JSON with digest-pinned Syft;
5. verifies every package has declared and concluded license fields, records unresolved assertions, and
   requires the application `UNLICENSED` declaration and proprietary notice;
6. creates disposable artifact descriptors binding source commit/tree, Dockerfiles, images, SBOMs,
   scan results, tool digests, and two-build results;
7. proves rejection of source, image, SBOM, scan, signature, and mutable-reference tampering; and
8. removes both local images and all evidence even on failure.

The worker SBOM is generated from esbuild bundle metadata and `package-lock.json`. Every bundled npm
input must map to an exact lockfile version, registry source, SHA-512 integrity, and reviewed license;
the resulting SPDX document is scanned by Trivy. Bundle metadata and evidence are absent from the
Distroless runtime image.

The combined test produces an in-toto/SLSA 1.1 statement with both image subjects, creates random local
Cosign keys plus a service-free signing configuration (no Fulcio, Rekor, OIDC, or timestamp authority),
signs and attests the statement with networking disabled, verifies both bundles, proves a
tampered statement fails, records only bundle/public-key hashes under `local-ephemeral-untrusted`, and
deletes the entire disposable evidence directory. When `RELEASE_EVIDENCE_EXPORT_DIRECTORY` is explicitly
set, it first copies only ADR 0019/0021's public 16-file allowlist to a newly created destination; the private
key, password, signing configuration, scanner databases, BuildKit working data and image archives are never
exported. Nothing is committed. This proves consistency, not trusted identity, timestamp, transparency
inclusion, registry attachment, approval or a SLSA level.

## Credential-free CI evidence

`.github/workflows/release-candidate.yml` runs only for main push/manual events with `contents: read`, pinned
official actions and no environment, secrets, OIDC, attestation/package/deployment write, registry or cloud
step. After the full release gate it exports the allowlist, creates an expiring schema-1 CI envelope, and
requests 14-day GitHub artifact retention. The envelope binds numeric repository/owner IDs, exact
source/workflow commit, ref/event/run/attempt, runner/tool versions, workflow/policy hashes, release-set hash,
and every retained file hash/size. It explicitly records no approval and no promotion authority.

Validate with `npm run test:ci-release-evidence`. Reject mutable actions, fork/repository-ID mismatch,
pull-request context, non-main ref, mixed commits, excessive permissions, self-hosted runner, missing or
changed files, expiry, replay or any attempt to turn the artifact into approval. See ADR 0019 and
`docs/CI_RELEASE_EVIDENCE.md`.

## Reproducibility limits

The output is reproducible when the source commit, architecture, protected build secret, pinned base
digest, npm lock file, requested Debian package version, BuildKit behavior, and dependency content are
unchanged. The build is not hermetic: it resolves npm/Debian content and scanners update vulnerability
data over the network. Save registry artifacts and attestations, not an assumption that upstream content
will remain available forever. A changed build secret intentionally changes the artifact.

The selected release compiler is also an input. ADR 0022 pins the release command to Next.js 16.3 Webpack;
changing back to the default Turbopack path requires new repeated reproducibility evidence.

An unresolved SPDX `NOASSERTION` is not permission to redistribute a package. The count remains visible
in evidence and must be reviewed against the package source before external promotion. A structurally
missing package license, missing root declaration, absent proprietary notice, or unknown direct-package
license blocks the gate.

## Approval boundary before registry writes

No current command logs in to AWS, creates ECR, pushes, signs, attests, or grants CI identity. Before any
registry write, obtain explicit staging-specific approval for:

- the exact reviewed commit and local image ID;
- AWS account/region, immutable repository URI, lifecycle policy, scan configuration, and owner;
- current high/critical scan and license review;
- the protected Server Actions build secret source, rotation owner, and reuse across a rolling release;
- the exact GitHub environment, protected branch/tag, workflow path/ref, and OIDC trust policy;
- calculator/budget approval and rollback/retention periods; and
- the proposed saved build/push/sign/attest commands and their expected subject digest.

Pull-request workflows keep `contents: read` only. The future protected promotion job may receive
`id-token: write` and the minimum ECR/OIDC role only after approval; it must never receive static AWS or
Cosign private keys.

## GitHub protected-promotion readiness

Run `npm run test:github-trust-readiness` to validate the desired policy, checked read-only snapshot,
synthetic configuration envelope and adversarial fixtures. Run `npm run github:trust:verify` when an
explicit machine-readable decision is needed: exit `0` means all observed controls satisfy policy; exit `2`
means deterministic NO-GO. An unavailable or unproven API control is always NO-GO.

The current snapshot was reduced from authenticated GET requests only. Before any future configuration or
promotion approval, recapture and independently review repository identity, active rulesets and bypass
actors, `main` protection and exact required checks, production environment reviewers/self-review/bypass
and branch policy, Actions allowlist/SHA policy, default token permission, immutable OIDC subject mode, and
verified artifact-attestation evidence. Never place API tokens, reviewer names, secrets, cloud role
credentials or raw provider payloads in the checked snapshot.

The policy and synthetic envelope are desired-state evidence only. There is intentionally no
`.github/workflows/protected-promotion.yml`; creating it or changing any GitHub/AWS setting requires a later
explicitly approved goal. Presence of the policy, a green test, or a successful release-candidate artifact
cannot authorize activation.

## Future push, sign, and attest sequence

The following is a design contract, not authorization to run it:

1. Build both artifacts once from the protected exact commit with full BuildKit SBOM and SLSA provenance
   enabled; reject any source-revision mismatch.
2. Push each artifact to its approved ECR repository, capture both registry-returned OCI manifest
   `sha256` digests, and stop if either differs from build metadata. A Docker configuration ID is not a
   registry promotion subject. Never promote by tag.
3. Fetch both digests from a clean verifier and re-run Trivy plus runtime hardening checks.
4. Use Cosign 3.1.3 keyless signing under GitHub OIDC against each digest. Store modern Sigstore bundles
   and Rekor proof; do not use legacy JSON blob bundles.
5. Attach each SPDX 2.3 document and the dual-subject SLSA provenance as OCI 1.1 referrers. The predicate must bind the exact
   repository, commit, workflow identity, builder, materials, parameters, and no secret values.
6. Verify signature and each attestation with the exact certificate identity and GitHub OIDC issuer,
   then independently enforce subject/predicate policy. A valid signature alone is insufficient.
7. Copy/promote the already verified pair of digests and their referrers between approved environment
   repositories. Do not rebuild.
8. Retain both digests, referrers, SPDX documents, SLSA/signature bundles, scan outputs, release-set
   digest, approval, deployment record, and independent rollback predecessors for the agreed audit period.

## Verification and rollback

Promotion verification must reject a mutable reference, wrong registry/account/region, wrong digest,
wrong workflow/repository/ref, unexpected issuer, missing Rekor inclusion, wrong predicate type,
different source commit, changed builder/materials, missing SBOM, failed scan, or absent license review.

Rollback selects the last fully verified immutable digest and repeats signature/attestation policy before
updating the ECS task definition. Database migrations remain forward-only; an image rollback is allowed
only while the database contract remains compatible. Artifact deletion is never the rollback mechanism.
