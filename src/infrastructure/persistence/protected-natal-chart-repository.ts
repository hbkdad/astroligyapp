import "server-only";

import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import {
  NATAL_CHART_ENGINE_VERSION,
  NatalChartEngine,
  type NatalChart,
} from "@/application/calculate-natal-chart";
import {
  ASPECT_TYPES,
  DEFAULT_ASPECT_DEFINITIONS,
  type AspectPhase,
} from "@/domain/astro/aspects";
import { CELESTIAL_BODIES } from "@/domain/astro/contracts";
import {
  findHouseNumber,
  WHOLE_SIGN_HOUSE_SYSTEM,
} from "@/domain/astro/house-strategies";
import { toZodiacPosition } from "@/domain/astro/zodiac";
import {
  CIVIL_TIME_RESOLVER_VERSION,
  resolveCivilTime,
} from "@/domain/time/civil-time";
import type { AccountId } from "@/infrastructure/auth/account";
import {
  ASTRONOMY_ENGINE_PROVIDER_ID,
  ASTRONOMY_ENGINE_PROVIDER_VERSION,
  AstronomyEngineProvider,
} from "@/infrastructure/ephemeris/astronomy-engine-provider";
import { withIdentityTransaction } from "@/infrastructure/persistence/identity-transaction";
import { toNatalChartReadModel } from "@/presentation/natal-chart-read-model";
import type { ProtectedNatalChartProfileView } from "@/presentation/protected-natal-chart-state";
import { createEntitlementPolicy } from "@/server/entitlement-policy";
import {
  validateProtectedNatalChartCommand,
  type ProtectedNatalChartCommand,
} from "@/server/protected-natal-chart-contracts";

export const PROTECTED_NATAL_CHART_CONFIG_VERSION = "1.0.0";

export class ProtectedNatalAuthorizationError extends Error {}
export class ProtectedNatalConflictError extends Error {}
export class ProtectedNatalLockedError extends Error {}
export class ProtectedNatalUnavailableError extends Error {}

export type ProtectedNatalGenerationResult = Readonly<{
  outcome:
    | "generated"
    | "cached"
    | "date-only"
    | "coordinates-missing"
    | "ambiguous-time"
    | "nonexistent-time";
}>;

interface BirthInputRow {
  revision: number;
  birth_date: string;
  birth_time_local: string | null;
  birth_time_precision: string;
  timezone: string;
  latitude: string | null;
  longitude: string | null;
  coordinate_source: string | null;
}

interface SubscriptionRow {
  transition_state_version: string | null;
  plan_key: string;
  status: string;
  period_starts_at: Date | string | null;
  period_ends_at: Date | string | null;
}

interface ChartProfileRow extends BirthInputRow {
  profile_id: string;
  birth_profile_id: string;
  display_name: string;
  calculation_run_id: string | null;
  resolution_metadata: unknown;
}

export class ProtectedNatalChartRepository {
  constructor(
    private readonly pool: Pick<Pool, "connect">,
    private readonly now: () => Date = () => new Date(),
    private readonly engine = new NatalChartEngine(
      new AstronomyEngineProvider(),
    ),
  ) {}

  async list(
    ownerId: AccountId,
  ): Promise<readonly ProtectedNatalChartProfileView[]> {
    return withIdentityTransaction(this.pool, ownerId, async ({ client }) => {
      const rows = await client.query<ChartProfileRow>(
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
          where p.deleted_at is null
          order by p.created_at, b.created_at, b.id`,
      );
      const generationAllowed = await allowsNatalChart(client, this.now);
      const projected = [];
      for (const row of rows.rows)
        projected.push(await projectProfile(client, row, generationAllowed));
      return Object.freeze(projected);
    });
  }

  async generate(
    ownerId: AccountId,
    commandValue: unknown,
  ): Promise<ProtectedNatalGenerationResult> {
    const command = validateProtectedNatalChartCommand(commandValue);
    if (!command) throw new ProtectedNatalAuthorizationError();
    return withIdentityTransaction(this.pool, ownerId, async ({ client }) =>
      generateInTransaction(client, ownerId, command, this.now, this.engine),
    );
  }
}

async function projectProfile(
  client: PoolClient,
  row: ChartProfileRow,
  generationAllowed: boolean,
): Promise<ProtectedNatalChartProfileView> {
  const readiness = readinessFor(row);
  const stored = row.calculation_run_id
    ? storedMetadata(row.resolution_metadata)
    : null;
  const chartStale = stored !== null && stored.profileRevision !== row.revision;
  const chart =
    stored && !chartStale
      ? toNatalChartReadModel(await loadStoredChart(client, row, stored))
      : null;
  return Object.freeze({
    profileId: row.profile_id,
    birthProfileId: row.birth_profile_id,
    revision: row.revision,
    displayName: row.display_name,
    timePrecision: precision(row.birth_time_precision),
    readiness,
    generationAllowed,
    chartStale,
    chart,
  });
}

function readinessFor(
  row: BirthInputRow,
): ProtectedNatalChartProfileView["readiness"] {
  if (row.birth_time_precision === "date-only" || row.birth_time_local === null)
    return "date-only";
  if (row.latitude === null || row.longitude === null)
    return "coordinates-missing";
  const result = resolveCivilTime({
    date: row.birth_date,
    time: row.birth_time_local,
    timezone: row.timezone,
  });
  return result.status === "unique" ? "ready" : `${result.status}-time`;
}

async function loadStoredChart(
  client: PoolClient,
  row: ChartProfileRow,
  metadata: ReturnType<typeof storedMetadata>,
): Promise<NatalChart> {
  const positions = await client.query<{
    body: string;
    longitude: string;
    latitude: string | null;
    distance: string | null;
    speed: string | null;
  }>(
    `select body, longitude::text, latitude::text, distance::text, speed::text
       from planet_position where calculation_run_id = $1`,
    [row.calculation_run_id],
  );
  const cusps = await client.query<{ house_number: number; longitude: string }>(
    `select house_number, longitude::text from house_cusp hc
       join birth_chart bc on bc.id = hc.birth_chart_id
      where bc.calculation_run_id = $1 order by house_number`,
    [row.calculation_run_id],
  );
  const aspects = await client.query<{
    source_body: string;
    target_body: string;
    aspect_type: string;
    exact_angle: string;
    actual_angle: string;
    orb: string;
    phase: string;
    strength: string;
  }>(
    `select source_body, target_body, aspect_type, exact_angle::text, actual_angle::text,
            orb::text, phase, strength::text from aspect where calculation_run_id = $1
       order by source_body, target_body, aspect_type`,
    [row.calculation_run_id],
  );
  if (
    positions.rows.length !== CELESTIAL_BODIES.length ||
    cusps.rows.length !== 12
  )
    throw new ProtectedNatalUnavailableError();
  const cuspValues = cusps.rows.map((value, index) => {
    if (value.house_number !== index + 1)
      throw new ProtectedNatalUnavailableError();
    return boundedNumber(value.longitude, 0, 359.99999999);
  });
  const placements = CELESTIAL_BODIES.map((body) => {
    const value = positions.rows.find((candidate) => candidate.body === body);
    if (!value) throw new ProtectedNatalUnavailableError();
    const longitude = boundedNumber(value.longitude, 0, 359.99999999);
    return {
      body,
      eclipticLongitudeDegrees: longitude,
      ...(value.latitude === null
        ? {}
        : { eclipticLatitudeDegrees: Number(value.latitude) }),
      ...(value.distance === null
        ? {}
        : { distanceAu: Number(value.distance) }),
      ...(value.speed === null
        ? {}
        : { speedLongitudeDegreesPerDay: Number(value.speed) }),
      zodiac: { ...toZodiacPosition(longitude), longitudeDegrees: longitude },
      houseNumber: findHouseNumber(longitude, cuspValues),
    };
  });
  return {
    input: metadata.input,
    placements,
    houses: {
      cuspsLongitudeDegrees: cuspValues,
      ascendantLongitudeDegrees: metadata.ascendantLongitudeDegrees,
      midheavenLongitudeDegrees: metadata.midheavenLongitudeDegrees,
    },
    aspects: aspects.rows.map((value) => {
      if (
        !CELESTIAL_BODIES.includes(
          value.source_body as (typeof CELESTIAL_BODIES)[number],
        ) ||
        !CELESTIAL_BODIES.includes(
          value.target_body as (typeof CELESTIAL_BODIES)[number],
        ) ||
        !ASPECT_TYPES.includes(
          value.aspect_type as (typeof ASPECT_TYPES)[number],
        ) ||
        !["applying", "separating", "stationary", "unknown"].includes(
          value.phase,
        )
      )
        throw new ProtectedNatalUnavailableError();
      const definition = DEFAULT_ASPECT_DEFINITIONS.find(
        (item) => item.type === value.aspect_type,
      )!;
      return {
        firstBody: value.source_body as (typeof CELESTIAL_BODIES)[number],
        secondBody: value.target_body as (typeof CELESTIAL_BODIES)[number],
        type: definition.type,
        exactAngleDegrees: Number(value.exact_angle),
        actualAngleDegrees: Number(value.actual_angle),
        orbDegrees: Number(value.orb),
        maximumOrbDegrees: definition.maximumOrbDegrees,
        phase: value.phase as AspectPhase,
        normalizedStrength: Number(value.strength),
      };
    }),
    metadata: metadata.metadata,
  };
}

async function generateInTransaction(
  client: PoolClient,
  ownerId: AccountId,
  command: ProtectedNatalChartCommand,
  now: () => Date,
  engine: NatalChartEngine,
): Promise<ProtectedNatalGenerationResult> {
  const selected = await client.query<BirthInputRow>(
    `select p.revision, b.birth_date::text, b.birth_time_local,
            b.birth_time_precision, b.timezone, b.latitude::text,
            b.longitude::text, b.coordinate_source
       from profile p
       join birth_profile b on b.profile_id = p.id
      where p.id = $1 and b.id = $2 and p.deleted_at is null
      for update of p, b`,
    [command.profileId, command.birthProfileId],
  );
  const row = selected.rows[0];
  if (!row) throw new ProtectedNatalAuthorizationError();
  if (row.revision !== command.revision)
    throw new ProtectedNatalConflictError();
  if (!(await allowsNatalChart(client, now)))
    throw new ProtectedNatalLockedError();
  if (row.birth_time_precision === "date-only" || row.birth_time_local === null)
    return outcome("date-only");
  if (
    row.latitude === null ||
    row.longitude === null ||
    row.coordinate_source === null
  )
    return outcome("coordinates-missing");

  const resolution = resolveCivilTime({
    date: row.birth_date,
    time: row.birth_time_local,
    timezone: row.timezone,
  });
  if (resolution.status !== "unique")
    return outcome(`${resolution.status}-time`);

  const latitude = boundedNumber(row.latitude, -90, 90);
  const longitude = boundedNumber(row.longitude, -180, 180);
  const normalized = JSON.stringify({
    version: PROTECTED_NATAL_CHART_CONFIG_VERSION,
    ownerId,
    profileId: command.profileId,
    birthProfileId: command.birthProfileId,
    revision: command.revision,
    instant: resolution.instant,
    timezone: row.timezone,
    offsetSeconds: resolution.offsetSeconds,
    latitude,
    longitude,
    coordinateSource: row.coordinate_source,
  });
  const inputHash = createHash("sha256").update(normalized).digest("hex");
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `protected-natal:${ownerId}:${inputHash}`,
  ]);
  const cached = await client.query(
    `select id from calculation_run
      where owner_user_id = $1 and kind = 'natal-chart'
        and normalized_input_hash = $2 and engine_version = $3
        and provider_key = $4 and provider_version = $5
        and config_version = $6 and status = 'completed'`,
    [
      ownerId,
      inputHash,
      NATAL_CHART_ENGINE_VERSION,
      ASTRONOMY_ENGINE_PROVIDER_ID,
      ASTRONOMY_ENGINE_PROVIDER_VERSION,
      PROTECTED_NATAL_CHART_CONFIG_VERSION,
    ],
  );
  if (cached.rowCount) return outcome("cached");

  const chartResult = await engine.calculate({
    instant: resolution.instant,
    timezone: row.timezone,
    timezoneSource: "user-supplied-iana",
    observer: { latitudeDegrees: latitude, longitudeDegrees: longitude },
    coordinateSource: row.coordinate_source,
    coordinateOrigin: "topocentric",
    houseSystem: WHOLE_SIGN_HOUSE_SYSTEM,
  });
  if (!chartResult.ok) throw new ProtectedNatalUnavailableError();
  const chart = chartResult.value;
  const run = await client.query<{ id: string }>(
    `insert into calculation_run
       (owner_user_id, kind, normalized_input_hash, engine_version,
        provider_key, provider_version, config_version, status, completed_at)
     values ($1, 'natal-chart', $2, $3, $4, $5, $6, 'completed', $7)
     returning id`,
    [
      ownerId,
      inputHash,
      NATAL_CHART_ENGINE_VERSION,
      ASTRONOMY_ENGINE_PROVIDER_ID,
      ASTRONOMY_ENGINE_PROVIDER_VERSION,
      PROTECTED_NATAL_CHART_CONFIG_VERSION,
      now().toISOString(),
    ],
  );
  const runId = run.rows[0]?.id;
  if (!runId) throw new ProtectedNatalUnavailableError();
  const birthChart = await client.query<{ id: string }>(
    `insert into birth_chart
       (birth_profile_id, calculation_run_id, house_system, resolution_metadata)
     values ($1, $2, $3, $4::jsonb) returning id`,
    [
      command.birthProfileId,
      runId,
      WHOLE_SIGN_HOUSE_SYSTEM,
      JSON.stringify({
        version: PROTECTED_NATAL_CHART_CONFIG_VERSION,
        resolverVersion: CIVIL_TIME_RESOLVER_VERSION,
        profileRevision: command.revision,
        offsetSeconds: resolution.offsetSeconds,
        input: chart.input,
        metadata: chart.metadata,
        ascendantLongitudeDegrees: chart.houses.ascendantLongitudeDegrees,
        midheavenLongitudeDegrees: chart.houses.midheavenLongitudeDegrees,
      }),
    ],
  );
  const chartId = birthChart.rows[0]?.id;
  if (!chartId) throw new ProtectedNatalUnavailableError();
  for (const placement of chart.placements) {
    await client.query(
      `insert into planet_position
         (calculation_run_id, body, longitude, latitude, distance, speed, coordinate_frame, units)
       values ($1,$2,$3,$4,$5,$6,'ecliptic-of-date',$7::jsonb)`,
      [
        runId,
        placement.body,
        placement.eclipticLongitudeDegrees,
        placement.eclipticLatitudeDegrees ?? null,
        placement.distanceAu ?? null,
        placement.speedLongitudeDegreesPerDay ?? null,
        JSON.stringify({
          longitude: "degrees",
          latitude: "degrees",
          distance: "au",
          speed: "degrees-per-day",
        }),
      ],
    );
  }
  for (
    let index = 0;
    index < chart.houses.cuspsLongitudeDegrees.length;
    index += 1
  ) {
    await client.query(
      `insert into house_cusp (birth_chart_id, house_number, longitude, house_system)
       values ($1,$2,$3,$4)`,
      [
        chartId,
        index + 1,
        chart.houses.cuspsLongitudeDegrees[index],
        WHOLE_SIGN_HOUSE_SYSTEM,
      ],
    );
  }
  for (const aspect of chart.aspects) {
    await client.query(
      `insert into aspect
         (calculation_run_id, source_body, target_body, aspect_type,
          exact_angle, actual_angle, orb, phase, strength)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        runId,
        aspect.firstBody,
        aspect.secondBody,
        aspect.type,
        aspect.exactAngleDegrees,
        aspect.actualAngleDegrees,
        aspect.orbDegrees,
        aspect.phase,
        aspect.normalizedStrength,
      ],
    );
  }
  if (
    chart.placements.length !== CELESTIAL_BODIES.length ||
    chart.houses.cuspsLongitudeDegrees.length !== 12
  )
    throw new ProtectedNatalUnavailableError();
  return outcome("generated");
}

async function allowsNatalChart(
  client: PoolClient,
  now: () => Date,
): Promise<boolean> {
  const rows = await client.query<SubscriptionRow>(
    `select transition_state_version, plan_key, status, period_starts_at, period_ends_at
       from subscription order by updated_at desc`,
  );
  const policy = createEntitlementPolicy();
  return rows.rows.some(
    (row) =>
      policy.check(
        {
          version: row.transition_state_version,
          planKey: row.plan_key,
          status: row.status,
          periodStartsAt: instant(row.period_starts_at),
          periodEndsAt: instant(row.period_ends_at),
        },
        "natal_chart",
        { now },
      ).allowed,
  );
}

function boundedNumber(
  value: string,
  minimum: number,
  maximum: number,
): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum)
    throw new ProtectedNatalAuthorizationError();
  return number;
}

function precision(
  value: string,
): ProtectedNatalChartProfileView["timePrecision"] {
  if (value === "date-only" || value === "approximate" || value === "exact")
    return value;
  throw new ProtectedNatalUnavailableError();
}

function storedMetadata(value: unknown): Readonly<{
  input: NatalChart["input"];
  metadata: NatalChart["metadata"];
  profileRevision: number;
  ascendantLongitudeDegrees: number;
  midheavenLongitudeDegrees: number;
}> {
  if (
    !record(value) ||
    value.version !== PROTECTED_NATAL_CHART_CONFIG_VERSION ||
    value.resolverVersion !== CIVIL_TIME_RESOLVER_VERSION ||
    !Number.isSafeInteger(value.profileRevision) ||
    (value.profileRevision as number) < 1 ||
    !record(value.input) ||
    !record(value.metadata)
  )
    throw new ProtectedNatalUnavailableError();
  const input = value.input;
  const observer = input.observer;
  const metadata = value.metadata;
  if (
    typeof input.instant !== "string" ||
    typeof input.timezone !== "string" ||
    typeof input.timezoneSource !== "string" ||
    typeof input.coordinateSource !== "string" ||
    input.coordinateOrigin !== "topocentric" ||
    input.houseSystem !== WHOLE_SIGN_HOUSE_SYSTEM ||
    !record(observer) ||
    typeof observer.latitudeDegrees !== "number" ||
    !Number.isFinite(observer.latitudeDegrees) ||
    typeof observer.longitudeDegrees !== "number" ||
    !Number.isFinite(observer.longitudeDegrees) ||
    typeof metadata.chartEngineVersion !== "string" ||
    typeof metadata.calculatedAt !== "string" ||
    !record(metadata.positionProvider) ||
    !record(metadata.houseProvider) ||
    !record(metadata.houseStrategy) ||
    !record(metadata.aspectPolicy) ||
    typeof value.ascendantLongitudeDegrees !== "number" ||
    !Number.isFinite(value.ascendantLongitudeDegrees) ||
    typeof value.midheavenLongitudeDegrees !== "number" ||
    !Number.isFinite(value.midheavenLongitudeDegrees)
  )
    throw new ProtectedNatalUnavailableError();
  return {
    input: input as unknown as NatalChart["input"],
    metadata: metadata as unknown as NatalChart["metadata"],
    profileRevision: value.profileRevision as number,
    ascendantLongitudeDegrees: boundedUnknown(
      value.ascendantLongitudeDegrees,
      0,
      359.99999999,
    ),
    midheavenLongitudeDegrees: boundedUnknown(
      value.midheavenLongitudeDegrees,
      0,
      359.99999999,
    ),
  };
}

function boundedUnknown(
  value: unknown,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  )
    throw new ProtectedNatalUnavailableError();
  return value;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function instant(value: Date | string | null): string | null {
  if (value === null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function outcome(
  value: ProtectedNatalGenerationResult["outcome"],
): ProtectedNatalGenerationResult {
  return Object.freeze({ outcome: value });
}
