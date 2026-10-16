import "server-only";

// PLAYER_ANSWER 同时用于登录和登录后的玩家称呼。
export function getPlayerName() {
  const name = process.env.PLAYER_ANSWER?.trim();
  if (!name) throw new Error("缺少必需的环境变量：PLAYER_ANSWER");
  return name;
}
