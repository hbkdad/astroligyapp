# Interpretation and claim safety

Status: accepted baseline for deterministic interpretation content.

## Boundary

Astronomical and numerological calculations produce versioned structured facts.
The interpretation projection may reference those facts but must not change,
recalculate, add, or imply another factual result. Template resolution produces
structured render data before any prose is composed.

Astrology and numerology content is framed as a tradition-based personal
reflection prompt. It is not presented as scientific prediction or as a basis
for high-stakes decisions.

## Template contract

Every deterministic template has two separate sections:

1. `factTemplate` states only supplied values through declared placeholders.
2. `interpretationTemplate` starts with explicit astrology or numerology
   tradition framing and contains reflection-oriented language.

Templates are single-line plain text with declared placeholders. HTML-like
characters, unknown or malformed placeholders, interpretive language in the
fact section, unsafe claims, duplicate keys, and mismatched tradition/template
responses fail validation. Unsupported keys return a structured
`unsupported-key` result rather than generic or invented copy.

The renderer requires supplied parameters to match the declared parameter set
exactly. It accepts only safe plain-text strings, finite numbers, and booleans;
uses an invariant six-decimal-maximum number policy; and never evaluates HTML,
templates, or executable content from a parameter. Raw source parameters remain
available unchanged beside the rendered text. Fact and interpretation sections
each retain their source fact, projection, context, library, locale, and
renderer versions. Unsupported templates produce one fixed, provenance-bearing
fallback record without attempting to reconstruct a fact.

## Prohibited content

Interpretation content must not:

- claim that an outcome will, certainly, or definitely occur;
- diagnose, cure, treat, or direct medication or medical decisions;
- direct buying, selling, investing, borrowing, or gambling;
- direct legal action or contract decisions;
- advise bypassing warnings, alarms, professional advice, or safety controls;
- direct a user to marry, leave, divorce, or end a relationship;
- present astrology or numerology as scientifically established prediction.

Examples rejected by the validation suite include:

- “This will definitely happen.”
- “You should make a medical decision because of this.”
- “Buy this investment.”
- “Ignore a safety warning.”
- “Your relationship will fail.”

## AI boundary

No AI interpretation adapter is selected or required. A future adapter may
receive only validated structured render data, must return schema-validated
output, and must pass equivalent claim-safety checks. Deterministic fallback
content remains mandatory, and AI must never calculate or modify facts.

Compatibility content follows the same boundary through a separate en-CA library.
Its factual section exposes only projected pair/aspect/overlay values. Its reflection
section begins with explicit astrology-and-numerology tradition framing and may
describe only configured product factors. Soulmate, guaranteed/perfect-match,
scientific-validity, and marry/leave/stay/divorce directives fail validation.
