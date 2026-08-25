# ADR 0017: Enforce fail-closed runtime license evidence

Status: Accepted

Date: 2026-08-25

## Context

The application and feedback-worker release artifacts already carry SPDX 2.3 SBOMs, but the application
SBOM previously left every `licenseConcluded` value as `NOASSERTION`. A manifest declaration alone is
not enough evidence for an external redistribution decision. The release boundary must distinguish the
project's proprietary code from third-party components, preserve exact artifact identity, and avoid
turning an automated policy result into legal advice.

npm documents that lockfile package records identify the installed version, resolved source and package
integrity. SPDX 2.3 defines normalized license-expression syntax and explicitly allows `NOASSERTION` when
the analyzer cannot determine a value. Node.js also distributes a version-specific composite license file,
so the copied Node binary cannot safely be reduced to a guessed single identifier.

Sources:

- [npm package-lock.json format](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/)
- [SPDX 2.3 license expressions](https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/)
- [SPDX 2.3 file license fields](https://spdx.github.io/spdx-spec/v2.3/file-information/)
- [Node.js 24.15.0 license](https://github.com/nodejs/node/blob/v24.15.0/LICENSE)

## Decision

1. `config/release-license-policy.json` is the versioned mechanical policy. It is a release gate, not a
   legal conclusion or grant of rights.
2. Automatic `permitted-with-notice` is limited to a small explicit SPDX allowlist and requires traceable
   installed license text. Missing text, missing assertions, custom `LicenseRef-*`, composite/copyright
   conflicts, and identifiers outside that allowlist require manual review. Explicit prohibited identifiers
   fail closed.
3. npm identities bind the exact lock path, version, registry tarball and SHA-512 integrity. Next.js compiled
   components with no upstream version are recorded honestly as content inside the exact locked Next.js
   package; `UNKNOWN` is not replaced with a fabricated version. Debian packages retain their exact dpkg
   version and package verification/source information. Node retains its exact runtime version and the
   license text from the digest-pinned build image.
4. The application and worker each generate an SPDX document, canonical license-evidence JSON containing
   license text and hashes, and a third-party notice index. These stay outside runtime images. Release-set
   schema 3 binds policy, evidence and notice hashes plus all decision counts.
5. External redistribution requires zero unresolved, manual-review and prohibited results. Local evidence
   generation may succeed with manual-review results so reviewers can see exactly what remains blocked.
6. Any dependency identity, version, source, integrity, expression, text, notice or policy mutation changes
   a bound digest and is rejected by bundle validation or the signed release-set boundary.

## Consequences

- External redistribution remains a NO-GO until every manual-review result has authoritative evidence and
  an accountable human disposition.
- Runtime images remain minimal and contain no generated notices or evidence. A registry publication step
  must attach the outside-image artifacts as referrers or equivalent immutable release records.
- A future legal review may narrow or expand policy categories, but it must version the policy and regenerate
  the complete release set. It must not rewrite historical evidence.
