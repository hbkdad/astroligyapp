import {
  pgTable,
  uniqueIndex,
  pgPolicy,
  uuid,
  text,
  timestamp,
  index,
  foreignKey,
  check,
  numeric,
  json,
  jsonb,
  date,
  integer,
  boolean,
  primaryKey,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const calculationStatus = pgEnum("calculation_status", [
  "pending",
  "completed",
  "failed",
]);
export const publicationState = pgEnum("publication_state", [
  "draft",
  "published",
  "retired",
]);
export const compatibilityShareState = pgEnum("compatibility_share_state", [
  "private",
  "public",
]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
]);

export const userAccount = pgTable(
  "user_account",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    identityProviderSubject: text("identity_provider_subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    uniqueIndex("user_account_identity_subject_uidx").using(
      "btree",
      table.identityProviderSubject.asc().nullsLast().op("text_ops"),
    ),
    pgPolicy("user_account_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(id = app.current_user_id())`,
      withCheck: sql`(id = app.current_user_id())`,
    }),
    pgPolicy("user_account_auth_account_bootstrap_owner", {
      as: "permissive",
      for: "all",
      to: ["app_auth_account_bootstrap_owner"],
      using: sql`true`,
      withCheck: sql`true`,
    }),
    pgPolicy("user_account_deletion_owner", {
      as: "permissive",
      for: "all",
      to: ["app_account_deletion_owner"],
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
);

export const profile = pgTable(
  "profile",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    displayName: text("display_name").notNull(),
    currentTimezone: text("current_timezone").notNull(),
    currentLatitude: numeric("current_latitude", { precision: 9, scale: 6 }),
    currentLongitude: numeric("current_longitude", { precision: 9, scale: 6 }),
    preferences: jsonb().default({}).notNull(),
    revision: integer().default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    index("profile_owner_idx").using(
      "btree",
      table.ownerUserId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.ownerUserId],
      foreignColumns: [userAccount.id],
      name: "profile_owner_user_id_user_account_id_fk",
    }).onDelete("cascade"),
    pgPolicy("profile_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(owner_user_id = app.current_user_id())`,
      withCheck: sql`(owner_user_id = app.current_user_id())`,
    }),
    pgPolicy("profile_deletion_owner", {
      as: "permissive",
      for: "all",
      to: ["app_account_deletion_owner"],
      using: sql`true`,
      withCheck: sql`true`,
    }),
    check(
      "profile_current_latitude_check",
      sql`(current_latitude IS NULL) OR ((current_latitude >= ('-90'::integer)::numeric) AND (current_latitude <= (90)::numeric))`,
    ),
    check(
      "profile_current_longitude_check",
      sql`(current_longitude IS NULL) OR ((current_longitude >= ('-180'::integer)::numeric) AND (current_longitude <= (180)::numeric))`,
    ),
    check(
      "profile_display_name_length_check",
      sql`char_length(display_name) between 1 and 80`,
    ),
    check(
      "profile_current_timezone_length_check",
      sql`char_length(current_timezone) between 1 and 128`,
    ),
    check(
      "profile_current_coordinates_pair_check",
      sql`(current_latitude is null) = (current_longitude is null)`,
    ),
    check("profile_revision_check", sql`revision >= 1`),
  ],
);

export const calculationRun = pgTable(
  "calculation_run",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    kind: text().notNull(),
    normalizedInputHash: text("normalized_input_hash").notNull(),
    engineVersion: text("engine_version").notNull(),
    providerKey: text("provider_key").notNull(),
    providerVersion: text("provider_version").notNull(),
    configVersion: text("config_version").notNull(),
    status: calculationStatus().default("pending").notNull(),
    requestedAt: timestamp("requested_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "string",
    }),
    failureCode: text("failure_code"),
  },
  (table) => [
    uniqueIndex("calculation_run_cache_uidx").using(
      "btree",
      table.kind.asc().nullsLast().op("text_ops"),
      table.normalizedInputHash.asc().nullsLast().op("text_ops"),
      table.engineVersion.asc().nullsLast().op("text_ops"),
      table.providerKey.asc().nullsLast().op("text_ops"),
      table.providerVersion.asc().nullsLast().op("text_ops"),
      table.configVersion.asc().nullsLast().op("text_ops"),
      table.ownerUserId.asc().nullsLast().op("uuid_ops"),
    ),
    index("calculation_run_owner_idx").using(
      "btree",
      table.ownerUserId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.ownerUserId],
      foreignColumns: [userAccount.id],
      name: "calculation_run_owner_user_id_user_account_id_fk",
    }).onDelete("cascade"),
    pgPolicy("calculation_run_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(owner_user_id = app.current_user_id())`,
      withCheck: sql`(owner_user_id = app.current_user_id())`,
    }),
    pgPolicy("calculation_run_deletion_owner", {
      as: "permissive",
      for: "all",
      to: ["app_account_deletion_owner"],
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
);

export const compatibilityReport = pgTable(
  "compatibility_report",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    ownerUserId: uuid("owner_user_id").notNull(),
    primaryBirthProfileId: uuid("primary_birth_profile_id").notNull(),
    comparisonBirthProfileId: uuid("comparison_birth_profile_id").notNull(),
    calculationReferences: jsonb("calculation_references").notNull(),
    categoryContributions: jsonb("category_contributions").notNull(),
    reportPayload: json("report_payload"),
    reportVersion: text("report_version"),
    shareState: compatibilityShareState("share_state")
      .default("private")
      .notNull(),
    publicSharePayload: json("public_share_payload"),
    publicShareVersion: text("public_share_version"),
    publicSharePayloadDigest: text("public_share_payload_digest"),
    shareTokenHash: text("share_token_hash"),
    shareExpiresAt: timestamp("share_expires_at", {
      withTimezone: true,
      mode: "string",
    }),
    shareRevokedAt: timestamp("share_revoked_at", {
      withTimezone: true,
      mode: "string",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("compatibility_report_owner_idx").using(
      "btree",
      table.ownerUserId.asc().nullsLast().op("uuid_ops"),
    ),
    uniqueIndex("compatibility_report_share_token_uidx")
      .using("btree", table.shareTokenHash.asc().nullsLast().op("text_ops"))
      .where(sql`(share_token_hash IS NOT NULL)`),
    foreignKey({
      columns: [table.ownerUserId],
      foreignColumns: [userAccount.id],
      name: "compatibility_report_owner_user_id_user_account_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.primaryBirthProfileId],
      foreignColumns: [birthProfile.id],
      name: "compatibility_report_primary_birth_profile_id_birth_profile_id_",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.comparisonBirthProfileId],
      foreignColumns: [birthProfile.id],
      name: "compatibility_report_comparison_birth_profile_id_birth_profile_",
    }).onDelete("cascade"),
    pgPolicy("compatibility_report_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`((owner_user_id = app.current_user_id()) AND (EXISTS ( SELECT 1
   FROM (birth_profile primary_birth
     JOIN profile primary_profile ON ((primary_profile.id = primary_birth.profile_id)))
  WHERE ((primary_birth.id = compatibility_report.primary_birth_profile_id) AND (primary_profile.owner_user_id = app.current_user_id())))) AND (EXISTS ( SELECT 1
   FROM (birth_profile comparison_birth
     JOIN profile comparison_profile ON ((comparison_profile.id = comparison_birth.profile_id)))
  WHERE ((comparison_birth.id = compatibility_report.comparison_birth_profile_id) AND (comparison_profile.owner_user_id = app.current_user_id())))))`,
      withCheck: sql`((owner_user_id = app.current_user_id()) AND (EXISTS ( SELECT 1
   FROM (birth_profile primary_birth
     JOIN profile primary_profile ON ((primary_profile.id = primary_birth.profile_id)))
  WHERE ((primary_birth.id = compatibility_report.primary_birth_profile_id) AND (primary_profile.owner_user_id = app.current_user_id())))) AND (EXISTS ( SELECT 1
   FROM (birth_profile comparison_birth
     JOIN profile comparison_profile ON ((comparison_profile.id = comparison_birth.profile_id)))
  WHERE ((comparison_birth.id = compatibility_report.comparison_birth_profile_id) AND (comparison_profile.owner_user_id = app.current_user_id())))))`,
    }),
    pgPolicy("compatibility_report_public_share", {
      as: "permissive",
      for: "select",
      to: ["app_share_reader"],
      using: sql`((share_token_hash = app.current_share_token_hash()) AND (share_state = 'public') AND (share_revoked_at IS NULL) AND ((share_expires_at IS NULL) OR (share_expires_at > CURRENT_TIMESTAMP)))`,
    }),
    check(
      "compatibility_report_distinct_profiles_check",
      sql`primary_birth_profile_id <> comparison_birth_profile_id`,
    ),
    check(
      "compatibility_report_payload_version_check",
      sql`(report_payload IS NULL) = (report_version IS NULL)`,
    ),
    check(
      "compatibility_report_token_digest_check",
      sql`((share_token_hash IS NULL) OR (share_token_hash ~ '^sha256:[0-9a-f]{64}$')) AND ((public_share_payload_digest IS NULL) OR (public_share_payload_digest ~ '^sha256:[0-9a-f]{64}$'))`,
    ),
    check(
      "compatibility_report_share_lifecycle_check",
      sql`((share_state = 'public' AND report_payload IS NOT NULL AND public_share_payload IS NOT NULL AND public_share_version IS NOT NULL AND public_share_payload_digest IS NOT NULL AND share_token_hash IS NOT NULL AND share_revoked_at IS NULL) OR (share_state = 'private' AND public_share_payload IS NULL AND public_share_version IS NULL AND public_share_payload_digest IS NULL AND ((share_token_hash IS NULL AND share_expires_at IS NULL AND share_revoked_at IS NULL) OR (share_token_hash IS NOT NULL AND share_revoked_at IS NOT NULL))))`,
    ),
  ],
);

export const subscription = pgTable(
  "subscription",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userAccountId: uuid("user_account_id").notNull(),
    planKey: text("plan_key").notNull(),
    status: subscriptionStatus().notNull(),
    externalProvider: text("external_provider").notNull(),
    externalCustomerReference: text("external_customer_reference").notNull(),
    externalSubscriptionReference: text(
      "external_subscription_reference",
    ).notNull(),
    periodStartsAt: timestamp("period_starts_at", {
      withTimezone: true,
      mode: "string",
    }),
    periodEndsAt: timestamp("period_ends_at", {
      withTimezone: true,
      mode: "string",
    }),
    transitionStateVersion: text("transition_state_version"),
    lastProviderEventId: text("last_provider_event_id"),
    lastProviderEventOccurredAt: timestamp("last_provider_event_occurred_at", {
      withTimezone: true,
      mode: "string",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("subscription_provider_event_uidx")
      .using(
        "btree",
        table.externalProvider.asc().nullsLast().op("text_ops"),
        table.lastProviderEventId.asc().nullsLast().op("text_ops"),
      )
      .where(sql`(last_provider_event_id IS NOT NULL)`),
    uniqueIndex("subscription_provider_reference_uidx").using(
      "btree",
      table.externalProvider.asc().nullsLast().op("text_ops"),
      table.externalSubscriptionReference.asc().nullsLast().op("text_ops"),
    ),
    index("subscription_user_idx").using(
      "btree",
      table.userAccountId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.userAccountId],
      foreignColumns: [userAccount.id],
      name: "subscription_user_account_id_user_account_id_fk",
    }).onDelete("cascade"),
    pgPolicy("subscription_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(user_account_id = app.current_user_id())`,
      withCheck: sql`(user_account_id = app.current_user_id())`,
    }),
    pgPolicy("subscription_deletion_owner", {
      as: "permissive",
      for: "select",
      to: ["app_account_deletion_owner"],
      using: sql`true`,
    }),
    check(
      "subscription_transition_state_check",
      sql`((transition_state_version IS NULL AND last_provider_event_occurred_at IS NULL) OR (transition_state_version = '1.0.0' AND plan_key IN ('personal', 'advanced') AND period_starts_at IS NOT NULL AND period_ends_at IS NOT NULL AND period_starts_at < period_ends_at AND last_provider_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' AND last_provider_event_occurred_at IS NOT NULL))`,
    ),
  ],
);

export const billingCustomerBinding = pgTable(
  "billing_customer_binding",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userAccountId: uuid("user_account_id").notNull(),
    externalProvider: text("external_provider").notNull(),
    externalCustomerReference: text("external_customer_reference").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("billing_customer_binding_provider_customer_uidx").using(
      "btree",
      table.externalProvider.asc().nullsLast().op("text_ops"),
      table.externalCustomerReference.asc().nullsLast().op("text_ops"),
    ),
    uniqueIndex("billing_customer_binding_owner_provider_uidx").using(
      "btree",
      table.userAccountId.asc().nullsLast().op("uuid_ops"),
      table.externalProvider.asc().nullsLast().op("text_ops"),
    ),
    index("billing_customer_binding_owner_idx").using(
      "btree",
      table.userAccountId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.userAccountId],
      foreignColumns: [userAccount.id],
      name: "billing_customer_binding_user_account_id_user_account_id_fk",
    }).onDelete("cascade"),
    pgPolicy("billing_customer_binding_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(user_account_id = app.current_user_id())`,
      withCheck: sql`(user_account_id = app.current_user_id())`,
    }),
    pgPolicy("billing_customer_binding_deletion_owner", {
      as: "permissive",
      for: "select",
      to: ["app_account_deletion_owner"],
      using: sql`true`,
    }),
    check(
      "billing_customer_binding_provider_check",
      sql`char_length(external_provider) <= 64 AND external_provider ~ '^[a-z][a-z0-9_-]*$'`,
    ),
    check(
      "billing_customer_binding_customer_check",
      sql`char_length(external_customer_reference) <= 200 AND external_customer_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'`,
    ),
  ],
);

export const subscriptionProviderEventReceipt = pgTable(
  "subscription_provider_event_receipt",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    externalProvider: text("external_provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    normalizedEventDigest: text("normalized_event_digest").notNull(),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    outcome: text().notNull(),
    receivedAt: timestamp("received_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("subscription_event_receipt_provider_event_uidx").using(
      "btree",
      table.externalProvider.asc().nullsLast().op("text_ops"),
      table.providerEventId.asc().nullsLast().op("text_ops"),
    ),
    index("subscription_event_receipt_subscription_idx").using(
      "btree",
      table.subscriptionId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.subscriptionId],
      foreignColumns: [subscription.id],
      name: "subscription_event_receipt_subscription_id_subscription_id_fk",
    }).onDelete("cascade"),
    pgPolicy("subscription_event_receipt_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`EXISTS (SELECT 1 FROM subscription WHERE subscription.id = subscription_provider_event_receipt.subscription_id AND subscription.user_account_id = app.current_user_id())`,
      withCheck: sql`EXISTS (SELECT 1 FROM subscription WHERE subscription.id = subscription_provider_event_receipt.subscription_id AND subscription.user_account_id = app.current_user_id())`,
    }),
    check(
      "subscription_event_receipt_digest_check",
      sql`normalized_event_digest ~ '^sha256:[0-9a-f]{64}$'`,
    ),
    check(
      "subscription_event_receipt_outcome_check",
      sql`outcome IN ('applied', 'stale', 'conflict', 'invalid-transition')`,
    ),
  ],
);

export const authenticationEmailDelivery = pgTable(
  "authentication_email_delivery",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    purpose: text().notNull(),
    templateVersion: text("template_version").notNull(),
    referenceKeyVersion: integer("reference_key_version").notNull(),
    referenceDigest: text("reference_digest").notNull(),
    requestDigest: text("request_digest").notNull(),
    state: text().notNull(),
    providerMessageReference: text("provider_message_reference"),
    reservedAt: timestamp("reserved_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "string",
    }),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("authentication_email_delivery_reference_uidx").using(
      "btree",
      table.referenceDigest.asc().nullsLast().op("text_ops"),
    ),
    uniqueIndex("authentication_email_delivery_provider_reference_uidx")
      .using(
        "btree",
        table.providerMessageReference.asc().nullsLast().op("text_ops"),
      )
      .where(sql`provider_message_reference IS NOT NULL`),
    index("authentication_email_delivery_recovery_idx").using(
      "btree",
      table.state.asc().nullsLast().op("text_ops"),
      table.leaseExpiresAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    pgPolicy("authentication_email_delivery_runtime", {
      as: "permissive",
      for: "all",
      to: ["app_auth_email_runtime"],
      using: sql`true`,
      withCheck: sql`true`,
    }),
    pgPolicy("authentication_email_delivery_feedback_consumer", {
      as: "permissive",
      for: "all",
      to: ["app_auth_email_feedback_consumer"],
      using: sql`true`,
      withCheck: sql`true`,
    }),
    check(
      "authentication_email_delivery_purpose_check",
      sql`purpose IN ('verify-email', 'reset-password')`,
    ),
    check(
      "authentication_email_delivery_template_check",
      sql`(purpose = 'verify-email' AND template_version = 'auth.verify-email.en-CA.1') OR (purpose = 'reset-password' AND template_version = 'auth.reset-password.en-CA.1')`,
    ),
    check(
      "authentication_email_delivery_key_version_check",
      sql`reference_key_version >= 0`,
    ),
    check(
      "authentication_email_delivery_reference_digest_check",
      sql`reference_digest ~ '^hmac-sha256:[0-9]+:[0-9a-f]{64}$'`,
    ),
    check(
      "authentication_email_delivery_request_digest_check",
      sql`request_digest ~ '^hmac-sha256:[0-9]+:[0-9a-f]{64}$'`,
    ),
    check(
      "authentication_email_delivery_digest_version_check",
      sql`split_part(reference_digest, ':', 2)::integer = reference_key_version AND split_part(request_digest, ':', 2)::integer = reference_key_version`,
    ),
    check(
      "authentication_email_delivery_state_check",
      sql`state IN ('reserved', 'accepted', 'rejected', 'retry', 'reconciliation-required', 'suppressed', 'delivered', 'transient-bounce', 'permanent-bounce', 'complaint', 'delivery-delayed', 'provider-rejected', 'rendering-failed')`,
    ),
    check(
      "authentication_email_delivery_provider_reference_check",
      sql`provider_message_reference IS NULL OR (char_length(provider_message_reference) <= 200 AND provider_message_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$')`,
    ),
    check(
      "authentication_email_delivery_timeline_check",
      sql`reserved_at < lease_expires_at AND reserved_at <= updated_at AND (completed_at IS NULL OR (reserved_at <= completed_at AND completed_at <= updated_at))`,
    ),
    check(
      "authentication_email_delivery_lifecycle_check",
      sql`(state = 'reserved' AND completed_at IS NULL AND provider_message_reference IS NULL) OR (state IN ('accepted', 'delivered', 'transient-bounce', 'permanent-bounce', 'complaint', 'delivery-delayed', 'provider-rejected', 'rendering-failed') AND completed_at IS NOT NULL AND provider_message_reference IS NOT NULL) OR (state IN ('rejected', 'retry', 'suppressed') AND completed_at IS NOT NULL AND provider_message_reference IS NULL) OR (state = 'reconciliation-required' AND completed_at IS NOT NULL)`,
    ),
  ],
);

export const authenticationEmailFeedbackReceipt = pgTable(
  "authentication_email_feedback_receipt",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    deliveryId: uuid("delivery_id"),
    eventKeyVersion: integer("event_key_version").notNull(),
    eventDigest: text("event_digest").notNull(),
    eventType: text("event_type").notNull(),
    outcome: text().notNull(),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    receivedAt: timestamp("received_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("authentication_email_feedback_event_uidx").using(
      "btree",
      table.eventDigest.asc().nullsLast().op("text_ops"),
    ),
    index("authentication_email_feedback_delivery_idx").using(
      "btree",
      table.deliveryId.asc().nullsLast().op("uuid_ops"),
      table.occurredAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    index("authentication_email_feedback_retention_idx").using(
      "btree",
      table.receivedAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.deliveryId],
      foreignColumns: [authenticationEmailDelivery.id],
      name: "authentication_email_feedback_delivery_fk",
    }),
    pgPolicy("authentication_email_feedback_consumer", {
      as: "permissive",
      for: "all",
      to: ["app_auth_email_feedback_consumer"],
      using: sql`true`,
      withCheck: sql`true`,
    }),
    check(
      "authentication_email_feedback_key_version_check",
      sql`event_key_version >= 0`,
    ),
    check(
      "authentication_email_feedback_digest_check",
      sql`event_digest ~ '^hmac-sha256:[0-9]+:[0-9a-f]{64}$' AND split_part(event_digest, ':', 2)::integer = event_key_version`,
    ),
    check(
      "authentication_email_feedback_type_check",
      sql`event_type IN ('delivery', 'bounce', 'complaint', 'reject', 'delay', 'render-failure')`,
    ),
    check(
      "authentication_email_feedback_outcome_check",
      sql`outcome IN ('applied', 'stale', 'unmatched')`,
    ),
    check(
      "authentication_email_feedback_timeline_check",
      sql`occurred_at <= received_at + interval '5 minutes'`,
    ),
  ],
);

export const authenticationEmailSuppression = pgTable(
  "authentication_email_suppression",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    recipientKeyVersion: integer("recipient_key_version").notNull(),
    recipientDigest: text("recipient_digest").notNull(),
    reason: text().notNull(),
    suppressedAt: timestamp("suppressed_at", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("authentication_email_suppression_recipient_uidx").using(
      "btree",
      table.recipientDigest.asc().nullsLast().op("text_ops"),
    ),
    index("authentication_email_suppression_retention_idx").using(
      "btree",
      table.suppressedAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    pgPolicy("authentication_email_suppression_consumer", {
      as: "permissive",
      for: "all",
      to: ["app_auth_email_feedback_consumer"],
      using: sql`true`,
      withCheck: sql`true`,
    }),
    check(
      "authentication_email_suppression_key_version_check",
      sql`recipient_key_version >= 0`,
    ),
    check(
      "authentication_email_suppression_digest_check",
      sql`recipient_digest ~ '^hmac-sha256:[0-9]+:[0-9a-f]{64}$' AND split_part(recipient_digest, ':', 2)::integer = recipient_key_version`,
    ),
    check(
      "authentication_email_suppression_reason_check",
      sql`reason IN ('permanent-bounce', 'complaint')`,
    ),
  ],
);

export const auditEvent = pgTable(
  "audit_event",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    ownerUserId: uuid("owner_user_id"),
    actorReference: text("actor_reference").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceReference: text("resource_reference").notNull(),
    action: text().notNull(),
    requestId: text("request_id").notNull(),
    metadata: jsonb().default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_event_owner_occurred_idx").using(
      "btree",
      table.ownerUserId.asc().nullsLast().op("timestamptz_ops"),
      table.occurredAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.ownerUserId],
      foreignColumns: [userAccount.id],
      name: "audit_event_owner_user_id_user_account_id_fk",
    }).onDelete("set null"),
    pgPolicy("audit_event_owner", {
      as: "permissive",
      for: "select",
      to: ["app_user"],
      using: sql`(owner_user_id = app.current_user_id())`,
    }),
    pgPolicy("audit_event_deletion_owner", {
      as: "permissive",
      for: "all",
      to: ["app_account_deletion_owner"],
      using: sql`true`,
      withCheck: sql`true`,
    }),
  ],
);

export const birthProfile = pgTable(
  "birth_profile",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    profileId: uuid("profile_id").notNull(),
    birthDate: date("birth_date").notNull(),
    birthName: text("birth_name"),
    birthTimeLocal: text("birth_time_local"),
    timezone: text().notNull(),
    timezoneResolution: jsonb("timezone_resolution").default({}).notNull(),
    latitude: numeric({ precision: 9, scale: 6 }),
    longitude: numeric({ precision: 9, scale: 6 }),
    coordinateSource: text("coordinate_source"),
    birthTimePrecision: text("birth_time_precision").notNull(),
    uncertainty: jsonb().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("birth_profile_profile_idx").using(
      "btree",
      table.profileId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.profileId],
      foreignColumns: [profile.id],
      name: "birth_profile_profile_id_profile_id_fk",
    }).onDelete("cascade"),
    pgPolicy("birth_profile_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(EXISTS ( SELECT 1
   FROM profile
  WHERE ((profile.id = birth_profile.profile_id) AND (profile.owner_user_id = app.current_user_id()))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM profile
  WHERE ((profile.id = birth_profile.profile_id) AND (profile.owner_user_id = app.current_user_id()))))`,
    }),
    check(
      "birth_profile_latitude_check",
      sql`(latitude IS NULL) OR ((latitude >= ('-90'::integer)::numeric) AND (latitude <= (90)::numeric))`,
    ),
    check(
      "birth_profile_longitude_check",
      sql`(longitude IS NULL) OR ((longitude >= ('-180'::integer)::numeric) AND (longitude <= (180)::numeric))`,
    ),
    check(
      "birth_profile_timezone_length_check",
      sql`char_length(timezone) between 1 and 128`,
    ),
    check(
      "birth_profile_birth_name_length_check",
      sql`birth_name is null or char_length(birth_name) between 1 and 160`,
    ),
    check(
      "birth_profile_time_precision_check",
      sql`birth_time_precision in ('date-only', 'approximate', 'exact')`,
    ),
    check(
      "birth_profile_time_consistency_check",
      sql`(birth_time_precision = 'date-only' and birth_time_local is null) or (birth_time_precision in ('approximate', 'exact') and birth_time_local ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')`,
    ),
    check(
      "birth_profile_coordinates_pair_check",
      sql`(latitude is null) = (longitude is null)`,
    ),
    check(
      "birth_profile_coordinate_source_check",
      sql`(latitude is null and coordinate_source is null) or (latitude is not null and char_length(coordinate_source) between 1 and 64)`,
    ),
  ],
);

export const birthChart = pgTable(
  "birth_chart",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    birthProfileId: uuid("birth_profile_id").notNull(),
    calculationRunId: uuid("calculation_run_id").notNull(),
    houseSystem: text("house_system").notNull(),
    resolutionMetadata: jsonb("resolution_metadata").default({}).notNull(),
    supersededById: uuid("superseded_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("birth_chart_birth_profile_idx").using(
      "btree",
      table.birthProfileId.asc().nullsLast().op("uuid_ops"),
    ),
    uniqueIndex("birth_chart_calculation_run_uidx").using(
      "btree",
      table.calculationRunId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.birthProfileId],
      foreignColumns: [birthProfile.id],
      name: "birth_chart_birth_profile_id_birth_profile_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.calculationRunId],
      foreignColumns: [calculationRun.id],
      name: "birth_chart_calculation_run_id_calculation_run_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.supersededById],
      foreignColumns: [table.id],
      name: "birth_chart_superseded_by_id_birth_chart_id_fk",
    }).onDelete("set null"),
    pgPolicy("birth_chart_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(EXISTS ( SELECT 1
   FROM (birth_profile
     JOIN profile ON ((profile.id = birth_profile.profile_id)))
  WHERE ((birth_profile.id = birth_chart.birth_profile_id) AND (profile.owner_user_id = app.current_user_id()))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM (birth_profile
     JOIN profile ON ((profile.id = birth_profile.profile_id)))
  WHERE ((birth_profile.id = birth_chart.birth_profile_id) AND (profile.owner_user_id = app.current_user_id()))))`,
    }),
  ],
);

export const planetPosition = pgTable(
  "planet_position",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    calculationRunId: uuid("calculation_run_id").notNull(),
    body: text().notNull(),
    longitude: numeric({ precision: 12, scale: 8 }).notNull(),
    latitude: numeric({ precision: 12, scale: 8 }),
    distance: numeric({ precision: 18, scale: 10 }),
    speed: numeric({ precision: 18, scale: 10 }),
    coordinateFrame: text("coordinate_frame").notNull(),
    units: jsonb().notNull(),
  },
  (table) => [
    uniqueIndex("planet_position_run_body_uidx").using(
      "btree",
      table.calculationRunId.asc().nullsLast().op("text_ops"),
      table.body.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.calculationRunId],
      foreignColumns: [calculationRun.id],
      name: "planet_position_calculation_run_id_calculation_run_id_fk",
    }).onDelete("cascade"),
    pgPolicy("planet_position_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(EXISTS ( SELECT 1
   FROM calculation_run
  WHERE ((calculation_run.id = planet_position.calculation_run_id) AND (calculation_run.owner_user_id = app.current_user_id()))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM calculation_run
  WHERE ((calculation_run.id = planet_position.calculation_run_id) AND (calculation_run.owner_user_id = app.current_user_id()))))`,
    }),
    check(
      "planet_position_longitude_check",
      sql`(longitude >= (0)::numeric) AND (longitude < (360)::numeric)`,
    ),
  ],
);

export const aspect = pgTable(
  "aspect",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    calculationRunId: uuid("calculation_run_id").notNull(),
    sourceBody: text("source_body").notNull(),
    targetBody: text("target_body").notNull(),
    aspectType: text("aspect_type").notNull(),
    exactAngle: numeric("exact_angle", { precision: 9, scale: 6 }).notNull(),
    actualAngle: numeric("actual_angle", { precision: 9, scale: 6 }).notNull(),
    orb: numeric({ precision: 9, scale: 6 }).notNull(),
    phase: text().notNull(),
    strength: numeric({ precision: 8, scale: 6 }).notNull(),
  },
  (table) => [
    index("aspect_calculation_run_idx").using(
      "btree",
      table.calculationRunId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.calculationRunId],
      foreignColumns: [calculationRun.id],
      name: "aspect_calculation_run_id_calculation_run_id_fk",
    }).onDelete("cascade"),
    pgPolicy("aspect_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(EXISTS ( SELECT 1
   FROM calculation_run
  WHERE ((calculation_run.id = aspect.calculation_run_id) AND (calculation_run.owner_user_id = app.current_user_id()))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM calculation_run
  WHERE ((calculation_run.id = aspect.calculation_run_id) AND (calculation_run.owner_user_id = app.current_user_id()))))`,
    }),
    check("aspect_orb_check", sql`orb >= (0)::numeric`),
    check(
      "aspect_strength_check",
      sql`(strength >= (0)::numeric) AND (strength <= (1)::numeric)`,
    ),
  ],
);

export const lunarEvent = pgTable(
  "lunar_event",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    calculationRunId: uuid("calculation_run_id").notNull(),
    eventType: text("event_type").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "string" }),
    exactAt: timestamp("exact_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "string" }),
    locationScope: jsonb("location_scope"),
    phaseAngle: numeric("phase_angle", { precision: 12, scale: 8 }),
    illumination: numeric({ precision: 8, scale: 6 }),
    moonLongitude: numeric("moon_longitude", { precision: 12, scale: 8 }),
  },
  (table) => [
    index("lunar_event_run_exact_idx").using(
      "btree",
      table.calculationRunId.asc().nullsLast().op("timestamptz_ops"),
      table.exactAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.calculationRunId],
      foreignColumns: [calculationRun.id],
      name: "lunar_event_calculation_run_id_calculation_run_id_fk",
    }).onDelete("cascade"),
    pgPolicy("lunar_event_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(EXISTS ( SELECT 1
   FROM calculation_run
  WHERE ((calculation_run.id = lunar_event.calculation_run_id) AND (calculation_run.owner_user_id = app.current_user_id()))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM calculation_run
  WHERE ((calculation_run.id = lunar_event.calculation_run_id) AND (calculation_run.owner_user_id = app.current_user_id()))))`,
    }),
    check(
      "lunar_event_illumination_check",
      sql`(illumination IS NULL) OR ((illumination >= (0)::numeric) AND (illumination <= (1)::numeric))`,
    ),
  ],
);

export const transitEvent = pgTable(
  "transit_event",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    profileId: uuid("profile_id").notNull(),
    calculationRunId: uuid("calculation_run_id").notNull(),
    transitingBody: text("transiting_body").notNull(),
    natalTarget: text("natal_target").notNull(),
    aspectType: text("aspect_type").notNull(),
    entersOrbAt: timestamp("enters_orb_at", {
      withTimezone: true,
      mode: "string",
    }),
    exactAt: timestamp("exact_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    exitsOrbAt: timestamp("exits_orb_at", {
      withTimezone: true,
      mode: "string",
    }),
    scoreModelVersion: text("score_model_version").notNull(),
    strength: numeric({ precision: 8, scale: 6 }).notNull(),
    categories: jsonb().default([]).notNull(),
  },
  (table) => [
    index("transit_event_profile_exact_idx").using(
      "btree",
      table.profileId.asc().nullsLast().op("timestamptz_ops"),
      table.exactAt.asc().nullsLast().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.profileId],
      foreignColumns: [profile.id],
      name: "transit_event_profile_id_profile_id_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.calculationRunId],
      foreignColumns: [calculationRun.id],
      name: "transit_event_calculation_run_id_calculation_run_id_fk",
    }).onDelete("cascade"),
    pgPolicy("transit_event_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`((EXISTS ( SELECT 1
   FROM profile
  WHERE ((profile.id = transit_event.profile_id) AND (profile.owner_user_id = app.current_user_id())))) AND (EXISTS ( SELECT 1
   FROM calculation_run
  WHERE ((calculation_run.id = transit_event.calculation_run_id) AND (calculation_run.owner_user_id = app.current_user_id())))))`,
      withCheck: sql`((EXISTS ( SELECT 1
   FROM profile
  WHERE ((profile.id = transit_event.profile_id) AND (profile.owner_user_id = app.current_user_id())))) AND (EXISTS ( SELECT 1
   FROM calculation_run
  WHERE ((calculation_run.id = transit_event.calculation_run_id) AND (calculation_run.owner_user_id = app.current_user_id())))))`,
    }),
    check(
      "transit_event_time_order_check",
      sql`((enters_orb_at IS NULL) OR (enters_orb_at <= exact_at)) AND ((exits_orb_at IS NULL) OR (exits_orb_at >= exact_at))`,
    ),
  ],
);

export const numerologyProfile = pgTable(
  "numerology_profile",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    profileId: uuid("profile_id").notNull(),
    normalizedInputHash: text("normalized_input_hash").notNull(),
    strategyVersion: text("strategy_version").notNull(),
    normalizationVersion: text("normalization_version").notNull(),
    results: jsonb().notNull(),
    calculationTrace: jsonb("calculation_trace").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("numerology_profile_profile_idx").using(
      "btree",
      table.profileId.asc().nullsLast().op("uuid_ops"),
    ),
    uniqueIndex("numerology_profile_version_uidx").using(
      "btree",
      table.profileId.asc().nullsLast().op("text_ops"),
      table.normalizedInputHash.asc().nullsLast().op("text_ops"),
      table.strategyVersion.asc().nullsLast().op("text_ops"),
      table.normalizationVersion.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.profileId],
      foreignColumns: [profile.id],
      name: "numerology_profile_profile_id_profile_id_fk",
    }).onDelete("cascade"),
    pgPolicy("numerology_profile_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(EXISTS ( SELECT 1
   FROM profile
  WHERE ((profile.id = numerology_profile.profile_id) AND (profile.owner_user_id = app.current_user_id()))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM profile
  WHERE ((profile.id = numerology_profile.profile_id) AND (profile.owner_user_id = app.current_user_id()))))`,
    }),
  ],
);

export const numerologyCycle = pgTable(
  "numerology_cycle",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    numerologyProfileId: uuid("numerology_profile_id").notNull(),
    cycleType: text("cycle_type").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to").notNull(),
    value: integer().notNull(),
    calculationTrace: jsonb("calculation_trace").notNull(),
  },
  (table) => [
    index("numerology_cycle_profile_range_idx").using(
      "btree",
      table.numerologyProfileId.asc().nullsLast().op("date_ops"),
      table.effectiveFrom.asc().nullsLast().op("date_ops"),
      table.effectiveTo.asc().nullsLast().op("date_ops"),
    ),
    foreignKey({
      columns: [table.numerologyProfileId],
      foreignColumns: [numerologyProfile.id],
      name: "numerology_cycle_numerology_profile_id_numerology_profile_id_fk",
    }).onDelete("cascade"),
    pgPolicy("numerology_cycle_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(EXISTS ( SELECT 1
   FROM (numerology_profile
     JOIN profile ON ((profile.id = numerology_profile.profile_id)))
  WHERE ((numerology_profile.id = numerology_cycle.numerology_profile_id) AND (profile.owner_user_id = app.current_user_id()))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM (numerology_profile
     JOIN profile ON ((profile.id = numerology_profile.profile_id)))
  WHERE ((numerology_profile.id = numerology_cycle.numerology_profile_id) AND (profile.owner_user_id = app.current_user_id()))))`,
    }),
    check("numerology_cycle_range_check", sql`effective_from <= effective_to`),
  ],
);

export const dailyContext = pgTable(
  "daily_context",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    profileId: uuid("profile_id").notNull(),
    localDate: date("local_date").notNull(),
    timezone: text().notNull(),
    sourceReferences: jsonb("source_references").notNull(),
    scoreModelVersion: text("score_model_version").notNull(),
    categoryScores: jsonb("category_scores").notNull(),
    contributingSignals: jsonb("contributing_signals").notNull(),
    cacheInputHash: text("cache_input_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("daily_context_profile_date_version_uidx").using(
      "btree",
      table.profileId.asc().nullsLast().op("date_ops"),
      table.localDate.asc().nullsLast().op("date_ops"),
      table.scoreModelVersion.asc().nullsLast().op("date_ops"),
      table.cacheInputHash.asc().nullsLast().op("date_ops"),
    ),
    foreignKey({
      columns: [table.profileId],
      foreignColumns: [profile.id],
      name: "daily_context_profile_id_profile_id_fk",
    }).onDelete("cascade"),
    pgPolicy("daily_context_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(EXISTS ( SELECT 1
   FROM profile
  WHERE ((profile.id = daily_context.profile_id) AND (profile.owner_user_id = app.current_user_id()))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM profile
  WHERE ((profile.id = daily_context.profile_id) AND (profile.owner_user_id = app.current_user_id()))))`,
    }),
  ],
);

export const dailyReading = pgTable(
  "daily_reading",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    dailyContextId: uuid("daily_context_id").notNull(),
    interpretationLibraryVersion: text(
      "interpretation_library_version",
    ).notNull(),
    aiModelVersion: text("ai_model_version"),
    aiPromptVersion: text("ai_prompt_version"),
    outputSchemaVersion: text("output_schema_version").notNull(),
    validatedOutput: jsonb("validated_output").notNull(),
    fallbackUsed: boolean("fallback_used").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("daily_reading_context_idx").using(
      "btree",
      table.dailyContextId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.dailyContextId],
      foreignColumns: [dailyContext.id],
      name: "daily_reading_daily_context_id_daily_context_id_fk",
    }).onDelete("cascade"),
    pgPolicy("daily_reading_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(EXISTS ( SELECT 1
   FROM (daily_context
     JOIN profile ON ((profile.id = daily_context.profile_id)))
  WHERE ((daily_context.id = daily_reading.daily_context_id) AND (profile.owner_user_id = app.current_user_id()))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM (daily_context
     JOIN profile ON ((profile.id = daily_context.profile_id)))
  WHERE ((daily_context.id = daily_reading.daily_context_id) AND (profile.owner_user_id = app.current_user_id()))))`,
    }),
  ],
);

export const notificationPreference = pgTable(
  "notification_preference",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    profileId: uuid("profile_id").notNull(),
    channel: text().notNull(),
    eventType: text("event_type").notNull(),
    optedIn: boolean("opted_in").default(false).notNull(),
    timezone: text().notNull(),
    frequency: jsonb().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("notification_preference_profile_channel_event_uidx").using(
      "btree",
      table.profileId.asc().nullsLast().op("text_ops"),
      table.channel.asc().nullsLast().op("text_ops"),
      table.eventType.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.profileId],
      foreignColumns: [profile.id],
      name: "notification_preference_profile_id_profile_id_fk",
    }).onDelete("cascade"),
    pgPolicy("notification_preference_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(EXISTS ( SELECT 1
   FROM profile
  WHERE ((profile.id = notification_preference.profile_id) AND (profile.owner_user_id = app.current_user_id()))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM profile
  WHERE ((profile.id = notification_preference.profile_id) AND (profile.owner_user_id = app.current_user_id()))))`,
    }),
  ],
);

export const notificationDelivery = pgTable(
  "notification_delivery",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    preferenceId: uuid("preference_id").notNull(),
    eventReference: text("event_reference").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text().notNull(),
    scheduledAt: timestamp("scheduled_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }),
    failedAt: timestamp("failed_at", { withTimezone: true, mode: "string" }),
    failureCode: text("failure_code"),
  },
  (table) => [
    uniqueIndex("notification_delivery_idempotency_uidx").using(
      "btree",
      table.idempotencyKey.asc().nullsLast().op("text_ops"),
    ),
    index("notification_delivery_preference_idx").using(
      "btree",
      table.preferenceId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.preferenceId],
      foreignColumns: [notificationPreference.id],
      name: "notification_delivery_preference_id_notification_preference_id_",
    }).onDelete("cascade"),
    pgPolicy("notification_delivery_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(EXISTS ( SELECT 1
   FROM (notification_preference
     JOIN profile ON ((profile.id = notification_preference.profile_id)))
  WHERE ((notification_preference.id = notification_delivery.preference_id) AND (profile.owner_user_id = app.current_user_id()))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM (notification_preference
     JOIN profile ON ((profile.id = notification_preference.profile_id)))
  WHERE ((notification_preference.id = notification_delivery.preference_id) AND (profile.owner_user_id = app.current_user_id()))))`,
    }),
  ],
);

export const houseCusp = pgTable(
  "house_cusp",
  {
    birthChartId: uuid("birth_chart_id").notNull(),
    houseNumber: integer("house_number").notNull(),
    longitude: numeric({ precision: 12, scale: 8 }).notNull(),
    houseSystem: text("house_system").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.birthChartId],
      foreignColumns: [birthChart.id],
      name: "house_cusp_birth_chart_id_birth_chart_id_fk",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.birthChartId, table.houseNumber],
      name: "house_cusp_birth_chart_id_house_number_pk",
    }),
    pgPolicy("house_cusp_owner", {
      as: "permissive",
      for: "all",
      to: ["app_user"],
      using: sql`(EXISTS ( SELECT 1
   FROM ((birth_chart
     JOIN birth_profile ON ((birth_profile.id = birth_chart.birth_profile_id)))
     JOIN profile ON ((profile.id = birth_profile.profile_id)))
  WHERE ((birth_chart.id = house_cusp.birth_chart_id) AND (profile.owner_user_id = app.current_user_id()))))`,
      withCheck: sql`(EXISTS ( SELECT 1
   FROM ((birth_chart
     JOIN birth_profile ON ((birth_profile.id = birth_chart.birth_profile_id)))
     JOIN profile ON ((profile.id = birth_profile.profile_id)))
  WHERE ((birth_chart.id = house_cusp.birth_chart_id) AND (profile.owner_user_id = app.current_user_id()))))`,
    }),
    check(
      "house_cusp_number_check",
      sql`(house_number >= 1) AND (house_number <= 12)`,
    ),
    check(
      "house_cusp_longitude_check",
      sql`(longitude >= (0)::numeric) AND (longitude < (360)::numeric)`,
    ),
  ],
);

export const contentInterpretation = pgTable(
  "content_interpretation",
  {
    interpretationKey: text("interpretation_key").notNull(),
    locale: text().notNull(),
    contentVersion: integer("content_version").notNull(),
    factRequirements: jsonb("fact_requirements").notNull(),
    fallbackTemplate: text("fallback_template").notNull(),
    state: publicationState().default("draft").notNull(),
    reviewMetadata: jsonb("review_metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.contentVersion, table.interpretationKey, table.locale],
      name: "content_interpretation_interpretation_key_locale_content_versio",
    }),
  ],
);
