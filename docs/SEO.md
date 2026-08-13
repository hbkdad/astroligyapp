# Public SEO architecture

## Release gate

Public indexing is fail-closed. `PUBLIC_SITE_INDEXING_ENABLED` defaults to false; robots deny all
crawling and the sitemap is empty. Enabling indexing requires an explicit HTTPS
`PUBLIC_SITE_ORIGIN`. Production must verify the final host, redirects, TLS, cache behavior,
rendered canonicals, Search Console ownership, and sitemap submission before changing the flag.

## Reviewed indexable surface

- `/astrology`: deterministic astrology geometry and provenance reference.
- `/moon-phase`: phase-angle, illumination, and mean-age limitations.
- `/numerology/life-path`: one transparent date-reduction example and privacy boundary.
- `/horoscope/{sign}`: exactly 12 canonical lowercase tropical-sign variants. Invalid signs are
  build-excluded and return 404.

The sitemap contains only those 15 URLs. Home, Moon, numerology, chart, timeline, compatibility,
account, API, and opaque share routes are not included. Local/demo/personal surfaces remain
page-level `noindex`; account and share pages keep their stricter existing directives.

## Canonical and crawl rules

Every reviewed public page emits one absolute self-canonical from the server-only configured
origin. Internal links use canonical paths. Sitemap inclusion, canonical metadata, and robots
indexability derive from the same configuration. When indexing is enabled, robots allows page
crawling and blocks only `/api/`; this permits crawlers to observe page-level `noindex` on demo
and account routes.

Google documents redirects, `rel=canonical`, and sitemap inclusion as progressively weaker but
stackable canonical signals, and recommends self-referential canonicals. Google also notes that a
robots-level crawl block prevents a crawler from seeing a page's `noindex` directive. Sources:

- https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag

Retrieved 2026-08-13.

## Structured data and content quality

Reference pages render a visible Home-to-page breadcrumb and a matching sanitized
`BreadcrumbList` JSON-LD block. No FAQ, review, event, organization, or predictive schema is
claimed. JSON-LD escapes `<` before insertion. Validate deployed samples with Google's Rich
Results Test and the Schema Markup Validator.

The three guides have distinct intent and explanatory content grounded in the existing validated
engines. Parameterized date and number pages are intentionally absent until each variant has
validated, maintainable, standalone utility; generating them now would create thin pages. No AI
copy or private inputs are used.

Sources retrieved 2026-08-13:

- https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
- https://developers.google.com/search/docs/appearance/structured-data/sd-policies
- https://nextjs.org/docs/app/guides/json-ld

## Privacy

Public URL, metadata, sitemap, breadcrumb, and JSON-LD contracts accept canonical static paths,
not profile IDs, names, birth dates/times, locations, account IDs, calculation-run IDs, or share
tokens. Public analytics remain unselected and must not be introduced without a separate privacy
and consent review.
