import {
  handleAdminRequest,
  numericRouteId,
  readJsonBody,
} from "@/modules/scratch/server/admin-http";
import { updateAdminRedemption } from "@/modules/scratch/server/admin-records";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  return handleAdminRequest(async (session) => {
    const { id } = await context.params;
    return updateAdminRedemption(session.memberId,
      numericRouteId(id),
      await readJsonBody(request),
    );
  });
}
