import type {
  NumerologyInputToken,
  NumerologyResult,
  NumerologyStrategy,
  NumerologyTraceStep,
} from "./contracts";

export const PYTHAGOREAN_LETTER_VALUES: Readonly<Record<string, number>> =
  Object.freeze(
    Object.fromEntries(
      ["AJS", "BKT", "CLU", "DMV", "ENW", "FOX", "GPY", "HQZ", "IR"].flatMap(
        (letters, index) => [...letters].map((letter) => [letter, index + 1]),
      ),
    ),
  );

export type YVowelPolicy = "never" | "always";

export interface PythagoreanOptions {
  masterNumbers?: readonly number[];
  preserveMasterNumbers?: boolean;
  yVowelPolicy?: YVowelPolicy;
}

export class InvalidNumerologyInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNumerologyInputError";
  }
}

export class PythagoreanNumerology implements NumerologyStrategy {
  readonly id = "pythagorean";
  readonly version = "1.0.0";
  private readonly masters: ReadonlySet<number>;
  private readonly preserveMasters: boolean;
  private readonly yVowelPolicy: YVowelPolicy;

  constructor(options: PythagoreanOptions = {}) {
    const masterNumbers = options.masterNumbers ?? [11, 22, 33];
    if (
      masterNumbers.some(
        (value) => !Number.isSafeInteger(value) || value < 10,
      ) ||
      new Set(masterNumbers).size !== masterNumbers.length
    ) {
      throw new InvalidNumerologyInputError(
        "Master numbers must be unique positive multi-digit integers",
      );
    }
    this.masters = new Set(masterNumbers);
    this.preserveMasters = options.preserveMasterNumbers ?? true;
    this.yVowelPolicy = options.yVowelPolicy ?? "never";
  }

  calculateLifePath(birthDate: string): NumerologyResult {
    const date = parseDate(birthDate);
    const trace: NumerologyTraceStep[] = [];
    const month = this.reduce(date.month, "reduce-month", trace);
    const day = this.reduce(date.day, "reduce-day", trace);
    const year = this.reduce(date.year, "reduce-year", trace);
    const componentSum = month + day + year;
    trace.push({
      operation: "sum-date-components",
      inputs: [month, day, year],
      result: componentSum,
    });
    return this.result(
      this.reduce(componentSum, "reduce-life-path", trace),
      dateTokens(birthDate),
      trace,
    );
  }

  calculateExpression(fullBirthName: string): NumerologyResult {
    return this.calculateNameNumber(fullBirthName, "all", "expression");
  }

  calculateSoulUrge(fullBirthName: string): NumerologyResult {
    return this.calculateNameNumber(fullBirthName, "vowels", "soul-urge");
  }

  calculatePersonality(fullBirthName: string): NumerologyResult {
    return this.calculateNameNumber(fullBirthName, "consonants", "personality");
  }

  calculateBirthday(birthDate: string): NumerologyResult {
    const date = parseDate(birthDate);
    const trace: NumerologyTraceStep[] = [];
    return this.result(
      this.reduce(date.day, "reduce-birthday", trace),
      dateTokens(birthDate),
      trace,
    );
  }

  calculateMaturity(
    birthDate: string,
    fullBirthName: string,
  ): NumerologyResult {
    const lifePath = this.calculateLifePath(birthDate);
    const expression = this.calculateExpression(fullBirthName);
    const trace: NumerologyTraceStep[] = [
      ...lifePath.trace,
      ...expression.trace,
    ];
    const sum = lifePath.value + expression.value;
    trace.push({
      operation: "sum-life-path-expression",
      inputs: [lifePath.value, expression.value],
      result: sum,
    });
    return this.result(
      this.reduce(sum, "reduce-maturity", trace),
      [...lifePath.tokens, ...expression.tokens],
      trace,
    );
  }

  calculatePersonalYear(birthDate: string, year: number): NumerologyResult {
    const birth = parseDate(birthDate);
    assertYear(year);
    const trace: NumerologyTraceStep[] = [];
    const month = this.reduce(birth.month, "reduce-birth-month", trace);
    const day = this.reduce(birth.day, "reduce-birth-day", trace);
    const calendarYear = this.reduce(year, "reduce-calendar-year", trace);
    const sum = month + day + calendarYear;
    trace.push({
      operation: "sum-personal-year-components",
      inputs: [month, day, calendarYear],
      result: sum,
    });
    return this.result(
      this.reduce(sum, "reduce-personal-year", trace),
      dateTokens(`${birthDate}|${year}`),
      trace,
    );
  }

  calculatePersonalMonth(
    birthDate: string,
    year: number,
    month: number,
  ): NumerologyResult {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new InvalidNumerologyInputError("Month must be between 1 and 12");
    }
    const personalYear = this.calculatePersonalYear(birthDate, year);
    const trace = [...personalYear.trace];
    const sum = personalYear.value + month;
    trace.push({
      operation: "sum-personal-month-components",
      inputs: [personalYear.value, month],
      result: sum,
    });
    return this.result(
      this.reduce(sum, "reduce-personal-month", trace),
      [...personalYear.tokens, ...numberTokens(month)],
      trace,
    );
  }

  calculatePersonalDay(birthDate: string, date: string): NumerologyResult {
    const calendarDate = parseDate(date);
    const personalMonth = this.calculatePersonalMonth(
      birthDate,
      calendarDate.year,
      calendarDate.month,
    );
    const trace = [...personalMonth.trace];
    const sum = personalMonth.value + calendarDate.day;
    trace.push({
      operation: "sum-personal-day-components",
      inputs: [personalMonth.value, calendarDate.day],
      result: sum,
    });
    return this.result(
      this.reduce(sum, "reduce-personal-day", trace),
      [...personalMonth.tokens, ...dateTokens(date)],
      trace,
    );
  }

  private calculateNameNumber(
    name: string,
    selection: "all" | "vowels" | "consonants",
    operation: string,
  ): NumerologyResult {
    const allTokens = tokenizeName(name);
    const selected = allTokens.filter((token) => {
      if (selection === "all") return true;
      const isVowel =
        "AEIOU".includes(token.normalized) ||
        (token.normalized === "Y" && this.yVowelPolicy === "always");
      return selection === "vowels" ? isVowel : !isVowel;
    });
    if (selected.length === 0) {
      throw new InvalidNumerologyInputError(
        `Name has no supported ${selection === "all" ? "letters" : selection}`,
      );
    }
    const trace: NumerologyTraceStep[] = [];
    const sum = selected.reduce((total, token) => total + token.value, 0);
    trace.push({
      operation: `sum-${operation}-letters`,
      inputs: selected.map((token) => token.value),
      result: sum,
    });
    return this.result(
      this.reduce(sum, `reduce-${operation}`, trace),
      selected,
      trace,
    );
  }

  private reduce(
    initial: number,
    operation: string,
    trace: NumerologyTraceStep[],
  ): number {
    let value = initial;
    while (value > 9 && !(this.preserveMasters && this.masters.has(value))) {
      const digits = [...String(value)].map(Number);
      const reduced = digits.reduce((sum, digit) => sum + digit, 0);
      trace.push({ operation, inputs: digits, result: reduced });
      value = reduced;
    }
    if (value === initial) {
      trace.push({ operation, inputs: [initial], result: value });
    }
    return value;
  }

  private result(
    value: number,
    tokens: readonly NumerologyInputToken[],
    trace: readonly NumerologyTraceStep[],
  ): NumerologyResult {
    return {
      value,
      masterNumber: this.masters.has(value),
      tokens,
      trace,
      strategyId: this.id,
      strategyVersion: this.version,
    };
  }
}

function tokenizeName(name: string): readonly NumerologyInputToken[] {
  const tokens: NumerologyInputToken[] = [];
  for (const source of [...name]) {
    if (/^[\p{White_Space}\p{P}\p{M}]$/u.test(source)) continue;
    const normalized = source
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toUpperCase();
    if (!/^[A-Z]+$/.test(normalized)) {
      throw new InvalidNumerologyInputError(
        `Unsupported name character U+${source.codePointAt(0)!.toString(16).toUpperCase()}`,
      );
    }
    for (const letter of normalized) {
      tokens.push({
        source,
        normalized: letter,
        value: PYTHAGOREAN_LETTER_VALUES[letter]!,
      });
    }
  }
  if (tokens.length === 0) {
    throw new InvalidNumerologyInputError(
      "Name must contain at least one supported Latin letter",
    );
  }
  return tokens;
}

function parseDate(input: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!match) {
    throw new InvalidNumerologyInputError("Date must use YYYY-MM-DD");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1) {
    throw new InvalidNumerologyInputError(
      "Date year must be between 0001 and 9999",
    );
  }
  const instant = new Date(0);
  instant.setUTCHours(0, 0, 0, 0);
  instant.setUTCFullYear(year, month - 1, day);
  if (
    instant.getUTCFullYear() !== year ||
    instant.getUTCMonth() !== month - 1 ||
    instant.getUTCDate() !== day
  ) {
    throw new InvalidNumerologyInputError("Date is not a valid calendar day");
  }
  return { year, month, day };
}

function assertYear(year: number): void {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new InvalidNumerologyInputError("Year must be between 1 and 9999");
  }
}

function dateTokens(input: string): readonly NumerologyInputToken[] {
  return [...input]
    .filter((source) => /\d/.test(source))
    .map((source) => ({ source, normalized: source, value: Number(source) }));
}

function numberTokens(input: number): readonly NumerologyInputToken[] {
  return [...String(input)].map((source) => ({
    source,
    normalized: source,
    value: Number(source),
  }));
}
