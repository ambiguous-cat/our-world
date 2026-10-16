import {
  type CSSProperties,
  useCallback,
  useState,
} from "react";

import type {
  PlayerBalanceHistoryResponse,
} from "@/modules/scratch/contracts/balance";
import type { PlayerTicket } from "@/modules/scratch/contracts/draw";
import { ticketIcon } from "@/modules/scratch/contracts/ticket-icon";
import { withBasePath } from "@/shared/routing/app-path";
import type { ApiErrorResponse } from "@/shared/http/contracts";

function formatBalanceTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function responsePayload<T extends object>(response: Response) {
  const payload = (await response.json()) as T | ApiErrorResponse;
  if (!response.ok) {
    throw new Error(
      "message" in payload ? payload.message : "读取次数消息失败",
    );
  }
  return payload as T;
}

function BalanceHistoryModal({
  data,
  page,
  isLoading,
  error,
  onPageChange,
  onRetry,
  onClose,
}: {
  data: PlayerBalanceHistoryResponse | null;
  page: number;
  isLoading: boolean;
  error: string;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop balance-modal-backdrop">
      <section
        className="balance-history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="balance-history-title"
      >
        <button
          type="button"
          className="modal-close"
          aria-label="关闭次数记录"
          onClick={onClose}
        >
          ×
        </button>
        <p className="eyebrow">LUCKY CHANCES</p>
        <h2 id="balance-history-title">幸运券记录</h2>
        <p className="balance-history-intro">
          每一次收到的幸运，都好好记在这里。
        </p>

        <div className="balance-history-scroll-area">
          {isLoading && (
            <div className="balance-history-state">正在翻开次数记录…</div>
          )}
          {!isLoading && error && (
            <div className="balance-history-state error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={onRetry}>
                重新读取
              </button>
            </div>
          )}
          {!isLoading && !error && data?.items.length === 0 && (
            <div className="balance-history-state">
              还没有收到新的幸运券～
            </div>
          )}
          {!isLoading && !error && data && data.items.length > 0 && (
            <div className="balance-history-list">
              {data.items.map((item) => (
                <article
                  key={item.id}
                  style={
                    {
                      "--history-ticket-color": item.themeColor,
                      "--history-ticket-accent": item.accentColor,
                    } as CSSProperties
                  }
                >
                  <span
                    className={`balance-history-source ${item.source}`}
                    aria-hidden="true"
                  >
                    {item.source === "admin_reward" ? "💌" : "✨"}
                  </span>
                  <div>
                    <strong>{item.ticketName}</strong>
                    <p>{item.reason}</p>
                    <small>
                      {formatBalanceTime(item.createdAt)} · 获得后共有{" "}
                      {item.balanceAfter} 张
                    </small>
                  </div>
                  <b>＋{item.delta}</b>
                </article>
              ))}
            </div>
          )}
        </div>
        {!isLoading && !error && data && data.items.length > 0 && (
            <div className="balance-history-pagination">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                上一页
              </button>
              <span>
                {page} / {data.pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={page >= data.pagination.totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                下一页
              </button>
            </div>
        )}
      </section>
    </div>
  );
}

export function PlayerBalanceActivity() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] =
    useState<PlayerBalanceHistoryResponse | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  const loadHistory = useCallback(async (page: number) => {
    setIsHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch(
        withBasePath(
          `/api/player/balance-history?page=${page}&pageSize=10`,
        ),
        { cache: "no-store" },
      );
      setHistory(
        await responsePayload<PlayerBalanceHistoryResponse>(response),
      );
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "暂时没能读取次数记录～",
      );
    } finally {
      setIsHistoryLoading(false);
    }
  }, []);

  const openHistory = () => {
    setHistoryOpen(true);
    setHistoryPage(1);
    void loadHistory(1);
  };

  const changePage = (page: number) => {
    setHistoryPage(page);
    void loadHistory(page);
  };

  return (
    <>
      <button
        className="balance-history-button"
        type="button"
        onClick={openHistory}
      >
        <span className="balance-history-button-icon" aria-hidden="true">
          🕰️
        </span>
        <span className="balance-history-button-copy">
          <small>LUCKY LOG</small>
          <strong>查看奖券记录</strong>
        </span>
        <i aria-hidden="true">›</i>
      </button>
      {historyOpen && (
        <BalanceHistoryModal
          data={history}
          page={historyPage}
          isLoading={isHistoryLoading}
          error={historyError}
          onPageChange={changePage}
          onRetry={() => void loadHistory(historyPage)}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </>
  );
}

export function RecentTicketRewards({
  initialHistory,
  tickets,
}: {
  initialHistory: PlayerBalanceHistoryResponse;
  tickets: PlayerTicket[];
}) {
  return (
    <article className="recent-ticket-card">
      <div className="recent-ticket-heading">
        <p className="eyebrow">RECENT TICKETS</p>
      </div>

      {initialHistory.items.length > 0 ? (
        <div className="recent-ticket-list">
          {initialHistory.items.map((item) => {
            const ticket = tickets.find(
              (candidate) => candidate.id === item.ticketTypeId,
            );

            return (
              <div
                className="recent-ticket-item"
                key={item.id}
                style={
                  {
                    "--recent-ticket-color": item.themeColor,
                    "--recent-ticket-accent": item.accentColor,
                  } as CSSProperties
                }
              >
                <span className="recent-ticket-cover" aria-hidden="true">
                  {ticket ? ticketIcon(ticket.displayIcon) : "🎟️"}
                </span>
                <div>
                  <strong>{item.ticketName}</strong>
                  <p>
                    <span>奖励原因：</span>
                    {item.reason}
                  </p>
                  <small>{formatBalanceTime(item.createdAt)}</small>
                </div>
                <b>＋{item.delta}</b>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="recent-ticket-empty">
          <span aria-hidden="true">🎟️</span>
          <p>还没有收到新的幸运券～</p>
        </div>
      )}
    </article>
  );
}
