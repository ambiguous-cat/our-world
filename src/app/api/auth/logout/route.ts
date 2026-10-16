import { NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/core/auth/session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  const cookieOptions = sessionCookieOptions();

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...cookieOptions,
    maxAge: 0,
  });
  // 清理由旧版根路径配置签发的会话，避免升级后退出仍恢复旧会话。
  if (cookieOptions.path !== "/") {
    response.headers.append(
      "Set-Cookie",
      [
        `${SESSION_COOKIE_NAME}=`,
        "Path=/",
        "Max-Age=0",
        "HttpOnly",
        "SameSite=Lax",
        cookieOptions.secure ? "Secure" : "",
      ]
        .filter(Boolean)
        .join("; "),
    );
  }

  return response;
}
