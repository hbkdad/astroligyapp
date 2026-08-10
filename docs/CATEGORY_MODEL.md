# Category score model

Status: accepted baseline for explainable product heuristics.

Category scores are interpretive product metrics, not astronomical,
numerological, psychological, or scientific measurements. Calculation engines
do not import this model and none of their facts change when category
configuration changes.

## Versioned formula

Model: `personal-category-baseline` version `1.0.0`.

Formula version: `1.0.0`.

For each category:

1. Start from the configured baseline of 50.
2. Match versioned rules against existing interpretation projection parameters.
3. Sum the configured impacts for every matched source fact.
4. Retain the unbounded raw score and clamp the rounded displayed score to
   0-100.
5. Calculate confidence as the mean of rule confidence weighted by absolute
   impact, or zero when there are no factors.

Output retains the baseline, contribution total, raw score, displayed score,
confidence, unique source fact IDs, and every rule ID, projection key, impact,
rule confidence, and rationale. A displayed number can therefore be rebuilt
from the output without hidden inputs.

## Configuration and failure policy

The product-owned configuration lives in `src/config/category-model.ts`, apart
from calculation and prose. Category IDs, rule IDs, template families,
selector parameter names, impacts, confidence bounds, identifiers, and
rationales are validated before evaluation. Duplicate or unknown categories,
duplicate rules, unknown selectors, invalid bounds, unsafe text, unknown fact
references, and non-finite arithmetic fail closed.

Version the model whenever a baseline, rule, selector, impact, confidence, or
rationale changes. Old stored readings must retain their model and formula
versions before persistence is introduced.
