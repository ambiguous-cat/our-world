import "server-only";

import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { cookies } from "next/headers";

import type { SessionIdentity, SessionRole } from "./contracts";
import { memberForRole } from "@/core/members/server/members";
import { APP_BASE_PATH } from "@/shared/routing/app-path";

export type { SessionRole } from "./contracts";

export const SESSION_COOKIE_NAME = "our_world_session";

type SessionPayload = SessionIdentity & {
  version: 2;
};

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`缺少必需的环境变量：${name}`);
  }

  return value;
}

function sessionSecret() {
  const secret = requiredEnvironmentValue("AUTH_SESSION_SECRET");

  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("AUTH_SESSION_SECRET 至少需要 32 字节");
  }

  return secret;
}

function signatureFor(encodedPayload: string) {
  return createHmac("sha256", sessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function safelyEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left, "utf8").digest();
  const rightDigest = createHash("sha256").update(right, "utf8").digest();

  return timingSafeEqual(leftDigest, rightDigest);
}

export function identifyRole(answer: string): SessionRole | null {
  const playerAnswer = requiredEnvironmentValue("PLAYER_ANSWER");
  const adminAnswer = requiredEnvironmentValue("ADMIN_ANSWER");

  if (safelyEqual(answer, playerAnswer)) {
    return "player";
  }

  if (safelyEqual(answer, adminAnswer)) {
    return "admin";
  }

  return null;
}

export function createSessionToken(role: SessionRole) {
  const payload: SessionPayload = { version: 2, ...memberForRole(role) };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );

  return `${encodedPayload}.${signatureFor(encodedPayload)}`;
}

export function verifySessionIdentity(token: string): SessionIdentity | null {
  const parts = token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, suppliedSignature] = parts;
  const expectedSignature = signatureFor(encodedPayload);

  if (!safelyEqual(suppliedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as unknown;

    if (
      typeof payload !== "object" || payload === null ||
      !("version" in payload) || !("role" in payload) ||
      (payload.role !== "player" && payload.role !== "admin")
    ) {
      return null;
    }

    const member = memberForRole(payload.role);
    // 兼容旧的已签名角色会话；重新登录后签发 v2。
    if (payload.version === 1) return { ...member };
    if (
      payload.version !== 2 || !("memberId" in payload) ||
      payload.memberId !== member.memberId
    ) return null;

    return { ...member };
  } catch {
    return null;
  }
}

export function verifySessionToken(token: string): SessionRole | null {
  return verifySessionIdentity(token)?.role ?? null;
}

export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return token ? verifySessionIdentity(token) : null;
}

export async function getSessionRole() {
  return (await getSessionIdentity())?.role ?? null;
}

export async function hasSessionRole(requiredRole: SessionRole) {
  return (await getSessionRole()) === requiredRole;
}

export function sessionCookieOptions() {
  const secureValue = (
    process.env.AUTH_COOKIE_SECURE ?? "false"
  ).trim().toLowerCase();

  if (secureValue !== "true" && secureValue !== "false") {
    throw new Error("AUTH_COOKIE_SECURE 只能设置为 true 或 false");
  }

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: secureValue === "true",
    path: APP_BASE_PATH || "/",
  };
}
