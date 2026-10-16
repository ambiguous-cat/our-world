import type { MemberId } from "@/core/members/contracts";
import "server-only";

import { and, count, desc, eq, ne, sql } from "drizzle-orm";

import { db, schema, sqlite } from "@/db";
import type {
  PlayerCollectionResponse,
  PlayerPrizeWin,
  PlayerRedemptionStatus,
  RedemptionMutationResponse,
} from "../contracts/collection";

export class CollectionServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CollectionServiceError";
  }
}

type PrizeWinRow = {
  id: number;
  status: PlayerRedemptionStatus;
  requestedAt: Date | null;
  redeemedAt: Date | null;
  wonAt: Date;
  name: string;
  description: string | null;
  imagePath: string | null;
};

function toIsoString(value: Date | null) {
  return value?.toISOString() ?? null;
}

function toPlayerPrizeWin(row: PrizeWinRow): PlayerPrizeWin {
  return {
    id: row.id,
    name: row.name,
    description:
      row.description?.trim() || "飞鼠为你准备的一份小惊喜～",
    imagePath: row.imagePath?.trim() || null,
    status: row.status,
    wonAt: row.wonAt.toISOString(),
    requestedAt: toIsoString(row.requestedAt),
    redeemedAt: toIsoString(row.redeemedAt),
  };
}

function prizeWinRows() {
  return db
    .select({
      id: schema.prizeWins.id,
      status: sql<PlayerRedemptionStatus>`${schema.prizeWins.status}`,
      requestedAt: schema.prizeWins.requestedAt,
      redeemedAt: schema.prizeWins.redeemedAt,
      wonAt: schema.prizeWins.createdAt,
      name: schema.prizeWins.nameSnapshot,
      description: schema.prizeWins.descriptionSnapshot,
      imagePath: schema.prizeWins.imagePathSnapshot,
    })
    .from(schema.prizeWins);
}

function getPrizeWinById(memberId: MemberId, prizeWinId: number) {
  const row = prizeWinRows()
    .where(
      and(
        and(eq(schema.prizeWins.memberId, memberId), eq(schema.prizeWins.id, prizeWinId)),
        ne(schema.prizeWins.status, "revoked"),
      ),
    )
    .get();

  return row ? toPlayerPrizeWin(row) : null;
}

export function getPlayerCollection(memberId: MemberId): PlayerCollectionResponse {
  const prizeWins = prizeWinRows()
    .where(and(eq(schema.prizeWins.memberId, memberId), ne(schema.prizeWins.status, "revoked")))
    .orderBy(desc(schema.prizeWins.createdAt), desc(schema.prizeWins.id))
    .all()
    .map(toPlayerPrizeWin);
  const totalDraws =
    db.select({ value: count() }).from(schema.drawRecords).where(eq(schema.drawRecords.memberId, memberId)).get()?.value ?? 0;

  return {
    prizeWins,
    collectedCount: prizeWins.length,
    unredeemedCount: prizeWins.filter(
      (prizeWin) => prizeWin.status !== "redeemed",
    ).length,
    totalDraws,
  };
}

const requestRedemptionTransaction = sqlite.transaction(
  (memberId: MemberId, prizeWinId: number): RedemptionMutationResponse => {
    const prizeWin = getPrizeWinById(memberId, prizeWinId);

    if (!prizeWin) {
      throw new CollectionServiceError(
        "PRIZE_WIN_NOT_FOUND",
        "没有找到这份礼物，它可能已经不在收藏里了～",
        404,
      );
    }

    if (prizeWin.status !== "unredeemed") {
      throw new CollectionServiceError(
        "INVALID_REDEMPTION_STATUS",
        prizeWin.status === "requested"
          ? "这份礼物已经告诉飞鼠啦，请耐心等一等～"
          : "这份礼物已经收到，不能再次申请兑换～",
        409,
      );
    }

    const now = new Date();
    db.update(schema.prizeWins)
      .set({
        status: "requested",
        requestedAt: now,
        redeemedAt: null,
        updatedAt: now,
      })
      .where(and(eq(schema.prizeWins.memberId, memberId), eq(schema.prizeWins.id, prizeWinId)))
      .run();
    db.insert(schema.redemptionLogs)
      .values({ actorType: "member", actorMemberId: memberId, prizeWinId, action: "request" })
      .run();

    const updated = getPrizeWinById(memberId, prizeWinId);
    if (!updated) throw new Error("申请兑换后无法读取收藏记录");

    return { prizeWin: updated };
  },
);

const cancelRedemptionTransaction = sqlite.transaction(
  (memberId: MemberId, prizeWinId: number): RedemptionMutationResponse => {
    const prizeWin = getPrizeWinById(memberId, prizeWinId);

    if (!prizeWin) {
      throw new CollectionServiceError(
        "PRIZE_WIN_NOT_FOUND",
        "没有找到这份礼物，它可能已经不在收藏里了～",
        404,
      );
    }

    if (prizeWin.status !== "requested") {
      throw new CollectionServiceError(
        "INVALID_REDEMPTION_STATUS",
        prizeWin.status === "unredeemed"
          ? "这份礼物还没有申请兑换，不需要取消～"
          : "这份礼物已经收到，不能取消申请～",
        409,
      );
    }

    const now = new Date();
    db.update(schema.prizeWins)
      .set({
        status: "unredeemed",
        requestedAt: null,
        redeemedAt: null,
        updatedAt: now,
      })
      .where(and(eq(schema.prizeWins.memberId, memberId), eq(schema.prizeWins.id, prizeWinId)))
      .run();
    db.insert(schema.redemptionLogs)
      .values({ actorType: "member", actorMemberId: memberId, prizeWinId, action: "cancel_request" })
      .run();

    const updated = getPrizeWinById(memberId, prizeWinId);
    if (!updated) throw new Error("取消申请后无法读取收藏记录");

    return { prizeWin: updated };
  },
);

export function requestPrizeRedemption(memberId: MemberId, prizeWinId: number) {
  return requestRedemptionTransaction.immediate(memberId, prizeWinId);
}

export function cancelPrizeRedemption(memberId: MemberId, prizeWinId: number) {
  return cancelRedemptionTransaction.immediate(memberId, prizeWinId);
}
