import type { SessionIdentity } from "@/core/auth/contracts";
import "server-only";

import { NextResponse } from "next/server";

import { getSessionIdentity } from "@/core/auth/session";
import type { SessionRole } from "@/core/auth/contracts";
import type { ApiErrorResponse } from "@/shared/http/contracts";
import { QuizServiceError } from "./error";

export async function readQuizJson(request: Request) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new QuizServiceError("INVALID_REQUEST", "提交的数据不是有效的 JSON");
  }
}

export function quizRouteId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new QuizServiceError("INVALID_ID", "题版编号无效");
  return id;
}

export async function handleQuizRequest<T>(
  role: SessionRole,
  operation: (session: SessionIdentity) => T | Promise<T>,
) {
  const session = await getSessionIdentity();
  if (!session || session.role !== role) {
    return NextResponse.json<ApiErrorResponse>(
      { code: "UNAUTHORIZED", message: "请先重新确认身份" },
      { status: 401 },
    );
  }
  try {
    return NextResponse.json(await operation(session));
  } catch (error) {
    if (error instanceof QuizServiceError) {
      return NextResponse.json<ApiErrorResponse>(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }
    console.error("答题模块操作失败", error);
    return NextResponse.json<ApiErrorResponse>(
      { code: "QUIZ_OPERATION_FAILED", message: "操作失败，请稍后再试" },
      { status: 500 },
    );
  }
}
