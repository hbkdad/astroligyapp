import type { NumerologyContext } from "./compose-personal-context";
import { PythagoreanNumerology } from "@/domain/numerology/pythagorean";

export function buildNumerologyContext(
  birthDate: string,
  birthName: string,
  effectiveDate: string,
  strategy = new PythagoreanNumerology(),
): NumerologyContext {
  const [year, month] = effectiveDate.split("-").map(Number);
  return Object.freeze({
    effectiveDate,
    results: Object.freeze({
      "life-path": strategy.calculateLifePath(birthDate),
      expression: strategy.calculateExpression(birthName),
      "soul-urge": strategy.calculateSoulUrge(birthName),
      personality: strategy.calculatePersonality(birthName),
      birthday: strategy.calculateBirthday(birthDate),
      maturity: strategy.calculateMaturity(birthDate, birthName),
      "personal-year": strategy.calculatePersonalYear(birthDate, year!),
      "personal-month": strategy.calculatePersonalMonth(
        birthDate,
        year!,
        month!,
      ),
      "personal-day": strategy.calculatePersonalDay(birthDate, effectiveDate),
    }),
  });
}
