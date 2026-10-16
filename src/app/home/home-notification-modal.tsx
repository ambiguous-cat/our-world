"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { withBasePath } from "@/shared/routing/app-path";
import type { ApiErrorResponse } from "@/shared/http/contracts";
import type { HomeNotification } from "./home-notifications";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function acknowledge(items: HomeNotification[]) {
  const ticketIds = items
    .filter((item) => item.type === "ticket_grant")
    .map((item) => item.id);
  const quizIds = items
    .filter((item) => item.type === "quiz_published")
    .map((item) => item.id);
  const requests: Promise<Response>[] = [];
  if (ticketIds.length) {
    requests.push(
      fetch(withBasePath("/api/player/balance-notices"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketBalanceLogIds: ticketIds }),
      }),
    );
  }
  if (quizIds.length) {
    requests.push(
      fetch(withBasePath("/api/player/quiz-notices"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizIds }),
      }),
    );
  }
  const responses = await Promise.all(requests);
  for (const response of responses) {
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as Partial<ApiErrorResponse>;
      throw new Error(payload.message || "暂时没能收好消息～");
    }
  }
}

export function HomeNotificationModal({
  initialNotifications,
  onNotificationsChange,
}: {
  initialNotifications: HomeNotification[];
  onNotificationsChange: (notifications: HomeNotification[]) => void;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (!notifications.length) return null;

  const updateNotifications = (next: HomeNotification[]) => {
    setNotifications(next);
    onNotificationsChange(next);
  };

  const openNotification = async (notification: HomeNotification) => {
    if (busyId !== null) return;
    const notificationKey = `${notification.type}-${notification.id}`;
    setBusyId(notificationKey);
    setError("");
    try {
      await acknowledge([notification]);
      updateNotifications(notifications.filter((item) => item !== notification));
      router.push(notification.type === "ticket_grant" ? "/scratch" : "/quiz");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时没能收好消息～");
      setBusyId(null);
    }
  };

  const acknowledgeAll = async () => {
    if (busyId !== null) return;
    setBusyId("all");
    setError("");
    try {
      await acknowledge(notifications);
      updateNotifications([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时没能收好消息～");
      setBusyId(null);
    }
  };

  return (
    <div className="world-notification-backdrop" role="presentation">
      <section
        className="world-notification-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="world-notification-title"
      >
        <span className="world-notification-icon" aria-hidden="true">💌</span>
        <p className="eyebrow">LITTLE WORLD NEWS</p>
        <h2 id="world-notification-title">小屋有新消息啦！</h2>
        <p className="world-notification-intro">飞鼠把刚刚发生的小惊喜都收在这里了。</p>
        <div className="world-notification-list">
          {notifications.map((notification) => (
            <article
              className={notification.type === "ticket_grant" ? "ticket" : "quiz"}
              key={`${notification.type}-${notification.id}`}
            >
              <span aria-hidden="true">
                {notification.type === "ticket_grant" ? "🎟️" : "📝"}
              </span>
              <div>
                <small>
                  {notification.type === "ticket_grant" ? "新的幸运券" : "新的答题挑战"}
                </small>
                <strong>{notification.title}</strong>
                <p>{notification.description}</p>
                <time>{formatTime(notification.createdAt)}</time>
              </div>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void openNotification(notification)}
              >
                {busyId === `${notification.type}-${notification.id}`
                  ? "正在前往…"
                  : notification.type === "ticket_grant"
                    ? "去刮奖"
                    : "去答题"}
              </button>
            </article>
          ))}
        </div>
        {error && <p className="world-notification-error" role="alert">{error}</p>}
        <button
          className="world-notification-acknowledge"
          type="button"
          disabled={busyId !== null}
          onClick={() => void acknowledgeAll()}
        >
          {busyId === "all" ? "正在收好…" : "都知道啦"}
        </button>
      </section>
    </div>
  );
}
