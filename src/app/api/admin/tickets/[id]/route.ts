import {
  handleAdminRequest,
  numericRouteId,
  readJsonBody,
} from "@/modules/scratch/server/admin-http";
import {
  archiveTicketType,
  updateTicketType,
} from "@/modules/scratch/server/admin-service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  return handleAdminRequest(async () => {
    const { id } = await context.params;
    return updateTicketType(
      numericRouteId(id),
      await readJsonBody(request),
    );
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  return handleAdminRequest(async () => {
    const { id } = await context.params;
    return archiveTicketType(numericRouteId(id));
  });
}
