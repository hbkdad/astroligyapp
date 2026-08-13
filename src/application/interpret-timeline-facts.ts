import type { TimelineFact, TimelineFacts } from "./compose-timeline-facts";
import {
  renderInterpretations,
  type RenderedInterpretationItem,
} from "./render-interpretations";
import type {
  InterpretationProjection,
  InterpretationTemplateKey,
} from "@/domain/interpretation/contracts";
import { DEFAULT_INTERPRETATION_LIBRARY } from "@/domain/interpretation/library";

export const TIMELINE_INTERPRETATION_PROJECTION_VERSION = "1.0.0";

export interface TimelineInterpretationOutput {
  readonly items: readonly RenderedInterpretationItem[];
  readonly unsupportedFactIds: readonly string[];
  readonly projectionVersion: string;
  readonly libraryVersion: string;
}

export function interpretTimelineFacts(
  timeline: TimelineFacts,
): TimelineInterpretationOutput {
  const projected = timeline.facts.flatMap(projectFact);
  const projections = projected.map(({ projection }) => projection);
  const output = renderInterpretations({
    effectiveAt: timeline.interval.startInstant,
    items: projections.map((projection) => ({
      projection,
      resolution: DEFAULT_INTERPRETATION_LIBRARY.resolve(
        projection.templateKey,
      ),
    })),
    unsupportedKeys: [],
    metadata: {
      projectionVersion: TIMELINE_INTERPRETATION_PROJECTION_VERSION,
      contextVersion: timeline.version,
      libraryId: DEFAULT_INTERPRETATION_LIBRARY.id,
      libraryVersion: DEFAULT_INTERPRETATION_LIBRARY.version,
      locale: DEFAULT_INTERPRETATION_LIBRARY.locale,
      preparedAt: new Date().toISOString(),
    },
  });
  const supportedIds = new Set(
    projections.map(({ sourceFactId }) => sourceFactId),
  );
  return deepFreeze({
    items: output.items,
    unsupportedFactIds: timeline.facts
      .map(({ id }) => id)
      .filter((id) => !supportedIds.has(id)),
    projectionVersion: TIMELINE_INTERPRETATION_PROJECTION_VERSION,
    libraryVersion: DEFAULT_INTERPRETATION_LIBRARY.version,
  });
}

function projectFact(
  fact: TimelineFact,
): readonly { projection: InterpretationProjection }[] {
  if (fact.type === "personal-transit") {
    const event = fact.source.event;
    return [
      wrap(fact, "transit-aspect", "astrology", {
        transitingBody: event.transitingBody,
        aspectType: event.aspect.type,
        targetLabel:
          event.natalTarget.kind === "body"
            ? `natal.${event.natalTarget.body}`
            : `natal.${event.natalTarget.angle}`,
        orbDegrees: event.peak.orbDegrees,
        phase: "exact",
      }),
    ];
  }
  if (fact.type === "primary-phase") {
    const event = fact.source.event;
    if (event.type !== "primary-phase") return [];
    return [
      wrap(fact, "lunar-phase", "astrology", {
        phase: event.phase,
        moonSign: event.geometry.moonZodiac.sign,
        phaseAngleDegrees: event.geometry.phaseAngleDegrees,
        approximateIlluminatedFraction:
          event.geometry.approximateIlluminatedFraction,
      }),
    ];
  }
  if (fact.type.endsWith("-boundary") && "result" in fact.source) {
    return [
      wrap(fact, "numerology-value", "numerology", {
        numerologyKey: fact.type.replace("-boundary", ""),
        value: fact.source.result.value,
        masterNumber: fact.source.result.masterNumber,
        strategyId: fact.source.result.strategyId,
        strategyVersion: fact.source.result.strategyVersion,
      }),
    ];
  }
  return [];
}

function wrap(
  fact: TimelineFact,
  templateKey: InterpretationTemplateKey,
  tradition: "astrology" | "numerology",
  parameters: InterpretationProjection["parameters"],
) {
  return {
    projection: {
      key: `timeline.${fact.id}`,
      templateKey,
      sourceFactId: fact.id,
      tradition,
      parameters,
    },
  } as const;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
