"use client";

import { usePlayerName } from "@/core/auth/player-name-context";
import type {
  PlayerScreen,
  PrizeFilter,
  PrizeWin,
  RedemptionStatus,
} from "./data";
import { formatGiftTime, prizeTone, getRedemptionMeta } from "./data";
import { PlayerBottomNav } from "./player-nav";
import { withBasePath } from "@/shared/routing/app-path";

function PrizeArt({
  prize,
  className,
}: {
  prize: PrizeWin;
  className: string;
}) {
  return (
    <span className={`${className} ${prizeTone(prize.id)}`}>
      {prize.imagePath ? (
        <img src={withBasePath(prize.imagePath)} alt="" />
      ) : (
        <span aria-hidden="true">🎁</span>
      )}
    </span>
  );
}

function PrizeDetailModal({
  prize,
  onClose,
  onChangeStatus,
  isUpdating,
  error,
}: {
  prize: PrizeWin;
  onClose: () => void;
  onChangeStatus: (status: RedemptionStatus) => void;
  isUpdating: boolean;
  error: string;
}) {
  const playerName = usePlayerName();
  const redemptionMeta = getRedemptionMeta(playerName);
  const status = redemptionMeta[prize.status];

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="prize-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prize-detail-title"
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="关闭奖品详情"
        >
          ×
        </button>

        <PrizeArt prize={prize} className="prize-detail-icon" />
        <span className={`detail-status detail-status-${prize.status}`}>
          {status.icon} {status.label}
        </span>
        <p className="eyebrow">MY LITTLE GIFT</p>
        <h2 id="prize-detail-title">{prize.name}</h2>
        <p className="prize-detail-note">{prize.description}</p>

        <dl className="prize-timeline">
          <div>
            <dt>
              <span>✦</span> 获得奖券
            </dt>
            <dd>{formatGiftTime(prize.wonAt)}</dd>
          </div>
          <div className={!prize.requestedAt ? "muted" : ""}>
            <dt>
              <span>💌</span> 告诉飞鼠
            </dt>
            <dd>{formatGiftTime(prize.requestedAt) ?? "还没有告诉飞鼠"}</dd>
          </div>
          <div className={!prize.redeemedAt ? "muted" : ""}>
            <dt>
              <span>✓</span> 收到礼物
            </dt>
            <dd>
              {formatGiftTime(prize.redeemedAt) ?? `${playerName}还没有收到这份礼物`}
            </dd>
          </div>
        </dl>

        {prize.status === "unredeemed" && (
          <button
            className="primary-button prize-action-button"
            onClick={() => onChangeStatus("requested")}
            disabled={isUpdating}
          >
            {isUpdating ? "正在告诉飞鼠…" : `${playerName}想兑换这份礼物`}
          </button>
        )}
        {prize.status === "requested" && (
          <button
            className="cancel-request-button"
            onClick={() => onChangeStatus("unredeemed")}
            disabled={isUpdating}
          >
            {isUpdating ? "正在取消…" : `${playerName}先不领取啦`}
          </button>
        )}
        {prize.status === "redeemed" && (
          <button className="redeemed-button" disabled>
            ✓ {playerName}已经收到这份礼物啦
          </button>
        )}
        <p className={`detail-helper ${error ? "detail-error" : ""}`}>
          {error ||
            (prize.status === "requested"
              ? `管理员大人已经收到消息，正在准备给${playerName}的礼物。`
              : prize.status === "unredeemed"
                ? "告诉管理员大人后，这份礼物就会开始准备啦。"
                : `这份小快乐已经被${playerName}好好收下啦。`)}
        </p>
      </section>
    </div>
  );
}

type CollectionScreenProps = {
  prizeWins: PrizeWin[];
  prizeFilter: PrizeFilter;
  selectedPrizeId: number | null;
  isLoading: boolean;
  error: string;
  updatingPrizeWinId: number | null;
  onFilterChange: (filter: PrizeFilter) => void;
  onSelectPrize: (prizeId: number | null) => void;
  onChangeStatus: (prizeId: number, status: RedemptionStatus) => void;
  onReload: () => void;
  onNavigate: (screen: PlayerScreen) => void;
  onEnterGame: () => void;
};

export function CollectionScreen({
  prizeWins,
  prizeFilter,
  selectedPrizeId,
  isLoading,
  error,
  updatingPrizeWinId,
  onFilterChange,
  onSelectPrize,
  onChangeStatus,
  onReload,
  onNavigate,
  onEnterGame,
}: CollectionScreenProps) {
  const playerName = usePlayerName();
  const redemptionMeta = getRedemptionMeta(playerName);
  const collectedCount = prizeWins.length;
  const unredeemedCount = prizeWins.filter(
    (prize) => prize.status !== "redeemed",
  ).length;
  const filteredPrizeWins =
    prizeFilter === "all"
      ? prizeWins
      : prizeWins.filter((prize) => prize.status === prizeFilter);
  const selectedPrize =
    prizeWins.find((prize) => prize.id === selectedPrizeId) ?? null;

  const navigate = (next: PlayerScreen) => {
    if (next === "game") onEnterGame();
    else onNavigate(next);
  };

  return (
    <main className="app-shell collection-screen">
      <nav className="topbar">
        <button className="round-button" onClick={() => onNavigate("home")}>
          ←
        </button>
        <span>我的小收藏</span>
        <span>◕ᴗ◕</span>
      </nav>
      <section className="collection-hero">
        <img
          src={withBasePath("/momo/gifts.jpg")}
          alt="抱着礼物开心庆祝的飞鼠"
        />
        <div className="collection-hero-copy">
          <p>MY LITTLE TREASURES</p>
          <h1>我的礼物收藏</h1>
          <span>“再来 x 次”和“谢谢惠顾”不会进入收藏</span>
        </div>
        <div className="collection-counts" aria-label="礼物数量">
          <div>
            <strong>{collectedCount}</strong>
            <span>已经收集</span>
          </div>
          <div>
            <strong>{unredeemedCount}</strong>
            <span>尚未兑换</span>
          </div>
        </div>
      </section>

      <section className="collection-toolbar">
        <div>
          <p className="eyebrow">GIFT STATUS</p>
        </div>
        <div className="prize-filters" aria-label="按兑换状态筛选">
          {(
            [
              ["all", "全部"],
              ["unredeemed", "未兑换"],
              ["requested", "申请中"],
              ["redeemed", "已兑换"],
            ] as [PrizeFilter, string][]
          ).map(([filter, label]) => (
            <button
              key={filter}
              className={prizeFilter === filter ? "active" : ""}
              onClick={() => onFilterChange(filter)}
              aria-pressed={prizeFilter === filter}
            >
              {label}
              <span>
                {filter === "all"
                  ? prizeWins.length
                  : prizeWins.filter((prize) => prize.status === filter).length}
              </span>
            </button>
          ))}
        </div>
      </section>

      {error && !selectedPrize && (
        <div className="collection-feedback" role="alert">
          <span>{error}</span>
          <button type="button" onClick={onReload}>
            再试一次
          </button>
        </div>
      )}

      <section className="prize-list">
        {isLoading && prizeWins.length === 0 && (
          <div className="empty-prize-filter">
            <span>🎀</span>
            <h2>飞鼠正在整理礼物</h2>
            <p>稍等一下，收藏马上就来～</p>
          </div>
        )}
        {filteredPrizeWins.map((prize) => (
          <button
            type="button"
            className={`prize-item ${prizeTone(prize.id)}`}
            key={prize.id}
            onClick={() => onSelectPrize(prize.id)}
          >
            <PrizeArt prize={prize} className="prize-icon" />
            <div className="prize-item-copy">
              <h2>{prize.name}</h2>
              <p>{prize.description}</p>
              <small>获得于 {formatGiftTime(prize.wonAt)}</small>
            </div>
            <span className={`status status-${prize.status}`}>
              {redemptionMeta[prize.status].icon}{" "}
              {redemptionMeta[prize.status].label}
            </span>
            <span className="prize-item-arrow" aria-hidden="true">
              ›
            </span>
          </button>
        ))}
        {!isLoading && filteredPrizeWins.length === 0 && (
          <div className="empty-prize-filter">
            <span>🎀</span>
            <h2>这里还空空的</h2>
            <p>这个状态下暂时没有礼物，去看看其他分类吧～</p>
          </div>
        )}
      </section>

      {selectedPrize && (
        <PrizeDetailModal
          prize={selectedPrize}
          onClose={() => onSelectPrize(null)}
          onChangeStatus={(status) => onChangeStatus(selectedPrize.id, status)}
          isUpdating={updatingPrizeWinId === selectedPrize.id}
          error={error}
        />
      )}
      <PlayerBottomNav active="collection" onNavigate={navigate} />
    </main>
  );
}
