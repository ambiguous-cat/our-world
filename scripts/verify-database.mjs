import assert from "node:assert/strict";
import path from "node:path";

import Database from "better-sqlite3";
import { loadProjectEnvironment } from "./load-env.mjs";

loadProjectEnvironment();

const requiredTables = [
  "members",
  "draw_configs",
  "draw_records",
  "external_ticket_grants",
  "notification_email_outbox",
  "player_ticket_balances",
  "prize_stock_logs",
  "prize_wins",
  "prizes",
  "quiz_answers",
  "quiz_attempts",
  "quiz_options",
  "quiz_publish_notices",
  "quiz_questions",
  "quizzes",
  "redemption_logs",
  "retry_options",
  "site_settings",
  "ticket_balance_logs",
  "ticket_grant_notices",
  "ticket_prize_pool_items",
  "ticket_types",
];

const configuredPath =
  process.env.DATABASE_PATH ?? path.join("data", "our-world.db");
const databasePath = path.resolve(process.cwd(), configuredPath);
const sqlite = new Database(databasePath, { readonly: true });

function columns(table) {
  return sqlite
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((column) => column.name);
}

try {
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name);
  for (const table of requiredTables) {
    assert.ok(tables.includes(table), `缺少数据表：${table}`);
  }

  assert.deepEqual(sqlite.prepare("SELECT id, role FROM members ORDER BY id").all(), [
    { id: "member_001", role: "player" }, { id: "member_002", role: "admin" },
  ]);
  for (const table of ["draw_records", "player_ticket_balances", "prize_wins", "ticket_balance_logs", "external_ticket_grants", "quiz_attempts", "quiz_publish_notices"]) {
    assert.ok(columns(table).includes("member_id"), table + " 缺少成员归属");
  }
  const tickets = sqlite
    .prepare(
      `SELECT t.id, t.name, t.display_icon, t.draw_background_image_path, b.balance
       FROM ticket_types t
       JOIN player_ticket_balances b ON b.ticket_type_id = t.id AND b.member_id = 'member_001'
       ORDER BY t.id`,
    )
    .all();
  assert.equal(tickets.length, 2, "初始数据库应包含两种常驻券");
  assert.deepEqual(
    tickets.map((ticket) => ticket.name),
    ["日常幸运券", "心动惊喜券"],
    "初始券种名称不正确",
  );
  assert.ok(
    tickets.every(
      (ticket) => Number.isInteger(ticket.balance) && ticket.balance >= 0,
    ),
    "各券种余额必须是非负整数",
  );
  assert.ok(
    tickets.every((ticket) => ticket.draw_background_image_path),
    "初始券种必须配置可用的刮奖背景",
  );
  assert.ok(
    tickets.every(
      (ticket) =>
        typeof ticket.display_icon === "string" && ticket.display_icon.trim(),
    ),
    "现有券种必须配置展示图标",
  );

  for (const column of [
    "cover_image_path",
    "display_icon",
    "draw_background_image_path",
    "theme_color",
    "accent_color",
    "scratch_mask_color",
    "scratch_text_color",
    "scratch_prompt",
    "is_grant_enabled",
    "is_draw_enabled",
  ]) {
    assert.ok(columns("ticket_types").includes(column), `券种缺少字段：${column}`);
  }
  for (const column of [
    "ticket_type_id",
    "ticket_snapshot",
    "config_snapshot",
    "result_snapshot",
    "request_key",
  ]) {
    assert.ok(columns("draw_records").includes(column), `抽奖记录缺少字段：${column}`);
  }

  const drawIndexes = sqlite.prepare("PRAGMA index_list(draw_records)").all();
  assert.ok(
    drawIndexes.some(
      (index) =>
        index.name === "draw_records_request_key_unique" && index.unique === 1,
    ),
    "draw_records 缺少幂等请求唯一索引",
  );
  const configIndexes = sqlite.prepare("PRAGMA index_list(draw_configs)").all();
  assert.ok(
    configIndexes.some(
      (index) =>
        index.name === "draw_configs_one_active_per_ticket_unique" &&
        index.unique === 1 &&
        index.partial === 1,
    ),
    "draw_configs 缺少每券种唯一启用配置索引",
  );
  const poolIndexes = sqlite
    .prepare("PRAGMA index_list(ticket_prize_pool_items)")
    .all();
  assert.ok(
    poolIndexes.some(
      (index) =>
        index.name === "ticket_prize_pool_items_ticket_prize_unique" &&
        index.unique === 1,
    ),
    "券池缺少券种与奖品唯一索引",
  );

  assert.deepEqual(
    columns("ticket_grant_notices"),
    ["ticket_balance_log_id", "shown_at", "created_at"],
    "发券提示字段不完整",
  );
  const rewardSourceIndexes = sqlite
    .prepare("PRAGMA index_list(external_ticket_grants)")
    .all();
  assert.ok(
    rewardSourceIndexes.some(
      (index) =>
        index.name === "external_ticket_grants_source_unique" &&
        index.unique === 1,
    ),
    "跨模块发券记录缺少来源幂等索引",
  );
  const attemptIndexes = sqlite.prepare("PRAGMA index_list(quiz_attempts)").all();
  assert.ok(
    attemptIndexes.some(
      (index) =>
        index.name === "quiz_attempts_request_key_unique" && index.unique === 1,
    ),
    "答题记录缺少请求幂等索引",
  );
  assert.ok(
    attemptIndexes.some(
      (index) =>
        index.name === "quiz_attempts_one_reward_per_quiz_unique" &&
        index.unique === 1 &&
        index.partial === 1,
    ),
    "答题记录缺少每题版唯一首次奖励索引",
  );
  assert.ok(
    columns("quiz_questions").includes("message"),
    "题目缺少留言字段",
  );
  assert.ok(
    columns("quiz_answers").includes("message_snapshot"),
    "答题快照缺少留言字段",
  );
  assert.deepEqual(
    columns("quiz_publish_notices"),
    ["member_id", "quiz_id", "shown_at", "created_at"],
    "题版发布提示字段不完整",
  );
  const emailOutboxIndexes = sqlite
    .prepare("PRAGMA index_list(notification_email_outbox)")
    .all();
  assert.ok(
    emailOutboxIndexes.some(
      (index) =>
        index.name === "notification_email_outbox_event_unique" &&
        index.unique === 1,
    ),
    "邮件 outbox 缺少事件幂等唯一索引",
  );
  assert.deepEqual(
    columns("site_settings"),
    ["id", "home_note", "home_note_signature", "updated_at"],
    "站点设置字段不完整",
  );
  const siteSettings = sqlite
    .prepare(
      `SELECT id, home_note, home_note_signature
       FROM site_settings
       WHERE id = 1`,
    )
    .get();
  assert.ok(siteSettings, "缺少默认站点设置");
  assert.ok(siteSettings.home_note.trim(), "首页寄语正文不能为空");
  assert.ok(siteSettings.home_note_signature.trim(), "首页寄语落款不能为空");
  const foreignKeyErrors = sqlite.prepare("PRAGMA foreign_key_check").all();
  assert.equal(
    foreignKeyErrors.length,
    0,
    `发现外键错误：${JSON.stringify(foreignKeyErrors)}`,
  );

  console.log(`数据库验证通过：${requiredTables.length} 张业务表完整。`);
  console.log(`初始券种：${tickets.map((ticket) => ticket.name).join("、")}。`);
  console.log("多券余额、独立概率、独立奖池和历史快照结构：通过。");
  console.log("抽奖幂等、发券提示及外键完整性：通过。");
  console.log("答题快照、重复提交幂等与首次奖励唯一性：通过。");
} finally {
  sqlite.close();
}
