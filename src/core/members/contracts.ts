// 固定成员的持久身份；不要因昵称、暗号或权限变化而重新分配 ID。
export const MEMBER_IDS = {
  first: "member_001",
  second: "member_002",
} as const;

export type MemberId = (typeof MEMBER_IDS)[keyof typeof MEMBER_IDS];
