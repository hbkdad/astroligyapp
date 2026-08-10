import { describe, expect, it } from "vitest";

import type { InterpretationRenderData } from "@/application/project-interpretations";
import {
  INTERPRETATION_NUMBER_MAX_FRACTION_DIGITS,
  INTERPRETATION_RENDERER_VERSION,
  UNSUPPORTED_INTERPRETATION_FALLBACK,
  renderInterpretations,
} from "@/application/render-interpretations";
import type {
  InterpretationProjection,
  InterpretationResolution,
  InterpretationTemplate,
} from "@/domain/interpretation/contracts";
import { DEFAULT_INTERPRETATION_LIBRARY } from "@/domain/interpretation/library";

describe("deterministic interpretation renderer", () => {
  it("renders separate fact and tradition sections with full provenance", () => {
    const output = renderInterpretations(preparedData());
    expect(output).toMatchObject({
      effectiveAt: "2000-01-01T02:00:00Z",
      preparedAt: "2000-01-01T02:00:01Z",
      renderingMode: "deterministic-template",
    });
    expect(output.items[0]).toEqual({
      status: "rendered",
      key: "natal.sun.aries.house-3",
      tradition: "astrology",
      parameters: {
        body: "sun",
        sign: "aries",
        degreeWithinSign: 12.3456789,
        houseNumber: 3,
      },
      fact: {
        text: "Sun is at 12.345679 degrees in Aries, house 3.",
        provenance: provenance(),
      },
      interpretation: {
        text: "Within astrology traditions, this placement is used as a prompt to reflect on themes associated with Sun, Aries, and house 3.",
        provenance: provenance(),
      },
    });
    const item = output.items[0]!;
    if (item.status !== "rendered") throw new Error("Expected rendered item");
    expect(item.fact).not.toBe(item.interpretation);
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.items[0])).toBe(true);
  });

  it("is deterministic and does not alter raw projection parameters", () => {
    const input = preparedData();
    const before = structuredClone(input.items[0]!.projection.parameters);
    expect(renderInterpretations(input)).toEqual(renderInterpretations(input));
    expect(input.items[0]!.projection.parameters).toEqual(before);
    expect(INTERPRETATION_NUMBER_MAX_FRACTION_DIGITS).toBe(6);
  });

  it("formats booleans, labels, versions, negative zero, and decimals invariantly", () => {
    const template: InterpretationTemplate = {
      key: "numerology-value",
      tradition: "numerology",
      parameters: [
        "numerologyKey",
        "value",
        "masterNumber",
        "strategyId",
        "strategyVersion",
      ],
      factTemplate:
        "{numerologyKey} is {value}; master-number status is {masterNumber}, calculated by {strategyId} version {strategyVersion}.",
      interpretationTemplate:
        "Within numerology traditions, this value is used as a prompt for personal reflection.",
    };
    const projection: InterpretationProjection = {
      key: "numerology.personal-day.0",
      templateKey: "numerology-value",
      sourceFactId: "numerology:personal-day",
      tradition: "numerology",
      parameters: {
        numerologyKey: "personal-day",
        value: -0,
        masterNumber: true,
        strategyId: "pythagorean_v1",
        strategyVersion: "1.0.0-beta",
      },
    };
    const output = renderInterpretations(
      preparedData(projection, { supported: true, template }),
    );
    const item = output.items[0]!;
    if (item.status !== "rendered") throw new Error("Expected rendered item");
    expect(item.fact.text).toBe(
      "Personal Day is 0; master-number status is yes, calculated by Pythagorean V1 version 1.0.0-beta.",
    );
  });

  it("uses explicit deterministic fallback records for unsupported keys", () => {
    const projection = placementProjection();
    const output = renderInterpretations(
      preparedData(projection, {
        supported: false,
        templateKey: "natal-placement",
        reason: "unsupported-key",
      }),
    );
    expect(output.items[0]).toEqual({
      status: "unsupported",
      key: projection.key,
      reason: "unsupported-key",
      fallback: {
        text: UNSUPPORTED_INTERPRETATION_FALLBACK,
        provenance: provenance(),
      },
    });
  });

  it("fails closed on missing and extra parameters", () => {
    const missing = placementProjection();
    delete (missing.parameters as Record<string, unknown>).houseNumber;
    expect(() => renderInterpretations(preparedData(missing))).toThrow(
      "exactly match",
    );

    const extra = placementProjection();
    (extra.parameters as Record<string, unknown>).invented = "value";
    expect(() => renderInterpretations(preparedData(extra))).toThrow(
      "exactly match",
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "fails closed on non-finite number %s",
    (value) => {
      const projection = placementProjection();
      (projection.parameters as Record<string, unknown>).degreeWithinSign =
        value;
      expect(() => renderInterpretations(preparedData(projection))).toThrow(
        "must be finite",
      );
    },
  );

  it.each(["<script>", "Sun & Moon", "bad\nvalue", "{body}"])(
    "never interpolates unsafe plain-text value %s",
    (value) => {
      const projection = placementProjection();
      (projection.parameters as Record<string, unknown>).body = value;
      expect(() => renderInterpretations(preparedData(projection))).toThrow(
        "safe plain text",
      );
    },
  );

  it("fails closed on unsupported runtime parameter types", () => {
    const projection = placementProjection();
    (projection.parameters as Record<string, unknown>).body = { name: "sun" };
    expect(() => renderInterpretations(preparedData(projection))).toThrow(
      "unsupported value",
    );
  });

  it("revalidates templates and rejects mismatched or unsafe render data", () => {
    const unsafe = placementTemplate();
    (unsafe as { interpretationTemplate: string }).interpretationTemplate =
      "Within astrology traditions, you will buy this investment.";
    expect(() =>
      renderInterpretations(
        preparedData(placementProjection(), {
          supported: true,
          template: unsafe,
        }),
      ),
    ).toThrow("unsafe claim");

    const mismatched = placementTemplate();
    (mismatched as { key: string }).key = "natal-aspect";
    expect(() =>
      renderInterpretations(
        preparedData(placementProjection(), {
          supported: true,
          template: mismatched,
        } as InterpretationResolution),
      ),
    ).toThrow("mismatched template");
  });

  it("rejects malformed metadata and unsupported-result bypasses", () => {
    const malformed = preparedData() as MutableRenderData;
    malformed.metadata.locale = "<img>";
    expect(() => renderInterpretations(malformed)).toThrow("safe plain text");

    expect(() =>
      renderInterpretations(
        preparedData(placementProjection(), {
          supported: false,
          templateKey: "transit-aspect",
          reason: "unsupported-key",
        }),
      ),
    ).toThrow("invalid unsupported result");
  });

  it("rejects duplicate items and inconsistent unsupported-key indexes", () => {
    const duplicate = preparedData() as MutableRenderData;
    duplicate.items = [duplicate.items[0]!, duplicate.items[0]!];
    expect(() => renderInterpretations(duplicate)).toThrow(
      "keys must be unique",
    );

    const inconsistent = preparedData() as MutableRenderData;
    inconsistent.unsupportedKeys = ["natal.sun.aries.house-3"];
    expect(() => renderInterpretations(inconsistent)).toThrow(
      "keys are inconsistent",
    );
  });
});

type MutableRenderData = InterpretationRenderData & {
  items: InterpretationRenderData["items"];
  unsupportedKeys: InterpretationRenderData["unsupportedKeys"];
  metadata: {
    -readonly [
      Key in keyof InterpretationRenderData["metadata"]
    ]: InterpretationRenderData["metadata"][Key];
  };
};

function preparedData(
  projection = placementProjection(),
  resolution: InterpretationResolution = DEFAULT_INTERPRETATION_LIBRARY.resolve(
    "natal-placement",
  ),
): InterpretationRenderData {
  return {
    effectiveAt: "2000-01-01T02:00:00Z",
    items: [{ projection, resolution }],
    unsupportedKeys: resolution.supported ? [] : [projection.key],
    metadata: {
      projectionVersion: "1.0.0",
      contextVersion: "1.0.0",
      libraryId: "personal-reflection-en-ca",
      libraryVersion: "1.0.0",
      locale: "en-CA",
      preparedAt: "2000-01-01T02:00:01Z",
    },
  };
}

function placementProjection(): InterpretationProjection {
  return {
    key: "natal.sun.aries.house-3",
    templateKey: "natal-placement",
    sourceFactId: "natal:placement:sun",
    tradition: "astrology",
    parameters: {
      body: "sun",
      sign: "aries",
      degreeWithinSign: 12.3456789,
      houseNumber: 3,
    },
  };
}

function placementTemplate(): InterpretationTemplate {
  const resolution = DEFAULT_INTERPRETATION_LIBRARY.resolve("natal-placement");
  if (!resolution.supported) throw new Error("Default fixture is unavailable");
  return structuredClone(resolution.template);
}

function provenance() {
  return {
    sourceFactId: "natal:placement:sun",
    projectionKey: "natal.sun.aries.house-3",
    templateKey: "natal-placement",
    projectionVersion: "1.0.0",
    contextVersion: "1.0.0",
    libraryId: "personal-reflection-en-ca",
    libraryVersion: "1.0.0",
    locale: "en-CA",
    rendererVersion: INTERPRETATION_RENDERER_VERSION,
  };
}
