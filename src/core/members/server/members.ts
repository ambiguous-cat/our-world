import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

import type { SessionRole } from "@/core/auth/contracts";
import { MEMBER_IDS, type MemberId } from "../contracts";

// 当前暗号入口与两位成员的固定绑定。未来改权限时保留成员 ID。
const MEMBERS = {
  player: { memberId: MEMBER_IDS.first, role: "player" },
  admin: { memberId: MEMBER_IDS.second, role: "admin" },
} as const;

export function memberForRole(role: SessionRole): {
  readonly memberId: MemberId;
  readonly role: SessionRole;
} {
  const fixed = MEMBERS[role];
  const member = db.select().from(schema.members).where(eq(schema.members.id, fixed.memberId)).get();
  if (!member || member.role !== role) throw new Error("成员数据缺失或角色不匹配，请先完成数据库迁移");
  return { memberId: member.id, role: member.role };
}
