---
name: lunar-validation
description: Validate Moon phase, illumination, Moon age, sign, rise/set, lunar-event, and personal lunar-transit calculations. Use for any lunar engine, boundary, location, timing, or lunar fixture change; do not use for lunar interpretation copy alone.
---

# Lunar validation

## Procedure

1. Confirm whether each value is provider-supplied or derived and document units, time scale, location, atmospheric assumptions, provider/version, and tolerances.
2. Verify phase angle normalization as `(moonLongitude - sunLongitude + 360) % 360`.
3. Test exact phase anchors, both sides of every classification boundary, cycle wraparound, and monotonic behavior around sampled instants.
4. Compare New Moon, Full Moon, illumination, and sign fixtures with authoritative astronomical sources or independently validated provider data. Preserve source URL or dataset identifier and retrieval date.
5. For rise/set or altitude/azimuth, test timezone transitions, high latitudes, no-rise/no-set conditions, coordinate validation, and explicit provider errors.
6. For personal lunar transits, reuse the aspect validation rules and prove the natal input was not recalculated inconsistently.
7. Run targeted tests followed by applicable repository checks and record evidence in `docs/PROJECT_STATUS.md`.

## Validation gate

- Phase and event results are reproducible with declared uncertainty.
- Phase labels do not rely on an approximate day-count when validated positional data is available.
- Location-dependent failures are represented honestly rather than replaced by plausible-looking times.

## Prohibited shortcuts

- Do not treat the average synodic month as a production ephemeris.
- Do not compare fixtures without matching UTC instant, coordinates, and conventions.
- Do not present lunar influence scores as astronomical measurements.
