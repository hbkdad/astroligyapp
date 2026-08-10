import { DeterministicInterpretationLibrary } from "./library";

export const PUBLIC_INTERPRETATION_LIBRARY_ID = "public-reflection-en-ca";
export const PUBLIC_INTERPRETATION_LIBRARY_VERSION = "1.0.0";

export const PUBLIC_INTERPRETATION_LIBRARY =
  new DeterministicInterpretationLibrary({
    id: PUBLIC_INTERPRETATION_LIBRARY_ID,
    version: PUBLIC_INTERPRETATION_LIBRARY_VERSION,
    locale: "en-CA",
    templates: [
      {
        key: "public-sun-sign-transit",
        tradition: "astrology",
        parameters: [
          "date",
          "sunSign",
          "targetLongitudeDegrees",
          "transitingBody",
          "aspectType",
          "orbDegrees",
        ],
        factTemplate:
          "On {date}, the shared-sky {transitingBody} position is {aspectType} the public {sunSign} model point at {targetLongitudeDegrees} tropical degrees, with an orb of {orbDegrees} degrees.",
        interpretationTemplate:
          "Within astrology traditions, this shared transit is used as a general reflection prompt for {sunSign}; it is not an individualized forecast.",
      },
      {
        key: "public-lunar-context",
        tradition: "astrology",
        parameters: [
          "date",
          "sunSign",
          "phase",
          "moonSign",
          "phaseAngleDegrees",
          "approximateIlluminatedFraction",
        ],
        factTemplate:
          "On {date}, the shared Moon phase is {phase} at {phaseAngleDegrees} degrees in {moonSign}, with approximate illuminated fraction {approximateIlluminatedFraction}; this same lunar fact is included for the public {sunSign} reading.",
        interpretationTemplate:
          "Within astrology traditions, this shared lunar context is used as a general reflection prompt for {sunSign}; it is not individualized.",
      },
    ],
  });
