# ADR 0001: Ephemeris provider boundary

Status: accepted

Date: 2026-08-09

## Context

The product requires reproducible astronomical positions and related calculations. Swiss Ephemeris is a strong candidate, but its current commercial licensing path, deployment fit, and total operating cost have not been verified for this product. Binding domain code directly to it would make a later provider change expensive and risky.

## Decision

Define and test an `EphemerisProvider` contract before integrating any ephemeris implementation. Provider-specific libraries, data files, processes, errors, and licensing assumptions remain inside infrastructure adapters.

The normalized contract must return values in documented units and coordinate frames, include provider/version metadata, expose explicit errors, and support shared contract fixtures with declared tolerances. Domain engines consume only normalized provider output.

No production provider is selected by this ADR. Provider adoption requires a follow-up ADR recording current licensing evidence, accuracy comparisons, platform compatibility, update strategy, operational cost, and fallback behavior.

## Consequences

- Domain calculations and stored result formats remain portable.
- Provider integration requires validation and normalization work up front.
- Provider-specific capabilities may need optional capability flags rather than leaking adapter types.
- Fixture provenance and version metadata become part of the product's audit trail.
