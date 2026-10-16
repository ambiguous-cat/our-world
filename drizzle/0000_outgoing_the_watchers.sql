CREATE TABLE `draw_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_type_id` integer NOT NULL,
	`version` integer NOT NULL,
	`prize_weight` integer NOT NULL,
	`retry_weight` integer NOT NULL,
	`miss_weight` integer NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "draw_configs_version_check" CHECK("draw_configs"."version" > 0),
	CONSTRAINT "draw_configs_prize_weight_check" CHECK("draw_configs"."prize_weight" BETWEEN 0 AND 10000),
	CONSTRAINT "draw_configs_retry_weight_check" CHECK("draw_configs"."retry_weight" BETWEEN 0 AND 10000),
	CONSTRAINT "draw_configs_miss_weight_check" CHECK("draw_configs"."miss_weight" BETWEEN 0 AND 10000),
	CONSTRAINT "draw_configs_total_weight_check" CHECK("draw_configs"."prize_weight" + "draw_configs"."retry_weight" + "draw_configs"."miss_weight" = 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draw_configs_ticket_version_unique` ON `draw_configs` (`ticket_type_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `draw_configs_one_active_per_ticket_unique` ON `draw_configs` (`ticket_type_id`) WHERE "draw_configs"."is_active" = 1;--> statement-breakpoint
CREATE INDEX `draw_configs_ticket_idx` ON `draw_configs` (`ticket_type_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `draw_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_key` text NOT NULL,
	`ticket_type_id` integer NOT NULL,
	`result_type` text NOT NULL,
	`balance_before` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`prize_id` integer,
	`pool_item_id` integer,
	`retry_option_id` integer,
	`extra_count` integer,
	`ticket_snapshot` text NOT NULL,
	`config_snapshot` text NOT NULL,
	`result_snapshot` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prize_id`) REFERENCES `prizes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`pool_item_id`) REFERENCES `ticket_prize_pool_items`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`retry_option_id`) REFERENCES `retry_options`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "draw_records_result_type_check" CHECK("draw_records"."result_type" IN ('prize', 'retry', 'miss')),
	CONSTRAINT "draw_records_balance_before_check" CHECK("draw_records"."balance_before" >= 1),
	CONSTRAINT "draw_records_balance_after_check" CHECK("draw_records"."balance_after" >= 0),
	CONSTRAINT "draw_records_result_fields_check" CHECK((
        ("draw_records"."result_type" = 'prize'
          AND "draw_records"."prize_id" IS NOT NULL
          AND "draw_records"."pool_item_id" IS NOT NULL
          AND "draw_records"."retry_option_id" IS NULL
          AND "draw_records"."extra_count" IS NULL)
        OR
        ("draw_records"."result_type" = 'retry'
          AND "draw_records"."prize_id" IS NULL
          AND "draw_records"."pool_item_id" IS NULL
          AND "draw_records"."retry_option_id" IS NOT NULL
          AND "draw_records"."extra_count" > 0)
        OR
        ("draw_records"."result_type" = 'miss'
          AND "draw_records"."prize_id" IS NULL
          AND "draw_records"."pool_item_id" IS NULL
          AND "draw_records"."retry_option_id" IS NULL
          AND "draw_records"."extra_count" IS NULL)
      )),
	CONSTRAINT "draw_records_balance_change_check" CHECK((
        ("draw_records"."result_type" IN ('prize', 'miss')
          AND "draw_records"."balance_after" = "draw_records"."balance_before" - 1)
        OR
        ("draw_records"."result_type" = 'retry'
          AND "draw_records"."balance_after" = "draw_records"."balance_before" - 1 + "draw_records"."extra_count")
      )),
	CONSTRAINT "draw_records_ticket_snapshot_json_check" CHECK(json_valid("draw_records"."ticket_snapshot")),
	CONSTRAINT "draw_records_config_snapshot_json_check" CHECK(json_valid("draw_records"."config_snapshot")),
	CONSTRAINT "draw_records_result_snapshot_json_check" CHECK(json_valid("draw_records"."result_snapshot"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `draw_records_request_key_unique` ON `draw_records` (`request_key`);--> statement-breakpoint
CREATE INDEX `draw_records_created_at_idx` ON `draw_records` (`created_at`);--> statement-breakpoint
CREATE INDEX `draw_records_ticket_created_idx` ON `draw_records` (`ticket_type_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `draw_records_result_type_idx` ON `draw_records` (`result_type`);--> statement-breakpoint
CREATE TABLE `player_ticket_balances` (
	`ticket_type_id` integer PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "player_ticket_balances_balance_check" CHECK("player_ticket_balances"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE `prize_stock_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prize_id` integer NOT NULL,
	`delta` integer NOT NULL,
	`stock_before` integer NOT NULL,
	`stock_after` integer NOT NULL,
	`reason` text NOT NULL,
	`draw_record_id` integer,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`prize_id`) REFERENCES `prizes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`draw_record_id`) REFERENCES `draw_records`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "prize_stock_logs_delta_check" CHECK("prize_stock_logs"."delta" <> 0),
	CONSTRAINT "prize_stock_logs_stock_before_check" CHECK("prize_stock_logs"."stock_before" >= 0),
	CONSTRAINT "prize_stock_logs_stock_after_check" CHECK("prize_stock_logs"."stock_after" >= 0),
	CONSTRAINT "prize_stock_logs_stock_change_check" CHECK("prize_stock_logs"."stock_after" = "prize_stock_logs"."stock_before" + "prize_stock_logs"."delta"),
	CONSTRAINT "prize_stock_logs_reason_check" CHECK("prize_stock_logs"."reason" IN ('draw', 'admin_add', 'admin_reduce')),
	CONSTRAINT "prize_stock_logs_source_check" CHECK((
        ("prize_stock_logs"."reason" = 'draw'
          AND "prize_stock_logs"."delta" = -1
          AND "prize_stock_logs"."draw_record_id" IS NOT NULL)
        OR
        ("prize_stock_logs"."reason" = 'admin_add'
          AND "prize_stock_logs"."delta" > 0
          AND "prize_stock_logs"."draw_record_id" IS NULL)
        OR
        ("prize_stock_logs"."reason" = 'admin_reduce'
          AND "prize_stock_logs"."delta" < 0
          AND "prize_stock_logs"."draw_record_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prize_stock_logs_draw_record_unique` ON `prize_stock_logs` (`draw_record_id`) WHERE "prize_stock_logs"."draw_record_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `prize_stock_logs_prize_created_idx` ON `prize_stock_logs` (`prize_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `prize_wins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`draw_record_id` integer,
	`prize_id` integer NOT NULL,
	`source` text DEFAULT 'draw' NOT NULL,
	`name_snapshot` text NOT NULL,
	`description_snapshot` text,
	`image_path_snapshot` text,
	`status` text DEFAULT 'unredeemed' NOT NULL,
	`requested_at` integer,
	`redeemed_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`draw_record_id`) REFERENCES `draw_records`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prize_id`) REFERENCES `prizes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "prize_wins_source_check" CHECK((
        ("prize_wins"."source" = 'draw' AND "prize_wins"."draw_record_id" IS NOT NULL)
        OR
        ("prize_wins"."source" = 'admin_grant' AND "prize_wins"."draw_record_id" IS NULL)
      )),
	CONSTRAINT "prize_wins_name_snapshot_check" CHECK(length(trim("prize_wins"."name_snapshot")) > 0),
	CONSTRAINT "prize_wins_status_check" CHECK("prize_wins"."status" IN ('unredeemed', 'requested', 'redeemed', 'revoked')),
	CONSTRAINT "prize_wins_status_timestamps_check" CHECK((
        ("prize_wins"."status" = 'unredeemed'
          AND "prize_wins"."requested_at" IS NULL
          AND "prize_wins"."redeemed_at" IS NULL
          AND "prize_wins"."revoked_at" IS NULL)
        OR
        ("prize_wins"."status" = 'requested'
          AND "prize_wins"."requested_at" IS NOT NULL
          AND "prize_wins"."redeemed_at" IS NULL
          AND "prize_wins"."revoked_at" IS NULL)
        OR
        ("prize_wins"."status" = 'redeemed'
          AND "prize_wins"."requested_at" IS NULL
          AND "prize_wins"."redeemed_at" IS NOT NULL
          AND "prize_wins"."revoked_at" IS NULL)
        OR
        ("prize_wins"."status" = 'revoked'
          AND "prize_wins"."requested_at" IS NULL
          AND "prize_wins"."redeemed_at" IS NULL
          AND "prize_wins"."revoked_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prize_wins_draw_record_unique` ON `prize_wins` (`draw_record_id`);--> statement-breakpoint
CREATE INDEX `prize_wins_status_idx` ON `prize_wins` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `prizes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`image_path` text,
	`remaining_stock` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`archived_at` integer,
	CONSTRAINT "prizes_name_check" CHECK(length(trim("prizes"."name")) > 0),
	CONSTRAINT "prizes_remaining_stock_check" CHECK("prizes"."remaining_stock" >= 0)
);
--> statement-breakpoint
CREATE INDEX `prizes_drawable_idx` ON `prizes` (`is_active`,`remaining_stock`);--> statement-breakpoint
CREATE INDEX `prizes_sort_order_idx` ON `prizes` (`sort_order`,`id`);--> statement-breakpoint
CREATE TABLE `redemption_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prize_win_id` integer NOT NULL,
	`action` text NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`prize_win_id`) REFERENCES `prize_wins`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "redemption_logs_action_check" CHECK("redemption_logs"."action" IN (
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
CREATE INDEX `redemption_logs_prize_win_created_idx` ON `redemption_logs` (`prize_win_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `retry_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_type_id` integer NOT NULL,
	`extra_count` integer NOT NULL,
	`weight` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "retry_options_extra_count_check" CHECK("retry_options"."extra_count" > 0),
	CONSTRAINT "retry_options_weight_check" CHECK("retry_options"."weight" > 0)
);
--> statement-breakpoint
CREATE INDEX `retry_options_ticket_active_idx` ON `retry_options` (`ticket_type_id`,`is_active`,`archived_at`);--> statement-breakpoint
CREATE TABLE `ticket_balance_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_type_id` integer NOT NULL,
	`ticket_name_snapshot` text NOT NULL,
	`delta` integer NOT NULL,
	`balance_before` integer NOT NULL,
	`balance_after` integer NOT NULL,
	`reason` text NOT NULL,
	`draw_record_id` integer,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`draw_record_id`) REFERENCES `draw_records`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ticket_balance_logs_delta_check" CHECK("ticket_balance_logs"."delta" <> 0),
	CONSTRAINT "ticket_balance_logs_balance_before_check" CHECK("ticket_balance_logs"."balance_before" >= 0),
	CONSTRAINT "ticket_balance_logs_balance_after_check" CHECK("ticket_balance_logs"."balance_after" >= 0),
	CONSTRAINT "ticket_balance_logs_balance_change_check" CHECK("ticket_balance_logs"."balance_after" = "ticket_balance_logs"."balance_before" + "ticket_balance_logs"."delta"),
	CONSTRAINT "ticket_balance_logs_reason_check" CHECK("ticket_balance_logs"."reason" IN ('draw_cost', 'retry_reward', 'admin_grant', 'admin_revoke')),
	CONSTRAINT "ticket_balance_logs_source_check" CHECK((
        ("ticket_balance_logs"."reason" = 'draw_cost'
          AND "ticket_balance_logs"."delta" = -1
          AND "ticket_balance_logs"."draw_record_id" IS NOT NULL)
        OR
        ("ticket_balance_logs"."reason" = 'retry_reward'
          AND "ticket_balance_logs"."delta" > 0
          AND "ticket_balance_logs"."draw_record_id" IS NOT NULL)
        OR
        ("ticket_balance_logs"."reason" = 'admin_grant'
          AND "ticket_balance_logs"."delta" > 0
          AND "ticket_balance_logs"."draw_record_id" IS NULL
          AND length(trim("ticket_balance_logs"."note")) > 0)
        OR
        ("ticket_balance_logs"."reason" = 'admin_revoke'
          AND "ticket_balance_logs"."delta" < 0
          AND "ticket_balance_logs"."draw_record_id" IS NULL)
      ))
);
--> statement-breakpoint
CREATE INDEX `ticket_balance_logs_created_at_idx` ON `ticket_balance_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `ticket_balance_logs_ticket_created_idx` ON `ticket_balance_logs` (`ticket_type_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ticket_balance_logs_draw_record_idx` ON `ticket_balance_logs` (`draw_record_id`);--> statement-breakpoint
CREATE TABLE `ticket_grant_notices` (
	`ticket_balance_log_id` integer PRIMARY KEY NOT NULL,
	`shown_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ticket_balance_log_id`) REFERENCES `ticket_balance_logs`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `ticket_grant_notices_shown_at_idx` ON `ticket_grant_notices` (`shown_at`);--> statement-breakpoint
CREATE TABLE `ticket_prize_pool_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticket_type_id` integer NOT NULL,
	`prize_id` integer NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`prize_id`) REFERENCES `prizes`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ticket_prize_pool_items_weight_check" CHECK("ticket_prize_pool_items"."weight" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ticket_prize_pool_items_ticket_prize_unique` ON `ticket_prize_pool_items` (`ticket_type_id`,`prize_id`);--> statement-breakpoint
CREATE INDEX `ticket_prize_pool_items_drawable_idx` ON `ticket_prize_pool_items` (`ticket_type_id`,`is_active`,`archived_at`);--> statement-breakpoint
CREATE TABLE `ticket_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`kind` text DEFAULT 'permanent' NOT NULL,
	`cover_image_path` text,
	`draw_background_image_path` text,
	`theme_color` text DEFAULT '#BFD9A8' NOT NULL,
	`accent_color` text DEFAULT '#F3AFC1' NOT NULL,
	`scratch_mask_color` text DEFAULT '#A8A9AD' NOT NULL,
	`scratch_text_color` text DEFAULT '#FFFFFF' NOT NULL,
	`scratch_prompt` text DEFAULT '刮开看看吧' NOT NULL,
	`is_grant_enabled` integer DEFAULT true NOT NULL,
	`is_draw_enabled` integer DEFAULT true NOT NULL,
	`grant_start_at` integer,
	`grant_end_at` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`archived_at` integer,
	CONSTRAINT "ticket_types_name_check" CHECK(length(trim("ticket_types"."name")) > 0),
	CONSTRAINT "ticket_types_kind_check" CHECK("ticket_types"."kind" IN ('permanent', 'limited')),
	CONSTRAINT "ticket_types_theme_color_check" CHECK("ticket_types"."theme_color" GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
	CONSTRAINT "ticket_types_accent_color_check" CHECK("ticket_types"."accent_color" GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
	CONSTRAINT "ticket_types_scratch_mask_color_check" CHECK("ticket_types"."scratch_mask_color" GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
	CONSTRAINT "ticket_types_scratch_text_color_check" CHECK("ticket_types"."scratch_text_color" GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
	CONSTRAINT "ticket_types_grant_window_check" CHECK("ticket_types"."grant_start_at" IS NULL OR "ticket_types"."grant_end_at" IS NULL OR "ticket_types"."grant_start_at" < "ticket_types"."grant_end_at")
);
--> statement-breakpoint
CREATE INDEX `ticket_types_display_idx` ON `ticket_types` (`archived_at`,`sort_order`);
--> statement-breakpoint
INSERT INTO `ticket_types` (
	`id`,
	`name`,
	`description`,
	`kind`,
	`draw_background_image_path`,
	`theme_color`,
	`accent_color`,
	`scratch_mask_color`,
	`scratch_text_color`,
	`scratch_prompt`,
	`sort_order`
) VALUES
	(
		1,
		'日常幸运券',
		'今天也来试试手气吧，每一张都藏着一点小幸运。',
		'permanent',
		'/momo/scratch.jpg',
		'#BFD9A8',
		'#F3AFC1',
		'#A8A9AD',
		'#FFFFFF',
		'刮开今天的小幸运',
		10
	),
	(
		2,
		'心动惊喜券',
		'更特别一点的心动奖励，等你亲手刮开。',
		'permanent',
		'/momo/scratch.jpg',
		'#F6B5C0',
		'#CDB8F2',
		'#D6A7B6',
		'#FFFFFF',
		'刮开这份心动惊喜',
		20
	);
--> statement-breakpoint
INSERT INTO `player_ticket_balances` (`ticket_type_id`, `balance`)
VALUES (1, 0), (2, 0);
