export const ticketIconOptions = [
  { key: "ticket", icon: "🎟️", label: "奖券" },
  { key: "moon", icon: "🌙", label: "月亮" },
  { key: "heart", icon: "💗", label: "爱心" },
  { key: "star", icon: "⭐", label: "星星" },
  { key: "cake", icon: "🎂", label: "生日" },
  { key: "flower", icon: "🌸", label: "花朵" },
  { key: "gift", icon: "🎁", label: "礼物" },
  { key: "sparkles", icon: "✨", label: "闪光" },
] as const;

export type TicketIconKey = (typeof ticketIconOptions)[number]["key"];

export function isTicketIconKey(value: unknown): value is TicketIconKey {
  return ticketIconOptions.some((option) => option.key === value);
}

export function ticketIcon(value: TicketIconKey) {
  return ticketIconOptions.find((option) => option.key === value)?.icon ?? "🎟️";
}
