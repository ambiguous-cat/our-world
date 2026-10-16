"use client";

import { usePlayerName } from "@/core/auth/player-name-context";
import type { CSSProperties } from "react";

import type { PlayerScreen, PrizeWin } from "./data";
import { prizeTone } from "./data";
import {
  PlayerBalanceActivity,
  RecentTicketRewards,
} from "./player-balance-activity";
import { PlayerBottomNav } from "./player-nav";
import { withBasePath } from "@/shared/routing/app-path";
import type { PlayerBalanceHistoryResponse } from "@/modules/scratch/contracts/balance";
import type { PlayerTicket } from "@/modules/scratch/contracts/draw";
import { ticketIcon } from "@/modules/scratch/contracts/ticket-icon";

type PlayerHomeScreenProps = {
  totalTickets: number;
  tickets: PlayerTicket[];
  initialRecentTicketRewards: PlayerBalanceHistoryResponse;
  prizeWins: PrizeWin[];
  totalDraws: number;
  isCollectionLoading: boolean;
  collectionError: string;
  onReloadCollection: () => void;
  onBackHome: () => void;
  onEnterGame: () => void;
  onEnterTicket: (ticketTypeId: number) => void;
  onNavigate: (screen: PlayerScreen) => void;
};

export function PlayerHomeScreen({
  totalTickets,
  tickets,
  initialRecentTicketRewards,
  prizeWins,
  totalDraws,
  isCollectionLoading,
  collectionError,
  onReloadCollection,
  onBackHome,
  onEnterGame,
  onEnterTicket,
  onNavigate,
}: PlayerHomeScreenProps) {
  const playerName = usePlayerName();
  const collectedCount = prizeWins.length;
  const unredeemedCount = prizeWins.filter(
    (prize) => prize.status !== "redeemed",
  ).length;

  const navigate = (next: PlayerScreen) => {
    if (next === "game") onEnterGame();
    else onNavigate(next);
  };

  return (
    <main className="app-shell home-screen">
      <nav className="topbar player-home-topbar">
        <div className="brand">
          <span>✦</span> 飞鼠幸运屋
        </div>
        <button
          className="collection-link"
          onClick={onBackHome}
        >
          ← 返回主页
        </button>
      </nav>

      <div className="home-content">
        <section className="home-hero scratch-home-hero">
          <div className="home-hero-copy">
            <p className="eyebrow">MOMO&apos;S LUCKY CORNER</p>
            <h1>
              飞鼠幸运屋，
              <span>开刮啦！</span>
            </h1>
            <p>挑一张喜欢的幸运券，看看今天藏着什么小惊喜。</p>
            <div className="home-tags" aria-label="刮刮乐区域状态">
              <span>🎟️ 我的奖券 {totalTickets} 张</span>
              <span>✨ 好运正在加载</span>
            </div>
          </div>
          <div className="home-hero-art">
            <span className="home-speech">选一张吧～</span>
            <img
              src={withBasePath("/momo/scratch.jpg")}
              alt="抱着刮刮乐的飞鼠"
            />
          </div>
        </section>

        <section className="lucky-footprint" aria-label="幸运足迹">
          <div className="footprint-intro">
            <span className="footprint-mark" aria-hidden="true">
              🐾
            </span>
            <div>
              <p className="eyebrow">LUCKY FOOTPRINT</p>
              <h2>{playerName}的幸运足迹</h2>
              <p>每一次刮开，都是我们一起攒下的一点小幸运。</p>
            </div>
          </div>
          <div className="footprint-trail" aria-hidden="true">
            <svg viewBox="0 0 220 80" preserveAspectRatio="none">
              <path d="M8 61 C42 17 79 68 117 43 S177 14 214 34" />
            </svg>
            <span className="footstep-one">🐾</span>
            <span className="footstep-two">🐾</span>
            <span className="footstep-three">🐾</span>
            <span className="footstep-four">🐾</span>
            <span className="footstep-five">🐾</span>
          </div>
          <div className="footprint-stats">
            <article>
              <span>累计刮奖</span>
              <p>
                <strong>{totalDraws}</strong>
                <small>次</small>
              </p>
            </article>
            <article>
              <span>收藏礼物</span>
              <p>
                <strong>{collectedCount}</strong>
                <small>份</small>
              </p>
            </article>
          </div>
        </section>

        <section className="home-dashboard" aria-label="幸运小屋概览">
          <article className="luck-card">
            <div className="luck-card-top">
              <div className="luck-card-main">
                <div className="luck-card-heading">
                  <span className="home-card-icon">🎟️</span>
                  <div>
                    <p>幸运机会</p>
                    <strong>
                      一共有 <i>{totalTickets}</i> 张
                    </strong>
                  </div>
                </div>
                <p className="luck-card-note">
                  每一张都藏着飞鼠悄悄准备的小惊喜。
                </p>
              </div>
              <PlayerBalanceActivity />
            </div>
            <button
              className="home-draw-button"
              onClick={onEnterGame}
              aria-disabled={totalTickets <= 0}
            >
              {totalTickets > 0 ? "打开我的奖券包" : "看看有哪些幸运券"}
              <span>➜</span>
            </button>
            <div className="mini-ticket-wallet">
              <div className="mini-ticket-wallet-heading">
                <span>MY TICKET WALLET</span>
                <strong>我的奖券包</strong>
              </div>
              {tickets.length > 0 ? (
                <div className="mini-ticket-list">
                  {tickets.map((ticket) => (
                    <button
                      type="button"
                      className="mini-ticket"
                      key={ticket.id}
                      style={
                        {
                          "--mini-ticket-color": ticket.themeColor,
                          "--mini-ticket-accent": ticket.accentColor,
                        } as CSSProperties
                      }
                      onClick={() => onEnterTicket(ticket.id)}
                    >
                      <span className="mini-ticket-cover" aria-hidden="true">
                        {ticketIcon(ticket.displayIcon)}
                      </span>
                      <span className="mini-ticket-footer">
                        <strong>{ticket.name}</strong>
                        <b className="mini-ticket-count">×{ticket.balance}</b>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mini-ticket-empty">幸运券还在准备中～</p>
              )}
            </div>
          </article>

          <RecentTicketRewards
            initialHistory={initialRecentTicketRewards}
            tickets={tickets}
          />

          <article className="gift-summary-card">
            <div>
              <span className="home-card-icon">🎁</span>
              <p>我的礼物</p>
              <strong>{unredeemedCount} 份还没有兑换</strong>
              <small>一共收集了 {collectedCount} 份小快乐</small>
            </div>
            <button
              aria-label="查看我的礼物"
              onClick={() => onNavigate("collection")}
            >
              查看礼物 <span>›</span>
            </button>
          </article>
        </section>

        <section className="recent-luck">
          <div className="home-section-heading">
            <div>
              <p className="eyebrow">RECENT LUCK</p>
              <h2>最近收到的小快乐</h2>
            </div>
            <button onClick={() => onNavigate("collection")}>全部礼物 ›</button>
          </div>
          {collectionError && (
            <div className="home-collection-feedback" role="alert">
              <span>{collectionError}</span>
              <button type="button" onClick={onReloadCollection}>
                重新读取
              </button>
            </div>
          )}
          <div className="recent-prize-grid">
            {prizeWins.slice(0, 3).map((prize) => (
              <article
                className={`recent-prize ${prizeTone(prize.id)}`}
                key={prize.id}
              >
                <span className="prize-icon">
                  {prize.imagePath ? (
                    <img src={withBasePath(prize.imagePath)} alt="" />
                  ) : (
                    <span aria-hidden="true">🎁</span>
                  )}
                </span>
                <div>
                  <h3>{prize.name}</h3>
                  <p>{prize.description}</p>
                </div>
              </article>
            ))}
            {isCollectionLoading && prizeWins.length === 0 && (
              <div className="recent-prize-empty">正在整理最近的礼物…</div>
            )}
            {!isCollectionLoading &&
              !collectionError &&
              prizeWins.length === 0 && (
                <div className="recent-prize-empty">
                  第一份小快乐还在路上，去刮一张幸运券吧～
                </div>
              )}
          </div>
        </section>

      </div>

      <PlayerBottomNav active="home" onNavigate={navigate} />
    </main>
  );
}
