import "server-only";

import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import {
  NOTIFICATION_EVENT_TYPES,
  materializeNotificationCandidates,
  type NotificationCandidate,
  type NotificationEventType,
  type NotificationPreferenceFact,
} from "@/application/materialize-notification-candidates";
import { PersonalTimelineEngine } from "@/application/calculate-personal-timeline";
import type { AccountId } from "@/infrastructure/auth/account";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import { withIdentityTransaction } from "@/infrastructure/persistence/identity-transaction";
import {
  loadStoredNatalChart,
  validateStoredNatalMetadata,
  type StoredNatalChartRow,
} from "@/infrastructure/persistence/protected-natal-chart-repository";
import { createEntitlementPolicy } from "@/server/entitlement-policy";
import {
  NOTIFICATION_PREFERENCE_CONTRACT_VERSION,
  validateNotificationPreferenceCommand,
  validateNotificationPreferenceSelection,
  type NotificationPreferenceCommand,
  type NotificationPreferenceSelection,
} from "@/server/notification-preference-contracts";

export class NotificationPreferenceAuthorizationError extends Error {}
export class NotificationPreferenceConflictError extends Error {}
export class NotificationPreferenceLockedError extends Error {}
export class NotificationPreferenceUnavailableError extends Error {}

export interface NotificationPreferenceView {
  readonly version: typeof NOTIFICATION_PREFERENCE_CONTRACT_VERSION;
  readonly profileId: string;
  readonly birthProfileId: string;
  readonly profileRevision: number;
  readonly preferenceRevision: number;
  readonly displayName: string;
  readonly channel: "email";
  readonly channelAvailability: "provider-unavailable";
  readonly consent: boolean;
  readonly eventTypes: readonly NotificationEventType[];
  readonly leadMinutes: 0 | 60 | 360 | 1440;
  readonly quietHours: Readonly<{ start: string; end: string }> | null;
  readonly timezone: string;
  readonly deliveries: readonly NotificationDeliveryView[];
}

export interface NotificationDeliveryView {
  readonly eventType: NotificationEventType;
  readonly eventOccursAt: string;
  readonly scheduledAt: string;
  readonly status:
    "pending-provider" | "queued" | "sent" | "failed" | "stale" | "canceled";
  readonly attemptCount: number;
}

export interface NotificationMaterializationResult {
  readonly inserted: number;
  readonly existing: number;
  readonly invalidated: number;
  readonly skippedPast: number;
  readonly providerAvailability: "provider-unavailable";
}

type ProfileRow = StoredNatalChartRow;
interface PreferenceRow {
  id: string;
  event_type: NotificationEventType;
  opted_in: boolean;
  timezone: string;
  revision: number;
  consent_state: string;
  lead_minutes: 0 | 60 | 360 | 1440;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}
interface DeliveryRow {
  event_type: NotificationEventType;
  event_occurs_at: Date | string;
  scheduled_at: Date | string;
  status: NotificationDeliveryView["status"];
  attempt_count: number;
}
interface SubscriptionRow {
  transition_state_version: string | null;
  plan_key: string;
  status: string;
  period_starts_at: Date | string | null;
  period_ends_at: Date | string | null;
}

export class NotificationPreferenceRepository {
  constructor(
    private readonly pool: Pick<Pool, "connect">,
    private readonly now: () => Date = () => new Date(),
    private readonly timeline: Pick<
      PersonalTimelineEngine,
      "calculate"
    > = new PersonalTimelineEngine(new AstronomyEngineProvider()),
  ) {}

  async load(
    ownerId: AccountId,
    value: unknown,
  ): Promise<NotificationPreferenceView> {
    const selection = validateNotificationPreferenceSelection(value);
    if (!selection) throw new NotificationPreferenceAuthorizationError();
    return withIdentityTransaction(this.pool, ownerId, ({ client }) =>
      loadView(client, selection, this.now),
    );
  }

  async replace(
    ownerId: AccountId,
    value: unknown,
  ): Promise<NotificationPreferenceView> {
    const command = validateNotificationPreferenceCommand(value);
    if (!command) throw new NotificationPreferenceAuthorizationError();
    return withIdentityTransaction(this.pool, ownerId, ({ client }) =>
      replaceInTransaction(client, command, this.now),
    );
  }

  async materialize(
    ownerId: AccountId,
    value: unknown,
  ): Promise<NotificationMaterializationResult> {
    const selection = validateNotificationPreferenceSelection(value);
    if (!selection) throw new NotificationPreferenceAuthorizationError();
    return withIdentityTransaction(this.pool, ownerId, ({ client }) =>
      materializeInTransaction(client, selection, this.now, this.timeline),
    );
  }
}

async function loadView(
  client: PoolClient,
  selection: NotificationPreferenceSelection,
  now: () => Date,
) {
  const profile = await ownedProfile(client, selection, false);
  await requireAlerts(client, now);
  return projectView(client, profile);
}

async function replaceInTransaction(
  client: PoolClient,
  command: NotificationPreferenceCommand,
  now: () => Date,
) {
  const profile = await ownedProfile(client, command, true);
  await requireAlerts(client, now);
  const existing = await preferences(
    client,
    profile.profile_id,
    profile.timezone,
    true,
  );
  const currentRevision = existing.reduce(
    (maximum, row) => Math.max(maximum, row.revision),
    0,
  );
  if (currentRevision !== command.preferenceRevision)
    throw new NotificationPreferenceConflictError();
  const changedAt = trustedNow(now).toISOString();
  const nextRevision = currentRevision + 1;
  const selected = new Set(command.eventTypes);
  const existingTypes = new Set(existing.map(({ event_type }) => event_type));
  for (const eventType of NOTIFICATION_EVENT_TYPES) {
    const optedIn = selected.has(eventType);
    const consentState = optedIn
      ? "consented"
      : !command.consent || existingTypes.has(eventType)
        ? "withdrawn"
        : "not-consented";
    const consentedAt = optedIn ? changedAt : null;
    await client.query(
      `insert into notification_preference
         (profile_id, channel, event_type, opted_in, timezone, frequency,
          contract_version, revision, consent_state, consented_at, lead_minutes,
          quiet_hours_start, quiet_hours_end, created_at, updated_at)
       values ($1, 'email', $2, $3, $4, $5::jsonb, '1.0.0', $6,
               $7, $8, $9, $10::time, $11::time, $12, $12)
       on conflict (profile_id, channel, event_type) do update set
         opted_in=excluded.opted_in, timezone=excluded.timezone, frequency=excluded.frequency,
         contract_version='1.0.0', revision=excluded.revision,
         consent_state=excluded.consent_state, consented_at=excluded.consented_at,
         lead_minutes=excluded.lead_minutes,
         quiet_hours_start=excluded.quiet_hours_start,
         quiet_hours_end=excluded.quiet_hours_end, updated_at=excluded.updated_at`,
      [
        profile.profile_id,
        eventType,
        optedIn,
        profile.timezone,
        JSON.stringify({ version: "1.0.0", mode: "per-event" }),
        nextRevision,
        consentState,
        consentedAt,
        command.leadMinutes,
        command.quietHours?.start ?? null,
        command.quietHours?.end ?? null,
        changedAt,
      ],
    );
  }
  await client.query(
    `update notification_delivery d
        set status='canceled', invalidated_at=$2, updated_at=$2
       from notification_preference p
      where d.preference_id=p.id and p.profile_id=$1
        and d.materialization_version='1.0.0'
        and d.status in ('pending-provider','queued')
        and d.preference_revision < $3`,
    [profile.profile_id, changedAt, nextRevision],
  );
  return projectView(client, profile);
}

async function materializeInTransaction(
  client: PoolClient,
  selection: NotificationPreferenceSelection,
  now: () => Date,
  engine: Pick<PersonalTimelineEngine, "calculate">,
): Promise<NotificationMaterializationResult> {
  const profile = await ownedProfile(client, selection, true);
  const scope = await requireAlerts(client, now);
  if (!profile.calculation_run_id)
    throw new NotificationPreferenceUnavailableError();
  const metadata = validateStoredNatalMetadata(profile.resolution_metadata);
  if (metadata.profileRevision !== profile.revision)
    throw new NotificationPreferenceConflictError();
  const preferenceRows = (
    await preferences(client, profile.profile_id, profile.timezone, true)
  ).filter((row) => row.opted_in && row.consent_state === "consented");
  if (preferenceRows.length === 0)
    return Object.freeze({
      inserted: 0,
      existing: 0,
      invalidated: 0,
      skippedPast: 0,
      providerAvailability: "provider-unavailable" as const,
    });
  const instant = trustedNow(now).toISOString();
  const natal = await loadStoredNatalChart(client, profile, metadata);
  const calculated = await engine.calculate(natal, {
    startInstant: instant,
    endInstant: new Date(
      Date.parse(instant) + (scope === "forecast" ? 14 : 45) * 86_400_000,
    ).toISOString(),
    birthDate: profile.birth_date,
    scope,
  });
  if (!calculated.ok) throw new NotificationPreferenceUnavailableError();
  const result = materializeNotificationCandidates(
    calculated.value,
    preferenceRows.map(toPreferenceFact),
    {
      profileId: profile.profile_id,
      profileRevision: profile.revision,
      calculationRunId: profile.calculation_run_id,
      scope,
      engineVersion: calculated.value.metadata.engineVersion,
      policyVersion: calculated.value.metadata.policyVersion,
      provider: calculated.value.metadata.provider,
    },
  );
  if (!result.ok) throw new NotificationPreferenceUnavailableError();
  const identities = result.candidates.map(idempotencyKey);
  const invalidated = await client.query(
    `update notification_delivery d
        set status='stale', invalidated_at=$2, updated_at=$2
       from notification_preference p
      where d.preference_id=p.id and p.profile_id=$1
        and d.materialization_version='1.0.0'
        and d.status in ('pending-provider','queued')
        and d.scheduled_at >= $3 and d.scheduled_at < $4
        and not (d.idempotency_key = any($5::text[]))`,
    [
      profile.profile_id,
      instant,
      calculated.value.input.effectiveStartInstant,
      calculated.value.input.effectiveEndInstant,
      identities,
    ],
  );
  let inserted = 0;
  for (const candidate of result.candidates) {
    const write = await insertCandidate(client, candidate);
    inserted += write.rowCount ?? 0;
  }
  return Object.freeze({
    inserted,
    existing: result.candidates.length - inserted,
    invalidated: invalidated.rowCount ?? 0,
    skippedPast: result.skippedPast,
    providerAvailability: "provider-unavailable" as const,
  });
}

async function insertCandidate(
  client: PoolClient,
  value: NotificationCandidate,
) {
  return client.query(
    `insert into notification_delivery
       (preference_id, event_reference, idempotency_key, status, scheduled_at,
        event_type, event_occurs_at, preference_revision,
        materialization_version, identity, attempt_count, created_at, updated_at)
     values ($1,$2,$3,'pending-provider',$4,$5,$6,$7,'1.0.0',$8::jsonb,0,now(),now())
     on conflict (idempotency_key) do nothing`,
    [
      value.preferenceId,
      value.eventReference,
      idempotencyKey(value),
      value.scheduledAt,
      value.eventType,
      value.eventOccursAt,
      value.preferenceRevision,
      JSON.stringify(value.identity),
    ],
  );
}

function idempotencyKey(value: NotificationCandidate) {
  const identity = value.identity;
  const stableSemanticIdentity = {
    materializationVersion: value.materializationVersion,
    profileId: identity.profileId,
    profileRevision: identity.profileRevision,
    calculationRunId: identity.calculationRunId,
    preferenceId: identity.preferenceId,
    preferenceRevision: identity.preferenceRevision,
    preference: identity.preference,
    eventReference: identity.eventReference,
    eventType: identity.eventType,
    eventOccursAt: identity.eventOccursAt,
    timeline: {
      engineVersion: identity.timeline.engineVersion,
      policyVersion: identity.timeline.policyVersion,
      providerId: identity.timeline.providerId,
      providerVersion: identity.timeline.providerVersion,
      dataVersion: identity.timeline.dataVersion,
      timeScale: identity.timeline.timeScale,
      referenceFrame: identity.timeline.referenceFrame,
      zodiacReference: identity.timeline.zodiacReference,
      coordinateOrigin: identity.timeline.coordinateOrigin,
    },
  };
  return `sha256:${createHash("sha256").update(JSON.stringify(stableSemanticIdentity)).digest("hex")}`;
}

async function ownedProfile(
  client: PoolClient,
  selection: NotificationPreferenceSelection,
  lock: boolean,
) {
  const selected = await client.query<ProfileRow>(
    `select p.id as profile_id, b.id as birth_profile_id, p.revision,
            p.display_name, b.birth_date::text, b.birth_time_local,
            b.birth_time_precision, b.timezone, b.latitude::text,
            b.longitude::text, b.coordinate_source,
            latest.calculation_run_id, latest.resolution_metadata
       from profile p join birth_profile b on b.profile_id=p.id
       left join lateral (
         select bc.calculation_run_id, bc.resolution_metadata
           from birth_chart bc join calculation_run cr on cr.id=bc.calculation_run_id
          where bc.birth_profile_id=b.id and cr.status='completed' and cr.kind='natal-chart'
          order by cr.completed_at desc, cr.id desc limit 1
       ) latest on true
      where p.id=$1 and b.id=$2 and p.deleted_at is null
      ${lock ? "for update of p, b" : "for share of p, b"}`,
    [selection.profileId, selection.birthProfileId],
  );
  const row = selected.rows[0];
  if (!row) throw new NotificationPreferenceAuthorizationError();
  if (row.revision !== selection.profileRevision)
    throw new NotificationPreferenceConflictError();
  return row;
}

async function preferences(
  client: PoolClient,
  profileId: string,
  profileTimezone: string,
  lock: boolean,
) {
  const rows = (
    await client.query<PreferenceRow>(
      `select id, event_type, opted_in, timezone, revision, consent_state,
              lead_minutes, quiet_hours_start::text, quiet_hours_end::text
         from notification_preference
        where profile_id=$1 and channel='email' and contract_version='1.0.0'
        order by array_position($2::text[], event_type)
        ${lock ? "for update" : ""}`,
      [profileId, NOTIFICATION_EVENT_TYPES],
    )
  ).rows;
  validatePreferenceSet(rows, profileTimezone);
  return rows;
}

async function projectView(
  client: PoolClient,
  profile: ProfileRow,
): Promise<NotificationPreferenceView> {
  const rows = await preferences(
    client,
    profile.profile_id,
    profile.timezone,
    false,
  );
  const enabled = rows.filter(
    (row) => row.opted_in && row.consent_state === "consented",
  );
  const representative = rows[0];
  const deliveries = await client.query<DeliveryRow>(
    `select d.event_type, d.event_occurs_at, d.scheduled_at, d.status, d.attempt_count
       from notification_delivery d join notification_preference p on p.id=d.preference_id
      where p.profile_id=$1 and d.materialization_version='1.0.0'
      order by d.scheduled_at desc, d.id desc limit 20`,
    [profile.profile_id],
  );
  return deepFreeze({
    version: NOTIFICATION_PREFERENCE_CONTRACT_VERSION,
    profileId: profile.profile_id,
    birthProfileId: profile.birth_profile_id,
    profileRevision: profile.revision,
    preferenceRevision: rows.reduce(
      (maximum, row) => Math.max(maximum, row.revision),
      0,
    ),
    displayName: profile.display_name,
    channel: "email",
    channelAvailability: "provider-unavailable",
    consent: enabled.length > 0,
    eventTypes: enabled.map(({ event_type }) => event_type),
    leadMinutes: representative?.lead_minutes ?? 60,
    quietHours:
      representative?.quiet_hours_start && representative.quiet_hours_end
        ? {
            start: minuteClock(representative.quiet_hours_start),
            end: minuteClock(representative.quiet_hours_end),
          }
        : null,
    timezone: profile.timezone,
    deliveries: deliveries.rows.map((row) => ({
      eventType: row.event_type,
      eventOccursAt: instantValue(row.event_occurs_at)!,
      scheduledAt: instantValue(row.scheduled_at)!,
      status: row.status,
      attemptCount: row.attempt_count,
    })),
  });
}

function validatePreferenceSet(
  rows: readonly PreferenceRow[],
  profileTimezone: string,
) {
  if (rows.length === 0) return;
  if (rows.length !== NOTIFICATION_EVENT_TYPES.length)
    throw new NotificationPreferenceUnavailableError();
  const first = rows[0]!;
  const expectedTypes = new Set(NOTIFICATION_EVENT_TYPES);
  for (const row of rows) {
    if (
      !expectedTypes.delete(row.event_type) ||
      row.timezone !== profileTimezone ||
      row.revision !== first.revision ||
      row.lead_minutes !== first.lead_minutes ||
      minuteClockOrNull(row.quiet_hours_start) !==
        minuteClockOrNull(first.quiet_hours_start) ||
      minuteClockOrNull(row.quiet_hours_end) !==
        minuteClockOrNull(first.quiet_hours_end)
    )
      throw new NotificationPreferenceUnavailableError();
  }
  if (expectedTypes.size !== 0)
    throw new NotificationPreferenceUnavailableError();
}

async function requireAlerts(client: PoolClient, now: () => Date) {
  const rows = await client.query<SubscriptionRow>(
    `select transition_state_version, plan_key, status, period_starts_at, period_ends_at
       from subscription order by updated_at desc`,
  );
  const policy = createEntitlementPolicy();
  let alerts = false;
  let full = false;
  for (const row of rows.rows) {
    const state = {
      version: row.transition_state_version,
      planKey: row.plan_key,
      status: row.status,
      periodStartsAt: instantValue(row.period_starts_at),
      periodEndsAt: instantValue(row.period_ends_at),
    };
    alerts ||= policy.check(state, "alerts", { now }).allowed;
    full ||= policy.check(state, "full_transit_calendar", { now }).allowed;
  }
  if (!alerts) throw new NotificationPreferenceLockedError();
  return full ? "full-transit-calendar" : "forecast";
}

function toPreferenceFact(row: PreferenceRow): NotificationPreferenceFact {
  return {
    preferenceId: row.id,
    revision: row.revision,
    eventType: row.event_type,
    timezone: row.timezone,
    leadMinutes: row.lead_minutes,
    quietHours:
      row.quiet_hours_start && row.quiet_hours_end
        ? {
            start: minuteClock(row.quiet_hours_start),
            end: minuteClock(row.quiet_hours_end),
          }
        : null,
  };
}

function minuteClock(value: string) {
  return value.slice(0, 5);
}

function minuteClockOrNull(value: string | null) {
  return value === null ? null : minuteClock(value);
}

function trustedNow(now: () => Date) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new NotificationPreferenceUnavailableError();
  return new Date(value.getTime());
}

function instantValue(value: Date | string | null) {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
