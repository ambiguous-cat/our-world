import { getPlayerName } from "@/core/auth/player-name";
import { MEMBER_IDS, type MemberId } from "@/core/members/contracts";
import "server-only";

import { and, asc, desc, eq, ne, sql } from "drizzle-orm";

import { db, schema, sqlite } from "@/db";
import { saveHomeNote } from "@/core/site-settings/service";
import type {
  AdminMutationResponse,
  AdminOverviewResponse,
} from "../contracts/admin";
import { isTicketIconKey } from "../contracts/ticket-icon";
import { AdminServiceError } from "./admin-error";
import { enqueueTicketGrantEmail } from "./ticket-notification-service";

const MAX_COUNT = 1_000_000;
const MAX_WEIGHT = 1_000_000_000;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function recordValue(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AdminServiceError("INVALID_REQUEST", "提交的数据格式不正确");
  }
  return input as Record<string, unknown>;
}

function requiredInteger(
  input: Record<string, unknown>,
  key: string,
  label: string,
  options: { min: number; max: number },
) {
  const value = input[key];
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < options.min ||
    value > options.max
  ) {
    throw new AdminServiceError(
      "INVALID_INPUT",
      `${label}必须是 ${options.min} 到 ${options.max} 之间的整数`,
    );
  }
  return value;
}

function requiredBoolean(
  input: Record<string, unknown>,
  key: string,
  label: string,
) {
  const value = input[key];
  if (typeof value !== "boolean") {
    throw new AdminServiceError("INVALID_INPUT", `${label}必须是布尔值`);
  }
  return value;
}

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new AdminServiceError("INVALID_INPUT", `${label}格式不正确`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw new AdminServiceError(
      "INVALID_INPUT",
      `${label}不能超过 ${maxLength} 个字符`,
    );
  }
  return trimmed;
}

function requiredText(value: unknown, label: string, maxLength: number) {
  const text = optionalText(value, label, maxLength);
  if (!text) {
    throw new AdminServiceError("INVALID_INPUT", `${label}不能为空`);
  }
  return text;
}

function imagePath(value: unknown) {
  const path = optionalText(value, "图片路径", 500);
  if (!path) return null;
  if (path.startsWith("/") && !path.startsWith("//")) return path;
  try {
    const url = new URL(path);
    if (url.protocol === "http:" || url.protocol === "https:") return path;
  } catch {
    // 使用下方统一错误。
  }
  throw new AdminServiceError(
    "INVALID_INPUT",
    "图片必须填写以 / 开头的站内路径，或 http/https 图片 URL",
  );
}

function color(value: unknown, label: string) {
  const result = requiredText(value, label, 7);
  if (!HEX_COLOR.test(result)) {
    throw new AdminServiceError(
      "INVALID_INPUT",
      `${label}必须是 #RRGGBB 格式`,
    );
  }
  return result.toUpperCase();
}

function existingTicket(id: number) {
  const ticket = db
    .select()
    .from(schema.ticketTypes)
    .where(eq(schema.ticketTypes.id, id))
    .get();
  if (!ticket) {
    throw new AdminServiceError("TICKET_NOT_FOUND", "没有找到这个券种", 404);
  }
  return ticket;
}

function existingPrize(id: number) {
  const prize = db
    .select()
    .from(schema.prizes)
    .where(eq(schema.prizes.id, id))
    .get();
  if (!prize) {
    throw new AdminServiceError("PRIZE_NOT_FOUND", "没有找到这个奖品", 404);
  }
  return prize;
}

function existingRetryOption(id: number) {
  const option = db
    .select()
    .from(schema.retryOptions)
    .where(eq(schema.retryOptions.id, id))
    .get();
  if (!option) {
    throw new AdminServiceError(
      "RETRY_OPTION_NOT_FOUND",
      "没有找到这个“再来”条目",
      404,
    );
  }
  return option;
}

function existingPoolItem(id: number) {
  const item = db
    .select()
    .from(schema.ticketPrizePoolItems)
    .where(eq(schema.ticketPrizePoolItems.id, id))
    .get();
  if (!item) {
    throw new AdminServiceError(
      "POOL_ITEM_NOT_FOUND",
      "没有找到这个券池奖品",
      404,
    );
  }
  return item;
}

function ensureNotArchived(archivedAt: Date | null, label: string) {
  if (archivedAt) {
    throw new AdminServiceError(
      "ITEM_ARCHIVED",
      `${label}已经归档，不能再修改`,
      409,
    );
  }
}

export function getAdminOverview(): AdminOverviewResponse {
  const prizes = db
    .select()
    .from(schema.prizes)
    .orderBy(
      asc(schema.prizes.archivedAt),
      asc(schema.prizes.sortOrder),
      asc(schema.prizes.id),
    )
    .all();
  const ticketRows = db
    .select({
      ticket: schema.ticketTypes,
      balance: schema.playerTicketBalances.balance,
    })
    .from(schema.ticketTypes)
    .leftJoin(
      schema.playerTicketBalances,
      and(eq(schema.playerTicketBalances.memberId, MEMBER_IDS.first), eq(schema.playerTicketBalances.ticketTypeId, schema.ticketTypes.id)),
    )
    .orderBy(
      asc(schema.ticketTypes.archivedAt),
      asc(schema.ticketTypes.sortOrder),
      asc(schema.ticketTypes.id),
    )
    .all();
  const delivered = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.prizeWins)
    .where(ne(schema.prizeWins.status, "revoked"))
    .get();

  const tickets = ticketRows.map(({ ticket, balance }) => {
    const probability = db
      .select()
      .from(schema.drawConfigs)
      .where(
        and(
          eq(schema.drawConfigs.ticketTypeId, ticket.id),
          eq(schema.drawConfigs.isActive, true),
        ),
      )
      .get();
    const retryOptions = db
      .select()
      .from(schema.retryOptions)
      .where(eq(schema.retryOptions.ticketTypeId, ticket.id))
      .orderBy(
        asc(schema.retryOptions.archivedAt),
        asc(schema.retryOptions.id),
      )
      .all();
    const poolItems = db
      .select({
        item: schema.ticketPrizePoolItems,
        prizeName: schema.prizes.name,
        prizeStock: schema.prizes.remainingStock,
        prizeActive: schema.prizes.isActive,
      })
      .from(schema.ticketPrizePoolItems)
      .innerJoin(
        schema.prizes,
        eq(schema.prizes.id, schema.ticketPrizePoolItems.prizeId),
      )
      .where(eq(schema.ticketPrizePoolItems.ticketTypeId, ticket.id))
      .orderBy(
        asc(schema.ticketPrizePoolItems.archivedAt),
        asc(schema.ticketPrizePoolItems.sortOrder),
        asc(schema.ticketPrizePoolItems.id),
      )
      .all();

    return {
      id: ticket.id,
      name: ticket.name,
      description: ticket.description,
      kind: ticket.kind,
      displayIcon: ticket.displayIcon,
      balance: Number(balance ?? 0),
      coverImagePath: ticket.coverImagePath,
      drawBackgroundImagePath: ticket.drawBackgroundImagePath,
      themeColor: ticket.themeColor,
      accentColor: ticket.accentColor,
      scratchMaskColor: ticket.scratchMaskColor,
      scratchTextColor: ticket.scratchTextColor,
      scratchPrompt: ticket.scratchPrompt,
      isGrantEnabled: ticket.isGrantEnabled,
      isDrawEnabled: ticket.isDrawEnabled,
      sortOrder: ticket.sortOrder,
      archivedAt: ticket.archivedAt?.toISOString() ?? null,
      probability: probability
        ? {
            id: probability.id,
            ticketTypeId: ticket.id,
            version: probability.version,
            prizeWeight: probability.prizeWeight,
            retryWeight: probability.retryWeight,
            missWeight: probability.missWeight,
          }
        : null,
      retryOptions: retryOptions.map((option) => ({
        id: option.id,
        ticketTypeId: option.ticketTypeId,
        extraCount: option.extraCount,
        weight: option.weight,
        isActive: option.isActive,
        archivedAt: option.archivedAt?.toISOString() ?? null,
      })),
      poolItems: poolItems.map(({ item, ...prize }) => ({
        id: item.id,
        ticketTypeId: item.ticketTypeId,
        prizeId: item.prizeId,
        prizeName: prize.prizeName,
        prizeStock: prize.prizeStock,
        prizeActive: prize.prizeActive,
        weight: item.weight,
        isActive: item.isActive,
        archivedAt: item.archivedAt?.toISOString() ?? null,
      })),
    };
  });

  return {
    totalTickets: tickets.reduce((sum, ticket) => sum + ticket.balance, 0),
    totalStock: prizes
      .filter((prize) => !prize.archivedAt)
      .reduce((sum, prize) => sum + prize.remainingStock, 0),
    deliveredCount: Number(delivered?.count ?? 0),
    tickets,
    prizes: prizes.map((prize) => ({
      id: prize.id,
      name: prize.name,
      description: prize.description,
      imagePath: prize.imagePath,
      remainingStock: prize.remainingStock,
      isActive: prize.isActive,
      sortOrder: prize.sortOrder,
      archivedAt: prize.archivedAt?.toISOString() ?? null,
    })),
  };
}

export function updateHomeNote(input: unknown): AdminMutationResponse {
  const body = recordValue(input);
  const content = requiredText(body.content, "寄语正文", 300);
  const signature = requiredText(body.signature, "寄语落款", 40);

  saveHomeNote({ content, signature });

  return { message: `给${getPlayerName()}的话已保存` };
}

function ticketValues(input: unknown, includeState: boolean) {
  const body = recordValue(input);
  const kind = body.kind;
  if (kind !== "permanent" && kind !== "limited") {
    throw new AdminServiceError(
      "INVALID_INPUT",
      "券种类型必须是常驻或限定",
    );
  }
  if (!isTicketIconKey(body.displayIcon)) {
    throw new AdminServiceError(
      "INVALID_INPUT",
      "请选择有效的券种图标",
    );
  }
  return {
    body,
    values: {
      name: requiredText(body.name, "券种名称", 40),
      description: optionalText(body.description, "券种说明", 200),
      kind: kind as "permanent" | "limited",
      displayIcon: body.displayIcon,
      coverImagePath: imagePath(body.coverImagePath),
      drawBackgroundImagePath: imagePath(body.drawBackgroundImagePath),
      themeColor: color(body.themeColor, "主题色"),
      accentColor: color(body.accentColor, "强调色"),
      scratchMaskColor: color(body.scratchMaskColor, "遮罩颜色"),
      scratchTextColor: color(body.scratchTextColor, "遮罩文字颜色"),
      scratchPrompt: requiredText(body.scratchPrompt, "刮奖提示", 40),
      sortOrder: requiredInteger(body, "sortOrder", "排序值", {
        min: -MAX_COUNT,
        max: MAX_COUNT,
      }),
      ...(includeState
        ? {
            isGrantEnabled: requiredBoolean(
              body,
              "isGrantEnabled",
              "允许发放状态",
            ),
            isDrawEnabled: requiredBoolean(
              body,
              "isDrawEnabled",
              "允许刮奖状态",
            ),
          }
        : {}),
    },
  };
}

const createTicketTransaction = sqlite.transaction(
  (input: unknown): AdminMutationResponse => {
    const { values } = ticketValues(input, false);
    const ticket = db
      .insert(schema.ticketTypes)
      .values({ ...values, isGrantEnabled: true, isDrawEnabled: true })
      .returning({ id: schema.ticketTypes.id, name: schema.ticketTypes.name })
      .get();
    db.insert(schema.playerTicketBalances)
      .values({
        memberId: MEMBER_IDS.first, ticketTypeId: ticket.id, balance: 0 })
      .run();
    return { message: `券种“${ticket.name}”已创建` };
  },
);

export function createTicketType(input: unknown) {
  return createTicketTransaction.immediate(input);
}

export function updateTicketType(id: number, input: unknown) {
  const ticket = existingTicket(id);
  ensureNotArchived(ticket.archivedAt, "这个券种");
  const { values } = ticketValues(input, true);
  db.update(schema.ticketTypes)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(schema.ticketTypes.id, id))
    .run();
  return { message: `券种“${values.name}”已保存` };
}

export function archiveTicketType(id: number) {
  const ticket = existingTicket(id);
  ensureNotArchived(ticket.archivedAt, "这个券种");
  const balance = db
    .select({ balance: schema.playerTicketBalances.balance })
    .from(schema.playerTicketBalances)
    .where(and(eq(schema.playerTicketBalances.memberId, MEMBER_IDS.first), eq(schema.playerTicketBalances.ticketTypeId, id)))
    .get()?.balance;
  if (balance && balance > 0) {
    throw new AdminServiceError(
      "TICKET_HAS_BALANCE",
      "玩家仍持有这个券种，请先清零或仅关闭发放",
      409,
    );
  }
  db.update(schema.ticketTypes)
    .set({
      isGrantEnabled: false,
      isDrawEnabled: false,
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.ticketTypes.id, id))
    .run();
  return { message: `券种“${ticket.name}”已归档` };
}

const adjustBalanceTransaction = sqlite.transaction(
  (actorMemberId: MemberId, input: unknown): AdminMutationResponse => {
    const body = recordValue(input);
    const ticketTypeId = requiredInteger(body, "ticketTypeId", "券种编号", {
      min: 1,
      max: MAX_COUNT,
    });
    const delta = requiredInteger(body, "delta", "调整张数", {
      min: -MAX_COUNT,
      max: MAX_COUNT,
    });
    if (delta === 0) {
      throw new AdminServiceError("INVALID_INPUT", "调整张数不能为 0");
    }
    const ticket = existingTicket(ticketTypeId);
    ensureNotArchived(ticket.archivedAt, "这个券种");
    if (delta > 0 && !ticket.isGrantEnabled) {
      throw new AdminServiceError(
        "TICKET_GRANT_DISABLED",
        "这个券种当前不允许继续发放",
        409,
      );
    }
    const note =
      delta > 0
        ? requiredText(body.note, "奖励原因", 200)
        : optionalText(body.note, "备注", 200);
    const current = db
      .select({ balance: schema.playerTicketBalances.balance })
      .from(schema.playerTicketBalances)
      .where(and(eq(schema.playerTicketBalances.memberId, MEMBER_IDS.first), eq(schema.playerTicketBalances.ticketTypeId, ticketTypeId)))
      .get();
    if (!current) throw new Error("缺少券种余额记录");
    const balanceAfter = current.balance + delta;
    if (balanceAfter < 0) {
      throw new AdminServiceError(
        "INSUFFICIENT_BALANCE",
        "减少后的券数量不能小于 0",
        409,
      );
    }
    db.update(schema.playerTicketBalances)
      .set({ balance: balanceAfter, updatedAt: new Date() })
      .where(and(eq(schema.playerTicketBalances.memberId, MEMBER_IDS.first), eq(schema.playerTicketBalances.ticketTypeId, ticketTypeId)))
      .run();
    const log = db
      .insert(schema.ticketBalanceLogs)
      .values({
        memberId: MEMBER_IDS.first,
        actorType: "member", actorMemberId,
        ticketTypeId,
        ticketNameSnapshot: ticket.name,
        delta,
        balanceBefore: current.balance,
        balanceAfter,
        reason: delta > 0 ? "admin_grant" : "admin_revoke",
        note,
      })
      .returning({ id: schema.ticketBalanceLogs.id })
      .get();
    if (delta > 0) {
      db.insert(schema.ticketGrantNotices)
        .values({ ticketBalanceLogId: log.id })
        .run();
      enqueueTicketGrantEmail({
        recipientMemberId: MEMBER_IDS.first,
        ticketBalanceLogId: log.id,
        ticketName: ticket.name,
        quantity: delta,
        reason: note ?? "管理员奖励",
      });
    }
    return { message: `“${ticket.name}”已调整为 ${balanceAfter} 张` };
  },
);

export function adjustPlayerBalance(actorMemberId: MemberId, input: unknown) {
  return adjustBalanceTransaction.immediate(actorMemberId, input);
}

const saveProbabilityTransaction = sqlite.transaction(
  (input: unknown): AdminMutationResponse => {
    const body = recordValue(input);
    const ticketTypeId = requiredInteger(body, "ticketTypeId", "券种编号", {
      min: 1,
      max: MAX_COUNT,
    });
    const ticket = existingTicket(ticketTypeId);
    ensureNotArchived(ticket.archivedAt, "这个券种");
    const prizeWeight = requiredInteger(body, "prizeWeight", "奖品概率", {
      min: 0,
      max: 10000,
    });
    const retryWeight = requiredInteger(body, "retryWeight", "再来概率", {
      min: 0,
      max: 10000,
    });
    const missWeight = requiredInteger(body, "missWeight", "谢谢惠顾概率", {
      min: 0,
      max: 10000,
    });
    if (prizeWeight + retryWeight + missWeight !== 10000) {
      throw new AdminServiceError(
        "INVALID_PROBABILITY_TOTAL",
        "三类概率之和必须严格等于 100%",
      );
    }
    const latest = db
      .select({ version: schema.drawConfigs.version })
      .from(schema.drawConfigs)
      .where(eq(schema.drawConfigs.ticketTypeId, ticketTypeId))
      .orderBy(desc(schema.drawConfigs.version))
      .get();
    const version = (latest?.version ?? 0) + 1;
    db.update(schema.drawConfigs)
      .set({ isActive: false })
      .where(
        and(
          eq(schema.drawConfigs.ticketTypeId, ticketTypeId),
          eq(schema.drawConfigs.isActive, true),
        ),
      )
      .run();
    db.insert(schema.drawConfigs)
      .values({
        ticketTypeId,
        version,
        prizeWeight,
        retryWeight,
        missWeight,
        isActive: true,
      })
      .run();
    return { message: `“${ticket.name}”概率已保存为第 ${version} 版` };
  },
);

export function saveProbabilityConfig(input: unknown) {
  return saveProbabilityTransaction.immediate(input);
}

export function createRetryOption(input: unknown): AdminMutationResponse {
  const body = recordValue(input);
  const ticketTypeId = requiredInteger(body, "ticketTypeId", "券种编号", {
    min: 1,
    max: MAX_COUNT,
  });
  const ticket = existingTicket(ticketTypeId);
  ensureNotArchived(ticket.archivedAt, "这个券种");
  const extraCount = requiredInteger(body, "extraCount", "奖励张数", {
    min: 1,
    max: 99,
  });
  const weight = requiredInteger(body, "weight", "内部权重", {
    min: 1,
    max: MAX_WEIGHT,
  });
  db.insert(schema.retryOptions)
    .values({ ticketTypeId, extraCount, weight, isActive: true })
    .run();
  return { message: `已为“${ticket.name}”添加“再来 ${extraCount} 张”` };
}

export function updateRetryOption(id: number, input: unknown) {
  const body = recordValue(input);
  const option = existingRetryOption(id);
  ensureNotArchived(option.archivedAt, "这个“再来”条目");
  db.update(schema.retryOptions)
    .set({
      extraCount: requiredInteger(body, "extraCount", "奖励张数", {
        min: 1,
        max: 99,
      }),
      weight: requiredInteger(body, "weight", "内部权重", {
        min: 1,
        max: MAX_WEIGHT,
      }),
      isActive: requiredBoolean(body, "isActive", "启用状态"),
      updatedAt: new Date(),
    })
    .where(eq(schema.retryOptions.id, id))
    .run();
  return { message: "“再来”条目已保存" };
}

export function archiveRetryOption(id: number) {
  const option = existingRetryOption(id);
  ensureNotArchived(option.archivedAt, "这个“再来”条目");
  db.update(schema.retryOptions)
    .set({ isActive: false, archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.retryOptions.id, id))
    .run();
  return { message: "“再来”条目已归档" };
}

export function addTicketPoolItem(input: unknown) {
  const body = recordValue(input);
  const ticketTypeId = requiredInteger(body, "ticketTypeId", "券种编号", {
    min: 1,
    max: MAX_COUNT,
  });
  const prizeId = requiredInteger(body, "prizeId", "奖品编号", {
    min: 1,
    max: MAX_COUNT,
  });
  const weight = requiredInteger(body, "weight", "抽取权重", {
    min: 1,
    max: MAX_WEIGHT,
  });
  const ticket = existingTicket(ticketTypeId);
  const prize = existingPrize(prizeId);
  ensureNotArchived(ticket.archivedAt, "这个券种");
  ensureNotArchived(prize.archivedAt, "这个奖品");
  const existing = db
    .select()
    .from(schema.ticketPrizePoolItems)
    .where(
      and(
        eq(schema.ticketPrizePoolItems.ticketTypeId, ticketTypeId),
        eq(schema.ticketPrizePoolItems.prizeId, prizeId),
      ),
    )
    .get();
  if (existing) {
    db.update(schema.ticketPrizePoolItems)
      .set({
        weight,
        isActive: true,
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.ticketPrizePoolItems.id, existing.id))
      .run();
  } else {
    db.insert(schema.ticketPrizePoolItems)
      .values({ ticketTypeId, prizeId, weight, isActive: true })
      .run();
  }
  return { message: `“${prize.name}”已加入“${ticket.name}”奖池` };
}

export function updateTicketPoolItem(id: number, input: unknown) {
  const body = recordValue(input);
  const item = existingPoolItem(id);
  ensureNotArchived(item.archivedAt, "这个券池奖品");
  db.update(schema.ticketPrizePoolItems)
    .set({
      weight: requiredInteger(body, "weight", "抽取权重", {
        min: 1,
        max: MAX_WEIGHT,
      }),
      isActive: requiredBoolean(body, "isActive", "启用状态"),
      updatedAt: new Date(),
    })
    .where(eq(schema.ticketPrizePoolItems.id, id))
    .run();
  return { message: "券池奖品配置已保存" };
}

export function archiveTicketPoolItem(id: number) {
  const item = existingPoolItem(id);
  ensureNotArchived(item.archivedAt, "这个券池奖品");
  db.update(schema.ticketPrizePoolItems)
    .set({ isActive: false, archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.ticketPrizePoolItems.id, id))
    .run();
  return { message: "奖品已移出这个券池" };
}

const createPrizeTransaction = sqlite.transaction(
  (actorMemberId: MemberId, input: unknown): AdminMutationResponse => {
    const body = recordValue(input);
    const name = requiredText(body.name, "奖品名称", 80);
    const description = optionalText(body.description, "奖品说明", 500);
    const prizeImagePath = imagePath(body.imagePath);
    const initialStock = requiredInteger(body, "initialStock", "初始库存", {
      min: 0,
      max: MAX_COUNT,
    });
    const sortOrder = requiredInteger(body, "sortOrder", "排序值", {
      min: -MAX_COUNT,
      max: MAX_COUNT,
    });
    const inserted = db
      .insert(schema.prizes)
      .values({
        name,
        description,
        imagePath: prizeImagePath,
        remainingStock: initialStock,
        sortOrder,
        isActive: true,
      })
      .returning({ id: schema.prizes.id })
      .get();
    if (initialStock > 0) {
      db.insert(schema.prizeStockLogs)
        .values({
        actorType: "member", actorMemberId,
          prizeId: inserted.id,
          delta: initialStock,
          stockBefore: 0,
          stockAfter: initialStock,
          reason: "admin_add",
          note: "创建奖品时设置初始库存",
        })
        .run();
    }
    return { message: `奖品“${name}”已添加` };
  },
);

export function createPrize(actorMemberId: MemberId, input: unknown) {
  return createPrizeTransaction.immediate(actorMemberId, input);
}

export function updatePrize(id: number, input: unknown) {
  const body = recordValue(input);
  const prize = existingPrize(id);
  ensureNotArchived(prize.archivedAt, "这个奖品");
  const name = requiredText(body.name, "奖品名称", 80);
  db.update(schema.prizes)
    .set({
      name,
      description: optionalText(body.description, "奖品说明", 500),
      imagePath: imagePath(body.imagePath),
      sortOrder: requiredInteger(body, "sortOrder", "排序值", {
        min: -MAX_COUNT,
        max: MAX_COUNT,
      }),
      isActive: requiredBoolean(body, "isActive", "启用状态"),
      updatedAt: new Date(),
    })
    .where(eq(schema.prizes.id, id))
    .run();
  return { message: `奖品“${name}”已保存` };
}

const adjustPrizeStockTransaction = sqlite.transaction(
  (actorMemberId: MemberId, id: number, input: unknown): AdminMutationResponse => {
    const body = recordValue(input);
    const prize = existingPrize(id);
    ensureNotArchived(prize.archivedAt, "这个奖品");
    const delta = requiredInteger(body, "delta", "库存调整量", {
      min: -MAX_COUNT,
      max: MAX_COUNT,
    });
    if (delta === 0) {
      throw new AdminServiceError("INVALID_INPUT", "库存调整量不能为 0");
    }
    const stockAfter = prize.remainingStock + delta;
    if (stockAfter < 0) {
      throw new AdminServiceError(
        "INSUFFICIENT_STOCK",
        "减少后的库存不能小于 0",
        409,
      );
    }
    db.update(schema.prizes)
      .set({ remainingStock: stockAfter, updatedAt: new Date() })
      .where(eq(schema.prizes.id, id))
      .run();
    db.insert(schema.prizeStockLogs)
      .values({
        actorType: "member", actorMemberId,
        prizeId: id,
        delta,
        stockBefore: prize.remainingStock,
        stockAfter,
        reason: delta > 0 ? "admin_add" : "admin_reduce",
        note: optionalText(body.note, "备注", 200),
      })
      .run();
    return { message: `“${prize.name}”库存已调整为 ${stockAfter}` };
  },
);

export function adjustPrizeStock(actorMemberId: MemberId, id: number, input: unknown) {
  return adjustPrizeStockTransaction.immediate(actorMemberId, id, input);
}

export function archivePrize(id: number) {
  const prize = existingPrize(id);
  ensureNotArchived(prize.archivedAt, "这个奖品");
  db.update(schema.prizes)
    .set({ isActive: false, archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.prizes.id, id))
    .run();
  return { message: `奖品“${prize.name}”已归档` };
}
