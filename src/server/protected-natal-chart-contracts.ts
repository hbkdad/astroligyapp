import "server-only";

import { CELESTIAL_BODIES } from "@/domain/astro/contracts";
import { NATAL_CHART_READ_MODEL_VERSION } from "@/presentation/natal-chart-read-model";
import type { ProtectedNatalChartProfileView } from "@/presentation/protected-natal-chart-state";

export const PROTECTED_NATAL_CHART_CONTRACT_VERSION = "1.0.0";

export type ProtectedNatalChartCommand = Readonly<{
  version: typeof PROTECTED_NATAL_CHART_CONTRACT_VERSION;
  profileId: string;
  birthProfileId: string;
  revision: number;
}>;

export function validateProtectedNatalChartCommand(
  value: unknown,
): ProtectedNatalChartCommand | null {
  if (
    !record(value) ||
    !exactKeys(value, ["version", "profileId", "birthProfileId", "revision"])
  )
    return null;
  if (
    value.version !== PROTECTED_NATAL_CHART_CONTRACT_VERSION ||
    !uuid(value.profileId) ||
    !uuid(value.birthProfileId) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1
  )
    return null;
  return Object.freeze({
    version: PROTECTED_NATAL_CHART_CONTRACT_VERSION,
    profileId: value.profileId,
    birthProfileId: value.birthProfileId,
    revision: value.revision as number,
  });
}

export function validateProtectedNatalChartProfileView(
  value: unknown,
): ProtectedNatalChartProfileView | null {
  if (
    !record(value) ||
    !exactKeys(value, [
      "profileId",
      "birthProfileId",
      "revision",
      "displayName",
      "timePrecision",
      "readiness",
      "generationAllowed",
      "chartStale",
      "chart",
    ])
  )
    return null;
  if (
    !uuid(value.profileId) ||
    !uuid(value.birthProfileId) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1 ||
    typeof value.displayName !== "string" ||
    value.displayName.length < 1 ||
    value.displayName.length > 80 ||
    !["date-only", "approximate", "exact"].includes(
      value.timePrecision as string,
    ) ||
    ![
      "ready",
      "date-only",
      "coordinates-missing",
      "ambiguous-time",
      "nonexistent-time",
    ].includes(value.readiness as string) ||
    typeof value.generationAllowed !== "boolean" ||
    typeof value.chartStale !== "boolean"
  )
    return null;
  if (value.chart !== null && !validReadModel(value.chart)) return null;
  return deepFreeze(
    structuredClone(value),
  ) as unknown as ProtectedNatalChartProfileView;
}

function validReadModel(value: unknown): boolean {
  if (
    !record(value) ||
    !exactKeys(value, [
      "version",
      "title",
      "subtitle",
      "orientationLabel",
      "placements",
      "aspects",
      "houses",
      "signs",
      "axes",
      "trace",
    ]) ||
    value.version !== NATAL_CHART_READ_MODEL_VERSION ||
    typeof value.title !== "string" ||
    typeof value.subtitle !== "string" ||
    typeof value.orientationLabel !== "string" ||
    !Array.isArray(value.placements) ||
    value.placements.length !== CELESTIAL_BODIES.length ||
    !Array.isArray(value.aspects) ||
    !Array.isArray(value.houses) ||
    value.houses.length !== 12 ||
    !Array.isArray(value.signs) ||
    value.signs.length !== 12 ||
    !Array.isArray(value.axes) ||
    value.axes.length !== 2 ||
    !Array.isArray(value.trace)
  )
    return false;
  return (
    value.placements.every(
      (item) =>
        record(item) &&
        exactKeys(item, [
          "body",
          "bodyLabel",
          "glyph",
          "sign",
          "signLabel",
          "degreeLabel",
          "longitudeLabel",
          "houseNumber",
          "x",
          "y",
          "accessibleLabel",
          "aspectCount",
        ]) &&
        typeof item.body === "string" &&
        CELESTIAL_BODIES.includes(
          item.body as (typeof CELESTIAL_BODIES)[number],
        ) &&
        finiteFields(item, ["houseNumber", "x", "y", "aspectCount"]),
    ) &&
    value.aspects.every(
      (item) =>
        record(item) &&
        exactKeys(item, [
          "id",
          "firstBody",
          "secondBody",
          "type",
          "orbLabel",
          "phase",
          "strengthLabel",
          "x1",
          "y1",
          "x2",
          "y2",
        ]) &&
        finiteFields(item, ["x1", "y1", "x2", "y2"]),
    ) &&
    value.houses.every(
      (item) =>
        record(item) &&
        exactKeys(item, [
          "number",
          "cuspLabel",
          "x1",
          "y1",
          "x2",
          "y2",
          "labelX",
          "labelY",
        ]) &&
        finiteFields(item, [
          "number",
          "x1",
          "y1",
          "x2",
          "y2",
          "labelX",
          "labelY",
        ]),
    ) &&
    value.signs.every(
      (item) =>
        record(item) &&
        exactKeys(item, ["key", "label", "glyph", "x", "y"]) &&
        finiteFields(item, ["x", "y"]),
    ) &&
    value.axes.every(
      (item) =>
        record(item) &&
        exactKeys(item, [
          "id",
          "startLabel",
          "endLabel",
          "x1",
          "y1",
          "x2",
          "y2",
          "startLabelX",
          "startLabelY",
          "endLabelX",
          "endLabelY",
        ]) &&
        finiteFields(item, [
          "x1",
          "y1",
          "x2",
          "y2",
          "startLabelX",
          "startLabelY",
          "endLabelX",
          "endLabelY",
        ]),
    ) &&
    value.trace.every(
      (item) =>
        record(item) &&
        exactKeys(item, ["label", "value"]) &&
        typeof item.label === "string" &&
        typeof item.value === "string",
    )
  );
}

function finiteFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return fields.every(
    (field) =>
      typeof value[field] === "number" && Number.isFinite(value[field]),
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => keys.includes(key))
  );
}

function uuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
