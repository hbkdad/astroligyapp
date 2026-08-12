# Compatibility category scoring contract

Status: Goal 36 engine and Goal 37 initial policy accepted.

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

## Initial policy 1.0.0

`initial-compatibility-categories` defines the five categories named in the master
specification: Attraction, Communication, Emotional, Long-Term, and Chemistry.
Each starts at 50 with a 0-100 display range.

The policy uses only canonical Goal 35 facts. Mirrored cross-chart body pairs have
equal rules so input-person order cannot affect output. Conjunctions and sextiles
contribute +3, trines +4, and squares/oppositions -2 for selected category-specific
body pairs. Selected relationship-house overlays contribute +2. Exact phase-one
equality facts contribute only +1 or +2. All rule confidence values are 0.50 or
0.55 and every rationale explicitly identifies itself as tradition-framed.

These weights are conservative product configuration, not assertions of causal,
psychological, or predictive validity. Any change requires a new policy version
and regression evidence; calculation and aggregate versions remain unchanged.

## Content projection 1.0.0

Each matched Goal 37 contribution projects exactly once, in category then rule/fact
order. The projection identifies its category, source fact, rule, impact, confidence,
fact-family key, and category/tone reflection key. It includes only the minimal
structured parameters required to render the underlying phase-one pair, synastry
aspect, or house overlay later.

Before projection, the accepted Goal 35 aggregate and Goal 37 policy/scores are
recomputed and required to match exactly. Missing, duplicated, reordered, unknown,
unsupported, or version-drifted data fails closed. The projection contains no prose,
policy rationale, raw birth/profile inputs, account identity, or public route data.
