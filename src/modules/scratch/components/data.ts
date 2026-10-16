export type Screen = "welcome" | "home" | "game" | "collection" | "admin";
export type PlayerScreen = Extract<Screen, "home" | "game" | "collection">;
export type { SessionRole } from "@/core/auth/contracts";
export type ResultKind = "prize" | "retry" | "thanks";

export type { PlayerPrizeWin as PrizeWin } from "@/modules/scratch/contracts/collection";
export type RedemptionStatus =
  import("@/modules/scratch/contracts/collection").PlayerRedemptionStatus;
export type PrizeFilter = "all" | RedemptionStatus;

export type DrawResult = {
  kind: ResultKind;
  title: string;
  description: string;
  image: string;
  icon: string;
  bonusTickets?: number;
  prizeWinId?: number;
};

export const getRedemptionMeta = (playerName: string) => ({
  unredeemed: { label: `等待${playerName}领取`, icon: "🎁" },
  requested: { label: "正在准备中", icon: "⏳" },
  redeemed: { label: `${playerName}已收到`, icon: "✓" },
} satisfies Record<RedemptionStatus, { label: string; icon: string }>);

export function formatGiftTime(value: string | null) {
  if (!value) return null;

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function prizeTone(id: number) {
  return ["pink", "purple", "yellow"][Math.abs(id) % 3];
}

export const resultMeta = {
  prize: { label: "抽中奖品", icon: "🎁", color: "pink" },
  retry: { label: "再来一次类", icon: "🎟️", color: "purple" },
  thanks: { label: "谢谢惠顾", icon: "🌧️", color: "blue" },
} satisfies Record<ResultKind, { label: string; icon: string; color: string }>;
