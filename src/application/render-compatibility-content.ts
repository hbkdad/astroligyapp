import type { CompatibilityCategoryScoreResult } from "@/application/calculate-compatibility-category-scores";
import type { CompatibilityFactAggregate } from "@/application/compose-compatibility-facts";
import {
  validateCompatibilityContentProjection,
  type CompatibilityContentParameter,
  type CompatibilityContentProjection,
  type CompatibilityContentProjectionItem,
} from "@/application/project-compatibility-content";
import { INITIAL_COMPATIBILITY_CATEGORY_POLICY } from "@/config/compatibility-category-policy";
import {
  DEFAULT_COMPATIBILITY_CONTENT_LIBRARY,
  validateCompatibilityContentTemplate,
  type CompatibilityContentLibrary,
  type CompatibilityContentTemplate,
} from "@/domain/compatibility/content-library";
import type { CompatibilityCategoryPolicy } from "@/domain/compatibility/scoring";

export const COMPATIBILITY_CONTENT_RENDERER_VERSION = "1.0.0";
export const UNSUPPORTED_COMPATIBILITY_CONTENT_FALLBACK =
  "No deterministic compatibility content is available for this item.";

export interface CompatibilityContentProvenance {
  readonly projectionItemId: string;
  readonly categoryId: string;
  readonly sourceFactId: string;
  readonly ruleId: string;
  readonly factKey: string;
  readonly reflectionKey: string;
  readonly projectionVersion: string;
  readonly aggregateVersion: string;
  readonly scoringResultVersion: string;
  readonly scoringFormulaVersion: string;
  readonly scoringPolicyVersion: string;
  readonly libraryId: string;
  readonly libraryVersion: string;
  readonly locale: string;
  readonly rendererVersion: string;
}

export type RenderedCompatibilitySection =
  | Readonly<{
      status: "rendered";
      text: string;
      provenance: CompatibilityContentProvenance;
    }>
  | Readonly<{
      status: "unsupported";
      reason: "unsupported-key";
      text: string;
      provenance: CompatibilityContentProvenance;
    }>;

export interface RenderedCompatibilityItem {
  readonly id: string;
  readonly categoryId: string;
  readonly tone: string;
  readonly parameters: Readonly<Record<string, CompatibilityContentParameter>>;
  readonly fact: RenderedCompatibilitySection;
  readonly reflection: RenderedCompatibilitySection;
}

export interface RenderedCompatibilityContent {
  readonly version: string;
  readonly renderingMode: "deterministic-template";
  readonly items: readonly RenderedCompatibilityItem[];
  readonly disclaimer: string;
}

export class InvalidCompatibilityRenderInputError extends Error {
  constructor() {
    super("Compatibility render input is invalid or inconsistent");
    this.name = "InvalidCompatibilityRenderInputError";
  }
}

export function renderCompatibilityContent(
  projection: CompatibilityContentProjection,
  aggregate: CompatibilityFactAggregate,
  scores: CompatibilityCategoryScoreResult,
  library: CompatibilityContentLibrary = DEFAULT_COMPATIBILITY_CONTENT_LIBRARY,
  policy: CompatibilityCategoryPolicy = INITIAL_COMPATIBILITY_CATEGORY_POLICY,
): RenderedCompatibilityContent {
  try {
    validateCompatibilityContentProjection(
      projection,
      aggregate,
      scores,
      policy,
    );
    validateMetadata(library);
    const items = projection.items.map((item) => {
      const provenance = provenanceFor(projection, item, library);
      const fact = renderSection(
        item.factKey,
        item.parameters,
        library,
        provenance,
      );
      const reflectionParameters = {
        categoryId: item.categoryId,
        tone: item.tone,
        impact: item.impact,
        confidence: item.confidence,
      };
      const reflection = renderSection(
        item.reflectionKey,
        reflectionParameters,
        library,
        provenance,
      );
      return {
        id: item.id,
        categoryId: item.categoryId,
        tone: item.tone,
        parameters: { ...item.parameters },
        fact,
        reflection,
      };
    });
    return deepFreeze({
      version: COMPATIBILITY_CONTENT_RENDERER_VERSION,
      renderingMode: "deterministic-template" as const,
      items,
      disclaimer: projection.disclaimer,
    });
  } catch {
    throw new InvalidCompatibilityRenderInputError();
  }
}

function renderSection(
  key: string,
  parameters: Readonly<Record<string, CompatibilityContentParameter>>,
  library: CompatibilityContentLibrary,
  provenance: CompatibilityContentProvenance,
): RenderedCompatibilitySection {
  const resolution = library.resolve(key);
  if (!resolution.supported) {
    if (resolution.key !== key || resolution.reason !== "unsupported-key")
      invalid();
    return {
      status: "unsupported",
      reason: "unsupported-key",
      text: UNSUPPORTED_COMPATIBILITY_CONTENT_FALLBACK,
      provenance,
    };
  }
  const template = resolution.template;
  validateCompatibilityContentTemplate(template);
  if (template.key !== key) invalid();
  const formatted = validateAndFormat(parameters, template);
  return {
    status: "rendered",
    text: interpolate(template.text, formatted),
    provenance,
  };
}

function validateAndFormat(
  parameters: Readonly<Record<string, CompatibilityContentParameter>>,
  template: CompatibilityContentTemplate,
): Readonly<Record<string, string>> {
  const supplied = Object.keys(parameters);
  if (
    !sameValue(supplied.sort(), [...template.parameters].sort()) ||
    template.parameters.some((key) => !Object.hasOwn(parameters, key))
  )
    invalid();
  return Object.fromEntries(
    template.parameters.map((key) => [key, format(parameters[key])]),
  );
}

function format(value: CompatibilityContentParameter | undefined): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid();
    return (Object.is(value, -0) ? 0 : value)
      .toFixed(6)
      .replace(/\.0+$/, "")
      .replace(/(\.\d*?)0+$/, "$1");
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value !== "string" || !safeText(value)) invalid();
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[._\-/ ]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function interpolate(
  template: string,
  parameters: Readonly<Record<string, string>>,
): string {
  const text = template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = parameters[key];
    if (value === undefined) invalid();
    return value;
  });
  if (!safeText(text)) invalid();
  return text;
}

function provenanceFor(
  projection: CompatibilityContentProjection,
  item: CompatibilityContentProjectionItem,
  library: CompatibilityContentLibrary,
): CompatibilityContentProvenance {
  return {
    projectionItemId: item.id,
    categoryId: item.categoryId,
    sourceFactId: item.sourceFactId,
    ruleId: item.ruleId,
    factKey: item.factKey,
    reflectionKey: item.reflectionKey,
    projectionVersion: projection.version,
    aggregateVersion: projection.sourceVersions.aggregate,
    scoringResultVersion: projection.sourceVersions.scoringResult,
    scoringFormulaVersion: projection.sourceVersions.scoringFormula,
    scoringPolicyVersion: projection.sourceVersions.scoringPolicy,
    libraryId: library.id,
    libraryVersion: library.version,
    locale: library.locale,
    rendererVersion: COMPATIBILITY_CONTENT_RENDERER_VERSION,
  };
}

function validateMetadata(library: CompatibilityContentLibrary): void {
  if (
    !safeText(library.id) ||
    !safeText(library.version) ||
    !safeText(library.locale)
  )
    invalid();
}

function safeText(value: string): boolean {
  return (
    value.trim() === value &&
    value.length > 0 &&
    value.length <= 1024 &&
    !/[\u0000-\u001f\u007f<>&{}]/.test(value)
  );
}

function sameValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function invalid(): never {
  throw new RangeError("Invalid compatibility renderer input");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
