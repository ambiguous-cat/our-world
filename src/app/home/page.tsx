import { redirect } from "next/navigation";
import { after } from "next/server";

import { getSessionIdentity } from "@/core/auth/session";
import { dispatchPendingEmailNotifications } from "@/core/notifications/server/email-service";
import { getHomeNote } from "@/core/site-settings/service";
import { getPendingBalanceNotices } from "@/modules/scratch/server/balance-service";
import { getPendingQuizPublishNotices } from "@/modules/quiz/server/notice-service";
import type { HomeNotification } from "./home-notifications";

import { HomeScreen } from "./home-screen";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSessionIdentity();
  const role = session?.role;

  if (!session || !role) {
    redirect("/");
  }

  after(dispatchPendingEmailNotifications);

  const notifications: HomeNotification[] = role === "player"
    ? [
        ...getPendingBalanceNotices(session.memberId).notices.map((notice) => ({
          type: "ticket_grant" as const,
          id: notice.ticketBalanceLogId,
          title: `${notice.ticketName} × ${notice.delta}`,
          description: notice.reason,
          createdAt: notice.createdAt,
        })),
        ...getPendingQuizPublishNotices(session.memberId).notices.map((notice) => ({
          type: "quiz_published" as const,
          id: notice.quizId,
          title: notice.title,
          description: notice.description || "新的挑战已经准备好，等你来答题～",
          createdAt: notice.createdAt,
        })),
      ].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    : [];

  return (
    <HomeScreen
      role={role}
      homeNote={getHomeNote()}
      initialNotifications={notifications}
    />
  );
}
