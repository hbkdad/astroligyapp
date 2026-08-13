import "server-only";

import type { Pool, PoolClient } from "pg";

import { buildNumerologyContext } from "@/application/build-numerology-context";
import { composeDailyReading } from "@/application/compose-daily-reading";
import { composePersonalContext } from "@/application/compose-personal-context";
import { PersonalTimelineEngine } from "@/application/calculate-personal-timeline";
import { TransitSnapshotEngine } from "@/application/calculate-transit-snapshot";
import { derivePersonalLunarSnapshot } from "@/application/derive-personal-lunar-snapshot";
import type { AccountId } from "@/infrastructure/auth/account";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import { withIdentityTransaction } from "@/infrastructure/persistence/identity-transaction";
import {
  loadStoredNatalChart,
  validateStoredNatalMetadata,
  type StoredNatalChartRow,
} from "@/infrastructure/persistence/protected-natal-chart-repository";
import {
  sourceFromDailyReading,
  toDashboardReadModel,
  type DashboardReadModel,
} from "@/presentation/dashboard-read-model";
import { toTimelineReadModel } from "@/presentation/timeline-read-model";
import { createEntitlementPolicy } from "@/server/entitlement-policy";
import {
  validatePersonalTodayCommand,
  type PersonalTodayCommand,
} from "@/server/personal-today-contracts";

export class PersonalTodayAuthorizationError extends Error {}
export class PersonalTodayConflictError extends Error {}
export class PersonalTodayLockedError extends Error {}
export class PersonalTodayUnavailableError extends Error {}

export type PersonalTodayResult =
  | Readonly<{ outcome: "ready"; model: DashboardReadModel }>
  | Readonly<{
      outcome: "incomplete" | "stale";
      reason: "birth-name" | "natal-chart";
    }>;

interface TodayRow extends StoredNatalChartRow {
  birth_name: string | null;
}

interface SubscriptionRow {
  transition_state_version: string | null;
  plan_key: string;
  status: string;
  period_starts_at: Date | string | null;
  period_ends_at: Date | string | null;
}

export class PersonalTodayRepository {
  constructor(
    private readonly pool: Pick<Pool, "connect">,
    private readonly now: () => Date = () => new Date(),
    private readonly transits: Pick<
      TransitSnapshotEngine,
      "calculate"
    > = new TransitSnapshotEngine(new AstronomyEngineProvider()),
    private readonly timeline: Pick<
      PersonalTimelineEngine,
      "calculate"
    > = new PersonalTimelineEngine(new AstronomyEngineProvider()),
  ) {}

  async load(
    ownerId: AccountId,
    commandValue: unknown,
  ): Promise<PersonalTodayResult> {
    const command = validatePersonalTodayCommand(commandValue);
    if (!command) throw new PersonalTodayAuthorizationError();
    return withIdentityTransaction(this.pool, ownerId, async ({ client }) =>
      loadInTransaction(
        client,
        command,
        this.now,
        this.transits,
        this.timeline,
      ),
    );
  }
}

async function loadInTransaction(
  client: PoolClient,
  command: PersonalTodayCommand,
  now: () => Date,
  transits: Pick<TransitSnapshotEngine, "calculate">,
  timelineEngine: Pick<PersonalTimelineEngine, "calculate">,
): Promise<PersonalTodayResult> {
  const selected = await client.query<TodayRow>(
    `select p.id as profile_id, b.id as birth_profile_id, p.revision,
            p.display_name, b.birth_name, b.birth_date::text,
            b.birth_time_local, b.birth_time_precision, b.timezone,
            b.latitude::text, b.longitude::text, b.coordinate_source,
            latest.calculation_run_id, latest.resolution_metadata
       from profile p
       join birth_profile b on b.profile_id = p.id
       left join lateral (
         select bc.calculation_run_id, bc.resolution_metadata
           from birth_chart bc
           join calculation_run cr on cr.id = bc.calculation_run_id
          where bc.birth_profile_id = b.id and cr.status = 'completed'
            and cr.kind = 'natal-chart'
          order by cr.completed_at desc, cr.id desc limit 1
       ) latest on true
      where p.id = $1 and b.id = $2 and p.deleted_at is null
      for share of p, b`,
    [command.profileId, command.birthProfileId],
  );
  const row = selected.rows[0];
  if (!row) throw new PersonalTodayAuthorizationError();
  if (row.revision !== command.revision) throw new PersonalTodayConflictError();
  const timelineScope = await allowedTimelineScope(client, now);
  if (!timelineScope) throw new PersonalTodayLockedError();
  if (!row.birth_name)
    return Object.freeze({ outcome: "incomplete", reason: "birth-name" });
  if (!row.calculation_run_id)
    return Object.freeze({ outcome: "incomplete", reason: "natal-chart" });
  const metadata = validateStoredNatalMetadata(row.resolution_metadata);
  if (metadata.profileRevision !== row.revision)
    return Object.freeze({ outcome: "stale", reason: "natal-chart" });

  const instant = trustedInstant(now);
  const natal = await loadStoredNatalChart(client, row, metadata);
  const transitResult = await transits.calculate(natal, {
    instant,
    coordinateOrigin: natal.input.coordinateOrigin,
    ...(natal.input.observer ? { observer: natal.input.observer } : {}),
    ...(natal.input.coordinateSource
      ? { coordinateSource: natal.input.coordinateSource }
      : {}),
  });
  if (!transitResult.ok) throw new PersonalTodayUnavailableError();
  const localDate = localDateAt(instant, natal.input.timezone);
  let numerology;
  try {
    numerology = buildNumerologyContext(
      row.birth_date,
      row.birth_name,
      localDate,
    );
  } catch {
    return Object.freeze({ outcome: "incomplete", reason: "birth-name" });
  }
  const context = composePersonalContext(
    natal,
    transitResult.value,
    derivePersonalLunarSnapshot(transitResult.value),
    numerology,
  );
  const reading = composeDailyReading(context);
  const timelineResult = await timelineEngine.calculate(natal, {
    startInstant: instant,
    endInstant: new Date(
      Date.parse(instant) +
        (timelineScope === "forecast" ? 14 : 45) * 86_400_000,
    ).toISOString(),
    birthDate: row.birth_date,
    scope: timelineScope,
  });
  if (!timelineResult.ok) throw new PersonalTodayUnavailableError();
  const timeline = toTimelineReadModel(timelineResult.value.timeline);
  return Object.freeze({
    outcome: "ready",
    model: toDashboardReadModel(sourceFromDailyReading(reading, timeline)),
  });
}

async function allowedTimelineScope(client: PoolClient, now: () => Date) {
  const rows = await client.query<SubscriptionRow>(
    `select transition_state_version, plan_key, status,
            period_starts_at, period_ends_at
       from subscription order by updated_at desc`,
  );
  const policy = createEntitlementPolicy();
  let forecast = false;
  let fullCalendar = false;
  for (const row of rows.rows) {
    const state = {
      version: row.transition_state_version,
      planKey: row.plan_key,
      status: row.status,
      periodStartsAt: instantValue(row.period_starts_at),
      periodEndsAt: instantValue(row.period_ends_at),
    };
    const base =
      policy.check(state, "personalized_daily_reading", { now }).allowed &&
      policy.check(state, "personal_transits", { now }).allowed;
    if (!base) continue;
    forecast ||= policy.check(state, "forecast", { now }).allowed;
    fullCalendar ||= policy.check(state, "full_transit_calendar", {
      now,
    }).allowed;
  }
  return fullCalendar ? "full-transit-calendar" : forecast ? "forecast" : null;
}

function trustedInstant(now: () => Date) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new PersonalTodayUnavailableError();
  return value.toISOString();
}

function localDateAt(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function instantValue(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
