import { handleAdminRequest, readJsonBody } from "@/modules/scratch/server/admin-http";
import {
  grantAdminPrize,
  getAdminRedemptions,
  readPagination,
} from "@/modules/scratch/server/admin-records";
import type { AdminRedemptionStatus } from "@/modules/scratch/contracts/admin";
import { AdminServiceError } from "@/modules/scratch/server/admin-error";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleAdminRequest(() => {
    const searchParams = new URL(request.url).searchParams;
    const rawStatus = searchParams.get("status") ?? "requested";
    if (
      rawStatus !== "all" &&
      rawStatus !== "unredeemed" &&
      rawStatus !== "requested" &&
      rawStatus !== "redeemed" &&
      rawStatus !== "revoked"
    ) {
      throw new AdminServiceError("INVALID_STATUS", "兑换状态筛选值无效");
    }
    const { page, pageSize } = readPagination(searchParams);
    return getAdminRedemptions(
      rawStatus as AdminRedemptionStatus | "all",
      page,
      pageSize,
    );
  });
}

export async function POST(request: Request) {
  return handleAdminRequest(async (session) => {
    return grantAdminPrize(session.memberId, await readJsonBody(request));
  });
}
