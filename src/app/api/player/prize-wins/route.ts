import { NextResponse } from "next/server";

import { getSessionIdentity } from "@/core/auth/session";
import {
  CollectionServiceError,
  getPlayerCollection,
} from "@/modules/scratch/server/collection-service";
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

  try {
    return NextResponse.json(getPlayerCollection(session.memberId));
  } catch (error) {
    if (error instanceof CollectionServiceError) {
      return NextResponse.json<ApiErrorResponse>(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }

    console.error("读取玩家收藏失败", error);
    return NextResponse.json<ApiErrorResponse>(
      {
        code: "COLLECTION_LOAD_FAILED",
        message: "飞鼠暂时没能找到礼物收藏，请稍后再试～",
      },
      { status: 500 },
    );
  }
}
