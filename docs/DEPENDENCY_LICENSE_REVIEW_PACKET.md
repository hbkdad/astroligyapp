# Dependency license review packet

## Scope and authority

This packet is deterministic review input, not legal advice, a disposition ledger, or authorization to
redistribute an image. `license-review-packet.json` binds the finalized release set, exact source commit/tree,
policy/material/evidence/notice hashes, and every current `manual-review` record. Its trust is always
`review-input-only`; status remains `not-requested`, decisions remain empty, and authorization remains false.

The required roles are evidence preparer, independent license reviewer, and release authorizer, represented
by three distinct accountable humans outside this generated packet. The packet stores no actor identifiers,
legal names, contact details, review prose, credentials, or decisions. Dependency identity/version/source/
integrity, expression/text, bound hashes, source commit/distribution model, or packet expiry forces re-review.

## Exact starting inventory

The clean Goal 89 evidence for commit `8c4ad208dadc6c46e147eca1898c4983ba86ef00` contained 15 application
and 5 worker manual records. The same dependency lock and runtime inputs remain in scope for Goal 91.

| Category                           | Application records                                                                                                                 | Worker records                                                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing assertion; also unresolved | `node` 24.15.0; `busboy` unknown                                                                                                    | None                                                                                                                                                              |
| Missing authoritative text         | `client-only` 0.0.1; `pg-types` 2.2.0; `pgpass` 1.0.5; `string-hash` unknown                                                        | `@aws-sdk/credential-provider-http` 3.972.70; `@aws-sdk/credential-provider-login` 3.972.75; `@aws-sdk/nested-clients` 3.997.42; `pg-types` 2.2.0; `pgpass` 1.0.5 |
| Custom or composite terms          | `base-files` 13.8+deb13u6; `libc6` 2.41-12+deb13u3; `media-types` 13.0.0; `tzdata` 2026b-0+deb13u1; `tzdata-legacy` 2026b-0+deb13u1 | None                                                                                                                                                              |
| Review-only expression             | `ca-certificates` 20250419; `netbase` 6.5; `@img/sharp-libvips-linux-x64` 1.3.2; `@img/sharp-wasm32` 0.35.3                         | None                                                                                                                                                              |

## Mechanically resolved gaps

Four missing-text records have exact locked version/integrity bindings to immutable publisher commits and
locally hash-checked publisher text:

- `client-only` 0.0.1 is identified by the exact Next.js 16.3.0 source package manifest at commit
  `d73f5622e226358dcef8cf7a8a373333ff265ae7` and bound to that commit's MIT text.
- the three AWS SDK packages are identified by exact manifests at tag commit
  `26b0eb790ff86399b7af7b74ce8c188f25512cc6`. The login manifest also traces its exact nested-client
  dependency. All three are bound to the publisher's Apache-2.0 text, whose normalized local SHA-256 is
  `sha256:e345c2ee7df4446e739de7b91535f0c10ddcd909b9753889e943ee637b05db8c`.

These bindings only fill authoritative-text provenance already supported by a permitted SPDX assertion.
They do not interpret custom, copyleft, composite, absent, conflicting, or prohibited terms.

## Remaining review scope

The expected clean Goal 91 result is 14 application and 2 worker manual records, including the same two
unresolved application assertions. The remaining categories are 2 missing assertions, 5 missing-text
records, 5 custom/composite records, and 4 review-only expressions. External redistribution remains NO-GO
until exact clean-artifact evidence confirms these counts and a separate accountable disposition process
satisfies ADR 0018.

Authoritative sources used for the mechanical bindings:

- [Next.js client-only manifest at the exact commit](https://raw.githubusercontent.com/vercel/next.js/d73f5622e226358dcef8cf7a8a373333ff265ae7/packages/next/src/compiled/client-only/package.json)
- [AWS credential-provider-http manifest at the exact commit](https://raw.githubusercontent.com/aws/aws-sdk-js-v3/26b0eb790ff86399b7af7b74ce8c188f25512cc6/packages-internal/credential-provider-http/package.json)
- [AWS credential-provider-login manifest at the exact commit](https://raw.githubusercontent.com/aws/aws-sdk-js-v3/26b0eb790ff86399b7af7b74ce8c188f25512cc6/packages-internal/credential-provider-login/package.json)
- [AWS SDK for JavaScript v3 license at the exact commit](https://raw.githubusercontent.com/aws/aws-sdk-js-v3/26b0eb790ff86399b7af7b74ce8c188f25512cc6/LICENSE)
