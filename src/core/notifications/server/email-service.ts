import { MEMBER_IDS, type MemberId } from "@/core/members/contracts";
import "server-only";

import { and, asc, eq, isNull, lte, or } from "drizzle-orm";

import { db, schema } from "@/db";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SEND_BATCH_SIZE = 10;
const MAX_ERROR_LENGTH = 1000;

type EmailNotificationInput = {
  recipientMemberId: MemberId;
  eventType: string;
  eventKey: string;
  subject: string;
  heading: string;
  message: string;
  actionLabel: string;
  actionPath: `/${string}`;
};

type EmailRuntimeConfig = {
  apiKey: string;
  fromAddress: string;
  fromName: string;
  recipient: string;
  publicUrl: string;
  replyTo?: string;
};

let activeDispatch: Promise<void> | null = null;

function trimmedEnvironmentValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function emailNotificationsEnabled() {
  return trimmedEnvironmentValue("EMAIL_NOTIFICATIONS_ENABLED").toLowerCase() === "true";
}

function runtimeConfig(): EmailRuntimeConfig | null {
  if (!emailNotificationsEnabled()) return null;
  const apiKey = trimmedEnvironmentValue("RESEND_API_KEY");
  const fromAddress = trimmedEnvironmentValue("EMAIL_FROM_ADDRESS");
  const fromName = trimmedEnvironmentValue("EMAIL_FROM_NAME");
  const recipient = trimmedEnvironmentValue("PLAYER_NOTIFICATION_EMAIL");
  const publicUrl = trimmedEnvironmentValue("OUR_WORLD_PUBLIC_URL").replace(/\/+$/, "");
  const replyTo = trimmedEnvironmentValue("EMAIL_REPLY_TO");
  if (!apiKey || !fromAddress || !fromName || !recipient || !publicUrl) {
    console.error("邮件通知已启用，但 Resend 邮件环境变量配置不完整");
    return null;
  }
  try {
    const url = new URL(publicUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error("invalid protocol");
  } catch {
    console.error("OUR_WORLD_PUBLIC_URL 不是有效的 HTTP/HTTPS 地址");
    return null;
  }
  return {
    apiKey,
    fromAddress,
    fromName,
    recipient,
    publicUrl,
    replyTo: replyTo || undefined,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

function emailHtml(
  item: typeof schema.notificationEmailOutbox.$inferSelect,
  actionUrl: string,
) {
  return `<!doctype html>
<html lang="zh-CN"><body style="margin:0;background:#fff4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;color:#55495f">
  <div style="max-width:560px;margin:0 auto;padding:36px 18px">
    <div style="border:3px solid #fff;border-radius:28px;background:#fffdf9;padding:34px 28px;box-shadow:0 12px 34px rgba(93,67,98,.13)">
      <p style="margin:0 0 8px;color:#f06f9c;font-size:12px;font-weight:800;letter-spacing:.12em">OUR LITTLE WORLD</p>
      <h1 style="margin:0 0 18px;font-size:28px;line-height:1.35">${escapeHtml(item.heading)}</h1>
      <p style="margin:0;color:#756a7a;font-size:16px;line-height:1.8;white-space:pre-wrap">${escapeHtml(item.message)}</p>
      <p style="margin:28px 0 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#ef79a2;color:#fff;text-decoration:none;font-weight:800">${escapeHtml(item.actionLabel)}</a></p>
    </div>
    <p style="margin:18px 0 0;text-align:center;color:#a191a5;font-size:12px">来自只属于我们的生活小屋</p>
  </div>
</body></html>`;
}

export function enqueueEmailNotification(input: EmailNotificationInput) {
  if (!emailNotificationsEnabled()) return;
  if (input.recipientMemberId !== MEMBER_IDS.first) throw new Error("当前业务仅支持玩家邮件通知");
  db.insert(schema.notificationEmailOutbox)
    .values(input)
    .onConflictDoNothing({
      target: [
        schema.notificationEmailOutbox.eventType,
        schema.notificationEmailOutbox.eventKey,
      ],
    })
    .run();
}

function retryDelayMilliseconds(attemptCount: number) {
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** Math.min(attemptCount, 7));
}

async function sendPendingBatch() {
  const config = runtimeConfig();
  if (!config) return;
  const now = new Date();
  const pending = db
    .select()
    .from(schema.notificationEmailOutbox)
    .where(
      and(
        eq(schema.notificationEmailOutbox.recipientMemberId, MEMBER_IDS.first),
        isNull(schema.notificationEmailOutbox.sentAt),
        or(
          isNull(schema.notificationEmailOutbox.nextAttemptAt),
          lte(schema.notificationEmailOutbox.nextAttemptAt, now),
        ),
      ),
    )
    .orderBy(asc(schema.notificationEmailOutbox.id))
    .limit(SEND_BATCH_SIZE)
    .all();

  for (const item of pending) {
    const actionUrl = `${config.publicUrl}${item.actionPath}`;
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `${item.eventType}:${item.eventKey}`.slice(0, 256),
        },
        body: JSON.stringify({
          from: `${config.fromName} <${config.fromAddress}>`,
          to: [config.recipient],
          reply_to: config.replyTo,
          subject: item.subject,
          html: emailHtml(item, actionUrl),
          text: `${item.heading}\n\n${item.message}\n\n${item.actionLabel}：${actionUrl}`,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
      };
      if (!response.ok || !payload.id) {
        throw new Error(payload.message || `Resend 返回 HTTP ${response.status}`);
      }
      db.update(schema.notificationEmailOutbox)
        .set({
          attemptCount: item.attemptCount + 1,
          lastAttemptAt: new Date(),
          nextAttemptAt: null,
          lastError: null,
          providerEmailId: payload.id,
          sentAt: new Date(),
        })
        .where(
          and(
            eq(schema.notificationEmailOutbox.id, item.id),
            isNull(schema.notificationEmailOutbox.sentAt),
          ),
        )
        .run();
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知邮件发送错误";
      db.update(schema.notificationEmailOutbox)
        .set({
          attemptCount: item.attemptCount + 1,
          lastAttemptAt: new Date(),
          nextAttemptAt: new Date(Date.now() + retryDelayMilliseconds(item.attemptCount)),
          lastError: message.slice(0, MAX_ERROR_LENGTH),
        })
        .where(
          and(
            eq(schema.notificationEmailOutbox.id, item.id),
            isNull(schema.notificationEmailOutbox.sentAt),
          ),
        )
        .run();
      console.error(`邮件通知发送失败（${item.eventType}:${item.eventKey}）`, message);
    }
  }
}

export async function dispatchPendingEmailNotifications() {
  if (!emailNotificationsEnabled()) return;
  if (!activeDispatch) {
    activeDispatch = sendPendingBatch().finally(() => {
      activeDispatch = null;
    });
  }
  await activeDispatch;
}
