---
name: numerology-validation
description: Validate deterministic Pythagorean numerology, name normalization, master-number conventions, cycle calculations, and calculation traces. Use whenever numerology strategies, mappings, date rules, Unicode handling, or fixtures change; do not use for interpretation prose only.
---

# Numerology validation

## Procedure

1. Name the selected `NumerologyStrategy`, its reduction convention, master-number preservation points, vowel rules, `Y` policy, calendar/timezone basis, and version.
2. Require every public result to include or reconstruct a calculation trace from normalized inputs through reductions.
3. Test the complete A-Z mapping, case, whitespace, apostrophes, hyphens, punctuation, combining marks, diacritics, non-Latin characters, empty inputs, and explicit unknown-character behavior.
4. Test `11`, `22`, and `33` at every configurable reduction stage plus ordinary and zero-containing dates.
5. Test Personal Year, Month, and Day at year/month/day boundaries using the product's explicit timezone rule.
6. Keep fixtures separated by convention so disagreement between traditions is not disguised as a bug.
7. Run targeted tests and applicable full checks; record convention, commands, results, and open ambiguities in `docs/PROJECT_STATUS.md`.

## Validation gate

- Equal normalized inputs produce equal versioned results and traces.
- Unknown Unicode is handled by an explicit rule and never silently discarded.
- Tradition-specific choices are configuration or strategy behavior, not scattered conditionals.

## Prohibited shortcuts

- Do not call one reduction convention universally correct.
- Do not adjust expected values without documenting the convention change.
- Do not mix interpretive meanings into arithmetic functions.
