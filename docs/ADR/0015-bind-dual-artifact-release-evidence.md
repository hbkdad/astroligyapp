# ADR 0015: Bind application and worker as one verifiable release set

- Status: Accepted
- Date: 2026-08-25

## Context

The application and authentication-email feedback worker are independently deployable images, but one
product release must not combine builds from different source revisions. Goal 85 also needs useful
dependency evidence for the bundled worker and local cryptographic tests without implying that an
ephemeral developer key proves a trusted release identity.

Primary specifications reviewed on 2026-08-25 were SPDX 2.3, CycloneDX 1.6 relationships, OCI Image and
Distribution 1.1 subject/referrer contracts, SLSA provenance 1.1, Sigstore bundle verification, Docker
Build attestations, and Amazon ECR OCI 1.1/referrer documentation.

## Decision

- Keep SPDX 2.3 as the canonical SBOM format for both images. CycloneDX is capable of representing the
  required relationships, but adding a second canonical format provides no launch benefit.
- Define release-set schema 2 as the promotion unit. It binds exactly `application` and
  `feedback-worker`, a common 40-hex Git revision, tree, source epoch, Dockerfile/base/image digests,
  `linux/amd64`, two-build reproducibility, SPDX digest/count/license status, scan status, pinned tools,
  target ECR repository names, and independent nullable rollback predecessors.
- Reject absent/extra artifacts, mutable references, repository mismatch, duplicate image digests,
  mixed revisions, changed SBOMs, failed scans, and rollback-to-current.
- Record the Docker configuration ID separately from the reproducible OCI manifest digest. Only the OCI
  manifest digest is a registry promotion, SLSA subject, or rollback identity.
- Derive the worker SPDX document from the esbuild metafile and npm lockfile. Every bundled npm input
  must resolve to an exact lock path, version, registry source, SHA-512 integrity, and reviewed license.
  Bundle metadata and SBOMs are exported only from a dedicated build evidence stage; the final worker
  remains minimal.
- Emit an in-toto Statement with a SLSA provenance 1.1 predicate for the two image subjects. Locally,
  exercise Cosign 3.1.3 blob signature and attestation bundles with a random ephemeral key and no
  network, then delete the key. The release set labels these hashes `local-ephemeral-untrusted`.
- Make the common source revision and release-set SHA-256 mandatory infrastructure inputs. Both ECS task
  definitions expose those non-secret identifiers for operational correlation, and OpenTofu rejects a
  mixed-source pair.
- For a future approved ECR promotion, use immutable image digests plus OCI 1.1 referrers for SPDX,
  provenance, signatures, and attestations. Verify exact GitHub OIDC certificate identity/issuer and
  transparency evidence before deployment. A valid signature does not replace subject or predicate
  policy.

## Trust boundaries

Local evidence proves deterministic consistency and detects tampering only within the disposable test.
It does not prove who built the artifacts, establish a trusted timestamp, enter a transparency log, or
claim a SLSA build level. Trusted promotion requires an approved protected workflow identity, registry,
remote immutable subjects/referrers, current scan data, policy verification, and deployment record.

ECR referrers are stored registry artifacts and therefore affect storage, retention, replication, and
cost. Their lifecycle must be retained with both image subjects and must never be mistaken for files
inside the runtime image.

## Primary references

- [SPDX 2.3 specification](https://spdx.github.io/spdx-spec/v2.3/)
- [CycloneDX 1.6 SBOM relationships](https://cyclonedx.org/guides/sbom/relationships/)
- [OCI Distribution Specification](https://github.com/opencontainers/distribution-spec/blob/main/spec.md)
- [SLSA provenance 1.1](https://slsa.dev/spec/v1.1/provenance)
- [Sigstore Cosign verification](https://docs.sigstore.dev/cosign/verifying/verify/)
- [Docker build attestations](https://docs.docker.com/build/metadata/attestations/)
- [Amazon ECR OCI formats and referrers](https://docs.aws.amazon.com/AmazonECR/latest/userguide/images.html)

## Consequences

- Application and worker can roll back independently, but every selected predecessor must itself have
  complete trusted evidence and database compatibility.
- Release verification is stricter and slower because both images, both SPDX documents, and local
  signature/attestation failure cases are required.
- Registry writes, AWS identity, GitHub OIDC, Rekor-backed keyless signing, and deployment remain outside
  this ADR's local authorization and require environment-specific approval.
