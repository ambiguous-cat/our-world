import { handleAdminRequest, readJsonBody } from "@/modules/scratch/server/admin-http";
import { createTicketType } from "@/modules/scratch/server/admin-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleAdminRequest(async () =>
    createTicketType(await readJsonBody(request)),
  );
}
