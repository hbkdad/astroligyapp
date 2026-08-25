# Staging approval evidence contract

## Purpose

Goal 86 makes a staging request mechanically reviewable without granting cloud access. Run:

```powershell
npm run staging:approval:example
npm run test:staging-approval
```

The first command prints a deterministic synthetic preparation package from
`infra/aws/approval/staging-review.fixture.json`. The fixture uses reserved test identities and
`example.invalid`-style values; it is not an approval template to fill in place and cannot pass either
readiness assertion. The second command exercises structural, documentary, and apply-readiness policy.

## Three distinct gates

| Gate                    | Required evidence                                                                                   | Authority                         |
| ----------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------- |
| Structural validity     | Exact schema, target, release pair, redacted plan/cost inputs, owners, recovery, data policy, gates | None                              |
| Documentary readiness   | Reviewed saved-plan/export hashes, safe change counts, all local gates, four split reviewers        | Review complete; no apply         |
| Staging apply readiness | Every live gate plus a fifth independent staging apply authorizer                                   | Exact staging window/package only |

`documentary-only` is a required literal value. No locally generated evidence, signature, green CI
run, or completed checklist can change it. The apply decision is a separate field bound to the same
canonical statement scope. Production requires another environment-specific process and is not a
valid target for schema 1.

## Bound statement

The canonical statement contains:

- generated/expiry instants no more than 72 hours old and seven days apart;
- staging, exact account ID, and `ca-central-1`;
- source revision, schema-2 release-set digest, both exact ECR digest subjects, and both exact rollback
  predecessors;
- saved-plan SHA-256, redacted-summary SHA-256, create/update/delete/replace counts, resource counts,
  capacity, retention, and security invariants;
- cost status, USD currency, calculator-export/assumption hashes, integer-cent estimate, budget and
  anomaly limit, plus inputs for all 12 modeled service groups;
- a canonical UTC change window of no more than four hours;
- opaque release/security/cost/rollback owner IDs, staging RPO/RTO/backup/restore targets, and
  synthetic-only/no-index/no-private-log data handling; and
- 7 documentary plus 12 live preflight gates.

The plan summary and cost assumptions have their own hashes. All review decisions bind the SHA-256 of
the complete statement, so changing any target, artifact, input, window, or gate invalidates review.

## Evidence handling

Never commit or routinely log a real saved plan, plan JSON, state, calculator export/link, account
contacts, credentials, secret values, approval tokens, provider response, private user data, or signing
material. OpenTofu documents that saved plans can contain cleartext sensitive values even where normal
output obscures them. Store the encrypted originals in the approved restricted evidence system and put
only their SHA-256 plus a manually inspected redacted summary in the approval envelope.

The checked-in fixture exposes assumptions, not prices. AWS Pricing Calculator can export estimates,
but updates create new estimate links and estimates are not bills. Documentary readiness therefore
requires a fresh export digest, dated assumptions, explicit currency, monthly estimate, monthly budget,
and anomaly threshold. Do not place its public share URL in the envelope.

Principal IDs use opaque `principal:<id>` or `team:<id>` tokens. Email addresses and other contact
details stay in the access-controlled operational roster. The requester cannot review their request;
all four documentary reviewers are unique; the apply authorizer is a fifth independent principal.
Every decision repeats the exact statement-scope SHA-256, includes the SHA-256 of its restricted
external approval record, and must be timestamped inside the package's active interval. Completing or
changing live evidence changes the scope and therefore requires the relevant decisions to be renewed.

## Live evidence inventory

The following always begin as `pending-external` and cannot be satisfied by mocked plans:

1. state recovery;
2. effective IAM/KMS allow and deny behavior;
3. ECR subjects and retained OCI referrers;
4. exact GitHub OIDC certificate identity and issuer;
5. Rekor inclusion;
6. DNS and TLS;
7. database restore and validation against RPO/RTO;
8. queue retry and controlled DLQ redrive;
9. alarm delivery and owner acknowledgement;
10. production-like accessibility smoke;
11. application rollback; and
12. worker rollback.

Each live result is represented only by a SHA-256 pointer to restricted evidence. AWS Backup restore
testing can schedule and measure restore viability, but the restored resource, validation, cleanup, and
cost must be inspected in the approved staging account before the gate becomes `verified-live`.

## Fail-closed behavior

The validator rejects unknown or missing fields, stale/expired scope, non-UTC windows, wrong account or
region, mutable or mixed repositories, current-as-predecessor rollback, release/plan mismatch, changed
summary/assumption hashes, missing or duplicated gates, unsafe data policy, missing owners, over-budget
cost, zero/overlong recovery targets, delete/replace plans, incomplete reviews, self-review, reused
reviewers, missing live evidence, and a non-independent apply authorizer.

Any delete or replacement count requires a separate destructive-change review that does not exist in
this baseline. The verifier never invokes OpenTofu, AWS, GitHub, Sigstore, DNS, or a registry.
