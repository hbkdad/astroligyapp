import {
  COMPATIBILITY_REPORT_DISCLAIMER,
  composeCompatibilityReport,
  type CompatibilityReport,
} from "@/application/compose-compatibility-report";
import {
  COMPATIBILITY_CATEGORY_IDS,
  COMPATIBILITY_REFLECTION_TONES,
} from "@/application/project-compatibility-content";
import { UNSUPPORTED_COMPATIBILITY_CONTENT_FALLBACK } from "@/application/render-compatibility-content";
import { COMPATIBILITY_CONTENT_LOCALE } from "@/domain/compatibility/content-library";

export const PUBLIC_COMPATIBILITY_SHARE_VERSION = "1.0.0";
const PUBLIC_SHARE_TITLE = "A transparent relationship comparison.";
const PUBLIC_SHARE_SUMMARY =
  "Calculated comparison facts and product-defined category metrics are separated from tradition-framed reflections.";

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

    return validatePublicCompatibilitySharePayload({
      version: PUBLIC_COMPATIBILITY_SHARE_VERSION,
      locale: report.sourceVersions.locale,
      title: PUBLIC_SHARE_TITLE,
      summary: PUBLIC_SHARE_SUMMARY,
      categories,
      factors,
      disclaimer: report.disclaimer,
    });
  } catch {
    throw new InvalidPublicCompatibilityShareInputError();
  }
}

export function validatePublicCompatibilitySharePayload(
  value: unknown,
): PublicCompatibilitySharePayload {
  try {
    if (
      !record(value) ||
      !exactKeys(value, [
        "version",
        "locale",
        "title",
        "summary",
        "categories",
        "factors",
        "disclaimer",
      ])
    )
      invalid();
    if (
      value.version !== PUBLIC_COMPATIBILITY_SHARE_VERSION ||
      value.locale !== COMPATIBILITY_CONTENT_LOCALE ||
      value.title !== PUBLIC_SHARE_TITLE ||
      value.summary !== PUBLIC_SHARE_SUMMARY ||
      value.disclaimer !== COMPATIBILITY_REPORT_DISCLAIMER ||
      !Array.isArray(value.categories) ||
      !Array.isArray(value.factors)
    )
      invalid();

    const categories = value.categories.map(validateCategory);
    if (
      !sameValue(
        categories.map((category) => category.key),
        COMPATIBILITY_CATEGORY_IDS,
      )
    )
      invalid();
    const categoryMap = new Map(
      categories.map((category) => [category.key, category]),
    );
    const factors = value.factors.map((factor, index) =>
      validateFactor(factor, index, categoryMap),
    );
    if (
      factors.length !==
        categories.reduce(
          (total, category) => total + category.factorCount,
          0,
        ) ||
      categories.some(
        (category) =>
          factors.filter((factor) => factor.categoryKey === category.key)
            .length !== category.factorCount,
      )
    )
      invalid();

    return deepFreeze({
      version: PUBLIC_COMPATIBILITY_SHARE_VERSION,
      locale: COMPATIBILITY_CONTENT_LOCALE,
      title: PUBLIC_SHARE_TITLE,
      summary: PUBLIC_SHARE_SUMMARY,
      categories,
      factors,
      disclaimer: COMPATIBILITY_REPORT_DISCLAIMER,
    });
  } catch {
    throw new InvalidPublicCompatibilityShareInputError();
  }
}

function validateCategory(value: unknown) {
  if (
    !record(value) ||
    !exactKeys(value, [
      "key",
      "label",
      "score",
      "maximum",
      "confidence",
      "factorCount",
    ])
  )
    invalid();
  if (
    typeof value.key !== "string" ||
    value.label !== humanize(value.key) ||
    typeof value.score !== "number" ||
    !Number.isSafeInteger(value.score) ||
    value.maximum !== 100 ||
    value.score < 0 ||
    value.score > value.maximum ||
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1 ||
    typeof value.factorCount !== "number" ||
    !Number.isSafeInteger(value.factorCount) ||
    value.factorCount < 0
  )
    invalid();
  return {
    key: value.key,
    label: value.label,
    score: value.score,
    maximum: value.maximum,
    confidence: value.confidence,
    factorCount: value.factorCount,
  };
}

function validateFactor(
  value: unknown,
  index: number,
  categories: ReadonlyMap<string, { readonly label: string }>,
) {
  if (
    !record(value) ||
    !exactKeys(value, [
      "publicId",
      "categoryKey",
      "categoryLabel",
      "tone",
      "impact",
      "fact",
      "reflection",
    ])
  )
    invalid();
  const category =
    typeof value.categoryKey === "string"
      ? categories.get(value.categoryKey)
      : undefined;
  if (
    value.publicId !== `factor-${String(index + 1).padStart(2, "0")}` ||
    !category ||
    value.categoryLabel !== category.label ||
    !COMPATIBILITY_REFLECTION_TONES.includes(
      value.tone as (typeof COMPATIBILITY_REFLECTION_TONES)[number],
    ) ||
    typeof value.impact !== "number" ||
    !Number.isFinite(value.impact) ||
    Math.abs(value.impact) > 100
  )
    invalid();
  const fact = validateSection(value.fact, false);
  const reflection = validateSection(value.reflection, true);
  return {
    publicId: value.publicId as string,
    categoryKey: value.categoryKey as string,
    categoryLabel: value.categoryLabel as string,
    tone: value.tone as string,
    impact: value.impact,
    fact,
    reflection,
  };
}

function validateSection(
  value: unknown,
  reflection: boolean,
): Readonly<{ status: "rendered" | "unsupported"; text: string }> {
  if (!record(value) || !exactKeys(value, ["status", "text"])) invalid();
  if (
    (value.status !== "rendered" && value.status !== "unsupported") ||
    !safeText(value.text)
  )
    invalid();
  if (
    value.status === "unsupported" &&
    value.text !== UNSUPPORTED_COMPATIBILITY_CONTENT_FALLBACK
  )
    invalid();
  if (
    reflection &&
    value.status === "rendered" &&
    !value.text.startsWith("Within astrology and numerology traditions,")
  )
    invalid();
  return {
    status: value.status as "rendered" | "unsupported",
    text: value.text,
  };
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

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  return sameValue(Object.keys(value).sort(), [...expected].sort());
}

function safeText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 4_000 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  );
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
