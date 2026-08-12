import {
  composeCompatibilityReport,
  type CompatibilityReport,
} from "@/application/compose-compatibility-report";

export const COMPATIBILITY_READ_MODEL_VERSION = "1.0.0";

export type CompatibilityViewState =
  | Readonly<{ status: "loading" }>
  | Readonly<{
      status: "unavailable" | "locked" | "error" | "empty" | "unsupported";
      message: string;
    }>
  | Readonly<{ status: "ready"; model: CompatibilityReadModel }>;

export interface CompatibilityReadModel {
  readonly version: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly categories: readonly Readonly<{
    id: string;
    label: string;
    score: number;
    scoreText: string;
    confidenceText: string;
    factorCountText: string;
  }>[];
  readonly items: readonly Readonly<{
    id: string;
    categoryId: string;
    categoryLabel: string;
    tone: string;
    toneLabel: string;
    impactText: string;
    factStatus: "rendered" | "unsupported";
    factText: string;
    reflectionStatus: "rendered" | "unsupported";
    reflectionText: string;
    sourceFactId: string;
  }>[];
  readonly trace: readonly Readonly<{ label: string; value: string }>[];
  readonly disclaimer: string;
}

export function toCompatibilityReadModel(
  report: CompatibilityReport,
): CompatibilityReadModel {
  const rebuilt = composeCompatibilityReport({
    aggregate: report.aggregate,
    scores: report.scores,
    projection: report.projection,
    rendered: report.rendered,
  });
  if (JSON.stringify(report) !== JSON.stringify(rebuilt))
    throw new RangeError("Compatibility report is invalid for presentation");
  const scoreMap = new Map(
    report.scores.categories.map((category) => [category.categoryId, category]),
  );
  const categories = report.scores.categories.map((category) => ({
    id: category.categoryId,
    label: humanize(category.categoryId),
    score: category.score,
    scoreText: `${category.score} out of ${category.maximum}`,
    confidenceText: `${formatPercent(category.confidence)} model confidence`,
    factorCountText: `${category.contributions.length} configured ${category.contributions.length === 1 ? "factor" : "factors"}`,
  }));
  const items = report.rendered.items.map((item) => {
    const score = scoreMap.get(item.categoryId);
    const contribution = score?.contributions.find(
      (candidate) => candidate.ruleId === item.fact.provenance.ruleId,
    );
    if (!score || !contribution)
      throw new RangeError("Report item source is unknown");
    return {
      id: item.id,
      categoryId: item.categoryId,
      categoryLabel: humanize(item.categoryId),
      tone: item.tone,
      toneLabel: humanize(item.tone),
      impactText: `${contribution.impact > 0 ? "+" : ""}${formatNumber(contribution.impact)} configured impact`,
      factStatus: item.fact.status,
      factText: item.fact.text,
      reflectionStatus: item.reflection.status,
      reflectionText: item.reflection.text,
      sourceFactId: item.fact.provenance.sourceFactId,
    };
  });
  return deepFreeze({
    version: COMPATIBILITY_READ_MODEL_VERSION,
    eyebrow: "Compatibility · local deterministic demo",
    title: "A transparent relationship comparison.",
    summary:
      "Calculated cross-chart facts and product-defined category metrics are kept visibly separate from tradition-framed reflections.",
    categories,
    items,
    trace: Object.entries(report.sourceVersions).map(([label, value]) => ({
      label: humanize(label),
      value,
    })),
    disclaimer: report.disclaimer,
  });
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[-_. ]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}
function formatPercent(value: number): string {
  return `${formatNumber(value * 100)}%`;
}
function formatNumber(value: number): string {
  return value
    .toFixed(6)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*?)0+$/, "$1");
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
