---
name: astro-validation
description: Validate changes to deterministic zodiac, ephemeris-adapter, house, aspect, natal-chart, transit, and astrology scoring code. Use whenever astronomy inputs, coordinate normalization, angular math, or astrology fixtures change; do not use for prose-only interpretations.
---

# Astro validation

## Procedure

1. Identify the changed deterministic contract, units, coordinate frame, time scale, timezone assumptions, provider version, and allowed tolerances.
2. Trace provider output through normalization to the displayed or persisted result. Reject undocumented provider-specific values from domain code.
3. Add or inspect tests for `0`, values just below and at each 30-degree boundary, `359.999...`, normalization outside one revolution, and angular wraparound across zero.
4. For aspects, test exact hits, just-inside and just-outside each orb, symmetry, closest-angle behavior, and applying/separating logic when implemented.
5. For natal or transit work, use sourced reference fixtures with UTC instant, coordinates, house system, provider/version, expected values, and explicit tolerances.
6. Run the narrow deterministic suite first, then the repository's full lint, typecheck, test, and build checks required by `AGENTS.md`.
7. Record commands, fixture provenance, versions, tolerances, results, and unresolved discrepancies in `docs/PROJECT_STATUS.md`.

## Validation gate

- Facts are reproducible from stored inputs and versions.
- Longitudes normalize to `[0, 360)` and boundary behavior is explicit.
- Provider failures are explicit; no approximate or fabricated astronomy silently replaces them.
- Interpretation text and product weights remain outside calculation functions.

## Prohibited shortcuts

- Do not ask an AI model to supply expected celestial values.
- Do not loosen tolerances or rewrite fixtures merely to match the implementation.
- Do not select or couple to an ephemeris provider without its licensing and technical ADR.
