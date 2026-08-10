import type { PersonalContextFacts } from "./compose-personal-context";
import type {
  InterpretationLibrary,
  InterpretationProjection,
  InterpretationResolution,
  InterpretationTemplateKey,
} from "@/domain/interpretation/contracts";
import { validateInterpretationTemplate } from "@/domain/interpretation/library";

export const INTERPRETATION_PROJECTION_VERSION = "1.0.0";

export interface InterpretationRenderItem {
  readonly projection: InterpretationProjection;
  readonly resolution: InterpretationResolution;
}

export interface InterpretationRenderData {
  readonly effectiveAt: string;
  readonly items: readonly InterpretationRenderItem[];
  readonly unsupportedKeys: readonly string[];
  readonly metadata: Readonly<{
    projectionVersion: string;
    contextVersion: string;
    libraryId: string;
    libraryVersion: string;
    locale: string;
    preparedAt: string;
  }>;
}

export function prepareInterpretationRenderData(
  context: PersonalContextFacts,
  library: InterpretationLibrary,
): InterpretationRenderData {
  const projections = projectInterpretationKeys(context);
  const items = projections.map((projection) => {
    const resolution = library.resolve(projection.templateKey);
    validateResolution(projection, resolution);
    return { projection, resolution };
  });
  return deepFreeze({
    effectiveAt: context.effectiveAt,
    items,
    unsupportedKeys: items
      .filter((item) => !item.resolution.supported)
      .map((item) => item.projection.key),
    metadata: {
      projectionVersion: INTERPRETATION_PROJECTION_VERSION,
      contextVersion: context.metadata.contextVersion,
      libraryId: library.id,
      libraryVersion: library.version,
      locale: library.locale,
      preparedAt: new Date().toISOString(),
    },
  });
}

function validateResolution(
  projection: InterpretationProjection,
  resolution: InterpretationResolution,
): void {
  if (resolution.supported) {
    validateInterpretationTemplate(resolution.template);
    if (
      resolution.template.key !== projection.templateKey ||
      resolution.template.tradition !== projection.tradition
    ) {
      throw new RangeError(
        "Interpretation library returned a mismatched template",
      );
    }
    return;
  }
  if (
    resolution.templateKey !== projection.templateKey ||
    resolution.reason !== "unsupported-key"
  ) {
    throw new RangeError("Interpretation library returned an invalid failure");
  }
}

export function projectInterpretationKeys(
  context: PersonalContextFacts,
): readonly InterpretationProjection[] {
  const projections: InterpretationProjection[] = [
    ...context.natal.placements.map((placement) =>
      projection(
        `natal.${placement.body}.${placement.zodiac.sign}.house-${placement.houseNumber}`,
        "natal-placement",
        `natal:placement:${placement.body}`,
        "astrology",
        {
          body: placement.body,
          sign: placement.zodiac.sign,
          degreeWithinSign: placement.zodiac.degreeWithinSign,
          houseNumber: placement.houseNumber,
        },
      ),
    ),
    ...context.natal.aspects.map((aspect) =>
      projection(
        `natal.${aspect.firstBody}.${aspect.type}.${aspect.secondBody}`,
        "natal-aspect",
        `natal:aspect:${aspect.firstBody}:${aspect.secondBody}:${aspect.type}`,
        "astrology",
        {
          firstBody: aspect.firstBody,
          aspectType: aspect.type,
          secondBody: aspect.secondBody,
          orbDegrees: aspect.orbDegrees,
        },
      ),
    ),
    ...context.transits.aspects.map((aspect) =>
      projection(
        `transit.${aspect.transitingBody}.${aspect.type}.${targetKey(aspect.natalTarget)}`,
        "transit-aspect",
        `transit:${aspect.transitingBody}:${aspect.natalTarget.id}:${aspect.type}`,
        "astrology",
        {
          transitingBody: aspect.transitingBody,
          aspectType: aspect.type,
          targetLabel: targetKey(aspect.natalTarget),
          orbDegrees: aspect.orbDegrees,
          phase: aspect.phase,
        },
      ),
    ),
    projection(
      `lunar.${context.lunar.phase.phase}.${context.lunar.phase.moonZodiac.sign}`,
      "lunar-phase",
      `lunar:phase:${context.lunar.phase.phase}`,
      "astrology",
      {
        phase: context.lunar.phase.phase,
        moonSign: context.lunar.phase.moonZodiac.sign,
        phaseAngleDegrees: context.lunar.phase.phaseAngleDegrees,
        approximateIlluminatedFraction:
          context.lunar.phase.approximateIlluminatedFraction,
      },
    ),
    ...context.lunar.natalAspects.map((aspect) =>
      projection(
        `personal-lunar.${aspect.type}.${targetKey(aspect.natalTarget)}`,
        "personal-lunar-aspect",
        `personal-lunar:${aspect.natalTarget.id}:${aspect.type}`,
        "astrology",
        {
          aspectType: aspect.type,
          targetLabel: targetKey(aspect.natalTarget),
          orbDegrees: aspect.orbDegrees,
          phase: aspect.phase,
        },
      ),
    ),
    ...Object.entries(context.numerology.results).map(([key, result]) =>
      projection(
        `numerology.${key}.${result.value}`,
        "numerology-value",
        `numerology:${key}`,
        "numerology",
        {
          numerologyKey: key,
          value: result.value,
          masterNumber: result.masterNumber,
          strategyId: result.strategyId,
          strategyVersion: result.strategyVersion,
        },
      ),
    ),
  ];

  const expectedFactIds = context.facts.map((fact) => fact.id);
  const actualFactIds = projections.map((item) => item.sourceFactId);
  if (
    expectedFactIds.length !== actualFactIds.length ||
    expectedFactIds.some((factId, index) => factId !== actualFactIds[index])
  ) {
    throw new RangeError(
      "Interpretation projection must cover every context fact exactly once",
    );
  }
  if (
    new Set(projections.map((item) => item.key)).size !== projections.length
  ) {
    throw new RangeError("Interpretation projection keys must be unique");
  }
  return deepFreeze(projections);
}

function projection(
  key: string,
  templateKey: InterpretationTemplateKey,
  sourceFactId: string,
  tradition: "astrology" | "numerology",
  parameters: InterpretationProjection["parameters"],
): InterpretationProjection {
  return { key, templateKey, sourceFactId, tradition, parameters };
}

function targetKey(
  target:
    | Readonly<{ kind: "body"; body: string }>
    | Readonly<{ kind: "angle"; angle: string }>,
): string {
  return target.kind === "body"
    ? `natal.${target.body}`
    : `natal.${target.angle}`;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
