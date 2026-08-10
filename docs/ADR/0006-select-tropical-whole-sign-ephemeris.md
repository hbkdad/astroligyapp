# ADR 0006: Select tropical positions with composed Whole Sign houses

- Status: Accepted
- Date: 2026-08-09

## Context

Goal 8 established that exact `astronomy-engine` 2.1.19 satisfies the declared
tropical position tolerances, but it does not expose an astrological house API.
The launch product does not require sidereal calculations or multiple house
systems. It does require reproducible Ascendant, Midheaven, and house cusps
without coupling the domain to a provider-specific type or a license whose
commercial path has not been approved.

Astrodienst documents Whole Sign houses as beginning at the start of the zodiac
sign containing the Ascendant, with one complete sign per house. It also
documents that angle values remain separate from Whole Sign cusp values. The
Swiss Ephemeris programming documentation identifies `W` as Whole Sign and
documents silent Porphyry fallback for some quadrant systems at polar
latitudes. This application must not silently substitute a different system.

## Decision

Select a composed provider for the first release:

1. Astronomy Engine 2.1.19 provides tropical geocentric and topocentric
   ecliptic-of-date positions and the ecliptic-to-local coordinate rotations
   used to derive Ascendant and Midheaven.
2. A provider-neutral, versioned `HouseStrategy` derives twelve Whole Sign
   cusps from the normalized Ascendant.
3. The supported launch boundary is tropical zodiac plus `whole-sign` houses.
   Sidereal positions, sidereal houses, Placidus, Equal House, and other house
   systems return explicit `unsupported-capability` results.
4. Geographic latitudes strictly between -90 and +90 are supported for Whole
   Sign calculations. At either exact pole, house angles return explicit
   `data-unavailable`; no alternate house system is substituted.
5. Provider and strategy versions are included in result metadata. The pure
   strategy remains replaceable without changing the `EphemerisProvider`
   contract.

The reference case is 1997-09-30 14:00 UTC at 47.33 N, 8.58 E. The published
Swiss Ephemeris 2.10.3.5 values are Ascendant 290.44° and Midheaven 230.38°.
The fixed acceptance tolerance is 0.01° because the independent source publishes
two decimal places. Whole Sign cusps are exact 30° boundaries derived from the
Ascendant sign.

Sources:

- [Astrodienst house-system descriptions](https://www.astro.com/swisseph/sweph_ht_e.htm?lang=e&pa=nmo)
- [Swiss Ephemeris programming documentation](https://www.astro.com/swisseph-download/doc/swephprg.2.10.htm)
- [pysweph angles and houses reference case](https://sailorfe.github.io/pysweph/tutorials/angles_and_houses.html)

## Consequences

The product can proceed to deterministic natal-chart composition without Swiss
Ephemeris installation or commercial-license approval. Swiss remains an
optional future candidate only if the roadmap requires sidereal output,
quadrant houses, or capabilities that cannot be met by separately validated
strategies.

Adding another house system requires its own versioned strategy, independently
sourced fixtures, explicit polar behavior, and an accepted decision update. It
must never inherit a silent fallback policy from a source library.
