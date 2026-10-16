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

import { timestamp } from "@/shared/db/columns";
import type { TicketIconKey } from "@/modules/scratch/contracts/ticket-icon";

export type TicketSnapshot = {
  ticketTypeId: number;
  name: string;
  kind: "permanent" | "limited";
  coverImagePath: string | null;
  drawBackgroundImagePath: string | null;
  themeColor: string;
  accentColor: string;
};

export type ProbabilityConfigSnapshot = {
  configId: number;
  ticketTypeId: number;
  version: number;
  prizeWeight: number;
  retryWeight: number;
  missWeight: number;
};

export type DrawResultSnapshot =
  | {
      type: "prize";
      prizeId: number;
      poolItemId: number;
      name: string;
      description: string | null;
      imagePath: string | null;
    }
  | {
      type: "retry";
      retryOptionId: number;
      ticketTypeId: number;
      ticketName: string;
      extraCount: number;
    }
  | {
      type: "miss";
    };

/**
 * 管理员创建的券种。限定时间只控制发放，已持有的券能否使用由 isDrawEnabled 决定。
 */
export const ticketTypes = sqliteTable(
  "ticket_types",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description"),
    kind: text("kind", { enum: ["permanent", "limited"] })
      .notNull()
      .default("permanent"),
    displayIcon: text("display_icon").$type<TicketIconKey>().notNull().default("ticket"),
    coverImagePath: text("cover_image_path"),
    drawBackgroundImagePath: text("draw_background_image_path"),
    themeColor: text("theme_color").notNull().default("#BFD9A8"),
    accentColor: text("accent_color").notNull().default("#F3AFC1"),
    scratchMaskColor: text("scratch_mask_color").notNull().default("#A8A9AD"),
    scratchTextColor: text("scratch_text_color").notNull().default("#FFFFFF"),
    scratchPrompt: text("scratch_prompt").notNull().default("刮开看看吧"),
    isGrantEnabled: integer("is_grant_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    isDrawEnabled: integer("is_draw_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    grantStartAt: integer("grant_start_at", { mode: "timestamp_ms" }),
    grantEndAt: integer("grant_end_at", { mode: "timestamp_ms" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    check("ticket_types_name_check", sql`length(trim(${table.name})) > 0`),
    check(
      "ticket_types_kind_check",
      sql`${table.kind} IN ('permanent', 'limited')`,
    ),
    check(
      "ticket_types_theme_color_check",
      sql`${table.themeColor} GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'`,
    ),
    check(
      "ticket_types_accent_color_check",
      sql`${table.accentColor} GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'`,
    ),
    check(
      "ticket_types_scratch_mask_color_check",
      sql`${table.scratchMaskColor} GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'`,
    ),
    check(
      "ticket_types_scratch_text_color_check",
      sql`${table.scratchTextColor} GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'`,
    ),
    check(
      "ticket_types_grant_window_check",
      sql`${table.grantStartAt} IS NULL OR ${table.grantEndAt} IS NULL OR ${table.grantStartAt} < ${table.grantEndAt}`,
    ),
    index("ticket_types_display_idx").on(table.archivedAt, table.sortOrder),
  ],
);

/**
 * 各成员持有的券余额，按成员和券种唯一。
 */
export const playerTicketBalances = sqliteTable(
  "player_ticket_balances",
  {
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
    ticketTypeId: integer("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id, { onDelete: "restrict" }),
    balance: integer("balance").notNull().default(0),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    primaryKey({ columns: [table.memberId, table.ticketTypeId] }),
    check(
      "player_ticket_balances_balance_check",
      sql`${table.balance} >= 0`,
    ),
  ],
);

/**
 * 奖品主数据。库存由所有券池共享，奖品使用归档而不是物理删除。
 */
export const prizes = sqliteTable(
  "prizes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description"),
    imagePath: text("image_path"),
    remainingStock: integer("remaining_stock").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    check("prizes_name_check", sql`length(trim(${table.name})) > 0`),
    check(
      "prizes_remaining_stock_check",
      sql`${table.remainingStock} >= 0`,
    ),
    index("prizes_drawable_idx").on(table.isActive, table.remainingStock),
    index("prizes_sort_order_idx").on(table.sortOrder, table.id),
  ],
);

/**
 * 每个券种独立的三类抽奖概率历史版本，概率以万分比整数保存。
 */
export const drawConfigs = sqliteTable(
  "draw_configs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticketTypeId: integer("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    prizeWeight: integer("prize_weight").notNull(),
    retryWeight: integer("retry_weight").notNull(),
    missWeight: integer("miss_weight").notNull(),
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("draw_configs_ticket_version_unique").on(
      table.ticketTypeId,
      table.version,
    ),
    uniqueIndex("draw_configs_one_active_per_ticket_unique")
      .on(table.ticketTypeId)
      .where(sql`${table.isActive} = 1`),
    check("draw_configs_version_check", sql`${table.version} > 0`),
    check(
      "draw_configs_prize_weight_check",
      sql`${table.prizeWeight} BETWEEN 0 AND 10000`,
    ),
    check(
      "draw_configs_retry_weight_check",
      sql`${table.retryWeight} BETWEEN 0 AND 10000`,
    ),
    check(
      "draw_configs_miss_weight_check",
      sql`${table.missWeight} BETWEEN 0 AND 10000`,
    ),
    check(
      "draw_configs_total_weight_check",
      sql`${table.prizeWeight} + ${table.retryWeight} + ${table.missWeight} = 10000`,
    ),
    index("draw_configs_ticket_idx").on(table.ticketTypeId, table.createdAt),
  ],
);

/**
 * 券种与奖品的多对多奖池配置。抽取权重与全局库存分离。
 */
export const ticketPrizePoolItems = sqliteTable(
  "ticket_prize_pool_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticketTypeId: integer("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id, { onDelete: "restrict" }),
    prizeId: integer("prize_id")
      .notNull()
      .references(() => prizes.id, { onDelete: "restrict" }),
    weight: integer("weight").notNull().default(1),
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("ticket_prize_pool_items_ticket_prize_unique").on(
      table.ticketTypeId,
      table.prizeId,
    ),
    check(
      "ticket_prize_pool_items_weight_check",
      sql`${table.weight} > 0`,
    ),
    index("ticket_prize_pool_items_drawable_idx").on(
      table.ticketTypeId,
      table.isActive,
      table.archivedAt,
    ),
  ],
);

/**
 * 每个券种自己的“再来 x 张同类券”条目。
 */
export const retryOptions = sqliteTable(
  "retry_options",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticketTypeId: integer("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id, { onDelete: "restrict" }),
    extraCount: integer("extra_count").notNull(),
    weight: integer("weight").notNull(),
    isActive: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    check("retry_options_extra_count_check", sql`${table.extraCount} > 0`),
    check("retry_options_weight_check", sql`${table.weight} > 0`),
    index("retry_options_ticket_active_idx").on(
      table.ticketTypeId,
      table.isActive,
      table.archivedAt,
    ),
  ],
);

/**
 * 所有抽奖的不可变历史。券种、概率和具体结果均保存当时快照。
 */
export const drawRecords = sqliteTable(
  "draw_records",
  {
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
    id: integer("id").primaryKey({ autoIncrement: true }),
    requestKey: text("request_key").notNull(),
    ticketTypeId: integer("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id, { onDelete: "restrict" }),
    resultType: text("result_type", {
      enum: ["prize", "retry", "miss"],
    }).notNull(),
    balanceBefore: integer("balance_before").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    prizeId: integer("prize_id").references(() => prizes.id, {
      onDelete: "restrict",
    }),
    poolItemId: integer("pool_item_id").references(
      () => ticketPrizePoolItems.id,
      { onDelete: "restrict" },
    ),
    retryOptionId: integer("retry_option_id").references(
      () => retryOptions.id,
      { onDelete: "restrict" },
    ),
    extraCount: integer("extra_count"),
    ticketSnapshot: text("ticket_snapshot", { mode: "json" })
      .$type<TicketSnapshot>()
      .notNull(),
    configSnapshot: text("config_snapshot", { mode: "json" })
      .$type<ProbabilityConfigSnapshot>()
      .notNull(),
    resultSnapshot: text("result_snapshot", { mode: "json" })
      .$type<DrawResultSnapshot>()
      .notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("draw_records_request_key_unique").on(table.requestKey),
    check(
      "draw_records_result_type_check",
      sql`${table.resultType} IN ('prize', 'retry', 'miss')`,
    ),
    check(
      "draw_records_balance_before_check",
      sql`${table.balanceBefore} >= 1`,
    ),
    check(
      "draw_records_balance_after_check",
      sql`${table.balanceAfter} >= 0`,
    ),
    check(
      "draw_records_result_fields_check",
      sql`(
        (${table.resultType} = 'prize'
          AND ${table.prizeId} IS NOT NULL
          AND ${table.poolItemId} IS NOT NULL
          AND ${table.retryOptionId} IS NULL
          AND ${table.extraCount} IS NULL)
        OR
        (${table.resultType} = 'retry'
          AND ${table.prizeId} IS NULL
          AND ${table.poolItemId} IS NULL
          AND ${table.retryOptionId} IS NOT NULL
          AND ${table.extraCount} > 0)
        OR
        (${table.resultType} = 'miss'
          AND ${table.prizeId} IS NULL
          AND ${table.poolItemId} IS NULL
          AND ${table.retryOptionId} IS NULL
          AND ${table.extraCount} IS NULL)
      )`,
    ),
    check(
      "draw_records_balance_change_check",
      sql`(
        (${table.resultType} IN ('prize', 'miss')
          AND ${table.balanceAfter} = ${table.balanceBefore} - 1)
        OR
        (${table.resultType} = 'retry'
          AND ${table.balanceAfter} = ${table.balanceBefore} - 1 + ${table.extraCount})
      )`,
    ),
    check(
      "draw_records_ticket_snapshot_json_check",
      sql`json_valid(${table.ticketSnapshot})`,
    ),
    check(
      "draw_records_config_snapshot_json_check",
      sql`json_valid(${table.configSnapshot})`,
    ),
    check(
      "draw_records_result_snapshot_json_check",
      sql`json_valid(${table.resultSnapshot})`,
    ),
    index("draw_records_created_at_idx").on(table.createdAt),
    index("draw_records_ticket_created_idx").on(
      table.ticketTypeId,
      table.createdAt,
    ),
    index("draw_records_result_type_idx").on(table.resultType),
  ],
);

/**
 * 抽中的奖品和管理员直接发放的奖券进入收藏；此表保存结果快照及当前状态。
 */
export const prizeWins = sqliteTable(
  "prize_wins",
  {
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
    id: integer("id").primaryKey({ autoIncrement: true }),
    drawRecordId: integer("draw_record_id").references(() => drawRecords.id, {
      onDelete: "restrict",
    }),
    prizeId: integer("prize_id")
      .notNull()
      .references(() => prizes.id, { onDelete: "restrict" }),
    source: text("source", {
      enum: ["draw", "admin_grant"],
    })
      .notNull()
      .default("draw"),
    nameSnapshot: text("name_snapshot").notNull(),
    descriptionSnapshot: text("description_snapshot"),
    imagePathSnapshot: text("image_path_snapshot"),
    status: text("status", {
      enum: ["unredeemed", "requested", "redeemed", "revoked"],
    })
      .notNull()
      .default("unredeemed"),
    requestedAt: integer("requested_at", { mode: "timestamp_ms" }),
    redeemedAt: integer("redeemed_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    uniqueIndex("prize_wins_draw_record_unique").on(table.drawRecordId),
    check(
      "prize_wins_source_check",
      sql`(
        (${table.source} = 'draw' AND ${table.drawRecordId} IS NOT NULL)
        OR
        (${table.source} = 'admin_grant' AND ${table.drawRecordId} IS NULL)
      )`,
    ),
    check(
      "prize_wins_name_snapshot_check",
      sql`length(trim(${table.nameSnapshot})) > 0`,
    ),
    check(
      "prize_wins_status_check",
      sql`${table.status} IN ('unredeemed', 'requested', 'redeemed', 'revoked')`,
    ),
    check(
      "prize_wins_status_timestamps_check",
      sql`(
        (${table.status} = 'unredeemed'
          AND ${table.requestedAt} IS NULL
          AND ${table.redeemedAt} IS NULL
          AND ${table.revokedAt} IS NULL)
        OR
        (${table.status} = 'requested'
          AND ${table.requestedAt} IS NOT NULL
          AND ${table.redeemedAt} IS NULL
          AND ${table.revokedAt} IS NULL)
        OR
        (${table.status} = 'redeemed'
          AND ${table.requestedAt} IS NULL
          AND ${table.redeemedAt} IS NOT NULL
          AND ${table.revokedAt} IS NULL)
        OR
        (${table.status} = 'revoked'
          AND ${table.requestedAt} IS NULL
          AND ${table.redeemedAt} IS NULL
          AND ${table.revokedAt} IS NOT NULL)
      )`,
    ),
    index("prize_wins_status_idx").on(table.status, table.createdAt),
  ],
);

/**
 * 各券种余额的完整变化日志。
 */
export const ticketBalanceLogs = sqliteTable(
  "ticket_balance_logs",
  {
    actorType: text("actor_type", { enum: ["member", "system"] }).notNull(),
    actorMemberId: text("actor_member_id").references(() => members.id, { onDelete: "restrict" }),
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticketTypeId: integer("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id, { onDelete: "restrict" }),
    ticketNameSnapshot: text("ticket_name_snapshot").notNull(),
    delta: integer("delta").notNull(),
    balanceBefore: integer("balance_before").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    reason: text("reason", {
      enum: ["draw_cost", "retry_reward", "admin_grant", "admin_revoke"],
    }).notNull(),
    drawRecordId: integer("draw_record_id").references(() => drawRecords.id, {
      onDelete: "restrict",
    }),
    note: text("note"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    check("ticket_balance_logs_actor_check", sql`(${table.actorType} = 'member' AND ${table.actorMemberId} IS NOT NULL) OR (${table.actorType} = 'system' AND ${table.actorMemberId} IS NULL)`),
    check("ticket_balance_logs_delta_check", sql`${table.delta} <> 0`),
    check(
      "ticket_balance_logs_balance_before_check",
      sql`${table.balanceBefore} >= 0`,
    ),
    check(
      "ticket_balance_logs_balance_after_check",
      sql`${table.balanceAfter} >= 0`,
    ),
    check(
      "ticket_balance_logs_balance_change_check",
      sql`${table.balanceAfter} = ${table.balanceBefore} + ${table.delta}`,
    ),
    check(
      "ticket_balance_logs_reason_check",
      sql`${table.reason} IN ('draw_cost', 'retry_reward', 'admin_grant', 'admin_revoke')`,
    ),
    check(
      "ticket_balance_logs_source_check",
      sql`(
        (${table.reason} = 'draw_cost'
          AND ${table.delta} = -1
          AND ${table.drawRecordId} IS NOT NULL)
        OR
        (${table.reason} = 'retry_reward'
          AND ${table.delta} > 0
          AND ${table.drawRecordId} IS NOT NULL)
        OR
        (${table.reason} = 'admin_grant'
          AND ${table.delta} > 0
          AND ${table.drawRecordId} IS NULL
          AND length(trim(${table.note})) > 0)
        OR
        (${table.reason} = 'admin_revoke'
          AND ${table.delta} < 0
          AND ${table.drawRecordId} IS NULL)
      )`,
    ),
    index("ticket_balance_logs_created_at_idx").on(table.createdAt),
    index("ticket_balance_logs_ticket_created_idx").on(
      table.ticketTypeId,
      table.createdAt,
    ),
    index("ticket_balance_logs_draw_record_idx").on(table.drawRecordId),
  ],
);

/**
 * 跨模块发券的幂等来源，不改变既有余额日志表及其稳定约束。
 */
export const externalTicketGrants = sqliteTable(
  "external_ticket_grants",
  {
    memberId: text("member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceType: text("source_type", { enum: ["quiz"] }).notNull(),
    sourceId: text("source_id").notNull(),
    ticketBalanceLogId: integer("ticket_balance_log_id")
      .notNull()
      .references(() => ticketBalanceLogs.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("external_ticket_grants_source_unique").on(
      table.memberId,
      table.sourceType,
      table.sourceId,
    ),
    uniqueIndex("external_ticket_grants_balance_log_unique").on(
      table.ticketBalanceLogId,
    ),
    check(
      "external_ticket_grants_source_type_check",
      sql`${table.sourceType} IN ('quiz')`,
    ),
  ],
);

/**
 * 管理员发券或跨模块奖励券的玩家首页确认状态。
 */
export const ticketGrantNotices = sqliteTable(
  "ticket_grant_notices",
  {
    ticketBalanceLogId: integer("ticket_balance_log_id")
      .primaryKey()
      .references(() => ticketBalanceLogs.id, { onDelete: "restrict" }),
    shownAt: integer("shown_at", { mode: "timestamp_ms" }),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    index("ticket_grant_notices_shown_at_idx").on(table.shownAt),
  ],
);

/**
 * 奖品全局库存的完整变化日志。
 */
export const prizeStockLogs = sqliteTable(
  "prize_stock_logs",
  {
    actorType: text("actor_type", { enum: ["member", "system"] }).notNull(),
    actorMemberId: text("actor_member_id").references(() => members.id, { onDelete: "restrict" }),
    id: integer("id").primaryKey({ autoIncrement: true }),
    prizeId: integer("prize_id")
      .notNull()
      .references(() => prizes.id, { onDelete: "restrict" }),
    delta: integer("delta").notNull(),
    stockBefore: integer("stock_before").notNull(),
    stockAfter: integer("stock_after").notNull(),
    reason: text("reason", {
      enum: ["draw", "admin_add", "admin_reduce"],
    }).notNull(),
    drawRecordId: integer("draw_record_id").references(() => drawRecords.id, {
      onDelete: "restrict",
    }),
    note: text("note"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    check("prize_stock_logs_actor_check", sql`(${table.actorType} = 'member' AND ${table.actorMemberId} IS NOT NULL) OR (${table.actorType} = 'system' AND ${table.actorMemberId} IS NULL)`),
    check("prize_stock_logs_delta_check", sql`${table.delta} <> 0`),
    check(
      "prize_stock_logs_stock_before_check",
      sql`${table.stockBefore} >= 0`,
    ),
    check(
      "prize_stock_logs_stock_after_check",
      sql`${table.stockAfter} >= 0`,
    ),
    check(
      "prize_stock_logs_stock_change_check",
      sql`${table.stockAfter} = ${table.stockBefore} + ${table.delta}`,
    ),
    check(
      "prize_stock_logs_reason_check",
      sql`${table.reason} IN ('draw', 'admin_add', 'admin_reduce')`,
    ),
    check(
      "prize_stock_logs_source_check",
      sql`(
        (${table.reason} = 'draw'
          AND ${table.delta} = -1
          AND ${table.drawRecordId} IS NOT NULL)
        OR
        (${table.reason} = 'admin_add'
          AND ${table.delta} > 0
          AND ${table.drawRecordId} IS NULL)
        OR
        (${table.reason} = 'admin_reduce'
          AND ${table.delta} < 0
          AND ${table.drawRecordId} IS NULL)
      )`,
    ),
    uniqueIndex("prize_stock_logs_draw_record_unique")
      .on(table.drawRecordId)
      .where(sql`${table.drawRecordId} IS NOT NULL`),
    index("prize_stock_logs_prize_created_idx").on(
      table.prizeId,
      table.createdAt,
    ),
  ],
);

/**
 * 申请兑换、取消、拒绝、核销、撤销核销、撤回和恢复的不可变操作日志。
 */
export const redemptionLogs = sqliteTable(
  "redemption_logs",
  {
    actorType: text("actor_type", { enum: ["member", "system"] }).notNull(),
    actorMemberId: text("actor_member_id").references(() => members.id, { onDelete: "restrict" }),
    id: integer("id").primaryKey({ autoIncrement: true }),
    prizeWinId: integer("prize_win_id")
      .notNull()
      .references(() => prizeWins.id, { onDelete: "restrict" }),
    action: text("action", {
      enum: [
        "grant",
        "request",
        "cancel_request",
        "reject_request",
        "redeem",
        "undo_redeem",
        "revoke",
        "restore",
      ],
    }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    check("redemption_logs_actor_check", sql`(${table.actorType} = 'member' AND ${table.actorMemberId} IS NOT NULL) OR (${table.actorType} = 'system' AND ${table.actorMemberId} IS NULL)`),
    check(
      "redemption_logs_action_check",
      sql`${table.action} IN (
        'grant',
        'request',
        'cancel_request',
        'reject_request',
        'redeem',
        'undo_redeem',
        'revoke',
        'restore'
      )`,
    ),
    index("redemption_logs_prize_win_created_idx").on(
      table.prizeWinId,
      table.createdAt,
    ),
  ],
);
