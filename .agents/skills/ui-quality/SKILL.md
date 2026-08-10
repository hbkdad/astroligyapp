---
name: ui-quality
description: Review and verify dashboard, chart, timeline, Moon, numerology, compatibility, account, and public-page UI for accessibility, responsiveness, clarity, and product claims. Use after substantial visual or interaction changes; do not use for backend-only changes.
---

# UI quality

## Procedure

1. Identify the user goal, critical states, data provenance, loading/empty/error states, entitlement state, and mobile priority.
2. Verify semantic structure, headings, landmarks, labels, keyboard order, visible focus, touch targets, contrast, zoom, and screen-reader names against WCAG 2.2 AA practices.
3. Give charts, category scores, timelines, and celestial graphics text equivalents. Do not encode meaning only with color, shape, animation, or hover.
4. Inspect a real browser at approximately 390px mobile and a representative desktop width. Test long names, localized dates, dense data, unavailable birth time, provider failure, and reduced motion.
5. Confirm deterministic facts display their source signal or trace where promised and interpretive claims use appropriate language.
6. Measure obvious performance risks: layout shift, oversized assets, blocking visualization code, and unusable interaction latency.
7. Capture evidence or concise observations, fix material issues, rerun relevant tests/build, and update `docs/PROJECT_STATUS.md`.

## Validation gate

- Critical flows work with keyboard and at mobile width.
- Every visualization has a usable nonvisual representation.
- Loading, empty, error, locked, and success states are deliberate.
- Motion respects `prefers-reduced-motion` and never blocks task completion.

## Prohibited shortcuts

- Do not approve UI from a static screenshot alone.
- Do not use decorative celestial effects at the expense of reading or performance.
- Do not hide calculation uncertainty or premium gating behind ambiguous visuals.
