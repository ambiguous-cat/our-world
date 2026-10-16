import { members } from "@/core/members/db/schema";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { timestamp } from "@/shared/db/columns";

export const notificationEmailOutbox = sqliteTable(
  "notification_email_outbox",
  {
    recipientMemberId: text("recipient_member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
    id: integer("id").primaryKey({ autoIncrement: true }),
    eventType: text("event_type").notNull(),
    eventKey: text("event_key").notNull(),
    subject: text("subject").notNull(),
    heading: text("heading").notNull(),
    message: text("message").notNull(),
    actionLabel: text("action_label").notNull(),
    actionPath: text("action_path").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: integer("last_attempt_at", { mode: "timestamp_ms" }),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    providerEmailId: text("provider_email_id"),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("notification_email_outbox_event_unique").on(
      table.eventType,
      table.eventKey,
    ),
    index("notification_email_outbox_pending_idx").on(
      table.sentAt,
      table.nextAttemptAt,
      table.id,
    ),
    check(
      "notification_email_outbox_attempt_count_check",
      sql`${table.attemptCount} >= 0`,
    ),
    check(
      "notification_email_outbox_content_check",
      sql`length(trim(${table.eventType})) > 0
        AND length(trim(${table.eventKey})) > 0
        AND length(trim(${table.subject})) > 0
        AND length(trim(${table.heading})) > 0
        AND length(trim(${table.message})) > 0
        AND length(trim(${table.actionLabel})) > 0
        AND ${table.actionPath} LIKE '/%'`,
    ),
  ],
);
