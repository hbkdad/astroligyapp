import type { CategoryScoreOutput } from "@/application/calculate-category-scores";
import type { DailyReadingSignal } from "@/application/compose-daily-reading";
import type { RenderedInterpretationItem } from "@/application/render-interpretations";
import type { CategoryKey } from "@/domain/category/contracts";
import {
  toDashboardReadModel,
  type DashboardReadingSource,
} from "./dashboard-read-model";
import { getDemoTimeline } from "./timeline-demo";

const effectiveAt = "1999-12-20T12:00:00Z";
const versions = {
  reading: "1.0.0-demo",
  context: "1.0.0",
  projection: "1.0.0",
  library: "1.1.0",
  renderer: "1.0.0",
  scoreModel: "1.0.0",
  scoreFormula: "1.0.0",
} as const;

const signals: readonly DailyReadingSignal[] = [
  signal(
    "opportunity",
    "trine-opportunity",
    8,
    64,
    "transit:jupiter:body:sun:trine",
  ),
  signal(
    "communication",
    "mercury-communication",
    7,
    61,
    "transit:mercury:body:jupiter:trine",
  ),
  signal(
    "personal-growth",
    "personal-year-growth",
    6,
    58,
    "numerology:personal-year",
  ),
];

const categories: CategoryScoreOutput = {
  effectiveAt,
  scores: [
    score("opportunity", 64, signals[0]),
    score("communication", 61, signals[1]),
    score("personal-growth", 58, signals[2]),
    score("energy", 50),
    score("love", 50),
    score("friction", 50),
  ],
  metadata: {
    label: "interpretive product heuristic; not a scientific measurement",
    modelId: "personal-category-baseline",
    modelVersion: versions.scoreModel,
    formulaVersion: versions.scoreFormula,
    contextVersion: versions.context,
    projectionVersion: versions.projection,
    scoreFormula: "clamp(round(baseline + sum(impact)), 0, 100)",
    confidenceFormula: "weighted mean by absolute impact; 0 without factors",
  },
};

const DASHBOARD_BASE = {
  effectiveAt,
  localDate: "1999-12-20",
  timezone: "America/Toronto",
  moon: {
    phase: "waning-crescent",
    sign: "gemini",
    illuminatedFraction: 0.23,
    phaseAngleDegrees: 302.4,
  },
  numerology: {
    "personal-day": { value: 7, masterNumber: false },
    "personal-month": { value: 8, masterNumber: false },
    "personal-year": { value: 6, masterNumber: false },
  },
  interpretations: [
    rendered(
      "transit.jupiter.trine.natal.sun",
      "transit:jupiter:body:sun:trine",
      "Jupiter is Trine Natal Sun with an orb of 0.8 degrees and is Applying.",
      "Within astrology traditions, this transit is used as a prompt to reflect on themes associated with Jupiter and Natal Sun.",
    ),
    rendered(
      "lunar.waning-crescent.gemini",
      "lunar:phase:waning-crescent",
      "The Moon phase is Waning Crescent at 302.4 degrees, in Gemini, with approximate illuminated fraction 0.23.",
      "Within astrology traditions, this lunar phase and sign are used as prompts for personal reflection.",
    ),
  ],
  categories,
  strongestSignals: signals,
  versions,
} as const;

let sourcePromise: Promise<DashboardReadingSource> | undefined;
let modelPromise: Promise<ReturnType<typeof toDashboardReadModel>> | undefined;

export function getDemoDashboardSource(): Promise<DashboardReadingSource> {
  sourcePromise ??= getDemoTimeline().then((timeline) => ({
    ...DASHBOARD_BASE,
    timeline,
  }));
  return sourcePromise;
}

export function getDemoDashboard() {
  modelPromise ??= getDemoDashboardSource().then(toDashboardReadModel);
  return modelPromise;
}

function signal(
  category: CategoryKey,
  ruleId: string,
  impact: number,
  categoryScore: number,
  sourceFactId: string,
): DailyReadingSignal {
  return {
    category,
    categoryScore,
    ruleId,
    sourceFactId,
    projectionKey: sourceFactId.replaceAll(":", "."),
    impact,
    confidence: 0.65,
    rationale: `Configured ${ruleId.replaceAll("-", " ")} contribution.`,
  };
}

function score(
  category: CategoryKey,
  value: number,
  contribution?: DailyReadingSignal,
): CategoryScoreOutput["scores"][number] {
  const factors = contribution
    ? [
        {
          ruleId: contribution.ruleId,
          sourceFactId: contribution.sourceFactId,
          projectionKey: contribution.projectionKey,
          impact: contribution.impact,
          confidence: contribution.confidence,
          rationale: contribution.rationale,
        },
      ]
    : [];
  return {
    category,
    label: "interpretive product heuristic",
    baseline: 50,
    contributionTotal: value - 50,
    rawScore: value,
    score: value,
    confidence: contribution?.confidence ?? 0,
    sourceFactIds: contribution ? [contribution.sourceFactId] : [],
    contributingFactors: factors,
  };
}

function rendered(
  key: string,
  sourceFactId: string,
  fact: string,
  interpretation: string,
): RenderedInterpretationItem {
  const provenance = {
    sourceFactId,
    projectionKey: key,
    templateKey: key.startsWith("lunar") ? "lunar-phase" : "transit-aspect",
    projectionVersion: versions.projection,
    contextVersion: versions.context,
    libraryId: "personal-reflection-en-ca",
    libraryVersion: versions.library,
    locale: "en-CA",
    rendererVersion: versions.renderer,
  };
  return {
    status: "rendered",
    key,
    tradition: "astrology",
    parameters: {},
    fact: { text: fact, provenance },
    interpretation: { text: interpretation, provenance },
  } as RenderedInterpretationItem;
}
