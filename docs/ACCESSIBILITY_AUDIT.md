# Accessibility audit

- Audit date: 2026-08-13
- Target: WCAG 2.2 Level AA
- Application build: optimized Next.js 16.3.0 production build
- Browser: headless Chromium through Playwright CLI
- Automated engine: axe-core 4.13.0

This document records engineering evidence, not a certification. Automated tools detect only a
subset of accessibility failures. The release gate still requires representative assistive-
technology use and authenticated production-flow testing.

## Route and state inventory

| Surface                | URLs exercised in optimized Chromium                                                                                               | States represented                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home and public guides | `/`, `/astrology`, `/moon-phase`, `/moon-phase/2026-08-13`, `/numerology/life-path`, `/horoscope/aries`                            | ready calculated facts, dated content, navigation, trace/disclaimer                                                                                                                          |
| Calculation demos      | `/chart`, `/moon`, `/numerology`, `/timeline`, `/compatibility`                                                                    | ready, filters, tables, SVG/chart alternative, horizontal regions                                                                                                                            |
| Account entry          | `/account`, `/account/sign-in`, `/account/sign-up`, `/account/forgot-password`, `/account/reset-password`, `/account/verify-email` | checking, anonymous, unavailable, forms, validation/feedback affordances                                                                                                                     |
| Protected account      | `/account/profiles`, `/account/today`, `/account/timeline`, `/account/alerts`                                                      | unauthenticated/unavailable shell; ready, empty, locked, incomplete, stale, conflict, provider-failure, destructive-confirmation, and saved states remain covered by component/action suites |
| Public share           | `/match/invalid-token` plus the valid-share component suite                                                                        | unavailable token; valid compatibility document and fact/interpretation regions                                                                                                              |

All 22 browser URLs returned one `main`, one `h1`, `lang="en"`, no duplicate IDs, and no positive
`tabindex`. Each returned zero axe violations after the fixes below. Dynamic authenticated states
cannot be reached in the local production server without a configured database and session; their
semantic structures and operations are exercised by the existing account, profile, protected-chart,
Today, personal-timeline, notification-preference, compatibility-share, and read-model tests.

## Evidence matrix

| Requirement                                                                 | Evidence                                                                                                                                                                                               | Result                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Names, roles, landmarks, headings, language, labels, descriptions, contrast | axe-core 4.13.0 against all 22 URLs; optimized accessibility tree inspected on `/chart`                                                                                                                | Pass, zero automated violations                     |
| Chart alternative and relationship                                          | Chart SVG is one named `group` with title/description; ten keyboard links name the exact fact and jump to authoritative placement rows; complete placements and aspects tables remain available        | Pass                                                |
| Repeated compatibility regions                                              | Repeated calculated/tradition pairs use neutral containers under their single named parent region, avoiding duplicate named landmarks                                                                  | Pass                                                |
| Keyboard and focus                                                          | First `Tab` exposes the skip link; `Enter` focuses `main`; chart markers show a solid focus outline and activate their matching row fragment; a false timeline filter toggles true with `Space`        | Pass                                                |
| Forms and confirmations                                                     | Native labels, fieldsets, legends, input types/autocomplete, feedback regions, disabled/pending behavior, and destructive account/profile confirmations are covered in axe plus interface/action tests | Pass with production-auth gate                      |
| Reflow and text spacing                                                     | 390x844 route matrix plus 32px root text and WCAG text-spacing override on every URL; 320px narrow viewport represents 400% reflow of a 1280px layout                                                  | Pass, zero document overflow                        |
| Horizontal data regions                                                     | Wide tables retain named, keyboard-focusable local scroll regions; the document itself does not scroll horizontally                                                                                    | Pass                                                |
| Target size                                                                 | Chart links measure at least 24.60x24.60 CSS px at 390px; buttons and labeled checkbox rows use at least 44px block targets; inline text links retain the WCAG inline exception                        | Pass                                                |
| Reduced motion                                                              | Chromium `prefers-reduced-motion: reduce` matches; root scroll behavior becomes `auto`; content and focus remain visible                                                                               | Pass                                                |
| Forced colors and no-color meaning                                          | Chromium forced-colors mode preserves readable content, solid focus, native borders/controls, tables, and the chart's textual/table alternative; status and category meaning is also written in text   | Pass by browser inspection                          |
| Layout stability                                                            | Buffered `layout-shift` observer found an async mobile account-navigation wrap; shared mobile navigation was stabilized and the optimized `/timeline` rerun recorded CLS `0`                           | Pass for audited flow                               |
| Loading, empty, locked, error, stale, conflict, unavailable                 | Fixed state renderers and action mappings are asserted across the existing UI suites; unavailable auth and invalid-share states were also exercised in Chromium                                        | Pass locally; authenticated production gate remains |

## Systemic corrections

1. Changed the interactive natal SVG from an image role containing links to a named group so its
   interactive descendants are valid and remain connected to the nonvisual tables.
2. Added transparent 46-unit SVG interaction geometry around each visible 30-unit planet marker.
   This preserves the rendering while producing at least a 24px browser target on the mobile chart.
3. Removed redundant repeated named `section` landmarks from compatibility and shared documents.
4. Added narrow-screen min-content and wrapping rules for grids, headings, identifiers, navigation,
   event panels, and signal rows so 200% text plus text-spacing overrides reflow without clipping.
5. Stabilized async account navigation at mobile width as one 44px single-line local scroll region,
   preventing auth-state hydration from moving the page while retaining every keyboard target.

## Commands and artifacts

- `npm test -- tests/natal-chart-read-model.test.tsx`
- `npm run build`
- `npx --yes @axe-core/cli <url> --exit` for every URL listed above
- Playwright CLI route matrix at desktop, 390x844, and 320px; keyboard activation; target
  measurements; text-spacing stress; reduced-motion; forced-colors; and buffered layout-shift probes
- Browser artifacts are local-only under `output/playwright/` and are intentionally not committed.

The final repository-wide lint, typecheck, unit, coverage, database-contract, integration, and build
commands are recorded in `docs/PROJECT_STATUS.md` at the Goal 77 checkpoint.

## Residual release gates

- Run NVDA with current Chrome or Firefox on Windows and VoiceOver with current Safari on macOS/iOS
  for landmarks, forms, validation feedback, chart-to-table navigation, filters, and live status.
- Repeat critical browser flows with a real authenticated non-production database: registration,
  sign-in, profile create/edit/delete, chart generation, Today, timeline, alerts, account export, and
  account deletion. Include empty, locked, stale, conflict, rate-limited, and provider-failure states.
- Verify browser zoom controls at 200% and 400% in the supported release-browser matrix; the narrow
  viewport and root-text tests are deterministic proxies, not substitutes for each browser's zoom UI.
- Recheck contrast and forced-colors behavior if production branding, chart colors, fonts, or shared
  primitives change. Re-run this matrix for any new indexable, account, or share route.
