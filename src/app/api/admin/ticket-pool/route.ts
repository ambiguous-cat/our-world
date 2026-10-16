import { handleAdminRequest, readJsonBody } from "@/modules/scratch/server/admin-http";
import { addTicketPoolItem } from "@/modules/scratch/server/admin-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleAdminRequest(async () =>
    addTicketPoolItem(await readJsonBody(request)),
  );
}
