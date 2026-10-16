import type { MemberId } from "@/core/members/contracts";

export type SessionRole = "player" | "admin";

export type SessionIdentity = {
  memberId: MemberId;
  role: SessionRole;
};
