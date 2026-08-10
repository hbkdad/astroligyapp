# Ephemeris provider research

Status: provider not selected

Last verified: 2026-08-09

This note records technical and commercial facts for architecture planning. It is not legal advice and does not authorize a purchase or production integration.

## Swiss Ephemeris

Astrodienst documents Swiss Ephemeris as dual-licensed. A developer must choose either the GNU Affero General Public License or the Swiss Ephemeris Professional License before distributing software containing it or activating a public service that uses it.

Current official commercial materials reviewed on 2026-08-09:

- The [live price and order page](https://www.astro.com/swisseph/swephprice_e.htm) lists a Professional Edition unlimited license at CHF 700 and states that only the license is sold; software is downloaded from the public repository.
- The [June 2026 professional contract](https://www.astro.com/swisseph/secont_e.pdf) lists an unlimited license at CHF 700, a 99-year duration, and coverage for both distributed applications and server software accessed by browser users. It also states that an app calling a server that performs the calculation is considered an app containing Swiss Ephemeris.
- The [general Swiss Ephemeris documentation](https://www.astro.com/swisseph-download/doc/swisseph.pdf) describes the AGPL/professional choice and requires purchase plus a signed contract for the professional option. Its embedded price figures differ from the newer live page and June 2026 contract, so it must not be used as the current price authority.

## Architectural consequence

Swiss Ephemeris remains a viable candidate, not an installed dependency. Before selection:

1. Obtain user approval for the commercial path or an explicit decision to publish compatible AGPL software.
2. Confirm the final contract, price, legal entity, project scope, and planned server/app topology directly with Astrodienst.
3. Prototype the adapter against the target Windows/Linux deployment runtime and record binary/data-file update procedures.
4. Compare sourced accuracy fixtures, latency, operational cost, supported calculations, and failure behavior with at least one credible alternative.
5. Record the selection and fallback in a new ADR.

Until then, no Swiss Ephemeris package, binary, data file, or provider-specific type may enter the domain layer.
