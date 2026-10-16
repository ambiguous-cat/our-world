import { members } from "@/core/members/db/schema";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { ticketBalanceLogs, ticketTypes } from "@/modules/scratch/db/schema";
import { timestamp } from "@/shared/db/columns";

export type QuizOptionSnapshot = {
  id: number;
  content: string;
  isCorrect: boolean;
};

export const quizzes = sqliteTable(
  "quizzes",
  {
    createdByMemberId: text("created_by_member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", {
      enum: ["draft", "published", "closed", "archived"],
    })
      .notNull()
      .default("draft"),
    rewardTicketTypeId: integer("reward_ticket_type_id").references(
      () => ticketTypes.id,
      { onDelete: "restrict" },
    ),
    rewardQuantity: integer("reward_quantity").notNull().default(0),
    rewardNote: text("reward_note"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    check("quizzes_title_check", sql`length(trim(${table.title})) BETWEEN 1 AND 100`),
    check(
      "quizzes_status_check",
      sql`${table.status} IN ('draft', 'published', 'closed', 'archived')`,
    ),
    check(
      "quizzes_reward_check",
      sql`(
        (${table.rewardTicketTypeId} IS NULL AND ${table.rewardQuantity} = 0 AND ${table.rewardNote} IS NULL)
        OR
        (${table.rewardTicketTypeId} IS NOT NULL AND ${table.rewardQuantity} > 0 AND length(trim(${table.rewardNote})) > 0)
      )`,
    ),
    index("quizzes_status_updated_idx").on(table.status, table.updatedAt),
  ],
);

export const quizPublishNotices = sqliteTable(
  "quiz_publish_notices",
  {
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
    quizId: integer("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "restrict" }),
    shownAt: integer("shown_at", { mode: "timestamp_ms" }),
    createdAt: timestamp("created_at"),
  },
  (table) => [primaryKey({ columns: [table.memberId, table.quizId] }), index("quiz_publish_notices_shown_at_idx").on(table.shownAt)],
);

export const quizQuestions = sqliteTable(
  "quiz_questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    quizId: integer("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["single", "text"] }).notNull(),
    prompt: text("prompt").notNull(),
    referenceAnswer: text("reference_answer"),
    explanation: text("explanation"),
    message: text("message"),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    check("quiz_questions_type_check", sql`${table.type} IN ('single', 'text')`),
    check(
      "quiz_questions_prompt_check",
      sql`length(trim(${table.prompt})) BETWEEN 1 AND 500`,
    ),
    uniqueIndex("quiz_questions_quiz_sort_unique").on(table.quizId, table.sortOrder),
    index("quiz_questions_quiz_idx").on(table.quizId, table.id),
  ],
);

export const quizOptions = sqliteTable(
  "quiz_options",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    questionId: integer("question_id")
      .notNull()
      .references(() => quizQuestions.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    isCorrect: integer("is_correct", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    check(
      "quiz_options_content_check",
      sql`length(trim(${table.content})) BETWEEN 1 AND 300`,
    ),
    uniqueIndex("quiz_options_question_sort_unique").on(
      table.questionId,
      table.sortOrder,
    ),
    uniqueIndex("quiz_options_one_correct_unique")
      .on(table.questionId)
      .where(sql`${table.isCorrect} = 1`),
  ],
);

export const quizAttempts = sqliteTable(
  "quiz_attempts",
  {
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
    id: integer("id").primaryKey({ autoIncrement: true }),
    quizId: integer("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "restrict" }),
    requestKey: text("request_key").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    singleCorrectCount: integer("single_correct_count").notNull().default(0),
    singleQuestionCount: integer("single_question_count").notNull().default(0),
    rewardBalanceLogId: integer("reward_balance_log_id").references(
      () => ticketBalanceLogs.id,
      { onDelete: "restrict" },
    ),
    rewardTicketNameSnapshot: text("reward_ticket_name_snapshot"),
    rewardQuantitySnapshot: integer("reward_quantity_snapshot"),
    submittedAt: timestamp("submitted_at"),
  },
  (table) => [
    uniqueIndex("quiz_attempts_request_key_unique").on(table.requestKey),
    uniqueIndex("quiz_attempts_quiz_number_unique").on(
      table.memberId,
      table.quizId,
      table.attemptNumber,
    ),
    uniqueIndex("quiz_attempts_one_reward_per_quiz_unique")
      .on(table.memberId, table.quizId)
      .where(sql`${table.rewardBalanceLogId} IS NOT NULL`),
    check("quiz_attempts_number_check", sql`${table.attemptNumber} > 0`),
    check(
      "quiz_attempts_score_check",
      sql`${table.singleCorrectCount} BETWEEN 0 AND ${table.singleQuestionCount}`,
    ),
    check(
      "quiz_attempts_reward_snapshot_check",
      sql`(
        (${table.rewardBalanceLogId} IS NULL AND ${table.rewardTicketNameSnapshot} IS NULL AND ${table.rewardQuantitySnapshot} IS NULL)
        OR
        (${table.rewardBalanceLogId} IS NOT NULL AND length(trim(${table.rewardTicketNameSnapshot})) > 0 AND ${table.rewardQuantitySnapshot} > 0)
      )`,
    ),
    index("quiz_attempts_quiz_submitted_idx").on(table.quizId, table.submittedAt),
  ],
);

export const quizAnswers = sqliteTable(
  "quiz_answers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    attemptId: integer("attempt_id")
      .notNull()
      .references(() => quizAttempts.id, { onDelete: "restrict" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => quizQuestions.id, { onDelete: "restrict" }),
    questionTypeSnapshot: text("question_type_snapshot", {
      enum: ["single", "text"],
    }).notNull(),
    promptSnapshot: text("prompt_snapshot").notNull(),
    optionsSnapshot: text("options_snapshot", { mode: "json" })
      .$type<QuizOptionSnapshot[]>()
      .notNull(),
    selectedOptionId: integer("selected_option_id"),
    selectedOptionTextSnapshot: text("selected_option_text_snapshot"),
    textAnswer: text("text_answer"),
    isCorrect: integer("is_correct", { mode: "boolean" }),
    referenceAnswerSnapshot: text("reference_answer_snapshot"),
    explanationSnapshot: text("explanation_snapshot"),
    messageSnapshot: text("message_snapshot"),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    uniqueIndex("quiz_answers_attempt_question_unique").on(
      table.attemptId,
      table.questionId,
    ),
    uniqueIndex("quiz_answers_attempt_sort_unique").on(
      table.attemptId,
      table.sortOrder,
    ),
    check(
      "quiz_answers_type_check",
      sql`${table.questionTypeSnapshot} IN ('single', 'text')`,
    ),
    check("quiz_answers_options_json_check", sql`json_valid(${table.optionsSnapshot})`),
    check(
      "quiz_answers_value_check",
      sql`(
        (${table.questionTypeSnapshot} = 'single'
          AND ${table.selectedOptionId} IS NOT NULL
          AND length(trim(${table.selectedOptionTextSnapshot})) > 0
          AND ${table.textAnswer} IS NULL
          AND ${table.isCorrect} IS NOT NULL)
        OR
        (${table.questionTypeSnapshot} = 'text'
          AND ${table.selectedOptionId} IS NULL
          AND ${table.selectedOptionTextSnapshot} IS NULL
          AND length(trim(${table.textAnswer})) > 0
          AND ${table.isCorrect} IS NULL)
      )`,
    ),
  ],
);
