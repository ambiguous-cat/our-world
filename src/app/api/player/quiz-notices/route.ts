import { NextResponse } from "next/server";

import { getSessionIdentity } from "@/core/auth/session";
import type { ApiErrorResponse } from "@/shared/http/contracts";
import { QuizServiceError } from "@/modules/quiz/server/error";
import {
  acknowledgeQuizPublishNotices,
  getPendingQuizPublishNotices,
} from "@/modules/quiz/server/notice-service";

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
  return NextResponse.json(getPendingQuizPublishNotices(session.memberId));
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
      throw new QuizServiceError("INVALID_REQUEST", "提交的数据不是有效的 JSON");
    }
    return NextResponse.json(acknowledgeQuizPublishNotices(session.memberId, input));
  } catch (error) {
    if (error instanceof QuizServiceError) {
      return NextResponse.json<ApiErrorResponse>(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    console.error("确认答题发布消息失败", error);
    return NextResponse.json<ApiErrorResponse>(
      { code: "QUIZ_NOTICE_ACK_FAILED", message: "暂时没能确认答题消息～" },
      { status: 500 },
    );
  }
}
