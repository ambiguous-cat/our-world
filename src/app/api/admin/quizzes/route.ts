import { getAdminQuizWorkspace, createQuiz } from "@/modules/quiz/server/service";
import { handleQuizRequest, readQuizJson } from "@/modules/quiz/server/http";

export const runtime = "nodejs";

export async function GET() {
  return handleQuizRequest("admin", getAdminQuizWorkspace);
}

export async function POST(request: Request) {
  return handleQuizRequest("admin", async (session) => createQuiz(session.memberId, await readQuizJson(request)));
}
