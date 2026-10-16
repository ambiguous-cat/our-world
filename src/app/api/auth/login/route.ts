import { NextResponse } from "next/server";
import { memberForRole } from "@/core/members/server/members";

import {
  checkLoginRateLimit,
  clearLoginFailures,
  recordLoginFailure,
} from "@/core/auth/login-rate-limit";
import {
  createSessionToken,
  identifyRole,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/core/auth/session";

const LOGIN_FAILURE_MESSAGE = "暗号好像不对，再想一想呀～";
const LOGIN_RATE_LIMIT_MESSAGE = "尝试次数太多，请稍后再试～";

function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      message: LOGIN_RATE_LIMIT_MESSAGE,
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

export async function POST(request: Request) {
  const currentLimit = checkLoginRateLimit();

  if (currentLimit.limited) {
    return rateLimitedResponse(currentLimit.retryAfterSeconds);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "请求格式不正确" },
      { status: 400 },
    );
  }

  const answer =
    typeof body === "object" &&
    body !== null &&
    "answer" in body &&
    typeof body.answer === "string"
      ? body.answer.trim()
      : "";

  if (!answer || answer.length > 128) {
    const failureLimit = recordLoginFailure();
    if (failureLimit.limited) {
      return rateLimitedResponse(failureLimit.retryAfterSeconds);
    }

    return NextResponse.json(
      { message: LOGIN_FAILURE_MESSAGE },
      { status: 401 },
    );
  }

  const role = identifyRole(answer);

  if (!role) {
    const failureLimit = recordLoginFailure();
    if (failureLimit.limited) {
      return rateLimitedResponse(failureLimit.retryAfterSeconds);
    }

    return NextResponse.json(
      { message: LOGIN_FAILURE_MESSAGE },
      { status: 401 },
    );
  }

  clearLoginFailures();
  const response = NextResponse.json(memberForRole(role));
  response.cookies.set(
    SESSION_COOKIE_NAME,
    createSessionToken(role),
    sessionCookieOptions(),
  );

  return response;
}
