import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { Pool, PoolClient } from "pg";

import {
  composeCompatibilityReport,
  type CompatibilityReport,
} from "@/application/compose-compatibility-report";
import {
  projectPublicCompatibilityShare,
  validatePublicCompatibilitySharePayload,
  type PublicCompatibilitySharePayload,
} from "@/application/project-public-compatibility-share";
import type { AccountId } from "@/infrastructure/auth/account";
import { withIdentityTransaction } from "@/infrastructure/persistence/identity-transaction";
import {
  createCompatibilityShareGrant,
  digestCompatibilityShareToken,
  generateCompatibilityShareToken,
} from "@/security/compatibility-share-token";

const PUBLIC_PAYLOAD_DIGEST_DOMAIN =
  "personal-cosmic-calendar:compatibility-public-payload:v1:";

export interface StoredCompatibilityReport {
  readonly id: string;
  readonly primaryBirthProfileId: string;
  readonly comparisonBirthProfileId: string;
  readonly report: CompatibilityReport;
  readonly share: Readonly<{
    visibility: "private" | "public";
    expiresAt: string | null;
    revokedAt: string | null;
  }>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CompatibilitySharePublication {
  readonly token: string;
  readonly expiresAt: string | null;
}

interface CompatibilityReportRow {
  id: string;
  primary_birth_profile_id: string;
  comparison_birth_profile_id: string;
  report_payload: unknown;
  report_version: string | null;
  share_state: "private" | "public";
  share_expires_at: Date | string | null;
  share_revoked_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export class InvalidStoredCompatibilityReportError extends Error {
  constructor() {
    super("Stored compatibility report is invalid");
    this.name = "InvalidStoredCompatibilityReportError";
  }
}

export class CompatibilityReportRepository {
  constructor(private readonly pool: Pick<Pool, "connect">) {}

  async create(
    ownerId: AccountId,
    input: Readonly<{
      primaryBirthProfileId: string;
      comparisonBirthProfileId: string;
      report: CompatibilityReport;
    }>,
  ): Promise<string> {
    if (
      !isUuid(input.primaryBirthProfileId) ||
      !isUuid(input.comparisonBirthProfileId) ||
      input.primaryBirthProfileId === input.comparisonBirthProfileId
    )
      throw new TypeError(
        "Valid distinct birth profile identifiers are required",
      );
    const report = validateReport(input.report);
    return withIdentityTransaction(this.pool, ownerId, async ({ client }) => {
      const result = await client.query<{ id: string }>(
        `insert into compatibility_report
           (owner_user_id, primary_birth_profile_id, comparison_birth_profile_id,
            calculation_references, category_contributions,
            report_payload, report_version)
         values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::json, $7)
         returning id`,
        [
          ownerId,
          input.primaryBirthProfileId,
          input.comparisonBirthProfileId,
          JSON.stringify(report.sourceVersions),
          JSON.stringify(
            report.scores.categories.map((category) => ({
              categoryId: category.categoryId,
              contributions: category.contributions,
            })),
          ),
          JSON.stringify(report),
          report.version,
        ],
      );
      return result.rows[0]!.id;
    });
  }

  async findOwned(
    ownerId: AccountId,
    reportId: string,
  ): Promise<StoredCompatibilityReport | null> {
    if (!isUuid(reportId)) return null;
    return withIdentityTransaction(this.pool, ownerId, async ({ client }) => {
      const row = await selectOwned(client, reportId);
      return row ? mapStored(row) : null;
    });
  }

  async deleteOwned(ownerId: AccountId, reportId: string): Promise<boolean> {
    if (!isUuid(reportId)) return false;
    return withIdentityTransaction(this.pool, ownerId, async ({ client }) => {
      const result = await client.query(
        "delete from compatibility_report where id = $1",
        [reportId],
      );
      return result.rowCount === 1;
    });
  }

  async publishOwned(
    ownerId: AccountId,
    reportId: string,
    expiresAt: string | null,
  ): Promise<CompatibilitySharePublication | null> {
    if (!isUuid(reportId)) return null;
    const token = generateCompatibilityShareToken();
    const tokenDigest = digestCompatibilityShareToken(token);
    const grant = createCompatibilityShareGrant(tokenDigest, expiresAt);

    return withIdentityTransaction(this.pool, ownerId, async ({ client }) => {
      const row = await selectOwned(client, reportId);
      if (!row) return null;
      const report = validateReport(row.report_payload);
      if (row.report_version !== report.version)
        throw new InvalidStoredCompatibilityReportError();
      const payload = projectPublicCompatibilityShare(report);
      const serializedPayload = JSON.stringify(payload);
      const payloadDigest = digestPublicPayload(serializedPayload);
      const result = await client.query(
        `update compatibility_report
         set share_state = 'public',
             public_share_payload = $2::json,
             public_share_version = $3,
             public_share_payload_digest = $4,
             share_token_hash = $5,
             share_expires_at = $6,
             share_revoked_at = null,
             updated_at = CURRENT_TIMESTAMP
         where id = $1
         returning id`,
        [
          reportId,
          serializedPayload,
          payload.version,
          payloadDigest,
          grant.tokenDigest,
          grant.expiresAt,
        ],
      );
      return result.rowCount === 1
        ? deepFreeze({ token, expiresAt: grant.expiresAt })
        : null;
    });
  }

  async revokeOwned(ownerId: AccountId, reportId: string): Promise<boolean> {
    if (!isUuid(reportId)) return false;
    return withIdentityTransaction(this.pool, ownerId, async ({ client }) => {
      const result = await client.query(
        `update compatibility_report
         set share_state = 'private',
             public_share_payload = null,
             public_share_version = null,
             public_share_payload_digest = null,
             share_revoked_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         where id = $1 and share_state = 'public'
         returning id`,
        [reportId],
      );
      return result.rowCount === 1;
    });
  }

  async resolveActivePublic(
    token: string,
  ): Promise<PublicCompatibilitySharePayload | null> {
    let digest: string;
    try {
      digest = digestCompatibilityShareToken(token);
    } catch {
      return null;
    }

    const client = await this.pool.connect();
    let open = false;
    try {
      await client.query("begin");
      open = true;
      await client.query("set local role app_share_reader");
      await client.query(
        "select set_config('app.current_share_token_hash', $1, true)",
        [digest],
      );
      const result = await client.query<{ envelope: unknown }>(
        `select json_build_object(
           'payload', public_share_payload,
           'payloadDigest', public_share_payload_digest
         ) as envelope
         from compatibility_report`,
      );
      await client.query("commit");
      open = false;
      const envelope = result.rows[0]?.envelope;
      if (envelope === null || envelope === undefined) return null;
      if (
        !record(envelope) ||
        !exactKeys(envelope, ["payload", "payloadDigest"]) ||
        typeof envelope.payloadDigest !== "string" ||
        !matchesPublicPayloadDigest(
          JSON.stringify(envelope.payload),
          envelope.payloadDigest,
        )
      )
        throw new InvalidStoredCompatibilityReportError();
      return validatePublicCompatibilitySharePayload(envelope.payload);
    } catch (error) {
      if (open) await client.query("rollback");
      if (error instanceof InvalidStoredCompatibilityReportError) throw error;
      if (
        error instanceof Error &&
        error.name === "InvalidPublicCompatibilityShareInputError"
      )
        throw new InvalidStoredCompatibilityReportError();
      throw error;
    } finally {
      client.release();
    }
  }
}

async function selectOwned(
  client: PoolClient,
  reportId: string,
): Promise<CompatibilityReportRow | undefined> {
  const result = await client.query<CompatibilityReportRow>(
    `select id, primary_birth_profile_id, comparison_birth_profile_id,
            report_payload, report_version, share_state,
            share_expires_at, share_revoked_at, created_at, updated_at
     from compatibility_report
     where id = $1`,
    [reportId],
  );
  return result.rows[0];
}

function mapStored(row: CompatibilityReportRow): StoredCompatibilityReport {
  const report = validateReport(row.report_payload);
  if (row.report_version !== report.version)
    throw new InvalidStoredCompatibilityReportError();
  return deepFreeze({
    id: row.id,
    primaryBirthProfileId: row.primary_birth_profile_id,
    comparisonBirthProfileId: row.comparison_birth_profile_id,
    report,
    share: {
      visibility: row.share_state,
      expiresAt: normalizeInstant(row.share_expires_at),
      revokedAt: normalizeInstant(row.share_revoked_at),
    },
    createdAt: normalizeInstant(row.created_at)!,
    updatedAt: normalizeInstant(row.updated_at)!,
  });
}

function validateReport(value: unknown): CompatibilityReport {
  try {
    const report = value as CompatibilityReport;
    const rebuilt = composeCompatibilityReport({
      aggregate: report.aggregate,
      scores: report.scores,
      projection: report.projection,
      rendered: report.rendered,
    });
    if (JSON.stringify(report) !== JSON.stringify(rebuilt))
      throw new InvalidStoredCompatibilityReportError();
    return rebuilt;
  } catch {
    throw new InvalidStoredCompatibilityReportError();
  }
}

function normalizeInstant(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new InvalidStoredCompatibilityReportError();
  return date.toISOString();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function digestPublicPayload(serializedPayload: string): string {
  return `sha256:${createHash("sha256")
    .update(PUBLIC_PAYLOAD_DIGEST_DOMAIN, "utf8")
    .update(serializedPayload, "utf8")
    .digest("hex")}`;
}

function matchesPublicPayloadDigest(
  serializedPayload: string,
  expectedDigest: string,
): boolean {
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedDigest)) return false;
  const actual = Buffer.from(digestPublicPayload(serializedPayload), "ascii");
  const expected = Buffer.from(expectedDigest, "ascii");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
