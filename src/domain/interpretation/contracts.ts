export const INTERPRETATION_TEMPLATE_KEYS = [
  "natal-placement",
  "natal-aspect",
  "transit-aspect",
  "lunar-phase",
  "personal-lunar-aspect",
  "numerology-value",
] as const;

export type InterpretationTemplateKey =
  (typeof INTERPRETATION_TEMPLATE_KEYS)[number];
export type InterpretationTradition = "astrology" | "numerology";
export type InterpretationParameterValue = string | number | boolean;

export interface InterpretationProjection {
  readonly key: string;
  readonly templateKey: InterpretationTemplateKey;
  readonly sourceFactId: string;
  readonly tradition: InterpretationTradition;
  readonly parameters: Readonly<Record<string, InterpretationParameterValue>>;
}

export interface InterpretationTemplate {
  readonly key: InterpretationTemplateKey;
  readonly tradition: InterpretationTradition;
  readonly parameters: readonly string[];
  /** A factual statement only; no inferred meaning or advice. */
  readonly factTemplate: string;
  /** Tradition-framed reflection copy; never a factual or directive claim. */
  readonly interpretationTemplate: string;
}

export type InterpretationResolution =
  | Readonly<{
      supported: true;
      template: InterpretationTemplate;
    }>
  | Readonly<{
      supported: false;
      templateKey: string;
      reason: "unsupported-key";
    }>;

export interface InterpretationLibrary {
  readonly id: string;
  readonly version: string;
  readonly locale: string;
  resolve(templateKey: string): InterpretationResolution;
}
