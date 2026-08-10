import { composeTimelineFacts } from "@/application/compose-timeline-facts";
import { PythagoreanNumerology } from "@/domain/numerology/pythagorean";
import {
  toNumerologyReadModel,
  type NumerologyPresentationSource,
} from "./numerology-read-model";

const strategy = new PythagoreanNumerology();
const birthDate = "1990-07-15";
const fullBirthName = "Pythagoras";

export const DEMO_NUMEROLOGY_SOURCE: NumerologyPresentationSource = {
  fullBirthName,
  birthDate,
  strategyId: strategy.id,
  strategyVersion: strategy.version,
  core: {
    "life-path": strategy.calculateLifePath(birthDate),
    expression: strategy.calculateExpression(fullBirthName),
    "soul-urge": strategy.calculateSoulUrge(fullBirthName),
    personality: strategy.calculatePersonality(fullBirthName),
    birthday: strategy.calculateBirthday(birthDate),
    maturity: strategy.calculateMaturity(birthDate, fullBirthName),
  },
  timeline: composeTimelineFacts(
    {
      interval: {
        startInstant: "2000-01-01T00:00:00Z",
        endInstant: "2000-02-03T00:00:00Z",
      },
      transitEvents: [],
      lunarEvents: [],
      stationEvents: [],
      numerology: {
        birthDate,
        boundaries: [
          boundary("personal-year", "2000-01-01", "2000-01-01T05:00:00Z"),
          boundary("personal-month", "2000-02-01", "2000-02-01T05:00:00Z"),
          boundary("personal-day", "2000-02-02", "2000-02-02T05:00:00Z"),
        ],
      },
    },
    strategy,
  ),
};

export const DEMO_NUMEROLOGY = toNumerologyReadModel(DEMO_NUMEROLOGY_SOURCE);

function boundary(
  kind: "personal-year" | "personal-month" | "personal-day",
  localDate: string,
  instant: string,
) {
  return {
    kind,
    localDate,
    instant,
    timezone: "America/Toronto",
    timezoneSource: "local deterministic demo boundary",
  } as const;
}
