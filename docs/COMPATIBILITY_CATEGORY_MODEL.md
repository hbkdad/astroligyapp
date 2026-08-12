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

## Deterministic content library and renderer 1.0.0

The en-CA library covers ordinary and numerology phase-one pairs, synastry aspects,
house overlays, and all five category by three tone reflection keys. Factual text
exposes every declared value without inference. Reflection text begins with explicit
astrology-and-numerology tradition framing and describes configured product factors,
not relationship outcomes.

The renderer requires exact parameters, finite numbers, safe plain text, and a
validated Goal 38 projection. Numbers use at most six fractional digits. Fact and
reflection sections are separate and carry the complete projection/source/policy/
library/locale/renderer trace. Missing templates produce a fixed fallback rather
than invented content.

## Report payload 1.0.0

The report payload retains the complete validated aggregate, scores, projection,
and rendered output. Composition reconstructs each layer with the declared policy
and content library and requires byte-exact equality. It also records five category
and contribution/projection counts plus rendered and unsupported fact/reflection
section counts, with complete source versions and a report-level claims disclaimer.

## Presentation read model 1.0.0

The presentation mapper accepts only a complete Goal 40 report, reconstructs it
with its declared policy and library, and requires exact equality before mapping.
It exposes five ordered category summaries plus paired fact and explicitly
tradition-framed reflection items, source labels, accounting, version trace, and
the accepted disclaimer. Scores always retain semantic text alongside native
meters, so colour and graphics are not required to interpret them.

The mapper performs display-only formatting and deeply freezes its result. It does
not expose chart placements, longitudes, speeds, cusps, birth/profile/account data,
private numerology traces, or report-engine dependencies to React. Loading, locked,
unavailable, error, empty, unsupported, and ready UI states are distinct.

## Public share projection and token contract 1.0.0

The public projection reconstructs the complete Goal 40 report and requires exact
equality before emitting deliberately selected output. It retains the five score,
maximum, confidence, and factor-count summaries plus paired rendered fact and
tradition-reflection copy. Factor IDs are replaced with ordered `factor-NN` labels.
Only the payload version and locale remain as public metadata.

The payload excludes the aggregate, score/projection/render children, source-version
map, calculation provenance, internal source/rule/projection IDs, chart placements,
longitudes, speeds, cusps, raw birth/profile/account data, private numerology traces,
and all token material. It is deterministic and deeply immutable.

Share capabilities use 32 bytes of cryptographic randomness encoded as canonical
unpadded base64url. The raw token is shown only as the bearer capability; storage
uses a domain-separated SHA-256 digest. Grant state is explicit, canonical UTC
expiry is exclusive at its exact instant, and revocation moves the immutable grant
from public to private. Malformed state and tokens fail closed.

## Persistence boundary 1.0.0

The compatibility repository persists a complete, revalidated Goal 40 report under
the owner and two owner-verified birth-profile references. Private reports and
redacted public payloads use preserved-order PostgreSQL `json`; their versions are
stored beside them. Existing pre-Goal-43 writes remain private legacy rows, while
all new repository writes require the complete report.

Publishing reprojects Goal 42 inside the owner transaction, generates a new bearer,
stores only its digest, and stores a separately domain-separated integrity digest
for the exact redacted payload. Resolution checks that digest in constant time and
then applies strict public-payload validation. Revoke clears the public payload and
integrity digest while retaining the old capability digest with a revocation time;
re-publish creates a new capability. Deletion removes both private and public state.

Private operations use owner RLS with independent ownership checks for both birth
profiles. Public reads use a NOLOGIN, transaction-local-digest RLS role with access
only to redacted payload and integrity-digest columns. The public HTTP route remains
Goal 44; tokens, digests, private reports, source IDs, and profile/account references
must not enter its rendered output, metadata, logs, analytics, or outbound links.
