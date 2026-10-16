import { changeQuizStatus, saveQuiz } from "@/modules/quiz/server/service";
import { dispatchPendingEmailNotifications } from "@/core/notifications/server/email-service";
import {
  handleQuizRequest,
  quizRouteId,
  readQuizJson,
} from "@/modules/quiz/server/http";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  return handleQuizRequest("admin", async () => {
    const { id } = await params;
    return saveQuiz(quizRouteId(id), await readQuizJson(request));
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return handleQuizRequest("admin", async (session) => {
    const { id } = await params;
    const result = changeQuizStatus(session.memberId, quizRouteId(id), await readQuizJson(request));
    after(dispatchPendingEmailNotifications);
    return result;
  });
}
import { after } from "next/server";
