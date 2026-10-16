import type { SessionIdentity } from "@/core/auth/contracts";
import "server-only";

import { NextResponse } from "next/server";

import { getSessionIdentity } from "@/core/auth/session";
import type { ApiErrorResponse } from "@/shared/http/contracts";
import { AdminServiceError } from "./admin-error";

export async function readJsonBody(request: Request) {
  try {
    return (await request.json()) as unknown;
  } catch {
    throw new AdminServiceError(
      "INVALID_REQUEST",
      "提交的数据不是有效的 JSON",
    );
  }
}

export async function readFormDataBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 6 * 1024 * 1024) {
    throw new AdminServiceError("REQUEST_TOO_LARGE", "上传内容不能超过 6 MB", 413);
  }

  try {
    return await request.formData();
  } catch {
    throw new AdminServiceError(
      "INVALID_REQUEST",
      "上传内容不是有效的表单数据",
    );
  }
}

export async function handleAdminRequest<T>(
  operation: (session: SessionIdentity) => T | Promise<T>,
) {
  const session = await getSessionIdentity();
  if (!session || session.role !== "admin") {
    return NextResponse.json<ApiErrorResponse>(
      { code: "UNAUTHORIZED", message: "请先重新确认管理员身份" },
      { status: 401 },
    );
  }

  try {
    return NextResponse.json(await operation(session));
  } catch (error) {
    if (error instanceof AdminServiceError) {
      return NextResponse.json<ApiErrorResponse>(
        { code: error.code, message: error.message },
        { status: error.status },
      );
    }

    console.error("管理员操作失败", error);
    return NextResponse.json<ApiErrorResponse>(
      { code: "ADMIN_OPERATION_FAILED", message: "操作失败，请稍后再试" },
      { status: 500 },
    );
  }
}

export function numericRouteId(value: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AdminServiceError("INVALID_ID", "记录编号无效");
  }
  return id;
}
