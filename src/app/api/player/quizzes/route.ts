import { handleQuizRequest } from "@/modules/quiz/server/http";
import { getPlayerQuizWorkspace } from "@/modules/quiz/server/service";

export const runtime = "nodejs";

export async function GET() {
  return handleQuizRequest("player", (session) => getPlayerQuizWorkspace(session.memberId));
}
