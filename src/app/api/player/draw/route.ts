import { NextResponse } from "next/server";

import { getSessionIdentity } from "@/core/auth/session";
import type { ApiErrorResponse } from "@/shared/http/contracts";
import { DrawServiceError, performDraw } from "@/modules/scratch/server/draw-service";

export const runtime = "nodejs";

const REQUEST_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const session = await getSessionIdentity();
  if (!session || session.role !== "player") {
    return NextResponse.json<ApiErrorResponse>(
      { code: "UNAUTHORIZED", message: "请先回到小屋重新确认身份～" },
      { status: 401 },
    );
  }

  let requestKey: string;
  let ticketTypeId: number;
  try {
    const body = (await request.json()) as {
      requestKey?: unknown;
      ticketTypeId?: unknown;
    };
    requestKey = typeof body.requestKey === "string" ? body.requestKey : "";
    ticketTypeId =
      typeof body.ticketTypeId === "number" ? body.ticketTypeId : 0;
  } catch {
    requestKey = "";
    ticketTypeId = 0;
  }

  if (
    !REQUEST_KEY_PATTERN.test(requestKey) ||
    !Number.isSafeInteger(ticketTypeId) ||
    ticketTypeId <= 0
  ) {
    return NextResponse.json<ApiErrorResponse>(
      { code: "INVALID_REQUEST", message: "这张刮奖券无效，请重新领取～" },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(performDraw(session.memberId, requestKey, ticketTypeId));
  } catch (error) {
    if (error instanceof DrawServiceError) {
      return NextResponse.json<ApiErrorResponse>(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }

    console.error("服务端抽奖失败", error);
    return NextResponse.json<ApiErrorResponse>(
      {
        code: "DRAW_FAILED",
        message: "奖券出错了，快去找管理员大人修一修吧～",
      },
      { status: 500 },
    );
  }
}
