import { handleAdminRequest } from "@/modules/scratch/server/admin-http";
import { getAdminOverview } from "@/modules/scratch/server/admin-service";

export const runtime = "nodejs";

export async function GET() {
  return handleAdminRequest(getAdminOverview);
}
