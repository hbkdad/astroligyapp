import {
  validatePublicCompatibilitySharePayload,
  type PublicCompatibilitySharePayload,
} from "@/application/project-public-compatibility-share";

export const PUBLIC_COMPATIBILITY_SHARE_READ_MODEL_VERSION = "1.0.0";

export type PublicCompatibilityShareViewState =
  | Readonly<{ status: "unavailable"; message: string }>
  | Readonly<{ status: "ready"; model: PublicCompatibilityShareReadModel }>;

export interface PublicCompatibilityShareReadModel {
  readonly version: string;
  readonly locale: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly categories: readonly Readonly<{
    key: string;
    label: string;
    score: number;
    scoreText: string;
    confidenceText: string;
    factorCountText: string;
  }>[];
  readonly factors: readonly Readonly<{
    key: string;
    categoryLabel: string;
    toneLabel: string;
    impactText: string;
    factStatus: "rendered" | "unsupported";
    factText: string;
    reflectionStatus: "rendered" | "unsupported";
    reflectionText: string;
  }>[];
  readonly disclaimer: string;
}

export function toPublicCompatibilityShareReadModel(
  value: PublicCompatibilitySharePayload,
): PublicCompatibilityShareReadModel {
  const payload = validatePublicCompatibilitySharePayload(value);
  return deepFreeze({
    version: PUBLIC_COMPATIBILITY_SHARE_READ_MODEL_VERSION,
    locale: payload.locale,
    eyebrow: "Shared compatibility · privacy-safe report",
    title: payload.title,
    summary: payload.summary,
    categories: payload.categories.map((category) => ({
      key: category.key,
      label: category.label,
      score: category.score,
      scoreText: `${category.score} out of ${category.maximum}`,
      confidenceText: `${formatNumber(category.confidence * 100)}% model confidence`,
      factorCountText: `${category.factorCount} configured ${category.factorCount === 1 ? "factor" : "factors"}`,
    })),
    factors: payload.factors.map((factor) => ({
      key: factor.publicId,
      categoryLabel: factor.categoryLabel,
      toneLabel: humanize(factor.tone),
      impactText: `${factor.impact > 0 ? "+" : ""}${formatNumber(factor.impact)} configured impact`,
      factStatus: factor.fact.status,
      factText: factor.fact.text,
      reflectionStatus: factor.reflection.status,
      reflectionText: factor.reflection.text,
    })),
    disclaimer: payload.disclaimer,
  });
}

function humanize(value: string): string {
  return value
    .split(/[-_. ]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
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
