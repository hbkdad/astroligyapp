# ADR 0012: Select SPDX, Syft, Gitleaks, Trivy, and Cosign for release evidence

- Status: Accepted
- Date: 2026-08-24

## Context

Goal 80 produces a hardened local OCI image and Goal 81 defines an immutable ECR digest contract. Goal
82 must bind source, image, dependency inventory, security scans, and future attestations without AWS
credentials, registry writes, signing keys, or claims that unsigned local evidence establishes trust.
The baseline must be reproducible, reject identity drift, keep build secrets out of evidence, and remain
portable outside AWS.

Current primary releases were checked on 2026-08-24: Syft 1.51.0, Cosign 3.1.3, Gitleaks 8.30.1, and
Trivy 0.74.0. Cosign 3.1.3 is the first v3 release fixing the August 2026 legacy-bundle identity-policy
bypass. The affected legacy blob bundle path will not be used; future verification must use modern
Sigstore bundles and pin both GitHub Actions identity and OIDC issuer.

## Decision

- Generate normalized SPDX 2.3 JSON with Syft 1.51.0. SPDX aligns with BuildKit's native SBOM
  attestation path, represents packages, relationships, checksums, and licenses, and is portable across
  registries and scanners. CycloneDX remains interoperable but adds no launch requirement.
- Scan the complete committed Git history and worktree with Gitleaks 8.30.1, and scan the final image for
  high/critical vulnerabilities and embedded secrets with Trivy 0.74.0. Trivy's fixed-vulnerability
  result is authoritative for this gate; `--ignore-unfixed` is not allowed.
- Produce a deterministic, unsigned local evidence manifest that binds exact source commit/tree,
  Dockerfile/base digest, OCI image ID, normalized SBOM hash/package count/license status, build inputs,
  and digest-pinned tools. It is verification evidence, not an attestation or signature.
- Pin container tools by digest:
  - Syft 1.51.0: `anchore/syft@sha256:678bfa565b60f747aac0f8e964fe5588a24445b8d0a480e91f6efd70020dfbb0`;
  - Gitleaks 8.30.1: `ghcr.io/gitleaks/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f`;
  - Trivy 0.74.0: `aquasec/trivy@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969`;
  - Cosign 3.1.3: `ghcr.io/sigstore/cosign/cosign@sha256:9e5c2f2edc34351160407ca3416c61855bdf9403c3c5936e0f0be7fc261611b8`.
- Build twice from separate archives of the exact clean commit using the same protected ephemeral build
  secret and `SOURCE_DATE_EPOCH`. BuildKit rewrites timestamps. Both independently uncached builds must
  produce the same image ID. The secret value and its hash are never written to evidence.
- Declare the private application `UNLICENSED` and the OCI artifact `LicenseRef-Proprietary`. Reject an
  absent root license declaration or any SBOM package with no license assertion; `NOASSERTION` is
  recorded as unresolved and blocks promotion until reviewed.

## Trust and promotion boundary

Local manifests and SBOMs are disposable and unsigned. They prove internal consistency only. After an
explicitly approved ECR push, GitHub Actions may use short-lived OIDC to run Cosign 3.1.3 keyless signing
and attach SPDX plus SLSA provenance to the immutable image digest. Verification must constrain the
exact workflow identity, repository, ref/environment, GitHub issuer, Rekor inclusion, subject digest,
predicate type, source commit, and builder. Pull requests receive no `id-token: write`, registry write,
AWS role, or signing authority.

Do not use a static Cosign key, export private key material, sign a local tag, sign a mutable registry
reference, use a legacy JSON blob bundle, or accept an attestation merely because its signature is valid.
Policy must separately verify identity and predicate contents.

## Consequences

The repository gains repeatable local artifact evidence and tamper tests without external authority.
Two uncached builds and full scans increase release-gate time. Network access is still needed to resolve
locked npm packages, Debian indexes, vulnerability databases, and pinned tool images, so this is
reproducible output from fixed inputs rather than a hermetic build. The exact protected Server Actions
build secret remains an undeclared input: reuse is required for byte-identical builds and promotion, but
its value must never appear in a manifest, log, layer, SBOM, cache export, or repository.

## Sources

- [Docker build attestations](https://docs.docker.com/build/metadata/attestations/)
- [Docker reproducible builds](https://docs.docker.com/build/ci/github-actions/reproducible-builds/)
- [SLSA provenance in BuildKit](https://docs.docker.com/build/metadata/attestations/slsa-provenance/)
- [SPDX 2.3 specification](https://spdx.github.io/spdx-spec/v2.3/)
- [Syft formats and configuration](https://github.com/anchore/syft)
- [Gitleaks usage](https://github.com/gitleaks/gitleaks)
- [Trivy image scanning](https://trivy.dev/latest/docs/target/container_image/)
- [Cosign verification](https://docs.sigstore.dev/cosign/verifying/verify/)
- [Cosign August 2026 advisory](https://github.com/sigstore/cosign/security/advisories/GHSA-fx35-mq7g-6g98)
