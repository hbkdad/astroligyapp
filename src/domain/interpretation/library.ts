import {
  INTERPRETATION_TEMPLATE_KEYS,
  type InterpretationLibrary,
  type InterpretationResolution,
  type InterpretationTemplate,
  type InterpretationTemplateKey,
} from "./contracts";

export const DEFAULT_INTERPRETATION_LIBRARY_ID = "personal-reflection-en-ca";
export const DEFAULT_INTERPRETATION_LIBRARY_VERSION = "1.1.0";

const FACTUAL_INFERENCE_PATTERN =
  /\b(?:means?|suggests?|indicates?|predicts?|lucky|unlucky|destined)\b/i;
const UNSAFE_DIRECTIVE_PATTERNS = [
  /\b(?:will|guaranteed|certain(?:ly)?)\b/i,
  /\b(?:diagnose|diagnosis|cure|treat|treatment|medication)\b/i,
  /\b(?:medical|financial|legal|safety)\s+(?:decision|directive|advice|recommendation)\b/i,
  /\b(?:buy|sell|invest|borrow|gamble)\b/i,
  /\b(?:legal action|lawsuit|plead guilty|sign the contract)\b/i,
  /\b(?:ignore|bypass|disable)\s+(?:a\s+)?(?:warning|doctor|lawyer|safety|alarm)\b/i,
  /\b(?:leave|marry|divorce|end)\s+(?:your\s+)?(?:partner|relationship|marriage)\b/i,
  /\b(?:must|should|need to)\s+(?:act|decide|stop|start|take|avoid|leave|marry|divorce)\b/i,
] as const;

export class DeterministicInterpretationLibrary implements InterpretationLibrary {
  readonly id: string;
  readonly version: string;
  readonly locale: string;
  private readonly templates: ReadonlyMap<
    InterpretationTemplateKey,
    InterpretationTemplate
  >;

  constructor(options: {
    id: string;
    version: string;
    locale: string;
    templates: readonly InterpretationTemplate[];
  }) {
    validateIdentifier(options.id, "Library ID");
    validateIdentifier(options.version, "Library version");
    validateIdentifier(options.locale, "Library locale");
    const templates = new Map<
      InterpretationTemplateKey,
      InterpretationTemplate
    >();
    for (const template of options.templates) {
      validateInterpretationTemplate(template);
      if (templates.has(template.key)) {
        throw new RangeError(
          `Duplicate interpretation template ${template.key}`,
        );
      }
      templates.set(template.key, freezeTemplate(template));
    }
    this.id = options.id;
    this.version = options.version;
    this.locale = options.locale;
    this.templates = templates;
  }

  resolve(templateKey: string): InterpretationResolution {
    const template = this.templates.get(
      templateKey as InterpretationTemplateKey,
    );
    return template
      ? { supported: true, template }
      : { supported: false, templateKey, reason: "unsupported-key" };
  }
}

export const DEFAULT_INTERPRETATION_LIBRARY =
  new DeterministicInterpretationLibrary({
    id: DEFAULT_INTERPRETATION_LIBRARY_ID,
    version: DEFAULT_INTERPRETATION_LIBRARY_VERSION,
    locale: "en-CA",
    templates: [
      {
        key: "natal-placement",
        tradition: "astrology",
        parameters: ["body", "sign", "degreeWithinSign", "houseNumber"],
        factTemplate:
          "{body} is at {degreeWithinSign} degrees in {sign}, house {houseNumber}.",
        interpretationTemplate:
          "Within astrology traditions, this placement is used as a prompt to reflect on themes associated with {body}, {sign}, and house {houseNumber}.",
      },
      {
        key: "natal-aspect",
        tradition: "astrology",
        parameters: ["firstBody", "aspectType", "secondBody", "orbDegrees"],
        factTemplate:
          "{firstBody} is {aspectType} {secondBody} with an orb of {orbDegrees} degrees.",
        interpretationTemplate:
          "Within astrology traditions, this natal aspect is used as a prompt to reflect on how the themes associated with {firstBody} and {secondBody} interact.",
      },
      {
        key: "transit-aspect",
        tradition: "astrology",
        parameters: [
          "transitingBody",
          "aspectType",
          "targetLabel",
          "orbDegrees",
          "phase",
        ],
        factTemplate:
          "{transitingBody} is {aspectType} {targetLabel} with an orb of {orbDegrees} degrees and is {phase}.",
        interpretationTemplate:
          "Within astrology traditions, this transit is used as a prompt to reflect on the themes associated with {transitingBody} and {targetLabel}.",
      },
      {
        key: "lunar-phase",
        tradition: "astrology",
        parameters: [
          "phase",
          "moonSign",
          "phaseAngleDegrees",
          "approximateIlluminatedFraction",
        ],
        factTemplate:
          "The Moon phase is {phase} at {phaseAngleDegrees} degrees, in {moonSign}, with approximate illuminated fraction {approximateIlluminatedFraction}.",
        interpretationTemplate:
          "Within astrology traditions, this lunar phase and sign are used as prompts for personal reflection.",
      },
      {
        key: "personal-lunar-aspect",
        tradition: "astrology",
        parameters: ["aspectType", "targetLabel", "orbDegrees", "phase"],
        factTemplate:
          "The Moon is {aspectType} {targetLabel} with an orb of {orbDegrees} degrees and is {phase}.",
        interpretationTemplate:
          "Within astrology traditions, this Moon-to-natal aspect is used as a short-term reflection prompt.",
      },
      {
        key: "numerology-value",
        tradition: "numerology",
        parameters: [
          "numerologyKey",
          "value",
          "masterNumber",
          "strategyId",
          "strategyVersion",
        ],
        factTemplate:
          "{numerologyKey} is {value}; master-number status is {masterNumber}, calculated by {strategyId} version {strategyVersion}.",
        interpretationTemplate:
          "Within numerology traditions, this value is used as a prompt for personal reflection.",
      },
    ],
  });

export function validateInterpretationTemplate(
  template: InterpretationTemplate,
): void {
  if (!INTERPRETATION_TEMPLATE_KEYS.includes(template.key)) {
    throw new RangeError("Unsupported interpretation template key");
  }
  if (
    (template.tradition !== "astrology" &&
      template.tradition !== "numerology") ||
    template.parameters.length === 0 ||
    new Set(template.parameters).size !== template.parameters.length
  ) {
    throw new RangeError(`Invalid interpretation template ${template.key}`);
  }
  for (const parameter of template.parameters) {
    if (!/^[a-z][A-Za-z0-9]*$/.test(parameter)) {
      throw new RangeError(`Invalid template parameter ${parameter}`);
    }
  }
  validateTemplateText(template.factTemplate, "fact", template.parameters);
  validateTemplateText(
    template.interpretationTemplate,
    "interpretation",
    template.parameters,
  );
  if (FACTUAL_INFERENCE_PATTERN.test(template.factTemplate)) {
    throw new RangeError("Fact template contains interpretive language");
  }
  const requiredFraming = `Within ${template.tradition}`;
  if (!template.interpretationTemplate.startsWith(requiredFraming)) {
    throw new RangeError(
      "Interpretation template must identify its tradition framing",
    );
  }
  if (
    UNSAFE_DIRECTIVE_PATTERNS.some((pattern) =>
      pattern.test(template.interpretationTemplate),
    )
  ) {
    throw new RangeError("Interpretation template contains an unsafe claim");
  }
}

function validateTemplateText(
  text: string,
  section: "fact" | "interpretation",
  parameters: readonly string[],
): void {
  if (
    !text.trim() ||
    text.length > 512 ||
    /[\r\n<>]/.test(text) ||
    /[{}]/.test(text.replace(/\{[^}]+\}/g, "")) ||
    [...text.matchAll(/\{([^}]+)\}/g)].some(
      ([, parameter]) =>
        parameter === undefined || !parameters.includes(parameter),
    )
  ) {
    throw new RangeError(`Invalid ${section} template text`);
  }
  const used = new Set(
    [...text.matchAll(/\{([^}]+)\}/g)].flatMap(([, parameter]) =>
      parameter === undefined ? [] : [parameter],
    ),
  );
  if (
    section === "fact" &&
    parameters.some((parameter) => !used.has(parameter))
  ) {
    throw new RangeError("Fact template must expose every declared parameter");
  }
}

function freezeTemplate(
  template: InterpretationTemplate,
): InterpretationTemplate {
  return Object.freeze({
    ...template,
    parameters: Object.freeze([...template.parameters]),
  });
}

function validateIdentifier(value: string, label: string): void {
  if (!value.trim() || value.length > 128 || /[\r\n]/.test(value)) {
    throw new RangeError(`${label} must contain 1 to 128 characters`);
  }
}
