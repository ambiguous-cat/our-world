CREATE TABLE `notification_email_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_type` text NOT NULL,
	`event_key` text NOT NULL,
	`subject` text NOT NULL,
	`heading` text NOT NULL,
	`message` text NOT NULL,
	`action_label` text NOT NULL,
	`action_path` text NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`next_attempt_at` integer,
	`last_error` text,
	`provider_email_id` text,
	`sent_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "notification_email_outbox_attempt_count_check" CHECK("notification_email_outbox"."attempt_count" >= 0),
	CONSTRAINT "notification_email_outbox_content_check" CHECK(length(trim("notification_email_outbox"."event_type")) > 0
        AND length(trim("notification_email_outbox"."event_key")) > 0
        AND length(trim("notification_email_outbox"."subject")) > 0
        AND length(trim("notification_email_outbox"."heading")) > 0
        AND length(trim("notification_email_outbox"."message")) > 0
        AND length(trim("notification_email_outbox"."action_label")) > 0
        AND "notification_email_outbox"."action_path" LIKE '/%')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_email_outbox_event_unique` ON `notification_email_outbox` (`event_type`,`event_key`);--> statement-breakpoint
CREATE INDEX `notification_email_outbox_pending_idx` ON `notification_email_outbox` (`sent_at`,`next_attempt_at`,`id`);--> statement-breakpoint
CREATE TABLE `quiz_publish_notices` (
	`quiz_id` integer PRIMARY KEY NOT NULL,
	`shown_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `quiz_publish_notices_shown_at_idx` ON `quiz_publish_notices` (`shown_at`);