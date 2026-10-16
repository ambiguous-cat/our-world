import {
  handleAdminRequest,
  readJsonBody,
} from "@/modules/scratch/server/admin-http";
import { saveProbabilityConfig } from "@/modules/scratch/server/admin-service";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  return handleAdminRequest(async () =>
    saveProbabilityConfig(await readJsonBody(request)),
  );
}
