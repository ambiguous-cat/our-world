export type PlayerBalanceHistoryItem = {
  id: number;
  ticketTypeId: number;
  ticketName: string;
  themeColor: string;
  accentColor: string;
  delta: number;
  balanceAfter: number;
  source: "admin_reward" | "retry_reward";
  reason: string;
  createdAt: string;
};

export type PlayerBalanceHistoryResponse = {
  items: PlayerBalanceHistoryItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type PlayerBalanceNotice = {
  ticketBalanceLogId: number;
  ticketTypeId: number;
  ticketName: string;
  delta: number;
  reason: string;
  createdAt: string;
};

export type PlayerBalanceNoticesResponse = {
  notices: PlayerBalanceNotice[];
};

export type AcknowledgeBalanceNoticesResponse = {
  message: string;
};
