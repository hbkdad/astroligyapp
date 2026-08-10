---
name: seo-audit
description: Audit indexable horoscope, Moon, numerology, astrology-reference, and other public routes for technical SEO, unique utility, structured data, internal linking, and privacy. Use whenever public routing, metadata, templates, sitemaps, robots, canonicals, or generated content changes.
---

# SEO audit

## Procedure

1. Inventory changed indexable routes, their search intent, deterministic inputs, unique user value, update cadence, and canonical ownership.
2. Verify crawlability, status codes, canonical URLs, robots directives, sitemap inclusion, pagination/date behavior, redirects, metadata, headings, and internal links.
3. Inspect rendered HTML without relying on client-only execution for essential content.
4. Validate structured data against the visible page and use only eligible types. Do not generate FAQ or review markup merely for rich results.
5. Compare templated pages for meaningful differentiated data and explanations. Mark thin, duplicate, expired, invalid-date, or unavailable-provider variants `noindex` or avoid generating them.
6. Check that public routes and analytics exclude private profile identifiers, birth times, locations, names, and relationship data.
7. Run the repository's SEO/build checks and sample representative URLs across route families. Record evidence and follow-ups in `docs/PROJECT_STATUS.md`.

## Validation gate

- Each indexable page stands alone as useful content.
- Canonical, robots, sitemap, and HTTP behavior agree.
- Structured data matches visible content and current eligibility.
- No private user data becomes crawlable or guessable.

## Prohibited shortcuts

- Do not mass-publish near-identical AI pages.
- Do not index empty, error, unsupported, or low-confidence calculation pages.
- Do not treat page count as success; define quality and conversion measures.
