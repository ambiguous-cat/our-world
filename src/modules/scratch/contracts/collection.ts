export type PlayerRedemptionStatus =
  | "unredeemed"
  | "requested"
  | "redeemed";

export type PlayerPrizeWin = {
  id: number;
  name: string;
  description: string;
  imagePath: string | null;
  status: PlayerRedemptionStatus;
  wonAt: string;
  requestedAt: string | null;
  redeemedAt: string | null;
};

export type PlayerCollectionResponse = {
  prizeWins: PlayerPrizeWin[];
  collectedCount: number;
  unredeemedCount: number;
  totalDraws: number;
};

export type RedemptionMutationResponse = {
  prizeWin: PlayerPrizeWin;
};
