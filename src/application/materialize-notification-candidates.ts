import type {
  PersonalTimelineAggregate,
  PersonalTimelineScope,
} from "./calculate-personal-timeline";
import type { TimelineFact } from "./compose-timeline-facts";
import type { ProviderMetadata } from "@/domain/astro/contracts";
import { resolveCivilTime } from "@/domain/time/civil-time";

export const NOTIFICATION_MATERIALIZATION_VERSION = "1.0.0";
export const NOTIFICATION_EVENT_TYPES = [
  "personal-transit",
  "primary-phase",
  "moon-sign-ingress",
  "planetary-station",
  "personal-year-boundary",
  "personal-month-boundary",
  "personal-day-boundary",
] as const;
export const NOTIFICATION_LEAD_MINUTES = [0, 60, 360, 1440] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];
export type NotificationLeadMinutes =
  (typeof NOTIFICATION_LEAD_MINUTES)[number];

export interface NotificationPreferenceFact {
  readonly preferenceId: string;
  readonly revision: number;
  readonly eventType: NotificationEventType;
  readonly timezone: string;
  readonly leadMinutes: NotificationLeadMinutes;
  readonly quietHours: Readonly<{
    start: string;
    end: string;
  }> | null;
}

export interface NotificationTimelineIdentity {
  readonly profileId: string;
  readonly profileRevision: number;
  readonly calculationRunId: string;
  readonly scope: PersonalTimelineScope;
  readonly engineVersion: string;
  readonly policyVersion: string;
  readonly provider: ProviderMetadata;
}

export interface NotificationCandidate {
  readonly eventReference: string;
  readonly eventType: NotificationEventType;
  readonly eventOccursAt: string;
  readonly scheduledAt: string;
  readonly preferenceId: string;
  readonly preferenceRevision: number;
  readonly materializationVersion: string;
  readonly identity: Readonly<{
    profileId: string;
    profileRevision: number;
    calculationRunId: string;
    preferenceId: string;
    preferenceRevision: number;
    preference: Readonly<{
      channel: "email";
      timezone: string;
      leadMinutes: NotificationLeadMinutes;
      quietHours: Readonly<{ start: string; end: string }> | null;
    }>;
    eventReference: string;
    eventType: NotificationEventType;
    eventOccursAt: string;
    scheduledAt: string;
    timeline: Readonly<{
      scope: PersonalTimelineScope;
      startInstant: string;
      endInstant: string;
      engineVersion: string;
      policyVersion: string;
      providerId: string;
      providerVersion: string;
      dataVersion: string;
      calculatedAt: string;
      timeScale: ProviderMetadata["timeScale"];
      referenceFrame: ProviderMetadata["referenceFrame"];
      zodiacReference: ProviderMetadata["zodiacReference"];
      coordinateOrigin: ProviderMetadata["coordinateOrigin"];
    }>;
  }>;
}

export type NotificationCandidateResult =
  | Readonly<{
      ok: true;
      candidates: readonly NotificationCandidate[];
      skippedPast: number;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "civil-time-unavailable" | "invalid-input";
        message: string;
      }>;
    }>;

export function materializeNotificationCandidates(
  timeline: PersonalTimelineAggregate,
  preferences: readonly NotificationPreferenceFact[],
  identity: NotificationTimelineIdentity,
): NotificationCandidateResult {
  try {
    validateInput(timeline, preferences, identity);
    const byType = new Map(preferences.map((item) => [item.eventType, item]));
    const candidates: NotificationCandidate[] = [];
    let skippedPast = 0;
    const effectiveAt = Date.parse(timeline.input.effectiveStartInstant);
    for (const fact of timeline.timeline.facts) {
      const preference = byType.get(fact.type);
      if (!preference) continue;
      const eventOccursAt = occurrenceInstant(fact);
      const eventEpoch = Date.parse(eventOccursAt);
      if (eventEpoch <= effectiveAt) {
        skippedPast += 1;
        continue;
      }
      const nominal = Math.max(
        effectiveAt,
        eventEpoch - preference.leadMinutes * 60_000,
      );
      const adjusted = adjustQuietHours(
        new Date(nominal).toISOString(),
        preference.timezone,
        preference.quietHours,
      );
      if (!adjusted.ok) return adjusted;
      if (Date.parse(adjusted.instant) > eventEpoch) {
        skippedPast += 1;
        continue;
      }
      const candidateIdentity = {
        profileId: identity.profileId,
        profileRevision: identity.profileRevision,
        calculationRunId: identity.calculationRunId,
        preferenceId: preference.preferenceId,
        preferenceRevision: preference.revision,
        preference: {
          channel: "email" as const,
          timezone: preference.timezone,
          leadMinutes: preference.leadMinutes,
          quietHours: preference.quietHours,
        },
        eventReference: fact.id,
        eventType: fact.type,
        eventOccursAt,
        scheduledAt: adjusted.instant,
        timeline: {
          scope: identity.scope,
          startInstant: timeline.input.effectiveStartInstant,
          endInstant: timeline.input.effectiveEndInstant,
          engineVersion: identity.engineVersion,
          policyVersion: identity.policyVersion,
          providerId: identity.provider.providerId,
          providerVersion: identity.provider.providerVersion,
          dataVersion: identity.provider.dataVersion,
          calculatedAt: identity.provider.calculatedAt,
          timeScale: identity.provider.timeScale,
          referenceFrame: identity.provider.referenceFrame,
          zodiacReference: identity.provider.zodiacReference,
          coordinateOrigin: identity.provider.coordinateOrigin,
        },
      } as const;
      candidates.push({
        eventReference: fact.id,
        eventType: fact.type,
        eventOccursAt,
        scheduledAt: adjusted.instant,
        preferenceId: preference.preferenceId,
        preferenceRevision: preference.revision,
        materializationVersion: NOTIFICATION_MATERIALIZATION_VERSION,
        identity: candidateIdentity,
      });
    }
    return deepFreeze({ ok: true, candidates, skippedPast });
  } catch {
    return {
      ok: false,
      error: {
        code: "invalid-input",
        message: "Notification materialization input is invalid",
      },
    };
  }
}

function occurrenceInstant(fact: TimelineFact) {
  return fact.occurrence.kind === "instant"
    ? fact.occurrence.instant
    : fact.occurrence.peakInstant;
}

function adjustQuietHours(
  instant: string,
  timezone: string,
  quiet: NotificationPreferenceFact["quietHours"],
):
  | Readonly<{ ok: true; instant: string }>
  | Extract<NotificationCandidateResult, { ok: false }> {
  if (!quiet) return { ok: true, instant };
  const local = localParts(instant, timezone);
  const current = minutes(local.time);
  const start = minutes(quiet.start);
  const end = minutes(quiet.end);
  const inside =
    start < end
      ? current >= start && current < end
      : current >= start || current < end;
  if (!inside) return { ok: true, instant };
  const targetDate =
    start > end && current >= start ? nextDate(local.date) : local.date;
  const resolution = resolveCivilTime({
    date: targetDate,
    time: quiet.end,
    timezone,
  });
  if (resolution.status !== "unique")
    return {
      ok: false,
      error: {
        code: "civil-time-unavailable",
        message: "A quiet-hours boundary could not be resolved uniquely",
      },
    };
  return { ok: true, instant: resolution.instant };
}

function validateInput(
  timeline: PersonalTimelineAggregate,
  preferences: readonly NotificationPreferenceFact[],
  identity: NotificationTimelineIdentity,
) {
  if (
    identity.engineVersion !== timeline.metadata.engineVersion ||
    identity.policyVersion !== timeline.metadata.policyVersion ||
    identity.scope !== timeline.input.scope ||
    !sameProvider(identity.provider, timeline.metadata.provider) ||
    !uuid(identity.profileId) ||
    !uuid(identity.calculationRunId) ||
    !Number.isSafeInteger(identity.profileRevision) ||
    identity.profileRevision < 1
  )
    throw new RangeError();
  if (
    new Set(preferences.map(({ eventType }) => eventType)).size !==
    preferences.length
  )
    throw new RangeError();
  for (const preference of preferences) {
    if (
      !uuid(preference.preferenceId) ||
      !NOTIFICATION_EVENT_TYPES.includes(preference.eventType) ||
      !NOTIFICATION_LEAD_MINUTES.includes(preference.leadMinutes) ||
      !Number.isSafeInteger(preference.revision) ||
      preference.revision < 1 ||
      (preference.quietHours !== null &&
        (!clock(preference.quietHours.start) ||
          !clock(preference.quietHours.end) ||
          preference.quietHours.start === preference.quietHours.end))
    )
      throw new RangeError();
  }
}

function localParts(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value]),
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function minutes(value: string) {
  if (!clock(value)) throw new RangeError();
  const [hour, minute] = value.split(":").map(Number);
  return hour! * 60 + minute!;
}

function clock(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function nextDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + 1, 12));
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function sameProvider(left: ProviderMetadata, right: ProviderMetadata) {
  return (
    left.providerId === right.providerId &&
    left.providerVersion === right.providerVersion &&
    left.dataVersion === right.dataVersion &&
    left.calculatedAt === right.calculatedAt &&
    left.timeScale === right.timeScale &&
    left.referenceFrame === right.referenceFrame &&
    left.zodiacReference === right.zodiacReference &&
    left.coordinateOrigin === right.coordinateOrigin
  );
}

function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
