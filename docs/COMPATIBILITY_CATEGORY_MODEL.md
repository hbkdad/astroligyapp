# Compatibility category scoring contract

Status: Goal 36 engine accepted; no production policy selected.

Compatibility category scores are product-defined interpretive heuristics. They
are not astronomical, psychological, or scientific measurements and must not be
presented as relationship predictions or advice.

## Injected policy

The scorer has no default policy. A caller must supply a versioned policy with:

- one or more unique, safe category IDs;
- an integer baseline and inclusive integer minimum/maximum from 0 through 100;
- uniquely identified rules that reference an existing category;
- one discriminated selector for a phase-one pair fact, synastry aspect, or
  bidirectional Whole Sign overlay;
- a finite contribution from -100 through 100, confidence from 0 through 1, and
  a safe product rationale.

Phase-one selector values must use the exact canonical order and supported value
sets. Synastry and overlay selectors must constrain at least one fact property.
Unknown fields, unknown values, impossible bounds, duplicate identifiers, unsafe
text, and deterministic relationship claims fail closed.

## Formula and trace

Formula version: `1.0.0`.

For each declared category, the scorer:

1. starts from its configured baseline;
2. matches rules against canonical Goal 35 facts in stable rule/fact order;
3. sums contributions to six decimal places;
4. rounds the raw score and clamps it to the category's declared bounds; and
5. computes confidence as the mean of rule confidence weighted by absolute
   contribution, or zero when matched contributions have no impact.

Every category retains the baseline, bounds, contribution total, raw/displayed
score, confidence, unique source fact IDs, and every contributing rule ID,
impact, confidence, and rationale. Result metadata retains the aggregate,
phase-one, synastry, overlay, policy, formula, and result versions.

Before matching, the scorer reconstructs the complete Goal 35 aggregate from its
three children and requires exact equality. It therefore rejects version drift,
missing or altered facts, and unknown fields, including raw private data. Scoring
does not mutate, recalculate, or reinterpret astronomical or numerological facts.
