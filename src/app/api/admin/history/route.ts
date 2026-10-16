import type { AdminHistoryType } from "@/modules/scratch/contracts/admin";
import { handleAdminRequest } from "@/modules/scratch/server/admin-http";
import { getAdminHistory, readPagination } from "@/modules/scratch/server/admin-records";
import { AdminServiceError } from "@/modules/scratch/server/admin-error";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleAdminRequest(() => {
    const searchParams = new URL(request.url).searchParams;
    const rawType = searchParams.get("type") ?? "draws";
    if (
      rawType !== "draws" &&
      rawType !== "balance" &&
      rawType !== "stock"
    ) {
      throw new AdminServiceError("INVALID_HISTORY_TYPE", "历史记录类型无效");
    }
    const { page, pageSize } = readPagination(searchParams);
    return getAdminHistory(rawType as AdminHistoryType, page, pageSize);
  });
}
