CREATE TABLE `external_ticket_grants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`ticket_balance_log_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`ticket_balance_log_id`) REFERENCES `ticket_balance_logs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "external_ticket_grants_source_type_check" CHECK("external_ticket_grants"."source_type" IN ('quiz'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_ticket_grants_source_unique` ON `external_ticket_grants` (`source_type`,`source_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_ticket_grants_balance_log_unique` ON `external_ticket_grants` (`ticket_balance_log_id`);--> statement-breakpoint
CREATE TABLE `quiz_answers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`attempt_id` integer NOT NULL,
	`question_id` integer NOT NULL,
	`question_type_snapshot` text NOT NULL,
	`prompt_snapshot` text NOT NULL,
	`options_snapshot` text NOT NULL,
	`selected_option_id` integer,
	`selected_option_text_snapshot` text,
	`text_answer` text,
	`is_correct` integer,
	`reference_answer_snapshot` text,
	`explanation_snapshot` text,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`question_id`) REFERENCES `quiz_questions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "quiz_answers_type_check" CHECK("quiz_answers"."question_type_snapshot" IN ('single', 'text')),
	CONSTRAINT "quiz_answers_options_json_check" CHECK(json_valid("quiz_answers"."options_snapshot")),
	CONSTRAINT "quiz_answers_value_check" CHECK((
        ("quiz_answers"."question_type_snapshot" = 'single'
          AND "quiz_answers"."selected_option_id" IS NOT NULL
          AND length(trim("quiz_answers"."selected_option_text_snapshot")) > 0
          AND "quiz_answers"."text_answer" IS NULL
          AND "quiz_answers"."is_correct" IS NOT NULL)
        OR
        ("quiz_answers"."question_type_snapshot" = 'text'
          AND "quiz_answers"."selected_option_id" IS NULL
          AND "quiz_answers"."selected_option_text_snapshot" IS NULL
          AND length(trim("quiz_answers"."text_answer")) > 0
          AND "quiz_answers"."is_correct" IS NULL)
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_answers_attempt_question_unique` ON `quiz_answers` (`attempt_id`,`question_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_answers_attempt_sort_unique` ON `quiz_answers` (`attempt_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `quiz_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quiz_id` integer NOT NULL,
	`request_key` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`single_correct_count` integer DEFAULT 0 NOT NULL,
	`single_question_count` integer DEFAULT 0 NOT NULL,
	`reward_balance_log_id` integer,
	`reward_ticket_name_snapshot` text,
	`reward_quantity_snapshot` integer,
	`submitted_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reward_balance_log_id`) REFERENCES `ticket_balance_logs`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "quiz_attempts_number_check" CHECK("quiz_attempts"."attempt_number" > 0),
	CONSTRAINT "quiz_attempts_score_check" CHECK("quiz_attempts"."single_correct_count" BETWEEN 0 AND "quiz_attempts"."single_question_count"),
	CONSTRAINT "quiz_attempts_reward_snapshot_check" CHECK((
        ("quiz_attempts"."reward_balance_log_id" IS NULL AND "quiz_attempts"."reward_ticket_name_snapshot" IS NULL AND "quiz_attempts"."reward_quantity_snapshot" IS NULL)
        OR
        ("quiz_attempts"."reward_balance_log_id" IS NOT NULL AND length(trim("quiz_attempts"."reward_ticket_name_snapshot")) > 0 AND "quiz_attempts"."reward_quantity_snapshot" > 0)
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_attempts_request_key_unique` ON `quiz_attempts` (`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_attempts_quiz_number_unique` ON `quiz_attempts` (`quiz_id`,`attempt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_attempts_one_reward_per_quiz_unique` ON `quiz_attempts` (`quiz_id`) WHERE "quiz_attempts"."reward_balance_log_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `quiz_attempts_quiz_submitted_idx` ON `quiz_attempts` (`quiz_id`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `quiz_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`question_id` integer NOT NULL,
	`content` text NOT NULL,
	`is_correct` integer DEFAULT false NOT NULL,
	`sort_order` integer NOT NULL,
	FOREIGN KEY (`question_id`) REFERENCES `quiz_questions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "quiz_options_content_check" CHECK(length(trim("quiz_options"."content")) BETWEEN 1 AND 300)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_options_question_sort_unique` ON `quiz_options` (`question_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_options_one_correct_unique` ON `quiz_options` (`question_id`) WHERE "quiz_options"."is_correct" = 1;--> statement-breakpoint
CREATE TABLE `quiz_questions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quiz_id` integer NOT NULL,
	`type` text NOT NULL,
	`prompt` text NOT NULL,
	`reference_answer` text,
	`explanation` text,
	`sort_order` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`quiz_id`) REFERENCES `quizzes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "quiz_questions_type_check" CHECK("quiz_questions"."type" IN ('single', 'text')),
	CONSTRAINT "quiz_questions_prompt_check" CHECK(length(trim("quiz_questions"."prompt")) BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_questions_quiz_sort_unique` ON `quiz_questions` (`quiz_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `quiz_questions_quiz_idx` ON `quiz_questions` (`quiz_id`,`id`);--> statement-breakpoint
CREATE TABLE `quizzes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`reward_ticket_type_id` integer,
	`reward_quantity` integer DEFAULT 0 NOT NULL,
	`reward_note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`published_at` integer,
	`closed_at` integer,
	`archived_at` integer,
	FOREIGN KEY (`reward_ticket_type_id`) REFERENCES `ticket_types`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "quizzes_title_check" CHECK(length(trim("quizzes"."title")) BETWEEN 1 AND 100),
	CONSTRAINT "quizzes_status_check" CHECK("quizzes"."status" IN ('draft', 'published', 'closed', 'archived')),
	CONSTRAINT "quizzes_reward_check" CHECK((
        ("quizzes"."reward_ticket_type_id" IS NULL AND "quizzes"."reward_quantity" = 0 AND "quizzes"."reward_note" IS NULL)
        OR
        ("quizzes"."reward_ticket_type_id" IS NOT NULL AND "quizzes"."reward_quantity" > 0 AND length(trim("quizzes"."reward_note")) > 0)
      ))
);
--> statement-breakpoint
CREATE INDEX `quizzes_status_updated_idx` ON `quizzes` (`status`,`updated_at`);