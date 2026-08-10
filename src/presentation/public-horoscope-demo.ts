import {
  PublicDailyReadingEngine,
  type PublicDailyReadings,
} from "@/application/compose-public-daily-readings";
import type { ZodiacSign } from "@/domain/astro/zodiac";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import {
  toPublicHoroscopeReadModel,
  type PublicHoroscopeReadModel,
} from "./public-horoscope-read-model";

export const PUBLIC_HOROSCOPE_DEMO_DATE = "2000-01-01";

let cachedAggregate: Promise<PublicDailyReadings> | undefined;
const cachedModels = new Map<ZodiacSign, Promise<PublicHoroscopeReadModel>>();

export function getDemoPublicDailyReadings(): Promise<PublicDailyReadings> {
  cachedAggregate ??= buildDemoAggregate();
  return cachedAggregate;
}

export function getDemoPublicHoroscope(
  sign: ZodiacSign,
): Promise<PublicHoroscopeReadModel> {
  const existing = cachedModels.get(sign);
  if (existing) return existing;
  const model = getDemoPublicDailyReadings().then((source) =>
    toPublicHoroscopeReadModel(source, sign),
  );
  cachedModels.set(sign, model);
  return model;
}

async function buildDemoAggregate(): Promise<PublicDailyReadings> {
  const result = await new PublicDailyReadingEngine(
    new AstronomyEngineProvider(),
  ).calculate({ date: PUBLIC_HOROSCOPE_DEMO_DATE });
  if (!result.ok)
    throw new Error("Local public horoscope demo calculation failed");
  return result.value;
}
