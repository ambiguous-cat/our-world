import {
  handleQuizRequest,
  quizRouteId,
  readQuizJson,
} from "@/modules/quiz/server/http";
import { submitQuiz } from "@/modules/quiz/server/service";
import { dispatchPendingEmailNotifications } from "@/core/notifications/server/email-service";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  return handleQuizRequest("player", async (session) => {
    const { id } = await params;
    const result = submitQuiz(session.memberId, quizRouteId(id), await readQuizJson(request));
    after(dispatchPendingEmailNotifications);
    return result;
  });
}
import { after } from "next/server";
