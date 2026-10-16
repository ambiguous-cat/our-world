-- Generated schema retained; explicit historical identity backfill. Run through scripts/migrate-database.mjs.
--> statement-breakpoint
CREATE TEMP TABLE __member_sequence_backup AS SELECT name, seq FROM sqlite_sequence;
--> statement-breakpoint
CREATE TABLE "members" (
  "id" text PRIMARY KEY NOT NULL,
  "role" text NOT NULL,
  CONSTRAINT "members_fixed_identity_check" CHECK (("members"."id" = 'member_001' AND "members"."role" = 'player') OR ("members"."id" = 'member_002' AND "members"."role" = 'admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "members_role_unique" ON "members" ("role");
--> statement-breakpoint
INSERT INTO members (id, role) VALUES ('member_001', 'player'), ('member_002', 'admin');
--> statement-breakpoint
CREATE TABLE "__new_notification_email_outbox" (
  "recipient_member_id" text NOT NULL,
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "event_type" text NOT NULL,
  "event_key" text NOT NULL,
  "subject" text NOT NULL,
  "heading" text NOT NULL,
  "message" text NOT NULL,
  "action_label" text NOT NULL,
  "action_path" text NOT NULL,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "last_attempt_at" integer,
  "next_attempt_at" integer,
  "last_error" text,
  "provider_email_id" text,
  "sent_at" integer,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY ("recipient_member_id") REFERENCES "members" ("id") ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "notification_email_outbox_attempt_count_check" CHECK ("__new_notification_email_outbox"."attempt_count" >= 0),
  CONSTRAINT "notification_email_outbox_content_check" CHECK (length(trim("__new_notification_email_outbox"."event_type")) > 0
        AND length(trim("__new_notification_email_outbox"."event_key")) > 0
        AND length(trim("__new_notification_email_outbox"."subject")) > 0
        AND length(trim("__new_notification_email_outbox"."heading")) > 0
        AND length(trim("__new_notification_email_outbox"."message")) > 0
        AND length(trim("__new_notification_email_outbox"."action_label")) > 0
        AND "__new_notification_email_outbox"."action_path" LIKE '/%')
);
--> statement-breakpoint
INSERT INTO "__new_notification_email_outbox" ("recipient_member_id","id","event_type","event_key","subject","heading","message","action_label","action_path","attempt_count","last_attempt_at","next_attempt_at","last_error","provider_email_id","sent_at","created_at") SELECT 'member_001', "id", "event_type", "event_key", "subject", "heading", "message", "action_label", "action_path", "attempt_count", "last_attempt_at", "next_attempt_at", "last_error", "provider_email_id", "sent_at", "created_at" FROM "notification_email_outbox";
--> statement-breakpoint
DROP TABLE "notification_email_outbox";
--> statement-breakpoint
ALTER TABLE "__new_notification_email_outbox" RENAME TO "notification_email_outbox";
--> statement-breakpoint
CREATE UNIQUE INDEX "notification_email_outbox_event_unique" ON "notification_email_outbox" ("event_type","event_key");
--> statement-breakpoint
CREATE INDEX "notification_email_outbox_pending_idx" ON "notification_email_outbox" ("sent_at","next_attempt_at","id");
--> statement-breakpoint
CREATE TABLE "__new_draw_records" (
  "member_id" text NOT NULL,
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "request_key" text NOT NULL,
  "ticket_type_id" integer NOT NULL,
  "result_type" text NOT NULL,
  "balance_before" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "prize_id" integer,
  "pool_item_id" integer,
  "retry_option_id" integer,
  "extra_count" integer,
  "ticket_snapshot" text NOT NULL,
  "config_snapshot" text NOT NULL,
  "result_snapshot" text NOT NULL,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY ("member_id") REFERENCES "members" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("prize_id") REFERENCES "prizes" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("pool_item_id") REFERENCES "ticket_prize_pool_items" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("retry_option_id") REFERENCES "retry_options" ("id") ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "draw_records_result_type_check" CHECK ("__new_draw_records"."result_type" IN ('prize', 'retry', 'miss')),
  CONSTRAINT "draw_records_balance_before_check" CHECK ("__new_draw_records"."balance_before" >= 1),
  CONSTRAINT "draw_records_balance_after_check" CHECK ("__new_draw_records"."balance_after" >= 0),
  CONSTRAINT "draw_records_result_fields_check" CHECK ((
        ("__new_draw_records"."result_type" = 'prize'
          AND "__new_draw_records"."prize_id" IS NOT NULL
          AND "__new_draw_records"."pool_item_id" IS NOT NULL
          AND "__new_draw_records"."retry_option_id" IS NULL
          AND "__new_draw_records"."extra_count" IS NULL)
        OR
        ("__new_draw_records"."result_type" = 'retry'
          AND "__new_draw_records"."prize_id" IS NULL
          AND "__new_draw_records"."pool_item_id" IS NULL
          AND "__new_draw_records"."retry_option_id" IS NOT NULL
          AND "__new_draw_records"."extra_count" > 0)
        OR
        ("__new_draw_records"."result_type" = 'miss'
          AND "__new_draw_records"."prize_id" IS NULL
          AND "__new_draw_records"."pool_item_id" IS NULL
          AND "__new_draw_records"."retry_option_id" IS NULL
          AND "__new_draw_records"."extra_count" IS NULL)
      )),
  CONSTRAINT "draw_records_balance_change_check" CHECK ((
        ("__new_draw_records"."result_type" IN ('prize', 'miss')
          AND "__new_draw_records"."balance_after" = "__new_draw_records"."balance_before" - 1)
        OR
        ("__new_draw_records"."result_type" = 'retry'
          AND "__new_draw_records"."balance_after" = "__new_draw_records"."balance_before" - 1 + "__new_draw_records"."extra_count")
      )),
  CONSTRAINT "draw_records_ticket_snapshot_json_check" CHECK (json_valid("__new_draw_records"."ticket_snapshot")),
  CONSTRAINT "draw_records_config_snapshot_json_check" CHECK (json_valid("__new_draw_records"."config_snapshot")),
  CONSTRAINT "draw_records_result_snapshot_json_check" CHECK (json_valid("__new_draw_records"."result_snapshot"))
);
--> statement-breakpoint
INSERT INTO "__new_draw_records" ("member_id","id","request_key","ticket_type_id","result_type","balance_before","balance_after","prize_id","pool_item_id","retry_option_id","extra_count","ticket_snapshot","config_snapshot","result_snapshot","created_at") SELECT 'member_001', "id", "request_key", "ticket_type_id", "result_type", "balance_before", "balance_after", "prize_id", "pool_item_id", "retry_option_id", "extra_count", "ticket_snapshot", "config_snapshot", "result_snapshot", "created_at" FROM "draw_records";
--> statement-breakpoint
DROP TABLE "draw_records";
--> statement-breakpoint
ALTER TABLE "__new_draw_records" RENAME TO "draw_records";
--> statement-breakpoint
CREATE UNIQUE INDEX "draw_records_request_key_unique" ON "draw_records" ("request_key");
--> statement-breakpoint
CREATE INDEX "draw_records_created_at_idx" ON "draw_records" ("created_at");
--> statement-breakpoint
CREATE INDEX "draw_records_ticket_created_idx" ON "draw_records" ("ticket_type_id","created_at");
--> statement-breakpoint
CREATE INDEX "draw_records_result_type_idx" ON "draw_records" ("result_type");
--> statement-breakpoint
CREATE TABLE "__new_external_ticket_grants" (
  "member_id" text NOT NULL,
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "ticket_balance_log_id" integer NOT NULL,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY ("member_id") REFERENCES "members" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("ticket_balance_log_id") REFERENCES "ticket_balance_logs" ("id") ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "external_ticket_grants_source_type_check" CHECK ("__new_external_ticket_grants"."source_type" IN ('quiz'))
);
--> statement-breakpoint
INSERT INTO "__new_external_ticket_grants" ("member_id","id","source_type","source_id","ticket_balance_log_id","created_at") SELECT 'member_001', "id", "source_type", "source_id", "ticket_balance_log_id", "created_at" FROM "external_ticket_grants";
--> statement-breakpoint
DROP TABLE "external_ticket_grants";
--> statement-breakpoint
ALTER TABLE "__new_external_ticket_grants" RENAME TO "external_ticket_grants";
--> statement-breakpoint
CREATE UNIQUE INDEX "external_ticket_grants_source_unique" ON "external_ticket_grants" ("member_id","source_type","source_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "external_ticket_grants_balance_log_unique" ON "external_ticket_grants" ("ticket_balance_log_id");
--> statement-breakpoint
CREATE TABLE "__new_player_ticket_balances" (
  "member_id" text NOT NULL,
  "ticket_type_id" integer NOT NULL,
  "balance" integer NOT NULL DEFAULT 0,
  "updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY ("member_id") REFERENCES "members" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types" ("id") ON UPDATE no action ON DELETE restrict,
  PRIMARY KEY ("member_id","ticket_type_id"),
  CONSTRAINT "player_ticket_balances_balance_check" CHECK ("__new_player_ticket_balances"."balance" >= 0)
);
--> statement-breakpoint
INSERT INTO "__new_player_ticket_balances" ("member_id","ticket_type_id","balance","updated_at") SELECT 'member_001', "ticket_type_id", "balance", "updated_at" FROM "player_ticket_balances";
--> statement-breakpoint
DROP TABLE "player_ticket_balances";
--> statement-breakpoint
ALTER TABLE "__new_player_ticket_balances" RENAME TO "player_ticket_balances";
--> statement-breakpoint
CREATE TABLE "__new_prize_stock_logs" (
  "actor_type" text NOT NULL,
  "actor_member_id" text,
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "prize_id" integer NOT NULL,
  "delta" integer NOT NULL,
  "stock_before" integer NOT NULL,
  "stock_after" integer NOT NULL,
  "reason" text NOT NULL,
  "draw_record_id" integer,
  "note" text,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY ("actor_member_id") REFERENCES "members" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("prize_id") REFERENCES "prizes" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("draw_record_id") REFERENCES "draw_records" ("id") ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "prize_stock_logs_actor_check" CHECK (("__new_prize_stock_logs"."actor_type" = 'member' AND "__new_prize_stock_logs"."actor_member_id" IS NOT NULL) OR ("__new_prize_stock_logs"."actor_type" = 'system' AND "__new_prize_stock_logs"."actor_member_id" IS NULL)),
  CONSTRAINT "prize_stock_logs_delta_check" CHECK ("__new_prize_stock_logs"."delta" <> 0),
  CONSTRAINT "prize_stock_logs_stock_before_check" CHECK ("__new_prize_stock_logs"."stock_before" >= 0),
  CONSTRAINT "prize_stock_logs_stock_after_check" CHECK ("__new_prize_stock_logs"."stock_after" >= 0),
  CONSTRAINT "prize_stock_logs_stock_change_check" CHECK ("__new_prize_stock_logs"."stock_after" = "__new_prize_stock_logs"."stock_before" + "__new_prize_stock_logs"."delta"),
  CONSTRAINT "prize_stock_logs_reason_check" CHECK ("__new_prize_stock_logs"."reason" IN ('draw', 'admin_add', 'admin_reduce')),
  CONSTRAINT "prize_stock_logs_source_check" CHECK ((
        ("__new_prize_stock_logs"."reason" = 'draw'
          AND "__new_prize_stock_logs"."delta" = -1
          AND "__new_prize_stock_logs"."draw_record_id" IS NOT NULL)
        OR
        ("__new_prize_stock_logs"."reason" = 'admin_add'
          AND "__new_prize_stock_logs"."delta" > 0
          AND "__new_prize_stock_logs"."draw_record_id" IS NULL)
        OR
        ("__new_prize_stock_logs"."reason" = 'admin_reduce'
          AND "__new_prize_stock_logs"."delta" < 0
          AND "__new_prize_stock_logs"."draw_record_id" IS NULL)
      ))
);
--> statement-breakpoint
INSERT INTO "__new_prize_stock_logs" ("actor_type","actor_member_id","id","prize_id","delta","stock_before","stock_after","reason","draw_record_id","note","created_at") SELECT 'member', CASE WHEN reason = 'draw' THEN 'member_001' ELSE 'member_002' END, "id", "prize_id", "delta", "stock_before", "stock_after", "reason", "draw_record_id", "note", "created_at" FROM "prize_stock_logs";
--> statement-breakpoint
DROP TABLE "prize_stock_logs";
--> statement-breakpoint
ALTER TABLE "__new_prize_stock_logs" RENAME TO "prize_stock_logs";
--> statement-breakpoint
CREATE UNIQUE INDEX "prize_stock_logs_draw_record_unique" ON "prize_stock_logs" ("draw_record_id") WHERE "prize_stock_logs"."draw_record_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "prize_stock_logs_prize_created_idx" ON "prize_stock_logs" ("prize_id","created_at");
--> statement-breakpoint
CREATE TABLE "__new_prize_wins" (
  "member_id" text NOT NULL,
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "draw_record_id" integer,
  "prize_id" integer NOT NULL,
  "source" text NOT NULL DEFAULT 'draw',
  "name_snapshot" text NOT NULL,
  "description_snapshot" text,
  "image_path_snapshot" text,
  "status" text NOT NULL DEFAULT 'unredeemed',
  "requested_at" integer,
  "redeemed_at" integer,
  "revoked_at" integer,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY ("member_id") REFERENCES "members" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("draw_record_id") REFERENCES "draw_records" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("prize_id") REFERENCES "prizes" ("id") ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "prize_wins_source_check" CHECK ((
        ("__new_prize_wins"."source" = 'draw' AND "__new_prize_wins"."draw_record_id" IS NOT NULL)
        OR
        ("__new_prize_wins"."source" = 'admin_grant' AND "__new_prize_wins"."draw_record_id" IS NULL)
      )),
  CONSTRAINT "prize_wins_name_snapshot_check" CHECK (length(trim("__new_prize_wins"."name_snapshot")) > 0),
  CONSTRAINT "prize_wins_status_check" CHECK ("__new_prize_wins"."status" IN ('unredeemed', 'requested', 'redeemed', 'revoked')),
  CONSTRAINT "prize_wins_status_timestamps_check" CHECK ((
        ("__new_prize_wins"."status" = 'unredeemed'
          AND "__new_prize_wins"."requested_at" IS NULL
          AND "__new_prize_wins"."redeemed_at" IS NULL
          AND "__new_prize_wins"."revoked_at" IS NULL)
        OR
        ("__new_prize_wins"."status" = 'requested'
          AND "__new_prize_wins"."requested_at" IS NOT NULL
          AND "__new_prize_wins"."redeemed_at" IS NULL
          AND "__new_prize_wins"."revoked_at" IS NULL)
        OR
        ("__new_prize_wins"."status" = 'redeemed'
          AND "__new_prize_wins"."requested_at" IS NULL
          AND "__new_prize_wins"."redeemed_at" IS NOT NULL
          AND "__new_prize_wins"."revoked_at" IS NULL)
        OR
        ("__new_prize_wins"."status" = 'revoked'
          AND "__new_prize_wins"."requested_at" IS NULL
          AND "__new_prize_wins"."redeemed_at" IS NULL
          AND "__new_prize_wins"."revoked_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
INSERT INTO "__new_prize_wins" ("member_id","id","draw_record_id","prize_id","source","name_snapshot","description_snapshot","image_path_snapshot","status","requested_at","redeemed_at","revoked_at","created_at","updated_at") SELECT 'member_001', "id", "draw_record_id", "prize_id", "source", "name_snapshot", "description_snapshot", "image_path_snapshot", "status", "requested_at", "redeemed_at", "revoked_at", "created_at", "updated_at" FROM "prize_wins";
--> statement-breakpoint
DROP TABLE "prize_wins";
--> statement-breakpoint
ALTER TABLE "__new_prize_wins" RENAME TO "prize_wins";
--> statement-breakpoint
CREATE UNIQUE INDEX "prize_wins_draw_record_unique" ON "prize_wins" ("draw_record_id");
--> statement-breakpoint
CREATE INDEX "prize_wins_status_idx" ON "prize_wins" ("status","created_at");
--> statement-breakpoint
CREATE TABLE "__new_redemption_logs" (
  "actor_type" text NOT NULL,
  "actor_member_id" text,
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "prize_win_id" integer NOT NULL,
  "action" text NOT NULL,
  "note" text,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY ("actor_member_id") REFERENCES "members" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("prize_win_id") REFERENCES "prize_wins" ("id") ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "redemption_logs_actor_check" CHECK (("__new_redemption_logs"."actor_type" = 'member' AND "__new_redemption_logs"."actor_member_id" IS NOT NULL) OR ("__new_redemption_logs"."actor_type" = 'system' AND "__new_redemption_logs"."actor_member_id" IS NULL)),
  CONSTRAINT "redemption_logs_action_check" CHECK ("__new_redemption_logs"."action" IN (
        'grant',
        'request',
        'cancel_request',
        'reject_request',
        'redeem',
        'undo_redeem',
        'revoke',
        'restore'
      ))
);
--> statement-breakpoint
INSERT INTO "__new_redemption_logs" ("actor_type","actor_member_id","id","prize_win_id","action","note","created_at") SELECT 'member', CASE WHEN action IN ('request', 'cancel_request') THEN 'member_001' ELSE 'member_002' END, "id", "prize_win_id", "action", "note", "created_at" FROM "redemption_logs";
--> statement-breakpoint
DROP TABLE "redemption_logs";
--> statement-breakpoint
ALTER TABLE "__new_redemption_logs" RENAME TO "redemption_logs";
--> statement-breakpoint
CREATE INDEX "redemption_logs_prize_win_created_idx" ON "redemption_logs" ("prize_win_id","created_at");
--> statement-breakpoint
CREATE TABLE "__new_ticket_balance_logs" (
  "actor_type" text NOT NULL,
  "actor_member_id" text,
  "member_id" text NOT NULL,
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "ticket_type_id" integer NOT NULL,
  "ticket_name_snapshot" text NOT NULL,
  "delta" integer NOT NULL,
  "balance_before" integer NOT NULL,
  "balance_after" integer NOT NULL,
  "reason" text NOT NULL,
  "draw_record_id" integer,
  "note" text,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY ("actor_member_id") REFERENCES "members" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("member_id") REFERENCES "members" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("draw_record_id") REFERENCES "draw_records" ("id") ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "ticket_balance_logs_actor_check" CHECK (("__new_ticket_balance_logs"."actor_type" = 'member' AND "__new_ticket_balance_logs"."actor_member_id" IS NOT NULL) OR ("__new_ticket_balance_logs"."actor_type" = 'system' AND "__new_ticket_balance_logs"."actor_member_id" IS NULL)),
  CONSTRAINT "ticket_balance_logs_delta_check" CHECK ("__new_ticket_balance_logs"."delta" <> 0),
  CONSTRAINT "ticket_balance_logs_balance_before_check" CHECK ("__new_ticket_balance_logs"."balance_before" >= 0),
  CONSTRAINT "ticket_balance_logs_balance_after_check" CHECK ("__new_ticket_balance_logs"."balance_after" >= 0),
  CONSTRAINT "ticket_balance_logs_balance_change_check" CHECK ("__new_ticket_balance_logs"."balance_after" = "__new_ticket_balance_logs"."balance_before" + "__new_ticket_balance_logs"."delta"),
  CONSTRAINT "ticket_balance_logs_reason_check" CHECK ("__new_ticket_balance_logs"."reason" IN ('draw_cost', 'retry_reward', 'admin_grant', 'admin_revoke')),
  CONSTRAINT "ticket_balance_logs_source_check" CHECK ((
        ("__new_ticket_balance_logs"."reason" = 'draw_cost'
          AND "__new_ticket_balance_logs"."delta" = -1
          AND "__new_ticket_balance_logs"."draw_record_id" IS NOT NULL)
        OR
        ("__new_ticket_balance_logs"."reason" = 'retry_reward'
          AND "__new_ticket_balance_logs"."delta" > 0
          AND "__new_ticket_balance_logs"."draw_record_id" IS NOT NULL)
        OR
        ("__new_ticket_balance_logs"."reason" = 'admin_grant'
          AND "__new_ticket_balance_logs"."delta" > 0
          AND "__new_ticket_balance_logs"."draw_record_id" IS NULL
          AND length(trim("__new_ticket_balance_logs"."note")) > 0)
        OR
        ("__new_ticket_balance_logs"."reason" = 'admin_revoke'
          AND "__new_ticket_balance_logs"."delta" < 0
          AND "__new_ticket_balance_logs"."draw_record_id" IS NULL)
      ))
);
--> statement-breakpoint
INSERT INTO "__new_ticket_balance_logs" ("actor_type","actor_member_id","member_id","id","ticket_type_id","ticket_name_snapshot","delta","balance_before","balance_after","reason","draw_record_id","note","created_at") SELECT CASE WHEN reason = 'retry_reward' OR EXISTS (SELECT 1 FROM external_ticket_grants e WHERE e.ticket_balance_log_id = ticket_balance_logs.id) THEN 'system' ELSE 'member' END, CASE WHEN reason = 'retry_reward' OR EXISTS (SELECT 1 FROM external_ticket_grants e WHERE e.ticket_balance_log_id = ticket_balance_logs.id) THEN NULL WHEN reason = 'draw_cost' THEN 'member_001' ELSE 'member_002' END, 'member_001', "id", "ticket_type_id", "ticket_name_snapshot", "delta", "balance_before", "balance_after", "reason", "draw_record_id", "note", "created_at" FROM "ticket_balance_logs";
--> statement-breakpoint
DROP TABLE "ticket_balance_logs";
--> statement-breakpoint
ALTER TABLE "__new_ticket_balance_logs" RENAME TO "ticket_balance_logs";
--> statement-breakpoint
CREATE INDEX "ticket_balance_logs_created_at_idx" ON "ticket_balance_logs" ("created_at");
--> statement-breakpoint
CREATE INDEX "ticket_balance_logs_ticket_created_idx" ON "ticket_balance_logs" ("ticket_type_id","created_at");
--> statement-breakpoint
CREATE INDEX "ticket_balance_logs_draw_record_idx" ON "ticket_balance_logs" ("draw_record_id");
--> statement-breakpoint
CREATE TABLE "__new_quiz_attempts" (
  "member_id" text NOT NULL,
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "quiz_id" integer NOT NULL,
  "request_key" text NOT NULL,
  "attempt_number" integer NOT NULL,
  "single_correct_count" integer NOT NULL DEFAULT 0,
  "single_question_count" integer NOT NULL DEFAULT 0,
  "reward_balance_log_id" integer,
  "reward_ticket_name_snapshot" text,
  "reward_quantity_snapshot" integer,
  "submitted_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY ("member_id") REFERENCES "members" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("quiz_id") REFERENCES "quizzes" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("reward_balance_log_id") REFERENCES "ticket_balance_logs" ("id") ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "quiz_attempts_number_check" CHECK ("__new_quiz_attempts"."attempt_number" > 0),
  CONSTRAINT "quiz_attempts_score_check" CHECK ("__new_quiz_attempts"."single_correct_count" BETWEEN 0 AND "__new_quiz_attempts"."single_question_count"),
  CONSTRAINT "quiz_attempts_reward_snapshot_check" CHECK ((
        ("__new_quiz_attempts"."reward_balance_log_id" IS NULL AND "__new_quiz_attempts"."reward_ticket_name_snapshot" IS NULL AND "__new_quiz_attempts"."reward_quantity_snapshot" IS NULL)
        OR
        ("__new_quiz_attempts"."reward_balance_log_id" IS NOT NULL AND length(trim("__new_quiz_attempts"."reward_ticket_name_snapshot")) > 0 AND "__new_quiz_attempts"."reward_quantity_snapshot" > 0)
      ))
);
--> statement-breakpoint
INSERT INTO "__new_quiz_attempts" ("member_id","id","quiz_id","request_key","attempt_number","single_correct_count","single_question_count","reward_balance_log_id","reward_ticket_name_snapshot","reward_quantity_snapshot","submitted_at") SELECT 'member_001', "id", "quiz_id", "request_key", "attempt_number", "single_correct_count", "single_question_count", "reward_balance_log_id", "reward_ticket_name_snapshot", "reward_quantity_snapshot", "submitted_at" FROM "quiz_attempts";
--> statement-breakpoint
DROP TABLE "quiz_attempts";
--> statement-breakpoint
ALTER TABLE "__new_quiz_attempts" RENAME TO "quiz_attempts";
--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_request_key_unique" ON "quiz_attempts" ("request_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_quiz_number_unique" ON "quiz_attempts" ("member_id","quiz_id","attempt_number");
--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_one_reward_per_quiz_unique" ON "quiz_attempts" ("member_id","quiz_id") WHERE "quiz_attempts"."reward_balance_log_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "quiz_attempts_quiz_submitted_idx" ON "quiz_attempts" ("quiz_id","submitted_at");
--> statement-breakpoint
CREATE TABLE "__new_quiz_publish_notices" (
  "member_id" text NOT NULL,
  "quiz_id" integer NOT NULL,
  "shown_at" integer,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY ("member_id") REFERENCES "members" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("quiz_id") REFERENCES "quizzes" ("id") ON UPDATE no action ON DELETE restrict,
  PRIMARY KEY ("member_id","quiz_id")
);
--> statement-breakpoint
INSERT INTO "__new_quiz_publish_notices" ("member_id","quiz_id","shown_at","created_at") SELECT 'member_001', "quiz_id", "shown_at", "created_at" FROM "quiz_publish_notices";
--> statement-breakpoint
DROP TABLE "quiz_publish_notices";
--> statement-breakpoint
ALTER TABLE "__new_quiz_publish_notices" RENAME TO "quiz_publish_notices";
--> statement-breakpoint
CREATE INDEX "quiz_publish_notices_shown_at_idx" ON "quiz_publish_notices" ("shown_at");
--> statement-breakpoint
CREATE TABLE "__new_quizzes" (
  "created_by_member_id" text NOT NULL,
  "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'draft',
  "reward_ticket_type_id" integer,
  "reward_quantity" integer NOT NULL DEFAULT 0,
  "reward_note" text,
  "created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "published_at" integer,
  "closed_at" integer,
  "archived_at" integer,
  FOREIGN KEY ("created_by_member_id") REFERENCES "members" ("id") ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY ("reward_ticket_type_id") REFERENCES "ticket_types" ("id") ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "quizzes_title_check" CHECK (length(trim("__new_quizzes"."title")) BETWEEN 1 AND 100),
  CONSTRAINT "quizzes_status_check" CHECK ("__new_quizzes"."status" IN ('draft', 'published', 'closed', 'archived')),
  CONSTRAINT "quizzes_reward_check" CHECK ((
        ("__new_quizzes"."reward_ticket_type_id" IS NULL AND "__new_quizzes"."reward_quantity" = 0 AND "__new_quizzes"."reward_note" IS NULL)
        OR
        ("__new_quizzes"."reward_ticket_type_id" IS NOT NULL AND "__new_quizzes"."reward_quantity" > 0 AND length(trim("__new_quizzes"."reward_note")) > 0)
      ))
);
--> statement-breakpoint
INSERT INTO "__new_quizzes" ("created_by_member_id","id","title","description","status","reward_ticket_type_id","reward_quantity","reward_note","created_at","updated_at","published_at","closed_at","archived_at") SELECT 'member_002', "id", "title", "description", "status", "reward_ticket_type_id", "reward_quantity", "reward_note", "created_at", "updated_at", "published_at", "closed_at", "archived_at" FROM "quizzes";
--> statement-breakpoint
DROP TABLE "quizzes";
--> statement-breakpoint
ALTER TABLE "__new_quizzes" RENAME TO "quizzes";
--> statement-breakpoint
CREATE INDEX "quizzes_status_updated_idx" ON "quizzes" ("status","updated_at");
--> statement-breakpoint
UPDATE sqlite_sequence SET seq = max(seq, coalesce((SELECT b.seq FROM __member_sequence_backup b WHERE b.name = sqlite_sequence.name), seq));
--> statement-breakpoint
DROP TABLE __member_sequence_backup;
