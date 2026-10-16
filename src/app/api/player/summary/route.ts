import { NextResponse } from "next/server";

import { getSessionIdentity } from "@/core/auth/session";
import type { PlayerSummaryResponse } from "@/modules/scratch/contracts/draw";
import { getPlayerTicketSummary } from "@/modules/scratch/server/draw-service";
import type { ApiErrorResponse } from "@/shared/http/contracts";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSessionIdentity();
  if (!session || session.role !== "player") {
    return NextResponse.json<ApiErrorResponse>(
      { code: "UNAUTHORIZED", message: "请先回到小屋重新确认身份～" },
      { status: 401 },
    );
  }

  return NextResponse.json<PlayerSummaryResponse>(getPlayerTicketSummary(session.memberId));
}
