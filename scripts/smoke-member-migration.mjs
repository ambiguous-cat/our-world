import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrateDatabase } from "./migrate-database.mjs";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "our-world-members-"));
const filename = path.join(directory, "legacy.db");
const sqlite = new Database(filename);
const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" });
const q = (name) => '"' + name.replaceAll('"', '""') + '"';
function insert(table, values) {
  return sqlite.prepare(`INSERT INTO ${q(table)} (${Object.keys(values).map(q)}) VALUES (${Object.keys(values).map(() => "?")})`)
    .run(...Object.values(values)).lastInsertRowid;
}
function snapshot(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '__*'")
    .all().map(({ name }) => {
      const columns = db.prepare(`PRAGMA table_info(${q(name)})`).all().map((c) => c.name);
      return { name, columns, rows: db.prepare(`SELECT ${columns.map(q)} FROM ${q(name)} ORDER BY ${columns.map(q)}`).all() };
    });
}
try {
  sqlite.exec("CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)");
  for (const migration of migrations.slice(0, 6)) {
    for (const statement of migration.sql) sqlite.exec(statement);
    insert("__drizzle_migrations", { hash: migration.hash, created_at: migration.folderMillis });
  }
  sqlite.pragma("foreign_keys = ON");
  insert("prizes", { id: 1, name: "历史奖品", remaining_stock: 8 });
  insert("ticket_prize_pool_items", { id: 1, ticket_type_id: 1, prize_id: 1 });
  insert("retry_options", { id: 1, ticket_type_id: 1, extra_count: 2, weight: 1 });
  const drawBase = { ticket_type_id: 1, ticket_snapshot: '{"name":"旧券名"}', config_snapshot: '{}', balance_before: 4, balance_after: 3 };
  insert("draw_records", { ...drawBase, id: 1, request_key: "legacy-prize", result_type: "prize", prize_id: 1, pool_item_id: 1, result_snapshot: '{"type":"prize","name":"历史奖品"}' });
  insert("draw_records", { ...drawBase, id: 2, request_key: "legacy-retry", result_type: "retry", retry_option_id: 1, extra_count: 2, balance_after: 5, result_snapshot: '{"type":"retry","extraCount":2}' });
  insert("draw_records", { ...drawBase, id: 3, request_key: "legacy-miss", result_type: "miss", result_snapshot: '{"type":"miss"}' });
  insert("prize_wins", { id: 1, draw_record_id: 1, prize_id: 1, name_snapshot: "中奖时快照" });
  insert("prize_wins", { id: 2, prize_id: 1, source: "admin_grant", name_snapshot: "赠送时快照" });
  const logBase = { ticket_type_id: 1, ticket_name_snapshot: "旧券名", delta: 2, balance_before: 3, balance_after: 5, reason: "admin_grant", note: "原因快照" };
  insert("ticket_balance_logs", { ...logBase, id: 1 });
  insert("ticket_balance_logs", { ...logBase, id: 2 });
  insert("ticket_balance_logs", { ...logBase, id: 3, reason: "retry_reward", draw_record_id: 2 });
  insert("ticket_balance_logs", { ...logBase, id: 4, reason: "draw_cost", delta: -1, balance_after: 2, draw_record_id: 1 });
  insert("ticket_balance_logs", { ...logBase, id: 5, reason: "admin_revoke", delta: -1, balance_after: 2 });
  insert("external_ticket_grants", { source_type: "quiz", source_id: "1", ticket_balance_log_id: 2 });
  insert("ticket_grant_notices", { ticket_balance_log_id: 1, shown_at: 1234 });
  insert("ticket_grant_notices", { ticket_balance_log_id: 2 });
  for (const action of ["grant", "request", "cancel_request", "reject_request", "redeem", "undo_redeem", "revoke", "restore"]) insert("redemption_logs", { prize_win_id: 2, action });
  insert("prize_stock_logs", { prize_id: 1, delta: 10, stock_before: 0, stock_after: 10, reason: "admin_add" });
  insert("prize_stock_logs", { prize_id: 1, delta: -1, stock_before: 10, stock_after: 9, reason: "draw", draw_record_id: 1 });
  insert("quizzes", { id: 1, title: "历史题版", status: "published", reward_ticket_type_id: 1, reward_quantity: 2, reward_note: "奖励快照" });
  insert("quiz_questions", { id: 1, quiz_id: 1, type: "text", prompt: "旧题目", sort_order: 0 });
  insert("quiz_attempts", { id: 1, quiz_id: 1, request_key: "legacy-attempt", attempt_number: 1, reward_balance_log_id: 2, reward_ticket_name_snapshot: "旧券名", reward_quantity_snapshot: 2 });
  insert("quiz_answers", { attempt_id: 1, question_id: 1, question_type_snapshot: "text", prompt_snapshot: "旧题目", options_snapshot: "[]", text_answer: "旧回答", sort_order: 0 });
  insert("quiz_publish_notices", { quiz_id: 1, shown_at: 4567 });
  insert("notification_email_outbox", { event_type: "ticket_grant", event_key: "1", subject: "旧主题", heading: "旧标题", message: "旧正文", action_label: "查看", action_path: "/scratch", attempt_count: 2, sent_at: 9999, provider_email_id: "old-sent-id" });
  sqlite.exec("UPDATE player_ticket_balances SET balance=7; UPDATE sqlite_sequence SET seq=99 WHERE name='quizzes'");
  const before = snapshot(sqlite);
  assert.equal(before.length, 21, "必须比较全部旧业务表");
  const brokenFile = path.join(directory, "broken.db");
  await sqlite.backup(brokenFile);
  sqlite.close();
  migrateDatabase(filename);
  migrateDatabase(filename); // 幂等，不再次回填。
  const migrated = new Database(filename);
  try {
    for (const table of before) assert.deepEqual(migrated.prepare(`SELECT ${table.columns.map(q)} FROM ${q(table.name)} ORDER BY ${table.columns.map(q)}`).all(), table.rows, `${table.name} 历史字段被改变`);
    assert.deepEqual(migrated.prepare("SELECT id, role FROM members ORDER BY id").all(), [{ id: "member_001", role: "player" }, { id: "member_002", role: "admin" }]);
    assert.deepEqual(migrated.prepare("SELECT actor_type, actor_member_id FROM ticket_balance_logs ORDER BY id").all(), [
      { actor_type: "member", actor_member_id: "member_002" },
      { actor_type: "system", actor_member_id: null },
      { actor_type: "system", actor_member_id: null },
      { actor_type: "member", actor_member_id: "member_001" },
      { actor_type: "member", actor_member_id: "member_002" },
    ]);
    for (const row of migrated.prepare("SELECT action, actor_member_id FROM redemption_logs").all()) assert.equal(row.actor_member_id, ["request", "cancel_request"].includes(row.action) ? "member_001" : "member_002");
    for (const table of ["player_ticket_balances", "draw_records", "prize_wins", "ticket_balance_logs", "external_ticket_grants", "quiz_attempts", "quiz_publish_notices"]) assert.equal(migrated.prepare(`SELECT count(*) n FROM ${table} WHERE member_id != 'member_001' OR member_id IS NULL`).get().n, 0);
    assert.equal(migrated.prepare("SELECT created_by_member_id FROM quizzes").get().created_by_member_id, "member_002");
    assert.equal(migrated.prepare("SELECT seq FROM sqlite_sequence WHERE name='quizzes'").get().seq, 99);
    migrated.pragma("foreign_keys=ON");
    assert.throws(() => migrated.prepare("UPDATE draw_records SET member_id='invalid'").run(), /FOREIGN KEY/);
    assert.throws(() => migrated.prepare("UPDATE ticket_balance_logs SET actor_type='member', actor_member_id=NULL").run(), /CHECK/);
    migrated.exec("INSERT INTO player_ticket_balances (member_id, ticket_type_id, balance) VALUES ('member_002', 1, 23)");
    assert.equal(migrated.prepare("SELECT balance FROM player_ticket_balances WHERE member_id='member_001' AND ticket_type_id=1").get().balance, 7);
    assert.deepEqual(migrated.pragma("foreign_key_check"), []);
  } finally { migrated.close(); }
  const broken = new Database(brokenFile);
  try {
    broken.pragma("foreign_keys=OFF");
    broken.exec("UPDATE prize_wins SET prize_id=9999");
  } finally { broken.close(); }
  assert.throws(() => migrateDatabase(brokenFile), /外键检查失败/);
  const rolledBack = new Database(brokenFile);
  try {
    assert.equal(rolledBack.prepare("SELECT count(*) n FROM sqlite_master WHERE name='members'").get().n, 0);
    assert.equal(rolledBack.prepare("SELECT count(*) n FROM __drizzle_migrations").get().n, 6);
  } finally { rolledBack.close(); }
  console.log("成员迁移：历史全字段保留、归属回填、系统识别、外键、序号保留、重复执行及失败回滚通过");
} finally {
  if (sqlite.open) sqlite.close();
  // 仅清理本脚本创建的唯一临时目录。
  assert.equal(path.dirname(directory), os.tmpdir());
  assert.ok(path.basename(directory).startsWith("our-world-members-"));
  fs.rmSync(directory, { recursive: true, force: true });
}
