# Release artifact and promotion runbook

## Local evidence gate

Run `npm run test:artifact` only from a clean tracked worktree. The command archives the exact `HEAD`
tree twice, performs two independent uncached `linux/amd64` builds with rewritten timestamps, and
requires byte-equivalent image configuration IDs. It uses one random in-memory Server Actions key for
both builds and derives Next preview metadata from that key with separate HMAC contexts. The key and
its hash are never written to the evidence directory or logs.

The gate then:

1. checks OCI revision, creation time, license, platform, and non-root identity;
2. scans the complete committed Git history and exact archived source tree with digest-pinned Gitleaks;
3. scans the final image for high/critical fixed and unfixed vulnerabilities plus embedded secrets with
   digest-pinned Trivy;
4. creates normalized SPDX 2.3 JSON with digest-pinned Syft;
5. verifies every package has declared and concluded license fields, records unresolved assertions, and
   requires the application `UNLICENSED` declaration and proprietary notice;
6. creates a disposable unsigned manifest binding source commit/tree, Dockerfile, image, SBOM, scan
   results, tool digests, and two-build result;
7. proves rejection of source, image, SBOM, scan, signature, and mutable-reference tampering; and
8. removes both local images and all evidence even on failure.

Generated SBOMs, manifests, scan databases, BuildKit metadata, keys, and image archives are not committed.
The local manifest establishes consistency only. Its `signature` and `attestation` fields must be null.

## Reproducibility limits

The output is reproducible when the source commit, architecture, protected build secret, pinned base
digest, npm lock file, requested Debian package version, BuildKit behavior, and dependency content are
unchanged. The build is not hermetic: it resolves npm/Debian content and scanners update vulnerability
data over the network. Save registry artifacts and attestations, not an assumption that upstream content
will remain available forever. A changed build secret intentionally changes the artifact.

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

## Future push, sign, and attest sequence

The following is a design contract, not authorization to run it:

1. Build once from the protected exact commit with full BuildKit SBOM and SLSA provenance enabled.
2. Push to the approved ECR repository, capture the registry-returned `sha256` digest, and stop if it
   differs from build metadata. Never promote by tag.
3. Fetch the digest from a clean verifier and re-run Trivy plus runtime hardening checks.
4. Use Cosign 3.1.3 keyless signing under GitHub OIDC against the digest. Store a modern Sigstore bundle
   and Rekor proof; do not use legacy JSON blob bundles.
5. Attach SPDX 2.3 and SLSA provenance attestations to the same digest. The predicate must bind the exact
   repository, commit, workflow identity, builder, materials, parameters, and no secret values.
6. Verify signature and each attestation with the exact certificate identity and GitHub OIDC issuer,
   then independently enforce subject/predicate policy. A valid signature alone is insufficient.
7. Copy/promote the already verified digest between approved environment repositories. Do not rebuild.
8. Retain the digest, SPDX, SLSA bundle, signatures, scan outputs, approval, deployment record, and
   rollback predecessor for the agreed audit period.

## Verification and rollback

Promotion verification must reject a mutable reference, wrong registry/account/region, wrong digest,
wrong workflow/repository/ref, unexpected issuer, missing Rekor inclusion, wrong predicate type,
different source commit, changed builder/materials, missing SBOM, failed scan, or absent license review.

Rollback selects the last fully verified immutable digest and repeats signature/attestation policy before
updating the ECS task definition. Database migrations remain forward-only; an image rollback is allowed
only while the database contract remains compatible. Artifact deletion is never the rollback mechanism.
