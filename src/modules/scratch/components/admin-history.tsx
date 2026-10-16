import { useCallback, useEffect, useState } from "react";

import type {
  AdminHistoryResponse,
  AdminHistoryType,
} from "@/modules/scratch/contracts/admin";
import type { ApiErrorResponse } from "@/shared/http/contracts";
import { withBasePath } from "@/shared/routing/app-path";

const historyLabels: Record<AdminHistoryType, string> = {
  draws: "抽奖记录",
  balance: "奖券变化",
  stock: "库存变化",
};

const reasonLabels = {
  draw_cost: "抽奖消耗",
  retry_reward: "再来同类券",
  admin_grant: "管理员发券",
  admin_revoke: "管理员扣券",
  draw: "抽中奖品",
  admin_add: "管理员增加",
  admin_reduce: "管理员减少",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatPercent(weight: number) {
  return `${(weight / 100).toFixed(2).replace(/\.00$/, "")}%`;
}

async function loadHistory(type: AdminHistoryType, page: number) {
  const response = await fetch(
    withBasePath(
      `/api/admin/history?type=${type}&page=${page}&pageSize=20`,
    ),
    { cache: "no-store" },
  );
  const payload = (await response.json()) as
    | AdminHistoryResponse
    | ApiErrorResponse;
  if (!response.ok) {
    throw new Error(
      "message" in payload ? payload.message : "无法读取历史记录",
    );
  }
  return payload as AdminHistoryResponse;
}

export function AdminHistory({
  onFeedback,
}: {
  onFeedback: (message: string, isError?: boolean) => void;
}) {
  const [type, setType] = useState<AdminHistoryType>("draws");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await loadHistory(type, page));
    } catch (error) {
      onFeedback(
        error instanceof Error ? error.message : "无法读取历史记录",
        true,
      );
    } finally {
      setIsLoading(false);
    }
  }, [onFeedback, page, type]);

  useEffect(() => {
    let cancelled = false;
    void loadHistory(type, page)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onFeedback(
            error instanceof Error ? error.message : "无法读取历史记录",
            true,
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onFeedback, page, type]);

  const changeType = (next: AdminHistoryType) => {
    setIsLoading(true);
    setType(next);
    setPage(1);
    setData(null);
  };

  const changePage = (next: number) => {
    setIsLoading(true);
    setPage(next);
  };

  const refresh = () => {
    setIsLoading(true);
    void load();
  };

  return (
    <section className="admin-content admin-record-panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">AUDIT HISTORY</p>
          <h2>历史记录</h2>
        </div>
        <button className="admin-refresh" onClick={refresh}>
          刷新
        </button>
      </div>

      <div className="admin-filter-tabs" role="tablist">
        {(Object.keys(historyLabels) as AdminHistoryType[]).map((value) => (
          <button
            key={value}
            className={type === value ? "active" : ""}
            onClick={() => changeType(value)}
            role="tab"
            aria-selected={type === value}
          >
            {historyLabels[value]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="admin-table-state">正在读取历史记录…</div>
      ) : data?.items.length ? (
        <div className="admin-table-wrap">
          {data.type === "draws" && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>编号</th>
                  <th>券种</th>
                  <th>结果</th>
                  <th>券余额</th>
                  <th>概率版本</th>
                  <th>概率快照（奖品 / 再来 / 谢谢）</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatTime(item.createdAt)}</td>
                    <td>#{item.id}</td>
                    <td>{item.ticketName}</td>
                    <td>
                      <span className={`result-type ${item.resultType}`}>
                        {item.resultLabel}
                      </span>
                    </td>
                    <td>
                      {item.balanceBefore} → {item.balanceAfter}
                    </td>
                    <td>第 {item.configVersion} 版</td>
                    <td>
                      {formatPercent(item.prizeWeight)} /{" "}
                      {formatPercent(item.retryWeight)} /{" "}
                      {formatPercent(item.missWeight)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.type === "balance" && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>券种</th>
                  <th>原因</th>
                  <th>变化</th>
                  <th>变化前后</th>
                  <th>关联抽奖</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatTime(item.createdAt)}</td>
                    <td>{item.ticketName}</td>
                    <td>{reasonLabels[item.reason]}</td>
                    <td className={item.delta > 0 ? "positive" : "negative"}>
                      {item.delta > 0 ? "+" : ""}
                      {item.delta}
                    </td>
                    <td>
                      {item.balanceBefore} → {item.balanceAfter}
                    </td>
                    <td>
                      {item.drawRecordId ? `#${item.drawRecordId}` : "—"}
                    </td>
                    <td>{item.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {data.type === "stock" && (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>奖品</th>
                  <th>原因</th>
                  <th>变化</th>
                  <th>变化前后</th>
                  <th>关联抽奖</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td>{formatTime(item.createdAt)}</td>
                    <td>{item.prizeName}</td>
                    <td>{reasonLabels[item.reason]}</td>
                    <td className={item.delta > 0 ? "positive" : "negative"}>
                      {item.delta > 0 ? "+" : ""}
                      {item.delta}
                    </td>
                    <td>
                      {item.stockBefore} → {item.stockAfter}
                    </td>
                    <td>
                      {item.drawRecordId ? `#${item.drawRecordId}` : "—"}
                    </td>
                    <td>{item.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="admin-table-state">当前还没有这类记录。</div>
      )}

      {data && data.pagination.totalPages > 1 && (
        <div className="admin-pagination">
          <button
            disabled={page <= 1}
            onClick={() => changePage(page - 1)}
          >
            上一页
          </button>
          <span>
            第 {page} / {data.pagination.totalPages} 页，共{" "}
            {data.pagination.total} 条
          </span>
          <button
            disabled={page >= data.pagination.totalPages}
            onClick={() => changePage(page + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </section>
  );
}
