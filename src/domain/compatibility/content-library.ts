import {
  COMPATIBILITY_CATEGORY_IDS,
  COMPATIBILITY_FACT_CONTENT_KEYS,
  COMPATIBILITY_REFLECTION_TONES,
  type CompatibilityFactContentKey,
  type CompatibilityReflectionContentKey,
} from "@/application/project-compatibility-content";

export const COMPATIBILITY_CONTENT_LIBRARY_ID =
  "compatibility-reflection-en-ca";
export const COMPATIBILITY_CONTENT_LIBRARY_VERSION = "1.0.0";
export const COMPATIBILITY_CONTENT_LOCALE = "en-CA";

export interface CompatibilityContentTemplate {
  readonly key: CompatibilityFactContentKey | CompatibilityReflectionContentKey;
  readonly section: "fact" | "reflection";
  readonly parameters: readonly string[];
  readonly text: string;
}

export type CompatibilityTemplateResolution =
  | Readonly<{ supported: true; template: CompatibilityContentTemplate }>
  | Readonly<{
      supported: false;
      key: string;
      reason: "unsupported-key";
    }>;

export interface CompatibilityContentLibrary {
  readonly id: string;
  readonly version: string;
  readonly locale: string;
  resolve(key: string): CompatibilityTemplateResolution;
}

const FACT_PARAMETER_SCHEMAS: Readonly<
  Record<CompatibilityFactContentKey, readonly string[]>
> = Object.freeze({
  "compatibility.fact.phase-one-pair": [
    "fact",
    "firstValue",
    "secondValue",
    "equal",
  ],
  "compatibility.fact.phase-one-numerology-pair": [
    "fact",
    "firstValue",
    "secondValue",
    "equal",
    "masterNumberCount",
  ],
  "compatibility.fact.synastry-aspect": [
    "firstBody",
    "secondBody",
    "aspectType",
    "orbDegrees",
    "phase",
    "normalizedStrength",
  ],
  "compatibility.fact.house-overlay": ["sourceBody", "targetHouseNumber"],
});

const REFLECTION_PARAMETERS = [
  "categoryId",
  "tone",
  "impact",
  "confidence",
] as const;

const UNSAFE_CLAIMS = [
  /\b(?:will|guaranteed|certain(?:ly)?|destined|fated|soulmate)\b/i,
  /\b(?:should|must|need to)\s+(?:marry|leave|stay|divorce|end)\b/i,
  /\b(?:perfect match|relationship (?:will|must)|scientifically proven)\b/i,
] as const;

export class DeterministicCompatibilityContentLibrary implements CompatibilityContentLibrary {
  readonly id: string;
  readonly version: string;
  readonly locale: string;
  private readonly templates: ReadonlyMap<string, CompatibilityContentTemplate>;

  constructor(options: {
    id: string;
    version: string;
    locale: string;
    templates: readonly CompatibilityContentTemplate[];
  }) {
    validateText(options.id);
    validateText(options.version);
    validateText(options.locale);
    const templates = new Map<string, CompatibilityContentTemplate>();
    for (const template of options.templates) {
      validateCompatibilityContentTemplate(template);
      if (templates.has(template.key))
        throw new RangeError("Duplicate template key");
      templates.set(
        template.key,
        Object.freeze({
          ...template,
          parameters: Object.freeze([...template.parameters]),
        }),
      );
    }
    this.id = options.id;
    this.version = options.version;
    this.locale = options.locale;
    this.templates = templates;
  }

  resolve(key: string): CompatibilityTemplateResolution {
    const template = this.templates.get(key);
    return template
      ? { supported: true, template }
      : { supported: false, key, reason: "unsupported-key" };
  }
}

export const DEFAULT_COMPATIBILITY_CONTENT_LIBRARY =
  new DeterministicCompatibilityContentLibrary({
    id: COMPATIBILITY_CONTENT_LIBRARY_ID,
    version: COMPATIBILITY_CONTENT_LIBRARY_VERSION,
    locale: COMPATIBILITY_CONTENT_LOCALE,
    templates: [
      factTemplate(
        "compatibility.fact.phase-one-pair",
        "Calculated {fact} values are {firstValue} and {secondValue}; equality is {equal}.",
      ),
      factTemplate(
        "compatibility.fact.phase-one-numerology-pair",
        "Calculated {fact} values are {firstValue} and {secondValue}; equality is {equal}, with master-number count {masterNumberCount}.",
      ),
      factTemplate(
        "compatibility.fact.synastry-aspect",
        "Calculated cross-chart aspect: {firstBody} is {aspectType} {secondBody}, with orb {orbDegrees} degrees, phase {phase}, and normalized strength {normalizedStrength}.",
      ),
      factTemplate(
        "compatibility.fact.house-overlay",
        "Calculated cross-chart house overlay: {sourceBody} falls in house {targetHouseNumber}.",
      ),
      ...COMPATIBILITY_CATEGORY_IDS.flatMap((categoryId) =>
        COMPATIBILITY_REFLECTION_TONES.map((tone) => ({
          key: `compatibility.reflection.${categoryId}.${tone}` as CompatibilityReflectionContentKey,
          section: "reflection" as const,
          parameters: REFLECTION_PARAMETERS,
          text: `Within astrology and numerology traditions, this configured {categoryId} factor is a {tone} reflection prompt; product impact is {impact} with confidence {confidence}.`,
        })),
      ),
    ],
  });

export function validateCompatibilityContentTemplate(
  template: CompatibilityContentTemplate,
): void {
  const factKey = COMPATIBILITY_FACT_CONTENT_KEYS.includes(
    template.key as never,
  );
  const reflectionKey =
    /^compatibility\.reflection\.(attraction|communication|emotional|long-term|chemistry)\.(supportive|challenging|neutral)$/.test(
      template.key,
    );
  if (!factKey && !reflectionKey)
    throw new RangeError("Unsupported template key");
  if (
    template.section !== (factKey ? "fact" : "reflection") ||
    !sameValue(
      template.parameters,
      factKey
        ? FACT_PARAMETER_SCHEMAS[template.key as CompatibilityFactContentKey]
        : REFLECTION_PARAMETERS,
    )
  )
    throw new RangeError("Template parameter schema is invalid");
  validateTemplateText(template.text, template.parameters);
  if (
    template.section === "reflection" &&
    !template.text.startsWith("Within astrology and numerology traditions,")
  )
    throw new RangeError("Reflection lacks tradition framing");
  if (UNSAFE_CLAIMS.some((pattern) => pattern.test(template.text)))
    throw new RangeError("Template contains an unsafe relationship claim");
  if (
    template.section === "fact" &&
    /\b(?:means?|suggests?|indicates?|predicts?|compatible|incompatible)\b/i.test(
      template.text,
    )
  )
    throw new RangeError("Fact template contains interpretation");
}

function factTemplate(
  key: CompatibilityFactContentKey,
  text: string,
): CompatibilityContentTemplate {
  return {
    key,
    section: "fact",
    parameters: FACT_PARAMETER_SCHEMAS[key],
    text,
  };
}

function validateTemplateText(
  text: string,
  parameters: readonly string[],
): void {
  if (!text.trim() || text.length > 512 || /[\r\n<>]/.test(text))
    throw new RangeError("Template text is invalid");
  const placeholders = [...text.matchAll(/\{([^}]+)\}/g)].map(
    (match) => match[1],
  );
  if (
    /[{}]/.test(text.replace(/\{[^}]+\}/g, "")) ||
    placeholders.some(
      (parameter) => !parameter || !parameters.includes(parameter),
    ) ||
    parameters.some((parameter) => !placeholders.includes(parameter))
  )
    throw new RangeError("Template placeholders are invalid");
}

function validateText(value: string): void {
  if (!value.trim() || value.length > 128 || /[\r\n<>]/.test(value))
    throw new RangeError("Library metadata is invalid");
}

function sameValue(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}
