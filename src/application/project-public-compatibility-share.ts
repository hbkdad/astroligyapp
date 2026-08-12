import {
  composeCompatibilityReport,
  type CompatibilityReport,
} from "@/application/compose-compatibility-report";

export const PUBLIC_COMPATIBILITY_SHARE_VERSION = "1.0.0";

export interface PublicCompatibilitySharePayload {
  readonly version: string;
  readonly locale: string;
  readonly title: string;
  readonly summary: string;
  readonly categories: readonly Readonly<{
    key: string;
    label: string;
    score: number;
    maximum: number;
    confidence: number;
    factorCount: number;
  }>[];
  readonly factors: readonly Readonly<{
    publicId: string;
    categoryKey: string;
    categoryLabel: string;
    tone: string;
    impact: number;
    fact: Readonly<{
      status: "rendered" | "unsupported";
      text: string;
    }>;
    reflection: Readonly<{
      status: "rendered" | "unsupported";
      text: string;
    }>;
  }>[];
  readonly disclaimer: string;
}

export class InvalidPublicCompatibilityShareInputError extends Error {
  constructor() {
    super("Compatibility report is invalid for public sharing");
    this.name = "InvalidPublicCompatibilityShareInputError";
  }
}

export function projectPublicCompatibilityShare(
  report: CompatibilityReport,
): PublicCompatibilitySharePayload {
  try {
    const rebuilt = composeCompatibilityReport({
      aggregate: report.aggregate,
      scores: report.scores,
      projection: report.projection,
      rendered: report.rendered,
    });
    if (!sameValue(report, rebuilt)) invalid();

    const scores = new Map(
      report.scores.categories.map((category) => [
        category.categoryId,
        category,
      ]),
    );
    const categories = report.scores.categories.map((category) => ({
      key: category.categoryId,
      label: humanize(category.categoryId),
      score: category.score,
      maximum: category.maximum,
      confidence: category.confidence,
      factorCount: category.contributions.length,
    }));
    const factors = report.rendered.items.map((item, index) => {
      const category = scores.get(item.categoryId);
      const contribution = category?.contributions.find(
        (candidate) => candidate.ruleId === item.fact.provenance.ruleId,
      );
      if (!category || !contribution) invalid();
      return {
        publicId: `factor-${String(index + 1).padStart(2, "0")}`,
        categoryKey: item.categoryId,
        categoryLabel: humanize(item.categoryId),
        tone: item.tone,
        impact: contribution.impact,
        fact: { status: item.fact.status, text: item.fact.text },
        reflection: {
          status: item.reflection.status,
          text: item.reflection.text,
        },
      };
    });

    return deepFreeze({
      version: PUBLIC_COMPATIBILITY_SHARE_VERSION,
      locale: report.sourceVersions.locale,
      title: "A transparent relationship comparison.",
      summary:
        "Calculated comparison facts and product-defined category metrics are separated from tradition-framed reflections.",
      categories,
      factors,
      disclaimer: report.disclaimer,
    });
  } catch {
    throw new InvalidPublicCompatibilityShareInputError();
  }
}

function humanize(value: string): string {
  return value
    .split(/[-_. ]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function sameValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function invalid(): never {
  throw new RangeError("Invalid public compatibility share input");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
