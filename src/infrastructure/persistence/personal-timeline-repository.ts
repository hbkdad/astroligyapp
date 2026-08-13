import "server-only";

import type { Pool, PoolClient } from "pg";

import {
  PersonalTimelineEngine,
  type PersonalTimelineScope,
} from "@/application/calculate-personal-timeline";
import type { AccountId } from "@/infrastructure/auth/account";
import { AstronomyEngineProvider } from "@/infrastructure/ephemeris/astronomy-engine-provider";
import { withIdentityTransaction } from "@/infrastructure/persistence/identity-transaction";
import {
  loadStoredNatalChart,
  validateStoredNatalMetadata,
  type StoredNatalChartRow,
} from "@/infrastructure/persistence/protected-natal-chart-repository";
import {
  toTimelineReadModel,
  type TimelineReadModel,
} from "@/presentation/timeline-read-model";
import { createEntitlementPolicy } from "@/server/entitlement-policy";
import {
  validatePersonalTimelineCommand,
  type PersonalTimelineCommand,
} from "@/server/personal-timeline-contracts";

export class PersonalTimelineAuthorizationError extends Error {}
export class PersonalTimelineConflictError extends Error {}
export class PersonalTimelineLockedError extends Error {}
export class PersonalTimelineUnavailableError extends Error {}

export type PersonalTimelineRepositoryResult =
  | Readonly<{
      outcome: "ready";
      model: TimelineReadModel;
      scope: PersonalTimelineScope;
      truncated: boolean;
    }>
  | Readonly<{ outcome: "incomplete" | "stale" }>;

type TimelineRow = StoredNatalChartRow;
interface SubscriptionRow {
  transition_state_version: string | null;
  plan_key: string;
  status: string;
  period_starts_at: Date | string | null;
  period_ends_at: Date | string | null;
}

export class PersonalTimelineRepository {
  constructor(
    private readonly pool: Pick<Pool, "connect">,
    private readonly now: () => Date = () => new Date(),
    private readonly engine: Pick<
      PersonalTimelineEngine,
      "calculate"
    > = new PersonalTimelineEngine(new AstronomyEngineProvider()),
  ) {}

  async load(ownerId: AccountId, commandValue: unknown) {
    const command = validatePersonalTimelineCommand(commandValue);
    if (!command) throw new PersonalTimelineAuthorizationError();
    return withIdentityTransaction(this.pool, ownerId, ({ client }) =>
      loadInTransaction(client, command, this.now, this.engine),
    );
  }
}

async function loadInTransaction(
  client: PoolClient,
  command: PersonalTimelineCommand,
  now: () => Date,
  engine: Pick<PersonalTimelineEngine, "calculate">,
): Promise<PersonalTimelineRepositoryResult> {
  const selected = await client.query<TimelineRow>(
    `select p.id as profile_id, b.id as birth_profile_id, p.revision,
            p.display_name, b.birth_date::text, b.birth_time_local,
            b.birth_time_precision, b.timezone, b.latitude::text,
            b.longitude::text, b.coordinate_source,
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
  if (!row) throw new PersonalTimelineAuthorizationError();
  if (row.revision !== command.revision)
    throw new PersonalTimelineConflictError();
  const trustedNow = validNow(now);
  const scope = await allowedScope(client, trustedNow);
  if (!scope) throw new PersonalTimelineLockedError();
  if (!row.calculation_run_id) return Object.freeze({ outcome: "incomplete" });
  const metadata = validateStoredNatalMetadata(row.resolution_metadata);
  if (metadata.profileRevision !== row.revision)
    return Object.freeze({ outcome: "stale" });
  const natal = await loadStoredNatalChart(client, row, metadata);
  const startInstant = trustedNow.toISOString();
  const result = await engine.calculate(natal, {
    startInstant,
    endInstant: new Date(
      trustedNow.getTime() + (scope === "forecast" ? 14 : 45) * 86_400_000,
    ).toISOString(),
    birthDate: row.birth_date,
    scope,
  });
  if (!result.ok) throw new PersonalTimelineUnavailableError();
  return Object.freeze({
    outcome: "ready",
    model: toTimelineReadModel(result.value.timeline),
    scope,
    truncated: result.value.metadata.truncated,
  });
}

async function allowedScope(
  client: PoolClient,
  trustedNow: Date,
): Promise<PersonalTimelineScope | null> {
  const subscriptions = await client.query<SubscriptionRow>(
    `select transition_state_version, plan_key, status,
            period_starts_at, period_ends_at
       from subscription order by updated_at desc`,
  );
  const policy = createEntitlementPolicy();
  let forecast = false;
  let full = false;
  for (const row of subscriptions.rows) {
    const state = {
      version: row.transition_state_version,
      planKey: row.plan_key,
      status: row.status,
      periodStartsAt: instantValue(row.period_starts_at),
      periodEndsAt: instantValue(row.period_ends_at),
    };
    forecast ||= policy.check(state, "forecast", {
      now: () => trustedNow,
    }).allowed;
    full ||= policy.check(state, "full_transit_calendar", {
      now: () => trustedNow,
    }).allowed;
  }
  return full ? "full-transit-calendar" : forecast ? "forecast" : null;
}

function validNow(now: () => Date) {
  const value = now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new PersonalTimelineUnavailableError();
  return new Date(value.getTime());
}

function instantValue(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
