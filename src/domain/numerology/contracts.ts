export type NumerologyInputToken = Readonly<{
  source: string;
  normalized: string;
  value: number;
}>;

export type NumerologyTraceStep = Readonly<{
  operation: string;
  inputs: readonly (number | string)[];
  result: number;
}>;

export interface NumerologyResult {
  value: number;
  masterNumber: boolean;
  tokens: readonly NumerologyInputToken[];
  trace: readonly NumerologyTraceStep[];
  strategyId: string;
  strategyVersion: string;
}

export interface NumerologyStrategy {
  readonly id: string;
  readonly version: string;
  calculateLifePath(birthDate: string): NumerologyResult;
  calculateExpression(fullBirthName: string): NumerologyResult;
  calculateSoulUrge(fullBirthName: string): NumerologyResult;
  calculatePersonality(fullBirthName: string): NumerologyResult;
  calculateBirthday(birthDate: string): NumerologyResult;
  calculateMaturity(birthDate: string, fullBirthName: string): NumerologyResult;
  calculatePersonalYear(birthDate: string, year: number): NumerologyResult;
  calculatePersonalMonth(
    birthDate: string,
    year: number,
    month: number,
  ): NumerologyResult;
  calculatePersonalDay(birthDate: string, date: string): NumerologyResult;
}
