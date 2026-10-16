import { NextResponse } from "next/server";

import { getSessionIdentity } from "@/core/auth/session";
import {
  getPlayerBalanceHistory,
  PlayerBalanceError,
  readPlayerBalancePagination,
} from "@/modules/scratch/server/balance-service";
import type { ApiErrorResponse } from "@/shared/http/contracts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getSessionIdentity();
  if (!session || session.role !== "player") {
    return NextResponse.json<ApiErrorResponse>(
      { code: "UNAUTHORIZED", message: "请先回到小屋重新确认身份～" },
      { status: 401 },
    );
  }

  try {
    const pagination = readPlayerBalancePagination(
      new URL(request.url).searchParams,
    );
    return NextResponse.json(
      getPlayerBalanceHistory(session.memberId, pagination.page, pagination.pageSize),
    );
  } catch (error) {
    if (error instanceof PlayerBalanceError) {
      return NextResponse.json<ApiErrorResponse>(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    console.error("读取玩家次数记录失败", error);
    return NextResponse.json<ApiErrorResponse>(
      { code: "BALANCE_HISTORY_FAILED", message: "暂时没能读取次数记录～" },
      { status: 500 },
    );
  }
}
