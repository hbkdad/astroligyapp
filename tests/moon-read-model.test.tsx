import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import { MoonView } from "@/components/moon-view";
import {
  getDemoMoon,
  getDemoMoonSource,
  type DemoMoonSource,
} from "@/presentation/moon-demo";
import {
  MOON_READ_MODEL_VERSION,
  toMoonReadModel,
  type MoonReadModel,
} from "@/presentation/moon-read-model";

let source: DemoMoonSource;
let model: MoonReadModel;

beforeAll(async () => {
  [source, model] = await Promise.all([getDemoMoonSource(), getDemoMoon()]);
});

describe("Moon presentation boundary", () => {
  it("maps validated current and upcoming lunar facts into a frozen model", () => {
    expect(model).toMatchObject({
      version: MOON_READ_MODEL_VERSION,
      title: "Waning Crescent Moon in Scorpio",
      effectiveAt: "2000-01-01T12:00:00Z",
      effectiveLabel: "January 1, 2000 at 12:00 UTC",
      current: {
        phase: "Waning Crescent",
        sign: "Scorpio",
        illumination: expect.stringContaining("approximate geometry"),
        age: expect.stringContaining("estimated"),
        trend: "Waning",
      },
    });
    expect(model.upcoming).toHaveLength(5);
    expect(model.upcoming.map((event) => event.type)).toContain("Sign ingress");
    expect(model.upcoming.map((event) => event.title)).toEqual(
      expect.arrayContaining([
        "New Moon",
        "First Quarter",
        "Full Moon",
        "Third Quarter",
      ]),
    );
    expect(Object.isFrozen(model)).toBe(true);
    expect(Object.isFrozen(model.upcoming)).toBe(true);
  });

  it("preserves personal aspect IDs and calculation/search versions", () => {
    expect(
      model.aspects.every((aspect) => aspect.id.startsWith("personal-lunar:")),
    ).toBe(true);
    expect(model.trace).toEqual(
      expect.arrayContaining([
        { label: "Personal lunar snapshot", value: "1.0.0" },
        { label: "Lunar phase engine", value: "1.0.0" },
        { label: "Lunar event search", value: "1.0.0" },
        { label: "Timeline composition", value: "1.0.0" },
      ]),
    );
  });

  it("renders current facts, personal aspects, event table, and honest rise/set omission", () => {
    const html = renderToStaticMarkup(
      <MoonView state={{ status: "ready", model }} />,
    );
    expect(html).toContain('<main id="moon-content"');
    expect(html).toContain('aria-label="Upcoming Moon events table"');
    expect(html).toContain("approximate geometry");
    expect(html).toContain("mean cycle (estimated)");
    expect(html).toContain("Moonrise and moonset unavailable");
    expect(html).toContain("does not substitute plausible-looking times");
    expect(html).toContain(
      "event instants come only from refined provider observations",
    );
    expect(html).toContain('dateTime="2000-');
  });

  it.each([
    { status: "loading" as const },
    { status: "unavailable" as const, message: "Lunar event unavailable." },
    { status: "locked" as const, message: "Sign in to continue." },
    { status: "error" as const, message: "Provider result unavailable." },
  ])("renders the $status state deliberately", (state) => {
    const html = renderToStaticMarkup(<MoonView state={state} />);
    expect(html).toContain(state.status === "loading" ? "polite" : "assertive");
    expect(html).not.toContain("undefined");
  });

  it("renders deliberate empty aspect and event states", () => {
    const empty = structuredClone(model);
    (empty as unknown as { aspects: unknown[] }).aspects = [];
    (empty as unknown as { upcoming: unknown[] }).upcoming = [];
    const html = renderToStaticMarkup(
      <MoonView state={{ status: "ready", model: empty }} />,
    );
    expect(html).toContain("No configured major Moon-to-natal aspects");
    expect(html).toContain("No refined lunar events are available");
  });

  it("fails closed on snapshot version, geometry, aspect, and event ordering corruption", () => {
    const version = structuredClone(source);
    (
      version.snapshot.provenance as { personalLunarVersion: string }
    ).personalLunarVersion = "wrong";
    expect(() => toMoonReadModel(version.snapshot, version.timeline)).toThrow(
      "Invalid personal lunar snapshot",
    );

    const geometry = structuredClone(source);
    (
      geometry.snapshot.phase as { approximateIlluminatedFraction: number }
    ).approximateIlluminatedFraction = 2;
    expect(() => toMoonReadModel(geometry.snapshot, geometry.timeline)).toThrow(
      "Invalid personal lunar snapshot",
    );

    const aspect = structuredClone(source);
    if (!aspect.snapshot.natalAspects[0]) return;
    (
      aspect.snapshot.natalAspects[0] as { transitingBody: string }
    ).transitingBody = "sun";
    expect(() => toMoonReadModel(aspect.snapshot, aspect.timeline)).toThrow(
      "Invalid personal lunar snapshot",
    );

    const ordering = structuredClone(source);
    (ordering.timeline.facts as unknown as unknown[]).reverse();
    expect(() => toMoonReadModel(ordering.snapshot, ordering.timeline)).toThrow(
      "chronological",
    );
  });
});
