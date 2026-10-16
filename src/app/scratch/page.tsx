import { redirect } from "next/navigation";

import { getSessionIdentity } from "@/core/auth/session";
import { getDefaultHomeNote } from "@/core/site-settings/service";
import LuckyClub from "@/modules/scratch/components/lucky-club";
import { getPlayerBalanceHistory } from "@/modules/scratch/server/balance-service";
import { getPlayerCollection } from "@/modules/scratch/server/collection-service";
import { getPlayerTicketSummary } from "@/modules/scratch/server/draw-service";

export const dynamic = "force-dynamic";

export default async function ScratchPage() {
  const session = await getSessionIdentity();
  const role = session?.role;

  if (!session || !role) {
    redirect("/");
  }

  const initialTicketSummary =
    role === "player"
      ? getPlayerTicketSummary(session.memberId)
      : { tickets: [], totalTickets: 0, homeNote: getDefaultHomeNote() };
  const initialCollection = role === "player" ? getPlayerCollection(session.memberId) : null;
  const initialRecentTicketRewards =
    role === "player"
      ? getPlayerBalanceHistory(session.memberId, 1, 2)
      : {
          items: [],
          pagination: { page: 1, pageSize: 2, total: 0, totalPages: 1 },
        };

  return (
    <LuckyClub
      initialRole={role}
      initialTicketSummary={initialTicketSummary}
      initialCollection={initialCollection}
      initialRecentTicketRewards={initialRecentTicketRewards}
    />
  );
}
