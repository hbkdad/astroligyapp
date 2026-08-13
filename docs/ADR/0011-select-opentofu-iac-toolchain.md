# ADR 0011: Select OpenTofu and containerized policy tooling

- Status: Accepted
- Date: 2026-08-13

## Context

ADR 0010 selects an AWS Canada Central topology but deliberately creates no resources. Goal 81 needs a
reviewable, credential-free infrastructure definition and policy gate before any account, remote state,
plan, or apply approval. The tool must support the AWS provider, S3 state locking, state/plan protection,
mocked plan tests, deterministic version pinning, local/CI use, and an exit path that does not couple the
application to an infrastructure vendor.

Current releases were checked from their primary repositories on 2026-08-13: OpenTofu 1.12.5,
Terraform 1.15.8, AWS provider 6.59.0, TFLint 0.64.0, Trivy 0.73.0, and Conftest 0.69.0.

## Comparison

| Concern               | OpenTofu 1.12.5                                                                                                                                              | Terraform 1.15.8                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| License/governance    | Linux Foundation project under MPL 2.0                                                                                                                       | Terraform 1.6+ uses Business Source License 1.1 with an additional-use grant and four-year change date                                      |
| AWS provider          | Uses the same provider protocol and current `hashicorp/aws` provider; pin 6.59.0                                                                             | Native registry/workflow for the same provider                                                                                              |
| State/plan protection | Native enforced state and plan encryption, including key-provider rollover                                                                                   | Backend encryption protects S3 storage, but state still contains sensitive values and has no equivalent core state/plan encryption contract |
| S3 locking            | S3 lockfile plus bucket versioning; DynamoDB locking is not required for this baseline                                                                       | Current S3 backend also supports lockfiles; older DynamoDB locking is deprecated                                                            |
| Tests                 | `tofu test`, mock providers, plan assertions, and module tests without AWS credentials                                                                       | Mature `terraform test` and provider mocking                                                                                                |
| Compatibility/exit    | HCL/provider/module compatibility makes migration practical; OpenTofu-only encryption must be removed through a rehearsed decrypt migration before switching | Broader commercial ecosystem, but BSL policy adds avoidable licensing review for redistribution/embedded service cases                      |
| Operator fit          | Open-source governance, native encryption, container distribution, and no paid control plane required                                                        | Technically credible, but no application-specific advantage offsets the license and state-encryption differences                            |

## Decision

Select OpenTofu 1.12.5 with exact AWS provider 6.59.0. Run tools through digest-pinned containers rather
than installing mutable host binaries:

- OpenTofu 1.12.5: `ghcr.io/opentofu/opentofu` digest
  `sha256:ba827d1af675c3f522eb78e2b8098cc87daefb9ceb9d3c4b69d0a1bb6d272463`;
- TFLint 0.64.0: `ghcr.io/terraform-linters/tflint` digest
  `sha256:1c595f42d794c32c45a6ea8b58655fd66433d4ca3b1bc631c574a48d120bd19f`;
- Trivy 0.73.0: `aquasec/trivy` digest
  `sha256:7cced7cae583819fc7806d4cbc0dbbc7cad18b99f7d3e235192e6da8c091045c`;
- Conftest 0.69.0: `openpolicyagent/conftest` digest
  `sha256:a38ba21668929a00dce2fe6ee43d1312228340bce5fd243f47dd0ce90516e558`.

The checked-in lock file must contain provider hashes for Linux AMD64 and Windows AMD64. Validation may
run `tofu init -backend=false` only in a disposable copy with no AWS environment variables, then
`validate` and mocked `test`. It must never initialize the declared remote backend or run a real plan or
apply in this goal.

Production state will use a separately bootstrapped, versioned, encrypted S3 bucket in `ca-central-1`,
native S3 lockfiles, blocked public access, TLS-only policy, retention/recovery controls, and a dedicated
state role. OpenTofu state and plan encryption are enforced; the encryption configuration and key are
supplied through the protected `TF_ENCRYPTION` environment, never HCL variables or state. Bootstrap
resources and the application stack must not share state.

## Policy layers

1. `tofu fmt`, disposable backend-disabled init, validate, and mocked tests prove language/provider
   schemas and dependency contracts without AWS access.
2. TFLint core checks names, declarations, and language mistakes without downloading an AWS ruleset.
3. Trivy scans Terraform configuration for current high/critical infrastructure findings.
4. Conftest applies repository Rego rules to the HCL configuration.
5. A deterministic repository validator enforces project-specific invariants and proves its rejection
   behavior against intentionally unsafe fixtures.

No tool is allowed to infer approval to provision. CI receives read-only source permissions and no AWS
OIDC permission during this phase.

## Consequences

The project gains a portable, reviewable AWS definition and credential-free plan gate. It accepts an
OpenTofu-specific encrypted-state stanza and the operational burden of managing encryption-key recovery.
Loss of the encryption key makes state unrecoverable; backup and restore rehearsals must include both
state and its key. Moving to Terraform requires an explicitly approved OpenTofu decrypt migration and a
new license review.

## Sources

- [OpenTofu introduction](https://opentofu.org/docs/intro/)
- [OpenTofu state and plan encryption](https://opentofu.org/docs/language/state/encryption/)
- [OpenTofu S3 backend](https://opentofu.org/docs/language/settings/backends/s3/)
- [OpenTofu test command](https://opentofu.org/docs/cli/commands/test/)
- [OpenTofu MPL-2.0 license](https://github.com/opentofu/opentofu/blob/main/LICENSE)
- [Terraform tests](https://developer.hashicorp.com/terraform/language/tests)
- [Terraform S3 backend](https://developer.hashicorp.com/terraform/language/backend/s3)
- [Terraform BSL license](https://github.com/hashicorp/terraform/blob/main/LICENSE)
- [AWS provider 6.59.0 release](https://github.com/hashicorp/terraform-provider-aws/releases/tag/v6.59.0)
- [TFLint 0.64.0 release](https://github.com/terraform-linters/tflint/releases/tag/v0.64.0)
- [Trivy 0.73.0 release](https://github.com/aquasecurity/trivy/releases/tag/v0.73.0)
- [Conftest 0.69.0 release](https://github.com/open-policy-agent/conftest/releases/tag/v0.69.0)
