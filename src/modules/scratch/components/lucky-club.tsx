"use client";

import {
  useCallback,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AdminScreen } from "./admin-screen";
import { CollectionScreen } from "./collection-screen";
import type {
  DrawResult,
  PlayerScreen,
  PrizeFilter,
  PrizeWin,
  RedemptionStatus,
  Screen,
  SessionRole,
} from "./data";
import { PlayerHomeScreen } from "./player-home-screen";
import { ScratchGameScreen } from "./scratch-game-screen";
import type {
  PlayerCollectionResponse,
  RedemptionMutationResponse,
} from "@/modules/scratch/contracts/collection";
import type { PlayerBalanceHistoryResponse } from "@/modules/scratch/contracts/balance";
import type {
  DrawApiResponse,
  PlayerSummaryResponse,
  PlayerTicket,
} from "@/modules/scratch/contracts/draw";
import type { ApiErrorResponse } from "@/shared/http/contracts";
import { withBasePath } from "@/shared/routing/app-path";

function createRequestKey() {
  if (typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  );

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export default function LuckyClub({
  initialRole,
  initialTicketSummary,
  initialCollection,
  initialRecentTicketRewards,
}: {
  initialRole: SessionRole;
  initialTicketSummary: PlayerSummaryResponse;
  initialCollection: PlayerCollectionResponse | null;
  initialRecentTicketRewards: PlayerBalanceHistoryResponse;
}) {
  const router = useRouter();
  const sessionRole = initialRole;
  const [screen, setScreen] = useState<Screen>(
    initialRole === "admin" ? "admin" : "home",
  );
  const [prizeWins, setPrizeWins] = useState<PrizeWin[]>(
    initialCollection?.prizeWins ?? [],
  );
  const [totalDraws, setTotalDraws] = useState(
    initialCollection?.totalDraws ?? 0,
  );
  const [isCollectionLoading, setIsCollectionLoading] = useState(false);
  const [collectionError, setCollectionError] = useState("");
  const [updatingPrizeWinId, setUpdatingPrizeWinId] = useState<number | null>(
    null,
  );
  const [prizeFilter, setPrizeFilter] = useState<PrizeFilter>("all");
  const [selectedPrizeId, setSelectedPrizeId] = useState<number | null>(null);
  const [tickets, setTickets] = useState<PlayerTicket[]>(
    initialTicketSummary.tickets,
  );
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);
  const [currentResult, setCurrentResult] = useState<DrawResult | null>(null);
  const [isPreparingRound, setIsPreparingRound] = useState(false);
  const [roundError, setRoundError] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const preparingRoundRef = useRef(false);
  const pendingDrawKeyRef = useRef<string | null>(null);

  const totalTickets = tickets.reduce(
    (sum, ticket) => sum + ticket.balance,
    0,
  );
  const selectedTicket =
    tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;

  const loadCollection = useCallback(async () => {
    setIsCollectionLoading(true);
    setCollectionError("");

    try {
      const response = await fetch(withBasePath("/api/player/prize-wins"), {
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | PlayerCollectionResponse
        | ApiErrorResponse;

      if (!response.ok || !("prizeWins" in payload)) {
        throw new Error(
          "message" in payload ? payload.message : "读取礼物收藏失败",
        );
      }

      setPrizeWins(payload.prizeWins);
      setTotalDraws(payload.totalDraws);
    } catch (error) {
      setCollectionError(
        error instanceof Error
          ? error.message
          : "暂时没能读取礼物收藏，请稍后再试～",
      );
    } finally {
      setIsCollectionLoading(false);
    }
  }, []);

  const prepareRound = useCallback(async (ticketTypeId: number) => {
    if (preparingRoundRef.current) return false;
    const ticket = tickets.find((item) => item.id === ticketTypeId);
    if (!ticket || ticket.balance <= 0 || !ticket.isDrawEnabled) {
      setCurrentResult(null);
      return false;
    }

    preparingRoundRef.current = true;
    setIsPreparingRound(true);
    setRoundError("");
    const requestKey = pendingDrawKeyRef.current ?? createRequestKey();
    pendingDrawKeyRef.current = requestKey;

    try {
      const response = await fetch(withBasePath("/api/player/draw"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestKey, ticketTypeId }),
      });
      const payload = (await response.json()) as
        | DrawApiResponse
        | ApiErrorResponse;

      if (!response.ok || !("result" in payload)) {
        if (response.status < 500) pendingDrawKeyRef.current = null;
        setRoundError(
          "message" in payload
            ? payload.message
            : "飞鼠暂时没能准备好刮奖券，请稍后再试～",
        );
        return false;
      }

      pendingDrawKeyRef.current = null;
      setTickets((items) =>
        items.map((item) =>
          item.id === payload.ticketTypeId
            ? { ...item, balance: payload.remainingTickets }
            : item,
        ),
      );
      setCurrentResult(payload.result);
      setRevealed(false);
      setResultOpen(false);
      setResetKey((value) => value + 1);
      if (payload.result.kind === "prize") {
        void loadCollection();
      } else {
        setTotalDraws((value) => value + 1);
      }
      return true;
    } catch {
      setRoundError(
        "网络好像开小差了，点击重试会继续处理同一张刮奖券，不会重复扣券～",
      );
      return false;
    } finally {
      preparingRoundRef.current = false;
      setIsPreparingRound(false);
    }
  }, [tickets, loadCollection]);

  const enterGame = () => {
    setScreen("game");
  };

  const selectTicket = (ticketTypeId: number | null) => {
    setSelectedTicketId(ticketTypeId);
    setCurrentResult(null);
    setRoundError("");
    setRevealed(false);
    setResultOpen(false);
    pendingDrawKeyRef.current = null;
  };

  const navigatePlayer = (next: PlayerScreen) => {
    setScreen(next);
  };

  const returnHome = () => {
    router.push("/home");
  };

  const enterTicket = (ticketTypeId: number) => {
    selectTicket(ticketTypeId);
    setScreen("game");
  };

  const revealResult = () => {
    if (!currentResult || revealed) return;
    setRevealed(true);
    window.setTimeout(() => setResultOpen(true), 220);
  };

  const continueDrawing = () => {
    setResultOpen(false);
    setRoundError("");
    if (!selectedTicketId) return;

    const ticket = tickets.find((item) => item.id === selectedTicketId);
    if (!ticket || ticket.balance <= 0 || !ticket.isDrawEnabled) {
      setCurrentResult(null);
      setRevealed(false);
      return;
    }

    void prepareRound(selectedTicketId);
  };

  const changePrizeStatus = async (
    prizeId: number,
    status: RedemptionStatus,
  ) => {
    if (updatingPrizeWinId !== null) return;

    setUpdatingPrizeWinId(prizeId);
    setCollectionError("");

    try {
      const response = await fetch(
        withBasePath(`/api/player/prize-wins/${prizeId}/request`),
        { method: status === "requested" ? "POST" : "DELETE" },
      );
      const payload = (await response.json()) as
        | RedemptionMutationResponse
        | ApiErrorResponse;

      if (!response.ok || !("prizeWin" in payload)) {
        throw new Error(
          "message" in payload ? payload.message : "更新礼物状态失败",
        );
      }

      setPrizeWins((items) =>
        items.map((item) =>
          item.id === prizeId ? payload.prizeWin : item,
        ),
      );
    } catch (error) {
      setCollectionError(
        error instanceof Error
          ? error.message
          : "飞鼠暂时没能记下这次操作，请稍后再试～",
      );
    } finally {
      setUpdatingPrizeWinId(null);
    }
  };

  if (screen === "admin" && sessionRole === "admin") {
    return (
      <AdminScreen
        isSigningOut={false}
        onSignOut={returnHome}
      />
    );
  }

  if (screen === "home" && sessionRole === "player") {
    return (
      <PlayerHomeScreen
        totalTickets={totalTickets}
        tickets={tickets}
        initialRecentTicketRewards={initialRecentTicketRewards}
        prizeWins={prizeWins}
        totalDraws={totalDraws}
        isCollectionLoading={isCollectionLoading}
        collectionError={collectionError}
        onReloadCollection={() => void loadCollection()}
        onBackHome={returnHome}
        onEnterGame={enterGame}
        onEnterTicket={enterTicket}
        onNavigate={navigatePlayer}
      />
    );
  }

  if (screen === "collection" && sessionRole === "player") {
    return (
      <CollectionScreen
        prizeWins={prizeWins}
        prizeFilter={prizeFilter}
        selectedPrizeId={selectedPrizeId}
        isLoading={isCollectionLoading}
        error={collectionError}
        updatingPrizeWinId={updatingPrizeWinId}
        onFilterChange={setPrizeFilter}
        onSelectPrize={setSelectedPrizeId}
        onChangeStatus={(prizeId, status) =>
          void changePrizeStatus(prizeId, status)
        }
        onReload={() => void loadCollection()}
        onNavigate={navigatePlayer}
        onEnterGame={enterGame}
      />
    );
  }

  return (
    <ScratchGameScreen
      tickets={tickets}
      selectedTicket={selectedTicket}
      currentResult={currentResult}
      revealed={revealed}
      resultOpen={resultOpen}
      resetKey={resetKey}
      isPreparingRound={isPreparingRound}
      roundError={roundError}
      onNavigate={navigatePlayer}
      onEnterGame={enterGame}
      onSelectTicket={selectTicket}
      onReveal={revealResult}
      onContinue={continueDrawing}
      onRetry={() =>
        selectedTicketId && void prepareRound(selectedTicketId)
      }
      onStart={() =>
        selectedTicketId && void prepareRound(selectedTicketId)
      }
      onOpenResult={() => setResultOpen(true)}
      onCloseResult={() => setResultOpen(false)}
    />
  );
}
