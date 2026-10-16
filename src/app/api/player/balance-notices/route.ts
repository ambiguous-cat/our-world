import { NextResponse } from "next/server";

import { getSessionIdentity } from "@/core/auth/session";
import {
  acknowledgeBalanceNotices,
  getPendingBalanceNotices,
  PlayerBalanceError,
} from "@/modules/scratch/server/balance-service";
import type { ApiErrorResponse } from "@/shared/http/contracts";

export const runtime = "nodejs";

async function requirePlayer() {
  const session = await getSessionIdentity();
  return session?.role === "player" ? session : null;
}

export async function GET() {
  const session = await requirePlayer();
  if (!session) {
    return NextResponse.json<ApiErrorResponse>(
      { code: "UNAUTHORIZED", message: "请先回到小屋重新确认身份～" },
      { status: 401 },
    );
  }

  try {
    return NextResponse.json(getPendingBalanceNotices(session.memberId));
  } catch (error) {
    console.error("读取玩家奖励提示失败", error);
    return NextResponse.json<ApiErrorResponse>(
      { code: "BALANCE_NOTICES_FAILED", message: "暂时没能读取奖励消息～" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const session = await requirePlayer();
  if (!session) {
    return NextResponse.json<ApiErrorResponse>(
      { code: "UNAUTHORIZED", message: "请先回到小屋重新确认身份～" },
      { status: 401 },
    );
  }

  try {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      throw new PlayerBalanceError(
        "INVALID_REQUEST",
        "提交的数据不是有效的 JSON",
      );
    }
    return NextResponse.json(acknowledgeBalanceNotices(session.memberId, input));
  } catch (error) {
    if (error instanceof PlayerBalanceError) {
      return NextResponse.json<ApiErrorResponse>(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    console.error("确认玩家奖励提示失败", error);
    return NextResponse.json<ApiErrorResponse>(
      { code: "BALANCE_NOTICE_ACK_FAILED", message: "暂时没能确认奖励消息～" },
      { status: 500 },
    );
  }
}
