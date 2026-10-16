import "server-only";
import type { MemberId } from "@/core/members/contracts";

import { enqueueEmailNotification } from "@/core/notifications/server/email-service";

export function enqueueTicketGrantEmail(input: {
  recipientMemberId: MemberId;
  ticketBalanceLogId: number;
  ticketName: string;
  quantity: number;
  reason: string;
}) {
  enqueueEmailNotification({
    recipientMemberId: input.recipientMemberId,
    eventType: "ticket_grant",
    eventKey: String(input.ticketBalanceLogId),
    subject: `新的${input.ticketName}来啦`,
    heading: "新的幸运券来啦！",
    message: `你获得了 ${input.ticketName} × ${input.quantity}。\n${input.reason}`,
    actionLabel: "回小屋看看",
    actionPath: "/scratch",
  });
}
