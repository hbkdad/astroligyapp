# Dependency license evidence

## Purpose and limits

This is the operational contract for the application and feedback-worker dependency-license gates. It is
not legal advice. A mechanical `permitted-with-notice` result means only that the checked-in policy recognized
the SPDX expression and found traceable installed text. A `manual-review` result is deliberately not labeled
compatible or incompatible.

## Generated files

`npm run test:release-artifacts` generates these files in its disposable outside-image evidence directory:

- `application.spdx.json` and `feedback-worker.spdx.json`
- `application-license-evidence.json` and `feedback-worker-license-evidence.json`
- `application-THIRD-PARTY-NOTICES.txt` and `feedback-worker-THIRD-PARTY-NOTICES.txt`
- the two artifact descriptors and the schema-4 dual release set

The JSON evidence contains the exact observed component, source/integrity trace, normalized expression,
license-text source, text hash and full captured text when available. The notice indexes identify every
third-party result and call out unavailable text. Neither generated artifact is copied into the application
or worker runtime filesystem.

License-evidence schema 2 and each artifact license summary bind the reviewed-materials version and canonical
configuration hash. A change to any package binding, source commit, local material path or expected text hash
therefore invalidates the evidence and the dual release set even when the resulting notice text is unchanged.

## Review outcomes

- `permitted-with-notice`: allowlisted SPDX identifier(s), traceable license text and no prohibited/custom term.
- `manual-review`: missing text/assertion, custom term, conflict, composite/copyright concern, or identifier
  outside the automatic policy.
- `prohibited`: the expression contains a policy-prohibited identifier.
- `first-party-proprietary`: application code is accounted for separately under the repository `LICENSE`.

The policy is [config/release-license-policy.json](../config/release-license-policy.json). Changes require a
new `policyVersion`, regenerated evidence, adversarial checks and release review.

## External redistribution gate

External image redistribution is allowed only after the bound summary has zero unresolved, manual-review
and prohibited results. A local reproducible build, scan or signature does not waive that rule. A reviewer
must never replace unknown bundled-component versions with guesses; the exact enclosing Next.js tarball and
component identity are the trace instead.

If a package lacks bundled text, obtain authoritative version-matched terms from the publisher, capture the
source and immutable hash, and update the generator or package evidence. Do not paste unverified web text or
silently reinterpret a custom expression.

## Publisher materials and human dispositions

ADR 0018 adds versioned publisher material bindings. Each binding must match the observed package name,
version, locked integrity, declared expression, immutable source commit, local text, and normalized text
hash. These bindings can satisfy missing-text evidence only; they never replace a missing assertion or
override a custom, copyleft, composite, conflicting, or prohibited expression.

The schema-4 release set also binds a disposition summary. Current artifacts use `trust: none`, a null ledger
hash, and an undisposed count equal to their manual-review count. Test data uses separate opaque actors,
expiry, exact evidence scope and all mandatory re-review triggers. `synthetic-fixture-only` trust can never
authorize promotion; the positive accountable contract uses only `.invalid` URLs and is not an approval.
A future real ledger must use accountable-human trust and immutable review-record URLs; none exists today.

## Tamper and runtime checks

The release-set contract tests reject changes to package identity/version, registry source, integrity,
expression, captured text, notice content and policy. The artifact checks additionally verify that generated
evidence is written only to the outside-image release directory and that both runtime images retain their
existing minimal filesystem contracts.
