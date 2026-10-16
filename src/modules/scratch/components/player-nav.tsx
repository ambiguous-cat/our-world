import type { PlayerScreen } from "./data";

export function PlayerBottomNav({
  active,
  onNavigate,
}: {
  active: PlayerScreen;
  onNavigate: (screen: PlayerScreen) => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="玩家页面导航">
      <button
        className={active === "home" ? "active" : ""}
        onClick={() => onNavigate("home")}
        aria-current={active === "home" ? "page" : undefined}
      >
        🏡<span>概览</span>
      </button>
      <button
        className={active === "game" ? "active" : ""}
        onClick={() => onNavigate("game")}
        aria-current={active === "game" ? "page" : undefined}
      >
        🎟️<span>刮奖</span>
      </button>
      <button
        className={active === "collection" ? "active" : ""}
        onClick={() => onNavigate("collection")}
        aria-current={active === "collection" ? "page" : undefined}
      >
        🎀<span>礼物</span>
      </button>
    </nav>
  );
}
