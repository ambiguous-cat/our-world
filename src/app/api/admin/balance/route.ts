import {
  handleAdminRequest,
  readJsonBody,
} from "@/modules/scratch/server/admin-http";
import { adjustPlayerBalance } from "@/modules/scratch/server/admin-service";
import { dispatchPendingEmailNotifications } from "@/core/notifications/server/email-service";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  return handleAdminRequest(async (session) => {
    const result = adjustPlayerBalance(session.memberId, await readJsonBody(request));
    after(dispatchPendingEmailNotifications);
    return result;
  });
}
import { after } from "next/server";
