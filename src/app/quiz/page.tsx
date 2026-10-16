import { redirect } from "next/navigation";

import { getSessionIdentity } from "@/core/auth/session";
import { QuizScreen } from "@/modules/quiz/components/quiz-screen";
import {
  getAdminQuizWorkspace,
  getPlayerQuizWorkspace,
} from "@/modules/quiz/server/service";

export const dynamic = "force-dynamic";

export default async function QuizPage() {
  const session = await getSessionIdentity();
  const role = session?.role;
  if (!session || !role) redirect("/");
  return role === "admin" ? (
    <QuizScreen role="admin" initialData={getAdminQuizWorkspace()} />
  ) : (
    <QuizScreen role="player" initialData={getPlayerQuizWorkspace(session.memberId)} />
  );
}
