import { useCallback, useEffect, useState } from "react";

import type {
  AdminMutationResponse,
  AdminPrize,
  AdminRedemptionAction,
  AdminRedemptionsResponse,
  AdminRedemptionStatus,
} from "@/modules/scratch/contracts/admin";
import type { ApiErrorResponse } from "@/shared/http/contracts";
import { withBasePath } from "@/shared/routing/app-path";

type RedemptionFilter = AdminRedemptionStatus | "all";

const statusLabels: Record<AdminRedemptionStatus, string> = {
  unredeemed: "未兑换",
  requested: "申请中",
  redeemed: "已兑换",
  revoked: "已撤回",
};

const actionLabels: Record<AdminRedemptionAction, string> = {
  grant: "管理员直接发放",
  request: "玩家申请兑换",
  cancel_request: "玩家取消申请",
  reject_request: "管理员拒绝申请",
  redeem: "管理员核销",
  undo_redeem: "管理员撤销核销",
  revoke: "管理员撤回奖券",
  restore: "管理员恢复奖券",
};

function formatTime(value: string | null) {
  if (!value) return "—";
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

async function request<T extends object>(url: string, init?: RequestInit) {
  const response = await fetch(withBasePath(url), {
    ...init,
    cache: "no-store",
    headers: init?.body
      ? { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
  });
  const payload = (await response.json()) as T | ApiErrorResponse;
  if (!response.ok) {
    throw new Error(
      "message" in payload ? payload.message : "操作失败，请稍后再试",
    );
  }
  return payload as T;
}

export function AdminRedemptions({
  onFeedback,
  prizes,
}: {
  onFeedback: (message: string, isError?: boolean) => void;
  prizes: AdminPrize[];
}) {
  const [filter, setFilter] = useState<RedemptionFilter>("requested");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminRedemptionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [grantPrizeId, setGrantPrizeId] = useState("");
  const [isGranting, setIsGranting] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await request<AdminRedemptionsResponse>(
        `/api/admin/redemptions?status=${filter}&page=${page}&pageSize=20`,
      );
      setData(result);
    } catch (error) {
      onFeedback(
        error instanceof Error ? error.message : "无法读取兑换记录",
        true,
      );
    } finally {
      setIsLoading(false);
    }
  }, [filter, onFeedback, page]);

  useEffect(() => {
    let cancelled = false;
    void request<AdminRedemptionsResponse>(
      `/api/admin/redemptions?status=${filter}&page=${page}&pageSize=20`,
    )
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          onFeedback(
            error instanceof Error ? error.message : "无法读取兑换记录",
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
  }, [filter, onFeedback, page]);

  const changeFilter = (next: RedemptionFilter) => {
    setIsLoading(true);
    setFilter(next);
    setPage(1);
  };

  const changePage = (next: number) => {
    setIsLoading(true);
    setPage(next);
  };

  const refresh = () => {
    setIsLoading(true);
    void load();
  };

  const mutate = async (
    id: number,
    action:
      | "reject"
      | "redeem"
      | "undo_redeem"
      | "revoke"
      | "restore",
  ) => {
    const prompts = {
      reject: "确定拒绝这条兑换申请吗？",
      redeem: "确定核销这份礼物吗？",
      undo_redeem: "确定撤销核销吗？撤销后礼物会恢复为未兑换。",
      revoke: "确定撤回这张奖券吗？玩家端将不再显示，但记录会保留。",
      restore: "确定恢复这张奖券吗？恢复后玩家端会重新显示。",
    };
    if (!window.confirm(prompts[action])) return;

    setBusyId(id);
    try {
      const result = await request<AdminMutationResponse>(
        `/api/admin/redemptions/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ action }),
        },
      );
      onFeedback(result.message);
      await load();
    } catch (error) {
      onFeedback(
        error instanceof Error ? error.message : "兑换操作失败",
        true,
      );
    } finally {
      setBusyId(null);
    }
  };

  const grantPrize = async () => {
    const prizeId = Number(grantPrizeId);
    if (!Number.isSafeInteger(prizeId) || prizeId <= 0) {
      onFeedback("请先选择要发放的奖品", true);
      return;
    }
    const prize = prizes.find((item) => item.id === prizeId);
    if (
      !window.confirm(
        `确定直接向玩家发放“${prize?.name ?? "这份礼物"}”奖券吗？本次发放不扣库存。`,
      )
    ) {
      return;
    }
    setIsGranting(true);
    try {
      const result = await request<AdminMutationResponse>(
        "/api/admin/redemptions",
        {
          method: "POST",
          body: JSON.stringify({ prizeId }),
        },
      );
      onFeedback(result.message);
      setGrantPrizeId("");
      if (filter === "unredeemed") {
        await load();
      } else {
        changeFilter("unredeemed");
      }
    } catch (error) {
      onFeedback(
        error instanceof Error ? error.message : "发放奖券失败",
        true,
      );
    } finally {
      setIsGranting(false);
    }
  };

  const filters: Array<[RedemptionFilter, string]> = [
    ["requested", "申请中"],
    ["unredeemed", "未兑换"],
    ["redeemed", "已兑换"],
    ["revoked", "已撤回"],
    ["all", "全部"],
  ];

  return (
    <section className="admin-content admin-record-panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">REDEMPTIONS</p>
          <h2>兑换处理</h2>
        </div>
        <button className="admin-refresh" onClick={refresh}>
          刷新
        </button>
      </div>

      <div className="admin-filter-tabs" role="tablist">
        {filters.map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? "active" : ""}
            onClick={() => changeFilter(value)}
            role="tab"
            aria-selected={filter === value}
          >
            {label}
            {data ? ` (${data.counts[value]})` : ""}
          </button>
        ))}
      </div>

      <div className="admin-grant-row">
        <label htmlFor="admin-grant-prize">直接发放礼物奖券</label>
        <select
          id="admin-grant-prize"
          value={grantPrizeId}
          onChange={(event) => setGrantPrizeId(event.target.value)}
        >
          <option value="">请选择奖品</option>
          {prizes
            .filter((prize) => !prize.archivedAt)
            .map((prize) => (
              <option key={prize.id} value={prize.id}>
                {prize.name}
                {!prize.isActive ? "（已停用）" : ""}
              </option>
            ))}
        </select>
        <button
          disabled={isGranting || !grantPrizeId}
          onClick={() => void grantPrize()}
        >
          {isGranting ? "正在发放…" : "发放奖券"}
        </button>
        <small>直接发放不会扣减库存，也不会计入抽奖历史。</small>
      </div>

      {isLoading ? (
        <div className="admin-table-state">正在读取兑换记录…</div>
      ) : data?.items.length ? (
        <div className="admin-data-list">
          {data.items.map((item) => (
            <article className="redemption-row" key={item.id}>
              <div className="redemption-main">
                <div className="redemption-title">
                  <strong>{item.name}</strong>
                  <span className={`admin-status ${item.status}`}>
                    {statusLabels[item.status]}
                  </span>
                  <span className="admin-source">
                    {item.source === "admin_grant" ? "管理员发放" : "抽奖获得"}
                  </span>
                  <small>#{item.id}</small>
                </div>
                <p>{item.description}</p>
                <dl className="admin-inline-meta">
                  <div>
                    <dt>
                      {item.source === "admin_grant" ? "发放时间" : "中奖时间"}
                    </dt>
                    <dd>{formatTime(item.wonAt)}</dd>
                  </div>
                  {item.requestedAt && (
                    <div>
                      <dt>申请时间</dt>
                      <dd>{formatTime(item.requestedAt)}</dd>
                    </div>
                  )}
                  {item.redeemedAt && (
                    <div>
                      <dt>核销时间</dt>
                      <dd>{formatTime(item.redeemedAt)}</dd>
                    </div>
                  )}
                  {item.revokedAt && (
                    <div>
                      <dt>撤回时间</dt>
                      <dd>{formatTime(item.revokedAt)}</dd>
                    </div>
                  )}
                </dl>
              </div>
              <div className="redemption-actions">
                {item.status === "requested" && (
                  <>
                    <button
                      className="danger"
                      disabled={busyId === item.id}
                      onClick={() => void mutate(item.id, "reject")}
                    >
                      拒绝申请
                    </button>
                    <button
                      className="primary"
                      disabled={busyId === item.id}
                      onClick={() => void mutate(item.id, "redeem")}
                    >
                      确认核销
                    </button>
                    <button
                      disabled={busyId === item.id}
                      onClick={() => void mutate(item.id, "revoke")}
                    >
                      撤回奖券
                    </button>
                  </>
                )}
                {item.status === "unredeemed" && (
                  <>
                    <button
                      className="primary"
                      disabled={busyId === item.id}
                      onClick={() => void mutate(item.id, "redeem")}
                    >
                      直接核销
                    </button>
                    <button
                      className="danger"
                      disabled={busyId === item.id}
                      onClick={() => void mutate(item.id, "revoke")}
                    >
                      撤回奖券
                    </button>
                  </>
                )}
                {item.status === "redeemed" && (
                  <button
                    disabled={busyId === item.id}
                    onClick={() => void mutate(item.id, "undo_redeem")}
                  >
                    撤销核销
                  </button>
                )}
                {item.status === "revoked" && (
                  <button
                    className="primary"
                    disabled={busyId === item.id}
                    onClick={() => void mutate(item.id, "restore")}
                  >
                    恢复奖券
                  </button>
                )}
              </div>
              <details className="redemption-log">
                <summary>操作日志（{item.logs.length}）</summary>
                {item.logs.length ? (
                  <ol>
                    {item.logs.map((log) => (
                      <li key={log.id}>
                        <time>{formatTime(log.createdAt)}</time>
                        <strong>{actionLabels[log.action]}</strong>
                        {log.note && <span>{log.note}</span>}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>暂无操作日志</p>
                )}
              </details>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-table-state">当前筛选下没有记录。</div>
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
