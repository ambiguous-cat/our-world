import {
  handleAdminRequest,
  numericRouteId,
  readJsonBody,
} from "@/modules/scratch/server/admin-http";
import { adjustPrizeStock } from "@/modules/scratch/server/admin-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  return handleAdminRequest(async (session) => {
    const { id } = await context.params;
    return adjustPrizeStock(session.memberId,
      numericRouteId(id),
      await readJsonBody(request),
    );
  });
}
