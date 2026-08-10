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

## Candidate comparison

| Candidate                                                          | License and cost                                                                                    | Node/deployment fit                                                                  | Data and operations                                                                                           | Houses                                 | Current role                                                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Swiss Ephemeris                                                    | AGPL or professional license; current official professional materials list CHF 700                  | Requires a reviewed Node/native or service adapter and target-runtime spike          | Local binaries/data files and an explicit update procedure                                                    | Astrology-focused house support        | Full-featured candidate; blocked on license approval and deployment proof                                 |
| [Astronomy Engine](https://github.com/cosinekitty/astronomy)       | [MIT](https://github.com/cosinekitty/astronomy/blob/master/LICENSE); no license fee                 | Native JavaScript/TypeScript package for Node and browsers                           | Exact 2.1.19 package installed; 1.84 MB unpacked; no separate data-file updates                               | No documented astrology house-cusp API | Tropical position spike passed JPL longitude, latitude, and speed budgets; distance omitted; not selected |
| [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) | Public NASA API; confirm service-use constraints before production reliance                         | HTTP integration is simple but creates network availability and latency dependencies | No local ephemeris files; query conventions, response retention, and service changes are operational concerns | Not an astrology house engine          | Independent planetary fixture source and remote candidate                                                 |
| [NAIF SPICE](https://naif.jpl.nasa.gov/naif/toolkit.html)          | NASA permits broad use under its published rules; redistribution/support constraints require review | Official native toolkits do not provide the project's desired direct Node path       | Kernel selection, distribution, loading, and updates are substantial operations                               | Not an astrology house engine          | High-effort scientific candidate; not first evaluation                                                    |

ADR 0005 records the deferred selection, evaluation order, and approval gates.

## Astronomy Engine 2.1.19 spike result

The isolated adapter supports tropical geocentric and topocentric positions for
the ten contract bodies. It derives longitudinal speed from the same one-minute
forward interval stored in the JPL source rows. Sidereal positions and house
cusps return explicit `unsupported-capability` errors.

All 40 comparisons passed the predeclared `0.02°` longitude/latitude and
`0.001°/day` speed budgets. Distance comparison exposed discrepancies above the
`0.000001 AU` limit, including approximately `0.0000137 AU` for the J2000
topocentric Sun case. The adapter omits optional distance rather than weakening
the tolerance. The package remains an unselected, positions-only candidate.
