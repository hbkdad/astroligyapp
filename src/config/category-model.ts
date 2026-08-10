import type { CategoryScoreModel } from "@/domain/category/contracts";

export const DEFAULT_CATEGORY_SCORE_MODEL: CategoryScoreModel = deepFreeze({
  id: "personal-category-baseline",
  version: "1.0.0",
  baseline: 50,
  categories: [
    "love",
    "career",
    "finance",
    "energy",
    "communication",
    "creativity",
    "relationships",
    "personal-growth",
    "friction",
    "opportunity",
  ],
  rules: [
    rule(
      "venus-love",
      "love",
      "transit-aspect",
      { transitingBody: "venus" },
      8,
    ),
    rule(
      "venus-relationships",
      "relationships",
      "transit-aspect",
      { transitingBody: "venus" },
      7,
    ),
    rule(
      "mars-energy",
      "energy",
      "transit-aspect",
      { transitingBody: "mars" },
      8,
    ),
    rule(
      "mercury-communication",
      "communication",
      "transit-aspect",
      { transitingBody: "mercury" },
      8,
    ),
    rule(
      "jupiter-opportunity",
      "opportunity",
      "transit-aspect",
      { transitingBody: "jupiter" },
      9,
    ),
    rule(
      "saturn-career",
      "career",
      "transit-aspect",
      { transitingBody: "saturn" },
      6,
    ),
    rule(
      "uranus-creativity",
      "creativity",
      "transit-aspect",
      { transitingBody: "uranus" },
      7,
    ),
    rule(
      "trine-opportunity",
      "opportunity",
      "transit-aspect",
      { aspectType: "trine" },
      6,
    ),
    rule(
      "sextile-opportunity",
      "opportunity",
      "transit-aspect",
      { aspectType: "sextile" },
      4,
    ),
    rule(
      "square-friction",
      "friction",
      "transit-aspect",
      { aspectType: "square" },
      7,
    ),
    rule(
      "opposition-friction",
      "friction",
      "transit-aspect",
      { aspectType: "opposition" },
      8,
    ),
    rule(
      "personal-day-growth",
      "personal-growth",
      "numerology-value",
      { numerologyKey: "personal-day" },
      5,
    ),
    rule(
      "personal-year-growth",
      "personal-growth",
      "numerology-value",
      { numerologyKey: "personal-year" },
      6,
    ),
    rule(
      "waxing-lunar-energy",
      "energy",
      "lunar-phase",
      { phase: "waxing-crescent" },
      4,
    ),
    rule(
      "full-moon-energy",
      "energy",
      "lunar-phase",
      { phase: "full-moon" },
      7,
    ),
  ],
});

function rule(
  id: string,
  category: CategoryScoreModel["categories"][number],
  templateKey: CategoryScoreModel["rules"][number]["templateKey"],
  parameterMatches: CategoryScoreModel["rules"][number]["parameterMatches"],
  impact: number,
): CategoryScoreModel["rules"][number] {
  return {
    id,
    category,
    templateKey,
    parameterMatches,
    impact,
    confidence: 0.65,
    rationale: `Configured ${id.replaceAll("-", " ")} contribution.`,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
