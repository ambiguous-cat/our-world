import type { HomeNote } from "@/core/site-settings/contracts";
import type { TicketIconKey } from "./ticket-icon";

export type PlayerTicket = {
  id: number;
  name: string;
  description: string;
  kind: "permanent" | "limited";
  displayIcon: TicketIconKey;
  balance: number;
  coverImagePath: string | null;
  drawBackgroundImagePath: string;
  themeColor: string;
  accentColor: string;
  scratchMaskColor: string;
  scratchTextColor: string;
  scratchPrompt: string;
  isDrawEnabled: boolean;
  archivedAt: string | null;
};

export type DrawApiResult =
  | {
      kind: "prize";
      title: string;
      description: string;
      image: string;
      icon: string;
      prizeWinId: number;
    }
  | {
      kind: "retry";
      title: string;
      description: string;
      image: string;
      icon: string;
      bonusTickets: number;
    }
  | {
      kind: "thanks";
      title: string;
      description: string;
      image: string;
      icon: string;
    };

export type DrawApiResponse = {
  drawRecordId: number;
  ticketTypeId: number;
  remainingTickets: number;
  result: DrawApiResult;
};

export type PlayerSummaryResponse = {
  tickets: PlayerTicket[];
  totalTickets: number;
  homeNote: HomeNote;
};
