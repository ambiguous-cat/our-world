import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { timestamp } from "@/shared/db/columns";

/**
 * 全站唯一的轻量展示配置。固定使用 id = 1，避免为私人站点引入复杂配置系统。
 */
export const siteSettings = sqliteTable(
  "site_settings",
  {
    id: integer("id").primaryKey().default(1),
    homeNote: text("home_note")
      .notNull()
      .default("今天也辛苦啦，记得收下属于你的小快乐。"),
    homeNoteSignature: text("home_note_signature")
      .notNull()
      .default("最爱小狗的管理员"),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    check("site_settings_singleton_check", sql`${table.id} = 1`),
    check(
      "site_settings_home_note_check",
      sql`length(trim(${table.homeNote})) BETWEEN 1 AND 300`,
    ),
    check(
      "site_settings_home_note_signature_check",
      sql`length(trim(${table.homeNoteSignature})) BETWEEN 1 AND 40`,
    ),
  ],
);
