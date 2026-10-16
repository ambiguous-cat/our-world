import type { MemberId } from "@/core/members/contracts";
import "server-only";

import {
  and,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNull,
} from "drizzle-orm";

import { db, schema, sqlite } from "@/db";
import type {
  AcknowledgeBalanceNoticesResponse,
  PlayerBalanceHistoryItem,
  PlayerBalanceHistoryResponse,
  PlayerBalanceNoticesResponse,
} from "../contracts/balance";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const MAX_NOTICE_ACKNOWLEDGEMENTS = 100;

export class PlayerBalanceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "PlayerBalanceError";
  }
}

function positiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
) {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new PlayerBalanceError(
      "INVALID_PAGINATION",
      "分页参数不正确",
    );
  }
  return parsed;
}

function playerReason(
  row: Pick<
    typeof schema.ticketBalanceLogs.$inferSelect,
    "reason" | "note" | "delta" | "ticketNameSnapshot"
  >,
) {
  if (row.reason === "retry_reward") {
    return `刮中“再来 ${row.delta} 张${row.ticketNameSnapshot}”`;
  }
  return row.note ?? "管理员奖励";
}

function playerHistoryItem(
  row: typeof schema.ticketBalanceLogs.$inferSelect & {
    themeColor: string;
    accentColor: string;
  },
): PlayerBalanceHistoryItem {
  return {
    id: row.id,
    ticketTypeId: row.ticketTypeId,
    ticketName: row.ticketNameSnapshot,
    themeColor: row.themeColor,
    accentColor: row.accentColor,
    delta: row.delta,
    balanceAfter: row.balanceAfter,
    source:
      row.reason === "retry_reward" ? "retry_reward" : "admin_reward",
    reason: playerReason(row),
    createdAt: row.createdAt.toISOString(),
  };
}

export function readPlayerBalancePagination(searchParams: URLSearchParams) {
  return {
    page: positiveInteger(searchParams.get("page"), 1, 1_000_000),
    pageSize: positiveInteger(
      searchParams.get("pageSize"),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    ),
  };
}

export function getPlayerBalanceHistory(
  memberId: MemberId,
  page: number,
  pageSize: number,
): PlayerBalanceHistoryResponse {
  const positiveBalanceFilter = and(eq(schema.ticketBalanceLogs.memberId, memberId), gt(schema.ticketBalanceLogs.delta, 0));
  const total = Number(
    db
      .select({ value: count() })
      .from(schema.ticketBalanceLogs)
      .where(positiveBalanceFilter)
      .get()?.value ?? 0,
  );
  const items = db
    .select({
      ...getTableColumns(schema.ticketBalanceLogs),
      themeColor: schema.ticketTypes.themeColor,
      accentColor: schema.ticketTypes.accentColor,
    })
    .from(schema.ticketBalanceLogs)
    .innerJoin(
      schema.ticketTypes,
      eq(schema.ticketBalanceLogs.ticketTypeId, schema.ticketTypes.id),
    )
    .where(positiveBalanceFilter)
    .orderBy(
      desc(schema.ticketBalanceLogs.createdAt),
      desc(schema.ticketBalanceLogs.id),
    )
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all()
    .map(playerHistoryItem);

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export function getPendingBalanceNotices(memberId: MemberId): PlayerBalanceNoticesResponse {
  const notices = db
    .select({
      ticketBalanceLogId: schema.ticketGrantNotices.ticketBalanceLogId,
      ticketTypeId: schema.ticketBalanceLogs.ticketTypeId,
      ticketName: schema.ticketBalanceLogs.ticketNameSnapshot,
      delta: schema.ticketBalanceLogs.delta,
      note: schema.ticketBalanceLogs.note,
      createdAt: schema.ticketBalanceLogs.createdAt,
    })
    .from(schema.ticketGrantNotices)
    .innerJoin(
      schema.ticketBalanceLogs,
      eq(
        schema.ticketGrantNotices.ticketBalanceLogId,
        schema.ticketBalanceLogs.id,
      ),
    )
    .where(and(eq(schema.ticketBalanceLogs.memberId, memberId), isNull(schema.ticketGrantNotices.shownAt)))
    .orderBy(
      schema.ticketBalanceLogs.createdAt,
      schema.ticketBalanceLogs.id,
    )
    .limit(MAX_NOTICE_ACKNOWLEDGEMENTS)
    .all()
    .map((row) => ({
      ticketBalanceLogId: row.ticketBalanceLogId,
      ticketTypeId: row.ticketTypeId,
      ticketName: row.ticketName,
      delta: row.delta,
      reason: row.note ?? "管理员奖励",
      createdAt: row.createdAt.toISOString(),
    }));

  return { notices };
}

function noticeIds(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PlayerBalanceError("INVALID_REQUEST", "提交的数据格式不正确");
  }
  const ids = (input as Record<string, unknown>).ticketBalanceLogIds;
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > MAX_NOTICE_ACKNOWLEDGEMENTS ||
    ids.some(
      (id) => typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0,
    )
  ) {
    throw new PlayerBalanceError(
      "INVALID_NOTICE_IDS",
      "奖励提示编号不正确",
    );
  }
  return [...new Set(ids as number[])];
}

const acknowledgeNoticesTransaction = sqlite.transaction(
  (memberId: MemberId, input: unknown): AcknowledgeBalanceNoticesResponse => {
    const ids = noticeIds(input);
    db.update(schema.ticketGrantNotices)
      .set({ shownAt: new Date() })
      .where(
        and(
          inArray(schema.ticketGrantNotices.ticketBalanceLogId,
            db.select({ id: schema.ticketBalanceLogs.id }).from(schema.ticketBalanceLogs)
              .where(and(eq(schema.ticketBalanceLogs.memberId, memberId), inArray(schema.ticketBalanceLogs.id, ids)))),
          isNull(schema.ticketGrantNotices.shownAt),
        ),
      )
      .run();
    return { message: "奖励提示已确认" };
  },
);

export function acknowledgeBalanceNotices(memberId: MemberId, input: unknown) {
  return acknowledgeNoticesTransaction.immediate(memberId, input);
}
