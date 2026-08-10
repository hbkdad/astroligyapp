import type { InterpretationRenderData } from "./project-interpretations";
import type {
  InterpretationParameterValue,
  InterpretationProjection,
  InterpretationTemplate,
} from "@/domain/interpretation/contracts";
import { validateInterpretationTemplate } from "@/domain/interpretation/library";

export const INTERPRETATION_RENDERER_VERSION = "1.0.0";
export const INTERPRETATION_NUMBER_MAX_FRACTION_DIGITS = 6;
export const UNSUPPORTED_INTERPRETATION_FALLBACK =
  "No deterministic interpretation is available for this item.";

export interface InterpretationSectionProvenance {
  readonly sourceFactId: string;
  readonly projectionKey: string;
  readonly templateKey: string;
  readonly projectionVersion: string;
  readonly contextVersion: string;
  readonly libraryId: string;
  readonly libraryVersion: string;
  readonly locale: string;
  readonly rendererVersion: string;
}

export interface RenderedTextSection {
  readonly text: string;
  readonly provenance: InterpretationSectionProvenance;
}

export type RenderedInterpretationItem =
  | Readonly<{
      status: "rendered";
      key: string;
      tradition: "astrology" | "numerology";
      parameters: Readonly<Record<string, InterpretationParameterValue>>;
      fact: RenderedTextSection;
      interpretation: RenderedTextSection;
    }>
  | Readonly<{
      status: "unsupported";
      key: string;
      reason: "unsupported-key";
      fallback: RenderedTextSection;
    }>;

export interface RenderedInterpretationOutput {
  readonly effectiveAt: string;
  readonly preparedAt: string;
  readonly renderingMode: "deterministic-template";
  readonly items: readonly RenderedInterpretationItem[];
}

export function renderInterpretations(
  data: InterpretationRenderData,
): RenderedInterpretationOutput {
  validateRenderMetadata(data);
  const items = data.items.map((item) => {
    const provenance = provenanceFor(data, item.projection);
    if (!item.resolution.supported) {
      validateUnsupportedResolution(item.projection, item.resolution);
      return {
        status: "unsupported" as const,
        key: item.projection.key,
        reason: item.resolution.reason,
        fallback: {
          text: UNSUPPORTED_INTERPRETATION_FALLBACK,
          provenance,
        },
      };
    }

    const { template } = item.resolution;
    validateResolvedPair(item.projection, template);
    const parameters = validateAndFormatParameters(
      item.projection.parameters,
      template.parameters,
    );
    return {
      status: "rendered" as const,
      key: item.projection.key,
      tradition: item.projection.tradition,
      parameters: { ...item.projection.parameters },
      fact: {
        text: interpolate(template.factTemplate, parameters),
        provenance,
      },
      interpretation: {
        text: interpolate(template.interpretationTemplate, parameters),
        provenance,
      },
    };
  });

  return deepFreeze({
    effectiveAt: data.effectiveAt,
    preparedAt: data.metadata.preparedAt,
    renderingMode: "deterministic-template" as const,
    items,
  });
}

function validateRenderMetadata(data: InterpretationRenderData): void {
  validatePlainText(data.effectiveAt, "Effective instant");
  validatePlainText(data.metadata.preparedAt, "Prepared instant");
  validatePlainText(data.metadata.projectionVersion, "Projection version");
  validatePlainText(data.metadata.contextVersion, "Context version");
  validatePlainText(data.metadata.libraryId, "Library ID");
  validatePlainText(data.metadata.libraryVersion, "Library version");
  validatePlainText(data.metadata.locale, "Locale");
  const itemKeys = data.items.map((item) => item.projection.key);
  if (new Set(itemKeys).size !== itemKeys.length) {
    throw new RangeError("Render item keys must be unique");
  }
  const actualUnsupported = data.items
    .filter((item) => !item.resolution.supported)
    .map((item) => item.projection.key);
  if (
    actualUnsupported.length !== data.unsupportedKeys.length ||
    actualUnsupported.some((key, index) => key !== data.unsupportedKeys[index])
  ) {
    throw new RangeError("Unsupported render keys are inconsistent");
  }
}

function validateResolvedPair(
  projection: InterpretationProjection,
  template: InterpretationTemplate,
): void {
  validateProjection(projection);
  validateInterpretationTemplate(template);
  if (
    template.key !== projection.templateKey ||
    template.tradition !== projection.tradition
  ) {
    throw new RangeError("Renderer received a mismatched template");
  }
}

function validateUnsupportedResolution(
  projection: InterpretationProjection,
  resolution: Readonly<{
    supported: false;
    templateKey: string;
    reason: "unsupported-key";
  }>,
): void {
  validateProjection(projection);
  if (
    resolution.templateKey !== projection.templateKey ||
    resolution.reason !== "unsupported-key"
  ) {
    throw new RangeError("Renderer received an invalid unsupported result");
  }
}

function validateProjection(projection: InterpretationProjection): void {
  validatePlainText(projection.key, "Projection key");
  validatePlainText(projection.sourceFactId, "Source fact ID");
}

function validateAndFormatParameters(
  supplied: Readonly<Record<string, InterpretationParameterValue>>,
  declared: readonly string[],
): Readonly<Record<string, string>> {
  const suppliedKeys = Object.keys(supplied);
  if (
    suppliedKeys.length !== declared.length ||
    suppliedKeys.some((key) => !declared.includes(key)) ||
    declared.some((key) => !Object.hasOwn(supplied, key))
  ) {
    throw new RangeError("Template parameters do not exactly match projection");
  }

  return Object.fromEntries(
    declared.map((key) => [key, formatParameter(key, supplied[key])]),
  );
}

function formatParameter(
  key: string,
  value: InterpretationParameterValue | undefined,
): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new RangeError(`Parameter ${key} must be finite`);
    }
    const normalized = Object.is(value, -0) ? 0 : value;
    return normalized
      .toFixed(INTERPRETATION_NUMBER_MAX_FRACTION_DIGITS)
      .replace(/\.0+$/, "")
      .replace(/(\.\d*?)0+$/, "$1");
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value !== "string") {
    throw new RangeError(`Parameter ${key} has an unsupported value`);
  }
  validatePlainText(value, `Parameter ${key}`);
  const normalizedKey = key.toLowerCase();
  if (normalizedKey.endsWith("version")) return value;
  if (normalizedKey.endsWith("date") && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
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
  const rendered = template.replace(/\{([^}]+)\}/g, (_, key: string) => {
    const value = parameters[key];
    if (value === undefined) {
      throw new RangeError(`Missing formatted parameter ${key}`);
    }
    return value;
  });
  if (/[{}<>]/.test(rendered)) {
    throw new RangeError("Rendered text contains unsafe markup");
  }
  return rendered;
}

function provenanceFor(
  data: InterpretationRenderData,
  projection: InterpretationProjection,
): InterpretationSectionProvenance {
  return {
    sourceFactId: projection.sourceFactId,
    projectionKey: projection.key,
    templateKey: projection.templateKey,
    projectionVersion: data.metadata.projectionVersion,
    contextVersion: data.metadata.contextVersion,
    libraryId: data.metadata.libraryId,
    libraryVersion: data.metadata.libraryVersion,
    locale: data.metadata.locale,
    rendererVersion: INTERPRETATION_RENDERER_VERSION,
  };
}

function validatePlainText(value: string, label: string): void {
  if (
    !value.trim() ||
    value.length > 256 ||
    /[\u0000-\u001f\u007f<>&{}]/.test(value)
  ) {
    throw new RangeError(`${label} must be safe plain text`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
