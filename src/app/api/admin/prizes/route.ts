import {
  handleAdminRequest,
  readJsonBody,
} from "@/modules/scratch/server/admin-http";
import { createPrize } from "@/modules/scratch/server/admin-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleAdminRequest(async (session) =>
    createPrize(session.memberId, await readJsonBody(request)),
  );
}
