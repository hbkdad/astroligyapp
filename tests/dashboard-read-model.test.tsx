import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PersonalDashboard } from "@/components/personal-dashboard";
import type { DailyReadingPayload } from "@/application/compose-daily-reading";
import {
  DEMO_DASHBOARD,
  DEMO_DASHBOARD_SOURCE,
} from "@/presentation/dashboard-demo";
import {
  DASHBOARD_READ_MODEL_VERSION,
  sourceFromDailyReading,
  toDashboardReadModel,
} from "@/presentation/dashboard-read-model";

describe("dashboard presentation boundary", () => {
  it("maps deterministic reading fields into a frozen presentation model", () => {
    expect(DEMO_DASHBOARD).toMatchObject({
      version: DASHBOARD_READ_MODEL_VERSION,
      dateLabel: "Sunday, August 9, 2026",
      timezoneLabel: "America/Toronto",
      moon: {
        phase: "Waning Crescent",
        sign: "Gemini",
        illuminationLabel: "23% illuminated (approximate)",
        geometryLabel: "302.4° Moon–Sun phase angle",
      },
    });
    expect(DEMO_DASHBOARD.signals).toHaveLength(3);
    expect(DEMO_DASHBOARD.categories[0]).toMatchObject({
      label: "Opportunity",
      score: 64,
      heuristicLabel: "interpretive product heuristic",
    });
    expect(Object.isFrozen(DEMO_DASHBOARD)).toBe(true);
    expect(Object.isFrozen(DEMO_DASHBOARD.categories)).toBe(true);
  });

  it("narrows a Goal 17 payload without changing its display facts", () => {
    const source = DEMO_DASHBOARD_SOURCE;
    const reading = {
      effectiveAt: source.effectiveAt,
      localDate: source.localDate,
      timezone: source.timezone,
      context: {
        lunar: {
          phase: {
            phase: source.moon.phase,
            moonZodiac: { sign: source.moon.sign },
            approximateIlluminatedFraction: source.moon.illuminatedFraction,
            phaseAngleDegrees: source.moon.phaseAngleDegrees,
          },
        },
        numerology: { results: source.numerology },
      },
      interpretations: { items: source.interpretations },
      categories: source.categories,
      strongestSignals: source.strongestSignals,
      metadata: {
        readingVersion: source.versions.reading,
        contextVersion: source.versions.context,
        projectionVersion: source.versions.projection,
        libraryVersion: source.versions.library,
        rendererVersion: source.versions.renderer,
        scoreModelVersion: source.versions.scoreModel,
        scoreFormulaVersion: source.versions.scoreFormula,
      },
    } as unknown as DailyReadingPayload;
    expect(sourceFromDailyReading(reading)).toEqual(source);
  });

  it("renders semantic success content and nonvisual score equivalents", () => {
    const html = renderToStaticMarkup(
      <PersonalDashboard state={{ status: "ready", model: DEMO_DASHBOARD }} />,
    );
    expect(html).toContain('<main id="dashboard-content"');
    expect(html).toContain('<nav aria-label="Dashboard sections"');
    expect(html).toContain("Strongest signals");
    expect(html).toContain("Calculated fact");
    expect(html).toContain("Tradition-framed reflection");
    expect(html).toContain('aria-label="Opportunity: 64 out of 100"');
    expect(html).toContain("not scientific measurements");
    expect(html).toContain("View version trace");
  });

  it.each([
    { status: "loading" as const },
    { status: "locked" as const, message: "Sign in to continue." },
    { status: "error" as const, message: "Try again later." },
  ])("renders the $status state deliberately", (state) => {
    const html = renderToStaticMarkup(<PersonalDashboard state={state} />);
    expect(html).toContain("<main");
    expect(html).toContain(state.status === "loading" ? "polite" : "assertive");
    expect(html).not.toContain("undefined");
  });

  it("renders deliberate empty states without fabricating content", () => {
    const model = structuredClone(DEMO_DASHBOARD);
    (model as unknown as { signals: unknown[] }).signals = [];
    (model as unknown as { numerology: unknown[] }).numerology = [];
    (model as unknown as { reflections: unknown[] }).reflections = [];
    const html = renderToStaticMarkup(
      <PersonalDashboard state={{ status: "ready", model }} />,
    );
    expect(html).toContain("No configured category rules matched");
    expect(html).toContain("Numerology values are unavailable");
    expect(html).toContain("No deterministic interpretation is available");
  });

  it("fails closed on invalid display facts, category duplicates, and versions", () => {
    const invalidMoon = structuredClone(DEMO_DASHBOARD_SOURCE);
    (invalidMoon.moon as { illuminatedFraction: number }).illuminatedFraction =
      2;
    expect(() => toDashboardReadModel(invalidMoon)).toThrow(
      "invalid display facts",
    );

    const duplicate = structuredClone(DEMO_DASHBOARD_SOURCE);
    (duplicate.categories.scores as unknown as unknown[]).push(
      duplicate.categories.scores[0]!,
    );
    expect(() => toDashboardReadModel(duplicate)).toThrow("must be unique");

    const missingVersion = structuredClone(DEMO_DASHBOARD_SOURCE);
    (missingVersion.versions as { reading: string }).reading = "";
    expect(() => toDashboardReadModel(missingVersion)).toThrow(
      "versions are required",
    );

    const invalidDate = structuredClone(DEMO_DASHBOARD_SOURCE);
    (invalidDate as { localDate: string }).localDate = "not-a-date";
    expect(() => toDashboardReadModel(invalidDate)).toThrow(
      "Invalid local date",
    );
  });
});
