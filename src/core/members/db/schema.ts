import { sql } from "drizzle-orm";
import { check, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { MemberId } from "../contracts";

export const members = sqliteTable("members", {
  id: text("id").$type<MemberId>().primaryKey().notNull(),
  role: text("role", { enum: ["player", "admin"] }).notNull(),
}, (table) => [
  uniqueIndex("members_role_unique").on(table.role),
  check("members_fixed_identity_check", sql`(${table.id} = 'member_001' AND ${table.role} = 'player') OR (${table.id} = 'member_002' AND ${table.role} = 'admin')`),
]);
