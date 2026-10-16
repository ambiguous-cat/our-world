import type { Metadata } from "next";
import "./globals.css";
import { getSessionIdentity } from "@/core/auth/session";
import { getPlayerName } from "@/core/auth/player-name";
import { PlayerNameProvider } from "@/core/auth/player-name-context";

export const metadata: Metadata = {
  title: "Our World",
  description: "只属于我们的生活小世界",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionIdentity();
  const name = session ? getPlayerName() : "玩家";
  return <html lang="zh-CN"><body><PlayerNameProvider name={name}>{children}</PlayerNameProvider></body></html>;
}
