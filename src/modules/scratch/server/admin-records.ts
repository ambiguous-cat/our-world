import { MEMBER_IDS, type MemberId } from "@/core/members/contracts";
import "server-only";

import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import { db, schema, sqlite } from "@/db";
import type {
  DrawResultSnapshot,
  ProbabilityConfigSnapshot,
} from "@/db/schema";
import type {
  AdminHistoryResponse,
  AdminHistoryType,
  AdminMutationResponse,
  AdminPagination,
  AdminRedemptionAction,
  AdminRedemptionsResponse,
  AdminRedemptionStatus,
} from "../contracts/admin";
import { AdminServiceError } from "./admin-error";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function pagination(page: number, pageSize: number, total: number): AdminPagination {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function readPagination(searchParams: URLSearchParams) {
  const rawPage = searchParams.get("page") ?? "1";
  const rawPageSize = searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE);
  const page = Number(rawPage);
  const pageSize = Number(rawPageSize);

  if (!Number.isSafeInteger(page) || page < 1) {
    throw new AdminServiceError("INVALID_PAGE", "页码必须是大于 0 的整数");
  }
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_PAGE_SIZE
  ) {
    throw new AdminServiceError(
      "INVALID_PAGE_SIZE",
      `每页数量必须是 1 到 ${MAX_PAGE_SIZE} 之间的整数`,
    );
  }
  return { page, pageSize };
}

function resultLabel(snapshot: DrawResultSnapshot) {
  if (snapshot.type === "prize") return snapshot.name;
  if (snapshot.type === "retry") return `再来 ${snapshot.extraCount} 次`;
  return "谢谢惠顾";
}

export function getAdminRedemptions(
  status: AdminRedemptionStatus | "all",
  page: number,
  pageSize: number,
): AdminRedemptionsResponse {
  const statusCondition =
    status === "all" ? undefined : eq(schema.prizeWins.status, status);
  const total = Number(
    db
      .select({ value: count() })
      .from(schema.prizeWins)
      .where(statusCondition)
      .get()?.value ?? 0,
  );
  const rows = db
    .select({
      id: schema.prizeWins.id,
      source: schema.prizeWins.source,
      status: schema.prizeWins.status,
      requestedAt: schema.prizeWins.requestedAt,
      redeemedAt: schema.prizeWins.redeemedAt,
      revokedAt: schema.prizeWins.revokedAt,
      wonAt: schema.prizeWins.createdAt,
      name: schema.prizeWins.nameSnapshot,
      description: schema.prizeWins.descriptionSnapshot,
      imagePath: schema.prizeWins.imagePathSnapshot,
    })
    .from(schema.prizeWins)
    .where(statusCondition)
    .orderBy(
      desc(
        sql`coalesce(${schema.prizeWins.requestedAt}, ${schema.prizeWins.redeemedAt}, ${schema.prizeWins.revokedAt}, ${schema.prizeWins.createdAt})`,
      ),
      desc(schema.prizeWins.id),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const ids = rows.map((row) => row.id);
  const logs =
    ids.length === 0
      ? []
      : db
          .select()
          .from(schema.redemptionLogs)
          .where(
            sql`${schema.redemptionLogs.prizeWinId} IN (${sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
          .orderBy(
            desc(schema.redemptionLogs.createdAt),
            desc(schema.redemptionLogs.id),
          )
          .all();
  const logsByWin = new Map<
    number,
    Array<{
      id: number;
      action: AdminRedemptionAction;
      note: string | null;
      createdAt: string;
    }>
  >();
  for (const log of logs) {
    const list = logsByWin.get(log.prizeWinId) ?? [];
    list.push({
      id: log.id,
      action: log.action,
      note: log.note,
      createdAt: log.createdAt.toISOString(),
    });
    logsByWin.set(log.prizeWinId, list);
  }

  const groupedCounts = db
    .select({ status: schema.prizeWins.status, value: count() })
    .from(schema.prizeWins)
    .groupBy(schema.prizeWins.status)
    .all();
  const counts = {
    all: 0,
    unredeemed: 0,
    requested: 0,
    redeemed: 0,
    revoked: 0,
  };
  for (const row of groupedCounts) {
    counts[row.status] = Number(row.value);
    counts.all += Number(row.value);
  }

  return {
    items: rows.map((row) => ({
        id: row.id,
        source: row.source,
        name: row.name,
        description:
          row.description?.trim() || "未填写奖品说明",
        imagePath: row.imagePath?.trim() || null,
        status: row.status,
        wonAt: row.wonAt.toISOString(),
        requestedAt: row.requestedAt?.toISOString() ?? null,
        redeemedAt: row.redeemedAt?.toISOString() ?? null,
        revokedAt: row.revokedAt?.toISOString() ?? null,
        logs: logsByWin.get(row.id) ?? [],
      })),
    pagination: pagination(page, pageSize, total),
    counts,
  };
}

function getPrizeWin(id: number) {
  return db
    .select({
      id: schema.prizeWins.id,
      status: schema.prizeWins.status,
    })
    .from(schema.prizeWins)
    .where(and(eq(schema.prizeWins.memberId, MEMBER_IDS.first), eq(schema.prizeWins.id, id)))
    .get();
}

const updateRedemptionTransaction = sqlite.transaction(
  (actorMemberId: MemberId,
    prizeWinId: number,
    action:
      | "reject"
      | "redeem"
      | "undo_redeem"
      | "revoke"
      | "restore",
    note: string | null,
  ): AdminMutationResponse => {
    const prizeWin = getPrizeWin(prizeWinId);
    if (!prizeWin) {
      throw new AdminServiceError(
        "PRIZE_WIN_NOT_FOUND",
        "没有找到这条中奖收藏",
        404,
      );
    }

    const now = new Date();
    if (action === "reject") {
      if (prizeWin.status !== "requested") {
        throw new AdminServiceError(
          "INVALID_REDEMPTION_STATUS",
          "只有申请中的礼物可以拒绝申请",
          409,
        );
      }
      db.update(schema.prizeWins)
        .set({
          status: "unredeemed",
          requestedAt: null,
          redeemedAt: null,
          revokedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.prizeWins.id, prizeWinId),
            eq(schema.prizeWins.status, "requested"),
          ),
        )
        .run();
      db.insert(schema.redemptionLogs)
        .values({
        actorType: "member", actorMemberId, prizeWinId, action: "reject_request", note })
        .run();
      return { message: "已拒绝兑换申请，礼物恢复为未兑换" };
    }

    if (action === "redeem") {
      if (
        prizeWin.status !== "requested" &&
        prizeWin.status !== "unredeemed"
      ) {
        throw new AdminServiceError(
          "INVALID_REDEMPTION_STATUS",
          "这份礼物已经核销，不能重复操作",
          409,
        );
      }
      const direct = prizeWin.status === "unredeemed";
      db.update(schema.prizeWins)
        .set({
          status: "redeemed",
          requestedAt: null,
          redeemedAt: now,
          revokedAt: null,
          updatedAt: now,
        })
        .where(eq(schema.prizeWins.id, prizeWinId))
        .run();
      db.insert(schema.redemptionLogs)
        .values({
        actorType: "member", actorMemberId,
          prizeWinId,
          action: "redeem",
          note: note ?? (direct ? "管理员直接核销" : "管理员确认兑换申请"),
        })
        .run();
      return { message: direct ? "礼物已直接核销" : "兑换申请已核销" };
    }

    if (action === "undo_redeem") {
      if (prizeWin.status !== "redeemed") {
        throw new AdminServiceError(
          "INVALID_REDEMPTION_STATUS",
          "只有已兑换的礼物可以撤销核销",
          409,
        );
      }
      db.update(schema.prizeWins)
        .set({
          status: "unredeemed",
          requestedAt: null,
          redeemedAt: null,
          revokedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.prizeWins.id, prizeWinId),
            eq(schema.prizeWins.status, "redeemed"),
          ),
        )
        .run();
      db.insert(schema.redemptionLogs)
        .values({
        actorType: "member", actorMemberId, prizeWinId, action: "undo_redeem", note })
        .run();
      return { message: "已撤销核销，礼物恢复为未兑换" };
    }

    if (action === "revoke") {
      if (
        prizeWin.status !== "unredeemed" &&
        prizeWin.status !== "requested"
      ) {
        throw new AdminServiceError(
          "INVALID_REDEMPTION_STATUS",
          prizeWin.status === "redeemed"
            ? "已核销奖券需要先撤销核销，才能撤回"
            : "这张奖券已经撤回，不能重复操作",
          409,
        );
      }
      const wasRequested = prizeWin.status === "requested";
      db.update(schema.prizeWins)
        .set({
          status: "revoked",
          requestedAt: null,
          redeemedAt: null,
          revokedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.prizeWins.id, prizeWinId))
        .run();
      db.insert(schema.redemptionLogs)
        .values({
        actorType: "member", actorMemberId,
          prizeWinId,
          action: "revoke",
          note:
            note ??
            (wasRequested
              ? "管理员撤回申请兑换中的奖券"
              : "管理员撤回未兑换奖券"),
        })
        .run();
      return { message: "奖券已撤回，玩家端将不再显示" };
    }

    if (prizeWin.status !== "revoked") {
      throw new AdminServiceError(
        "INVALID_REDEMPTION_STATUS",
        "只有已撤回的奖券可以恢复",
        409,
      );
    }
    db.update(schema.prizeWins)
      .set({
        status: "unredeemed",
        requestedAt: null,
        redeemedAt: null,
        revokedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.prizeWins.id, prizeWinId),
          eq(schema.prizeWins.status, "revoked"),
        ),
      )
      .run();
    db.insert(schema.redemptionLogs)
      .values({
        actorType: "member", actorMemberId, prizeWinId, action: "restore", note })
      .run();
    return { message: "奖券已恢复为未兑换，玩家端会重新显示" };
  },
);

export function updateAdminRedemption(actorMemberId: MemberId,
  prizeWinId: number,
  input: unknown,
): AdminMutationResponse {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminServiceError("INVALID_REQUEST", "提交的数据格式不正确");
  }
  const body = input as Record<string, unknown>;
  if (
    body.action !== "reject" &&
    body.action !== "redeem" &&
    body.action !== "undo_redeem" &&
    body.action !== "revoke" &&
    body.action !== "restore"
  ) {
    throw new AdminServiceError("INVALID_ACTION", "不支持这个兑换操作");
  }
  if (
    body.note !== undefined &&
    body.note !== null &&
    typeof body.note !== "string"
  ) {
    throw new AdminServiceError("INVALID_INPUT", "备注格式不正确");
  }
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim()
      : null;
  if (note && note.length > 200) {
    throw new AdminServiceError("INVALID_INPUT", "备注不能超过 200 个字符");
  }
  return updateRedemptionTransaction.immediate(actorMemberId,
    prizeWinId,
    body.action,
    note,
  );
}

const grantPrizeTransaction = sqlite.transaction(
  (actorMemberId: MemberId, prizeId: number, note: string | null): AdminMutationResponse => {
    const prize = db
      .select()
      .from(schema.prizes)
      .where(
        and(
          eq(schema.prizes.id, prizeId),
          isNull(schema.prizes.archivedAt),
        ),
      )
      .get();
    if (!prize) {
      throw new AdminServiceError(
        "PRIZE_NOT_FOUND",
        "没有找到可发放的奖品，奖品可能已经归档",
        404,
      );
    }

    const inserted = db
      .insert(schema.prizeWins)
      .values({
        memberId: MEMBER_IDS.first,
        drawRecordId: null,
        prizeId: prize.id,
        source: "admin_grant",
        nameSnapshot: prize.name,
        descriptionSnapshot: prize.description,
        imagePathSnapshot: prize.imagePath,
        status: "unredeemed",
      })
      .returning({ id: schema.prizeWins.id })
      .get();
    db.insert(schema.redemptionLogs)
      .values({
        actorType: "member", actorMemberId,
        prizeWinId: inserted.id,
        action: "grant",
        note: note ?? "管理员直接发放奖券，不扣减奖品库存",
      })
      .run();
    return { message: `已向玩家发放“${prize.name}”奖券` };
  },
);

export function grantAdminPrize(actorMemberId: MemberId, input: unknown): AdminMutationResponse {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminServiceError("INVALID_REQUEST", "提交的数据格式不正确");
  }
  const body = input as Record<string, unknown>;
  const prizeId = body.prizeId;
  if (
    typeof prizeId !== "number" ||
    !Number.isSafeInteger(prizeId) ||
    prizeId <= 0
  ) {
    throw new AdminServiceError("INVALID_PRIZE_ID", "请选择要发放的奖品");
  }
  if (
    body.note !== undefined &&
    body.note !== null &&
    typeof body.note !== "string"
  ) {
    throw new AdminServiceError("INVALID_INPUT", "备注格式不正确");
  }
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim()
      : null;
  if (note && note.length > 200) {
    throw new AdminServiceError("INVALID_INPUT", "备注不能超过 200 个字符");
  }
  return grantPrizeTransaction.immediate(actorMemberId, prizeId, note);
}

export function getAdminHistory(
  type: AdminHistoryType,
  page: number,
  pageSize: number,
): AdminHistoryResponse {
  const offset = (page - 1) * pageSize;

  if (type === "draws") {
    const total = Number(
      db.select({ value: count() }).from(schema.drawRecords).get()?.value ?? 0,
    );
    const items = db
      .select()
      .from(schema.drawRecords)
      .orderBy(desc(schema.drawRecords.createdAt), desc(schema.drawRecords.id))
      .limit(pageSize)
      .offset(offset)
      .all()
      .map((row) => {
        const config = row.configSnapshot as ProbabilityConfigSnapshot;
        return {
          id: row.id,
          ticketName: row.ticketSnapshot.name,
          resultType: row.resultType,
          resultLabel: resultLabel(row.resultSnapshot),
          balanceBefore: row.balanceBefore,
          balanceAfter: row.balanceAfter,
          configVersion: config.version,
          prizeWeight: config.prizeWeight,
          retryWeight: config.retryWeight,
          missWeight: config.missWeight,
          createdAt: row.createdAt.toISOString(),
        };
      });
    return { type, items, pagination: pagination(page, pageSize, total) };
  }

  if (type === "balance") {
    const total = Number(
      db
        .select({ value: count() })
        .from(schema.ticketBalanceLogs)
        .get()?.value ?? 0,
    );
    const items = db
      .select()
      .from(schema.ticketBalanceLogs)
      .orderBy(
        desc(schema.ticketBalanceLogs.createdAt),
        desc(schema.ticketBalanceLogs.id),
      )
      .limit(pageSize)
      .offset(offset)
      .all()
      .map((row) => ({
        id: row.id,
        ticketName: row.ticketNameSnapshot,
        delta: row.delta,
        balanceBefore: row.balanceBefore,
        balanceAfter: row.balanceAfter,
        reason: row.reason,
        drawRecordId: row.drawRecordId,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      }));
    return { type, items, pagination: pagination(page, pageSize, total) };
  }

  const total = Number(
    db.select({ value: count() }).from(schema.prizeStockLogs).get()?.value ?? 0,
  );
  const items = db
    .select({
      id: schema.prizeStockLogs.id,
      prizeName: schema.prizes.name,
      delta: schema.prizeStockLogs.delta,
      stockBefore: schema.prizeStockLogs.stockBefore,
      stockAfter: schema.prizeStockLogs.stockAfter,
      reason: schema.prizeStockLogs.reason,
      drawRecordId: schema.prizeStockLogs.drawRecordId,
      note: schema.prizeStockLogs.note,
      createdAt: schema.prizeStockLogs.createdAt,
    })
    .from(schema.prizeStockLogs)
    .innerJoin(
      schema.prizes,
      eq(schema.prizeStockLogs.prizeId, schema.prizes.id),
    )
    .orderBy(
      desc(schema.prizeStockLogs.createdAt),
      desc(schema.prizeStockLogs.id),
    )
    .limit(pageSize)
    .offset(offset)
    .all()
    .map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  return { type, items, pagination: pagination(page, pageSize, total) };
}
