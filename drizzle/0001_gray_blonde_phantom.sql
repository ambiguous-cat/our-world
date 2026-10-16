CREATE TABLE `site_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`home_note` text DEFAULT '今天也辛苦啦，记得收下属于你的小快乐。' NOT NULL,
	`home_note_signature` text DEFAULT '最爱小狗的管理员' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "site_settings_singleton_check" CHECK("site_settings"."id" = 1),
	CONSTRAINT "site_settings_home_note_check" CHECK(length(trim("site_settings"."home_note")) BETWEEN 1 AND 300),
	CONSTRAINT "site_settings_home_note_signature_check" CHECK(length(trim("site_settings"."home_note_signature")) BETWEEN 1 AND 40)
);
--> statement-breakpoint
INSERT INTO `site_settings` (`id`) VALUES (1);
