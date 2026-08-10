import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PublicDailyReadingEngine } from "@/application/compose-public-daily-readings";
import {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
  revalidate,
} from "@/app/horoscope/[sign]/page";
import { PublicHoroscopeView } from "@/components/public-horoscope-view";
import { ZODIAC_SIGNS, type ZodiacSign } from "@/domain/astro/zodiac";
import { DeterministicInterpretationLibrary } from "@/domain/interpretation/library";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import {
  getDemoPublicDailyReadings,
  getDemoPublicHoroscope,
} from "@/presentation/public-horoscope-demo";
import {
  PUBLIC_HOROSCOPE_READ_MODEL_VERSION,
  isPublicHoroscopeSign,
  toPublicHoroscopeReadModel,
  type PublicHoroscopeReadModel,
} from "@/presentation/public-horoscope-read-model";

let models: PublicHoroscopeReadModel[];

beforeAll(async () => {
  models = await Promise.all(ZODIAC_SIGNS.map(getDemoPublicHoroscope));
});

describe("public horoscope presentation boundary", () => {
  it("maps all twelve sign models in canonical order without losing fact coverage", async () => {
    const source = await getDemoPublicDailyReadings();
    expect(models.map((model) => model.sign)).toEqual(ZODIAC_SIGNS);
    models.forEach((model, index) => {
      expect(model).toMatchObject({
        version: PUBLIC_HOROSCOPE_READ_MODEL_VERSION,
        sourceVersion: source.version,
        sign: ZODIAC_SIGNS[index],
        date: "2000-01-01",
        dateLabel: "January 1, 2000",
        effectiveAt: "2000-01-01T12:00:00Z",
        sampleLabel: "Shared sky sampled at 12:00 UTC",
      });
      expect(model.items.map((item) => item.id)).toEqual(
        source.readings[index]!.facts.map((fact) => fact.id),
      );
      expect(model.items[0]).toMatchObject({ kind: "lunar" });
      expect(model.signNavigation).toHaveLength(12);
      expect(
        model.signNavigation
          .filter((item) => item.current)
          .map((item) => item.sign),
      ).toEqual([model.sign]);
      expect(Object.isFrozen(model)).toBe(true);
      expect(Object.isFrozen(model.items)).toBe(true);
    });
  });

  it("preserves exact fact/reflection separation and complete source versions", () => {
    const model = models[0]!;
    expect(model.items.every((item) => item.status === "rendered")).toBe(true);
    for (const item of model.items) {
      if (item.status !== "rendered") continue;
      expect(item.factText).not.toBe(item.reflectionText);
      expect(item.reflectionText).toMatch(/^Within astrology traditions,/);
      expect(item.reflectionText).toMatch(/not (?:an )?individualized/);
      expect(item.sourceReference).toBe(item.id);
    }
    expect(model.trace).toEqual(
      expect.arrayContaining([
        { label: "Public aggregate", value: "1.0.0" },
        { label: "Lunar engine", value: "1.0.0" },
        { label: "Aspect policy", value: "major-aspects 1.0.0" },
        { label: "Interpretation projection", value: "1.0.0" },
        { label: "Renderer", value: "1.0.0" },
      ]),
    );
    expect(model.disclaimer).toContain("not an individualized prediction");
  });

  it("renders semantic navigation, separated copy, trace, and claims disclosure", () => {
    const model = models[0]!;
    const html = renderToStaticMarkup(
      <PublicHoroscopeView state={{ status: "ready", model }} />,
    );
    expect(html).toContain('<main id="horoscope-content"');
    expect(html).toContain('aria-label="Public horoscope signs"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain("Calculated facts and reflections");
    expect(html).toContain("Calculated fact");
    expect(html).toContain("Tradition-framed reflection");
    expect(html).toContain("On 2000-01-01");
    expect(html).toContain("Historical local demo");
    expect(html).toContain("intentionally excluded from search indexing");
    expect(html).toContain("performs no ephemeris");
    for (const item of model.items) expect(html).toContain(item.id);
  });

  it("labels the current UTC route mode without changing the immutable model", () => {
    const html = renderToStaticMarkup(
      <PublicHoroscopeView
        state={{ status: "ready", model: models[0]! }}
        deliveryMode="current-preview"
      />,
    );
    expect(html).toContain("No-index current preview");
    expect(html).toContain("Current UTC preview");
    expect(html).toContain("regenerated on a bounded schedule");
    expect(html).not.toContain("Historical local demo");
  });

  it.each([
    { status: "loading" as const },
    { status: "unavailable" as const, message: "No shared sky is available." },
    { status: "error" as const, message: "The local demo failed." },
  ])("renders the $status state deliberately", (state) => {
    const html = renderToStaticMarkup(<PublicHoroscopeView state={state} />);
    expect(html).toContain("<main");
    expect(html).toContain(state.status === "loading" ? "polite" : "assertive");
    expect(html).not.toContain("undefined");
  });

  it("renders deliberate empty and unsupported-template states", async () => {
    const emptyModel = structuredClone(models[0]!);
    (emptyModel as unknown as { items: unknown[] }).items = [];
    expect(
      renderToStaticMarkup(
        <PublicHoroscopeView state={{ status: "ready", model: emptyModel }} />,
      ),
    ).toContain("No public facts are available");

    const library = new DeterministicInterpretationLibrary({
      id: "empty-public-view-fixture",
      version: "1.0.0",
      locale: "en-CA",
      templates: [],
    });
    const result = await new PublicDailyReadingEngine(
      new AstronomyEngineProvider(),
      library,
    ).calculate({ date: "2000-01-01" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const unsupported = toPublicHoroscopeReadModel(result.value, "aries");
    expect(
      unsupported.items.every((item) => item.status === "unsupported"),
    ).toBe(true);
    expect(
      renderToStaticMarkup(
        <PublicHoroscopeView state={{ status: "ready", model: unsupported }} />,
      ),
    ).toContain("No deterministic interpretation is available");
  });

  it("publishes exactly twelve static, no-index route variants", async () => {
    expect(dynamicParams).toBe(false);
    expect(revalidate).toBe(900);
    expect(generateStaticParams()).toEqual(
      ZODIAC_SIGNS.map((sign) => ({ sign })),
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ sign: "aries" }),
    });
    expect(metadata).toMatchObject({
      title: "Aries Daily Sky Reflection",
      description: expect.stringContaining("current UTC preview"),
      robots: { index: false, follow: false, noarchive: true },
    });
    expect(isPublicHoroscopeSign("aries")).toBe(true);
    expect(isPublicHoroscopeSign("ophiuchus")).toBe(false);
  });

  it("fails closed on aggregate, date, order, identity, target, and provenance corruption", async () => {
    const source = await getDemoPublicDailyReadings();

    const version = structuredClone(source);
    (version as { version: string }).version = "0.9.0";
    expect(() => toPublicHoroscopeReadModel(version, "aries")).toThrow(
      "Unsupported public daily aggregate",
    );

    const instant = structuredClone(source);
    (instant as { effectiveAt: string }).effectiveAt = "2000-01-01T00:00:00Z";
    expect(() => toPublicHoroscopeReadModel(instant, "aries")).toThrow(
      "Unsupported public daily aggregate",
    );

    const order = structuredClone(source);
    (order.readings as unknown as unknown[]).reverse();
    expect(() => toPublicHoroscopeReadModel(order, "aries")).toThrow(
      "coverage or ordering",
    );

    const target = structuredClone(source);
    (
      target.readings[0]!.target as { longitudeDegrees: number }
    ).longitudeDegrees = 16;
    expect(() => toPublicHoroscopeReadModel(target, "aries")).toThrow(
      "sign reading is inconsistent",
    );

    const duplicate = structuredClone(source);
    (duplicate.readings[1]!.facts[0] as { id: string }).id =
      duplicate.readings[0]!.facts[0]!.id;
    expect(() => toPublicHoroscopeReadModel(duplicate, "aries")).toThrow(
      "unique and sign scoped",
    );

    const provenance = structuredClone(source);
    const rendered = provenance.readings[0]!.rendered.items[0]!;
    if (rendered.status !== "rendered")
      throw new Error("Expected rendered item");
    (rendered.fact.provenance as { libraryVersion: string }).libraryVersion =
      "wrong";
    expect(() => toPublicHoroscopeReadModel(provenance, "aries")).toThrow(
      "provenance is inconsistent",
    );

    expect(() =>
      toPublicHoroscopeReadModel(source, "ophiuchus" as ZodiacSign),
    ).toThrow("Unsupported public horoscope sign");
  });

  it("fails closed on cross-version metadata and unsafe reflection corruption", async () => {
    const source = await getDemoPublicDailyReadings();
    const crossVersion = structuredClone(source);
    (
      crossVersion.metadata as { lunarEngineVersion: string }
    ).lunarEngineVersion = "2.0.0";
    expect(() => toPublicHoroscopeReadModel(crossVersion, "aries")).toThrow(
      "Unsupported public daily aggregate",
    );

    const claim = structuredClone(source);
    const rendered = claim.readings[0]!.rendered.items[0]!;
    if (rendered.status !== "rendered")
      throw new Error("Expected rendered item");
    (rendered.interpretation as { text: string }).text =
      "Within astrology traditions, this will definitely happen and is not individualized.";
    expect(() => toPublicHoroscopeReadModel(claim, "aries")).toThrow(
      "rendered claims are invalid",
    );
  });
});
