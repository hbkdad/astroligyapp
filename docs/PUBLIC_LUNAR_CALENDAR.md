# Public lunar calendar boundary

## Route contract

`/moon-phase/YYYY-MM-DD` accepts only a canonical Gregorian UTC date from the current UTC day
through 30 days ahead. Malformed, impossible, past, and farther-future dates return 404 before a
provider call. The moving 31-date window is the only lunar-date set added to the reviewed sitemap;
the sitemap and Moon guide refresh daily.

The route accepts no location, timezone, name, birth input, profile, account, chart, or arbitrary
interval. Its canonical and indexability come from the Goal 73 public-site release gate. Provider
failure returns a complete unavailable page and no-index metadata rather than partial or estimated
events.

## Calculation contract

Public lunar calendar engine `1.0.0`:

- samples the Sun and Moon geocentrically in the tropical ecliptic every 12 hours across one
  pre-roll day, the seven-day visible interval, and one post-roll day;
- derives the selected date's phase, Moon sign, approximate illumination, estimated mean-cycle
  age, and trend from the UTC-noon observation;
- detects candidate primary-phase and Moon-sign boundary crossings from the shared observations;
- refines candidates through lunar event search `1.0.0` to a 60-second time bracket with at most
  24 iterations; and
- publishes only refined event points inside the exact seven-day interval, sorted and unique.

Mean-cycle age never supplies an event time. Illumination and age are visibly labelled as
approximations. The page is geocentric and does not claim local visibility, altitude, terrain,
atmosphere, or rise/set behavior.

## Trace and caching

Output retains date, UTC interval, provider/data/calculation metadata, coordinate conventions,
phase/search versions, sample step, tolerance, iteration cap, evaluated/refined event traces, and
provider call count. Presentation revalidates event ordering, uniqueness, interval membership,
search version, and provider identity before rendering.

The server-only bounded memory cache uses a six-hour TTL, 40-entry cap, and in-flight coalescing.
Its key includes date, loader/calendar/phase/search versions, sample/tolerance/iteration policy,
and exact provider/data versions. It stores no user or private data. A distributed cache is not
selected; production multi-instance behavior and performance remain later gates.
