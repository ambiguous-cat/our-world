import type { MemberId } from "@/core/members/contracts";
import "server-only";

import { and, eq } from "drizzle-orm";

import { db, schema } from "@/db";
import { enqueueTicketGrantEmail } from "./ticket-notification-service";

export class TicketRewardError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "TicketRewardError";
  }
}

export type QuizRewardInput = {
  memberId: MemberId;
  quizId: number;
  ticketTypeId: number;
  quantity: number;
  note: string;
};

export function getQuizRewardTicketChoices() {
  return db
    .select({
      id: schema.ticketTypes.id,
      name: schema.ticketTypes.name,
      isGrantEnabled: schema.ticketTypes.isGrantEnabled,
      archivedAt: schema.ticketTypes.archivedAt,
    })
    .from(schema.ticketTypes)
    .orderBy(schema.ticketTypes.sortOrder, schema.ticketTypes.id)
    .all()
    .filter((ticket) => !ticket.archivedAt)
    .map(({ id, name, isGrantEnabled }) => ({ id, name, isGrantEnabled }));
}

export function grantQuizReward(input: QuizRewardInput) {
  const sourceId = String(input.quizId);
  const { memberId } = input;
  const existing = db
    .select({
      id: schema.ticketBalanceLogs.id,
      ticketTypeId: schema.ticketBalanceLogs.ticketTypeId,
      quantity: schema.ticketBalanceLogs.delta,
      ticketName: schema.ticketBalanceLogs.ticketNameSnapshot,
    })
    .from(schema.externalTicketGrants)
    .innerJoin(
      schema.ticketBalanceLogs,
      eq(
        schema.externalTicketGrants.ticketBalanceLogId,
        schema.ticketBalanceLogs.id,
      ),
    )
    .where(
      and(
        eq(schema.externalTicketGrants.memberId, memberId),
        eq(schema.externalTicketGrants.sourceType, "quiz"),
        eq(schema.externalTicketGrants.sourceId, sourceId),
      ),
    )
    .get();

  if (existing) {
    if (
      existing.ticketTypeId !== input.ticketTypeId ||
      existing.quantity !== input.quantity
    ) {
      throw new TicketRewardError(
        "REWARD_CONFLICT",
        "这份题版已经发放过不同配置的奖励",
      );
    }
    return existing;
  }

  const ticket = db
    .select()
    .from(schema.ticketTypes)
    .where(eq(schema.ticketTypes.id, input.ticketTypeId))
    .get();
  const now = new Date();

  if (!ticket || ticket.archivedAt) {
    throw new TicketRewardError("REWARD_TICKET_UNAVAILABLE", "答题奖励券已归档");
  }
  if (!ticket.isGrantEnabled) {
    throw new TicketRewardError(
      "REWARD_TICKET_DISABLED",
      "答题奖励券当前已停止发放",
    );
  }
  if (ticket.grantStartAt && ticket.grantStartAt > now) {
    throw new TicketRewardError("REWARD_NOT_STARTED", "答题奖励还未到发放时间");
  }
  if (ticket.grantEndAt && ticket.grantEndAt <= now) {
    throw new TicketRewardError("REWARD_ENDED", "答题奖励已经超过发放时间");
  }
  if (
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 9999
  ) {
    throw new TicketRewardError(
      "INVALID_REWARD_QUANTITY",
      "答题奖励张数无效",
      400,
    );
  }

  const current = db
    .select({ balance: schema.playerTicketBalances.balance })
    .from(schema.playerTicketBalances)
    .where(and(eq(schema.playerTicketBalances.memberId, memberId), eq(schema.playerTicketBalances.ticketTypeId, ticket.id)))
    .get();
  if (!current) throw new Error("缺少券种余额记录");

  const balanceAfter = current.balance + input.quantity;
  db.update(schema.playerTicketBalances)
    .set({ balance: balanceAfter, updatedAt: now })
    .where(and(eq(schema.playerTicketBalances.memberId, memberId), eq(schema.playerTicketBalances.ticketTypeId, ticket.id)))
    .run();
  const log = db
    .insert(schema.ticketBalanceLogs)
    .values({
      memberId,
      ticketTypeId: ticket.id,
      ticketNameSnapshot: ticket.name,
      delta: input.quantity,
      balanceBefore: current.balance,
      balanceAfter,
      actorType: "system", actorMemberId: null,
      reason: "admin_grant",
      note: input.note.trim(),
    })
    .returning({ id: schema.ticketBalanceLogs.id })
    .get();
  db.insert(schema.ticketGrantNotices)
    .values({ ticketBalanceLogId: log.id })
    .run();
  enqueueTicketGrantEmail({
    recipientMemberId: memberId,
    ticketBalanceLogId: log.id,
    ticketName: ticket.name,
    quantity: input.quantity,
    reason: input.note.trim(),
  });
  db.insert(schema.externalTicketGrants)
    .values({
      memberId,
      sourceType: "quiz",
      sourceId,
      ticketBalanceLogId: log.id,
    })
    .run();

  return {
    id: log.id,
    ticketTypeId: ticket.id,
    quantity: input.quantity,
    ticketName: ticket.name,
  };
}
