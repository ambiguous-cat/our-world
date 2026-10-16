import { NextResponse } from "next/server";

import { getSessionIdentity } from "@/core/auth/session";
import type { RedemptionMutationResponse } from "@/modules/scratch/contracts/collection";
import {
  cancelPrizeRedemption,
  CollectionServiceError,
  requestPrizeRedemption,
} from "@/modules/scratch/server/collection-service";
import type { ApiErrorResponse } from "@/shared/http/contracts";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function authorizeAndReadId(context: RouteContext) {
  const session = await getSessionIdentity();
  if (!session || session.role !== "player") {
    return {
      response: NextResponse.json<ApiErrorResponse>(
        { code: "UNAUTHORIZED", message: "请先回到小屋重新确认身份～" },
        { status: 401 },
      ),
    };
  }

  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    return {
      response: NextResponse.json<ApiErrorResponse>(
        { code: "INVALID_PRIZE_WIN_ID", message: "这份礼物的编号无效～" },
        { status: 400 },
      ),
    };
  }

  return { prizeWinId: Number(id), memberId: session.memberId };
}

function mutationResponse(
  operation: () => RedemptionMutationResponse,
  fallbackMessage: string,
) {
  try {
    return NextResponse.json(operation());
  } catch (error) {
    if (error instanceof CollectionServiceError) {
      return NextResponse.json<ApiErrorResponse>(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }

    console.error(fallbackMessage, error);
    return NextResponse.json<ApiErrorResponse>(
      {
        code: "REDEMPTION_UPDATE_FAILED",
        message: "飞鼠暂时没能记下这次操作，请稍后再试～",
      },
      { status: 500 },
    );
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const authorized = await authorizeAndReadId(context);
  if ("response" in authorized) return authorized.response;

  return mutationResponse(
    () => requestPrizeRedemption(authorized.memberId, authorized.prizeWinId),
    "玩家申请兑换失败",
  );
}

export async function DELETE(_request: Request, context: RouteContext) {
  const authorized = await authorizeAndReadId(context);
  if ("response" in authorized) return authorized.response;

  return mutationResponse(
    () => cancelPrizeRedemption(authorized.memberId, authorized.prizeWinId),
    "玩家取消兑换申请失败",
  );
}
