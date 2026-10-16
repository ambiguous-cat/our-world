import type { TicketIconKey } from "./ticket-icon";

export type AdminProbabilityConfig = {
  id: number;
  ticketTypeId: number;
  version: number;
  prizeWeight: number;
  retryWeight: number;
  missWeight: number;
};

export type AdminRetryOption = {
  id: number;
  ticketTypeId: number;
  extraCount: number;
  weight: number;
  isActive: boolean;
  archivedAt: string | null;
};

export type AdminPrize = {
  id: number;
  name: string;
  description: string | null;
  imagePath: string | null;
  remainingStock: number;
  isActive: boolean;
  sortOrder: number;
  archivedAt: string | null;
};

export type AdminTicketPoolItem = {
  id: number;
  ticketTypeId: number;
  prizeId: number;
  prizeName: string;
  prizeStock: number;
  prizeActive: boolean;
  weight: number;
  isActive: boolean;
  archivedAt: string | null;
};

export type AdminTicketType = {
  id: number;
  name: string;
  description: string | null;
  kind: "permanent" | "limited";
  displayIcon: TicketIconKey;
  balance: number;
  coverImagePath: string | null;
  drawBackgroundImagePath: string | null;
  themeColor: string;
  accentColor: string;
  scratchMaskColor: string;
  scratchTextColor: string;
  scratchPrompt: string;
  isGrantEnabled: boolean;
  isDrawEnabled: boolean;
  sortOrder: number;
  archivedAt: string | null;
  probability: AdminProbabilityConfig | null;
  retryOptions: AdminRetryOption[];
  poolItems: AdminTicketPoolItem[];
};

export type AdminOverviewResponse = {
  totalTickets: number;
  totalStock: number;
  deliveredCount: number;
  tickets: AdminTicketType[];
  prizes: AdminPrize[];
};

export type AdminMutationResponse = {
  message: string;
};

export type AdminRedemptionStatus =
  | "unredeemed"
  | "requested"
  | "redeemed"
  | "revoked";

export type AdminRedemptionAction =
  | "grant"
  | "request"
  | "cancel_request"
  | "reject_request"
  | "redeem"
  | "undo_redeem"
  | "revoke"
  | "restore";

export type AdminRedemptionLog = {
  id: number;
  action: AdminRedemptionAction;
  note: string | null;
  createdAt: string;
};

export type AdminRedemptionItem = {
  id: number;
  source: "draw" | "admin_grant";
  name: string;
  description: string;
  imagePath: string | null;
  status: AdminRedemptionStatus;
  wonAt: string;
  requestedAt: string | null;
  redeemedAt: string | null;
  revokedAt: string | null;
  logs: AdminRedemptionLog[];
};

export type AdminPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type AdminRedemptionsResponse = {
  items: AdminRedemptionItem[];
  pagination: AdminPagination;
  counts: Record<AdminRedemptionStatus | "all", number>;
};

export type AdminHistoryType = "draws" | "balance" | "stock";

export type AdminDrawHistoryItem = {
  id: number;
  ticketName: string;
  resultType: "prize" | "retry" | "miss";
  resultLabel: string;
  balanceBefore: number;
  balanceAfter: number;
  configVersion: number;
  prizeWeight: number;
  retryWeight: number;
  missWeight: number;
  createdAt: string;
};

export type AdminBalanceHistoryItem = {
  id: number;
  ticketName: string;
  delta: number;
  balanceBefore: number;
  balanceAfter: number;
  reason: "draw_cost" | "retry_reward" | "admin_grant" | "admin_revoke";
  drawRecordId: number | null;
  note: string | null;
  createdAt: string;
};

export type AdminStockHistoryItem = {
  id: number;
  prizeName: string;
  delta: number;
  stockBefore: number;
  stockAfter: number;
  reason: "draw" | "admin_add" | "admin_reduce";
  drawRecordId: number | null;
  note: string | null;
  createdAt: string;
};

export type AdminHistoryResponse =
  | {
      type: "draws";
      items: AdminDrawHistoryItem[];
      pagination: AdminPagination;
    }
  | {
      type: "balance";
      items: AdminBalanceHistoryItem[];
      pagination: AdminPagination;
    }
  | {
      type: "stock";
      items: AdminStockHistoryItem[];
      pagination: AdminPagination;
    };
