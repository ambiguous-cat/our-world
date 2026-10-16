import type { MemberId } from "@/core/members/contracts";
import "server-only";

import { randomInt } from "node:crypto";

import { and, asc, eq, gt, isNull } from "drizzle-orm";

import { db, schema, sqlite } from "@/db";
import { getHomeNote } from "@/core/site-settings/service";
import type {
  DrawResultSnapshot,
  ProbabilityConfigSnapshot,
  TicketSnapshot,
} from "@/db/schema";

import type {
  DrawApiResponse,
  DrawApiResult,
  PlayerSummaryResponse,
  PlayerTicket,
} from "../contracts/draw";

export class DrawServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "DrawServiceError";
  }
}

function weightedPick<T>(items: T[], weightOf: (item: T) => number) {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);

  if (!Number.isSafeInteger(total) || total <= 0) {
    throw new DrawServiceError(
      "INVALID_DRAW_POOL",
      "这个券池暂时不可用，请管理员检查后再试～",
      409,
    );
  }

  let cursor = randomInt(total);
  for (const item of items) {
    cursor -= weightOf(item);
    if (cursor < 0) return item;
  }

  throw new DrawServiceError(
    "INVALID_DRAW_POOL",
    "这个券池暂时不可用，请管理员检查后再试～",
    409,
  );
}

function apiResultFromSnapshot(
  snapshot: DrawResultSnapshot,
  prizeWinId?: number,
): DrawApiResult {
  if (snapshot.type === "prize") {
    if (!prizeWinId) {
      throw new Error("奖品抽奖记录缺少对应的收藏记录");
    }

    return {
      kind: "prize",
      title: snapshot.name,
      description: snapshot.description?.trim() || "飞鼠为你准备的一份小惊喜～",
      image: snapshot.imagePath?.trim() || "/momo/celebrate.jpg",
      icon: "🎁",
      prizeWinId,
    };
  }

  if (snapshot.type === "retry") {
    return {
      kind: "retry",
      title: `再来 ${snapshot.extraCount} 张`,
      description: `幸运续杯！已经放入 ${snapshot.extraCount} 张“${snapshot.ticketName}”`,
      image: "/momo/retry.jpg",
      icon: "🎟️",
      bonusTickets: snapshot.extraCount,
    };
  }

  return {
    kind: "thanks",
    title: "谢谢惠顾",
    description: "这次和奖品擦肩而过，下次一定会更幸运！",
    image: "/momo/sad.jpg",
    icon: "☁️",
  };
}

function ticketSnapshot(
  ticket: typeof schema.ticketTypes.$inferSelect,
): TicketSnapshot {
  return {
    ticketTypeId: ticket.id,
    name: ticket.name,
    kind: ticket.kind,
    coverImagePath: ticket.coverImagePath,
    drawBackgroundImagePath: ticket.drawBackgroundImagePath,
    themeColor: ticket.themeColor,
    accentColor: ticket.accentColor,
  };
}

function playerTicket(
  ticket: typeof schema.ticketTypes.$inferSelect,
  balance: number,
): PlayerTicket {
  return {
    id: ticket.id,
    name: ticket.name,
    description: ticket.description?.trim() || "一张装着小幸运的刮奖券",
    kind: ticket.kind,
    displayIcon: ticket.displayIcon,
    balance,
    coverImagePath: ticket.coverImagePath,
    drawBackgroundImagePath:
      ticket.drawBackgroundImagePath?.trim() || "/momo/scratch.jpg",
    themeColor: ticket.themeColor,
    accentColor: ticket.accentColor,
    scratchMaskColor: ticket.scratchMaskColor,
    scratchTextColor: ticket.scratchTextColor,
    scratchPrompt: ticket.scratchPrompt,
    isDrawEnabled: ticket.isDrawEnabled,
    archivedAt: ticket.archivedAt?.toISOString() ?? null,
  };
}

export function getPlayerTicketSummary(memberId: MemberId): PlayerSummaryResponse {
  const rows = db
    .select({
      ticket: schema.ticketTypes,
      balance: schema.playerTicketBalances.balance,
    })
    .from(schema.ticketTypes)
    .leftJoin(
      schema.playerTicketBalances,
      and(eq(schema.playerTicketBalances.memberId, memberId), eq(schema.playerTicketBalances.ticketTypeId, schema.ticketTypes.id)),
    )
    .orderBy(
      asc(schema.ticketTypes.archivedAt),
      asc(schema.ticketTypes.sortOrder),
      asc(schema.ticketTypes.id),
    )
    .all()
    .filter((row) => !row.ticket.archivedAt || Number(row.balance ?? 0) > 0)
    .map((row) => playerTicket(row.ticket, Number(row.balance ?? 0)));

  return {
    tickets: rows,
    totalTickets: rows.reduce((sum, ticket) => sum + ticket.balance, 0),
    homeNote: getHomeNote(),
  };
}

function existingDrawResponse(memberId: MemberId, requestKey: string): DrawApiResponse | null {
  const existing = db
    .select({
      id: schema.drawRecords.id,
      memberId: schema.drawRecords.memberId,
      ticketTypeId: schema.drawRecords.ticketTypeId,
      resultSnapshot: schema.drawRecords.resultSnapshot,
    })
    .from(schema.drawRecords)
    .where(eq(schema.drawRecords.requestKey, requestKey))
    .get();

  if (!existing) return null;
  if (existing.memberId !== memberId) throw new DrawServiceError("REQUEST_KEY_CONFLICT", "请求标识已被使用", 409);

  const balance = db
    .select({ balance: schema.playerTicketBalances.balance })
    .from(schema.playerTicketBalances)
    .where(and(eq(schema.playerTicketBalances.memberId, memberId), eq(schema.playerTicketBalances.ticketTypeId, existing.ticketTypeId)))
    .get();
  const win =
    existing.resultSnapshot.type === "prize"
      ? db
          .select({ id: schema.prizeWins.id })
          .from(schema.prizeWins)
          .where(eq(schema.prizeWins.drawRecordId, existing.id))
          .get()
      : undefined;

  if (!balance) {
    throw new Error("抽奖记录对应的券余额不存在");
  }

  return {
    drawRecordId: existing.id,
    ticketTypeId: existing.ticketTypeId,
    remainingTickets: balance.balance,
    result: apiResultFromSnapshot(existing.resultSnapshot, win?.id),
  };
}

const performDrawTransaction = sqlite.transaction(
  (memberId: MemberId, requestKey: string, ticketTypeId: number): DrawApiResponse => {
    const duplicate = existingDrawResponse(memberId, requestKey);
    if (duplicate) return duplicate;

    const ticket = db
      .select()
      .from(schema.ticketTypes)
      .where(eq(schema.ticketTypes.id, ticketTypeId))
      .get();
    if (!ticket || ticket.archivedAt) {
      throw new DrawServiceError(
        "TICKET_NOT_FOUND",
        "没有找到这张刮奖券～",
        404,
      );
    }
    if (!ticket.isDrawEnabled) {
      throw new DrawServiceError(
        "TICKET_DRAW_DISABLED",
        "这张券暂时不能刮，请稍后再来看看～",
        409,
      );
    }

    const state = db
      .select({ balance: schema.playerTicketBalances.balance })
      .from(schema.playerTicketBalances)
      .where(and(eq(schema.playerTicketBalances.memberId, memberId), eq(schema.playerTicketBalances.ticketTypeId, ticketTypeId)))
      .get();
    if (!state || state.balance <= 0) {
      throw new DrawServiceError(
        "NO_TICKETS",
        `“${ticket.name}”已经用完啦，请找管理员大人再奖励一些吧～`,
        409,
      );
    }

    const config = db
      .select()
      .from(schema.drawConfigs)
      .where(
        and(
          eq(schema.drawConfigs.ticketTypeId, ticketTypeId),
          eq(schema.drawConfigs.isActive, true),
        ),
      )
      .get();
    if (!config) {
      throw new DrawServiceError(
        "DRAW_NOT_CONFIGURED",
        "这张券的幸运奖池还在准备中，快请管理员先生装填礼物吧～",
        409,
      );
    }
    if (config.prizeWeight + config.retryWeight + config.missWeight !== 10000) {
      throw new DrawServiceError(
        "INVALID_PROBABILITY_CONFIG",
        "这张券的概率配置不完整，请管理员检查后再试～",
        409,
      );
    }

    const drawablePrizes = db
      .select({
        poolItem: schema.ticketPrizePoolItems,
        prize: schema.prizes,
      })
      .from(schema.ticketPrizePoolItems)
      .innerJoin(
        schema.prizes,
        eq(schema.prizes.id, schema.ticketPrizePoolItems.prizeId),
      )
      .where(
        and(
          eq(schema.ticketPrizePoolItems.ticketTypeId, ticketTypeId),
          eq(schema.ticketPrizePoolItems.isActive, true),
          isNull(schema.ticketPrizePoolItems.archivedAt),
          eq(schema.prizes.isActive, true),
          isNull(schema.prizes.archivedAt),
          gt(schema.prizes.remainingStock, 0),
        ),
      )
      .all();
    const activeRetryOptions = db
      .select()
      .from(schema.retryOptions)
      .where(
        and(
          eq(schema.retryOptions.ticketTypeId, ticketTypeId),
          eq(schema.retryOptions.isActive, true),
          isNull(schema.retryOptions.archivedAt),
        ),
      )
      .all();

    if (config.prizeWeight > 0 && drawablePrizes.length === 0) {
      throw new DrawServiceError(
        "NO_DRAWABLE_PRIZES",
        "这张券的奖品暂时补货中，快去找管理员先生添加礼物吧～",
        409,
      );
    }
    if (config.retryWeight > 0 && activeRetryOptions.length === 0) {
      throw new DrawServiceError(
        "NO_RETRY_OPTIONS",
        "这张券的“再来一张”还没准备好，请管理员检查后再试～",
        409,
      );
    }

    const category = weightedPick(
      [
        { type: "prize" as const, weight: config.prizeWeight },
        { type: "retry" as const, weight: config.retryWeight },
        { type: "miss" as const, weight: config.missWeight },
      ].filter((item) => item.weight > 0),
      (item) => item.weight,
    ).type;

    const balanceBefore = state.balance;
    let balanceAfter = balanceBefore - 1;
    let resultSnapshot: DrawResultSnapshot;
    let selectedPrize: (typeof drawablePrizes)[number] | undefined;
    let selectedRetry: (typeof activeRetryOptions)[number] | undefined;

    if (category === "prize") {
      selectedPrize = weightedPick(
        drawablePrizes,
        (item) => item.poolItem.weight,
      );
      resultSnapshot = {
        type: "prize",
        prizeId: selectedPrize.prize.id,
        poolItemId: selectedPrize.poolItem.id,
        name: selectedPrize.prize.name,
        description: selectedPrize.prize.description,
        imagePath: selectedPrize.prize.imagePath,
      };
    } else if (category === "retry") {
      selectedRetry = weightedPick(
        activeRetryOptions,
        (option) => option.weight,
      );
      balanceAfter += selectedRetry.extraCount;
      resultSnapshot = {
        type: "retry",
        retryOptionId: selectedRetry.id,
        ticketTypeId,
        ticketName: ticket.name,
        extraCount: selectedRetry.extraCount,
      };
    } else {
      resultSnapshot = { type: "miss" };
    }

    const configSnapshot: ProbabilityConfigSnapshot = {
      configId: config.id,
      ticketTypeId,
      version: config.version,
      prizeWeight: config.prizeWeight,
      retryWeight: config.retryWeight,
      missWeight: config.missWeight,
    };
    const insertedDraw = db
      .insert(schema.drawRecords)
      .values({
        memberId,
        requestKey,
        ticketTypeId,
        resultType: category,
        balanceBefore,
        balanceAfter,
        prizeId: selectedPrize?.prize.id,
        poolItemId: selectedPrize?.poolItem.id,
        retryOptionId: selectedRetry?.id,
        extraCount: selectedRetry?.extraCount,
        ticketSnapshot: ticketSnapshot(ticket),
        configSnapshot,
        resultSnapshot,
      })
      .returning({ id: schema.drawRecords.id })
      .get();
    const now = new Date();

    db.update(schema.playerTicketBalances)
      .set({ balance: balanceAfter, updatedAt: now })
      .where(and(eq(schema.playerTicketBalances.memberId, memberId), eq(schema.playerTicketBalances.ticketTypeId, ticketTypeId)))
      .run();
    db.insert(schema.ticketBalanceLogs)
      .values({
        memberId,
        ticketTypeId,
        ticketNameSnapshot: ticket.name,
        delta: -1,
        balanceBefore,
        balanceAfter: balanceBefore - 1,
        actorType: "member", actorMemberId: memberId,
        reason: "draw_cost",
        drawRecordId: insertedDraw.id,
      })
      .run();
    if (selectedRetry) {
      db.insert(schema.ticketBalanceLogs)
        .values({
        memberId,
          ticketTypeId,
          ticketNameSnapshot: ticket.name,
          delta: selectedRetry.extraCount,
          balanceBefore: balanceBefore - 1,
          balanceAfter,
          actorType: "system", actorMemberId: null,
          reason: "retry_reward",
          drawRecordId: insertedDraw.id,
        })
        .run();
    }

    let prizeWinId: number | undefined;
    if (selectedPrize) {
      const stockAfter = selectedPrize.prize.remainingStock - 1;
      db.update(schema.prizes)
        .set({ remainingStock: stockAfter, updatedAt: now })
        .where(eq(schema.prizes.id, selectedPrize.prize.id))
        .run();
      db.insert(schema.prizeStockLogs)
        .values({
          prizeId: selectedPrize.prize.id,
          delta: -1,
          stockBefore: selectedPrize.prize.remainingStock,
          stockAfter,
          actorType: "member", actorMemberId: memberId,
          reason: "draw",
          drawRecordId: insertedDraw.id,
        })
        .run();
      prizeWinId = db
        .insert(schema.prizeWins)
        .values({
        memberId,
          drawRecordId: insertedDraw.id,
          prizeId: selectedPrize.prize.id,
          source: "draw",
          nameSnapshot: selectedPrize.prize.name,
          descriptionSnapshot: selectedPrize.prize.description,
          imagePathSnapshot: selectedPrize.prize.imagePath,
        })
        .returning({ id: schema.prizeWins.id })
        .get().id;
    }

    return {
      drawRecordId: insertedDraw.id,
      ticketTypeId,
      remainingTickets: balanceAfter,
      result: apiResultFromSnapshot(resultSnapshot, prizeWinId),
    };
  },
);

export function performDraw(memberId: MemberId, requestKey: string, ticketTypeId: number) {
  return performDrawTransaction.immediate(memberId, requestKey, ticketTypeId);
}
