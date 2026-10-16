import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
} from "react";
import type { PlayerTicket } from "@/modules/scratch/contracts/draw";
import { ticketIcon } from "@/modules/scratch/contracts/ticket-icon";
import type { DrawResult, PlayerScreen } from "./data";
import { resultMeta } from "./data";
import { PlayerBottomNav } from "./player-nav";
import { withBasePath } from "@/shared/routing/app-path";

function ScratchCanvas({
  interactive = true,
  onReveal,
  resetKey,
  ticket,
}: {
  interactive?: boolean;
  onReveal?: () => void;
  resetKey: number;
  ticket: PlayerTicket;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const revealedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const drawCover = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
      gradient.addColorStop(0, ticket.scratchMaskColor);
      gradient.addColorStop(0.52, ticket.scratchMaskColor);
      gradient.addColorStop(1, ticket.accentColor);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, rect.width, rect.height);

      ctx.globalAlpha = 0.2;
      ctx.fillStyle = "#ffffff";
      for (let x = -rect.height; x < rect.width; x += 18) {
        ctx.save();
        ctx.translate(x, 0);
        ctx.rotate(-0.35);
        ctx.fillRect(0, 0, 7, rect.height * 1.5);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      ctx.fillStyle = ticket.scratchTextColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const setFittedFont = (
        text: string,
        weight: number,
        preferredSize: number,
        minimumSize: number,
        maxWidth: number,
      ) => {
        let size = Math.max(minimumSize, preferredSize);
        ctx.font = `${weight} ${size}px "Microsoft YaHei", sans-serif`;
        while (size > minimumSize && ctx.measureText(text).width > maxWidth) {
          size -= 1;
          ctx.font = `${weight} ${size}px "Microsoft YaHei", sans-serif`;
        }
      };
      setFittedFont(
        ticket.name,
        800,
        Math.max(22, Math.min(34, rect.width * 0.1)),
        15,
        rect.width * 0.86,
      );
      ctx.fillText(ticket.name, rect.width / 2, rect.height * 0.4);
      ctx.globalAlpha = 0.9;
      setFittedFont(
        ticket.scratchPrompt,
        600,
        Math.max(15, Math.min(22, rect.width * 0.065)),
        11,
        rect.width * 0.9,
      );
      ctx.fillText(
        ticket.scratchPrompt,
        rect.width / 2,
        rect.height * 0.68,
      );
    };

    revealedRef.current = false;
    drawCover();
    const observer = new ResizeObserver(drawCover);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [resetKey, ticket]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const scratchTo = (point: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    const previous = lastPointRef.current;
    if (!canvas || !previous) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = canvas.width / rect.width;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(22, rect.width * 0.085);
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    ctx.restore();
    lastPointRef.current = point;
  };

  const checkProgress = () => {
    const canvas = canvasRef.current;
    if (!interactive || !canvas || revealedRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0;
    let sampled = 0;
    for (let i = 3; i < pixels.length; i += 4 * 16) {
      sampled += 1;
      if (pixels[i] < 40) transparent += 1;
    }
    if (transparent / sampled > 0.42) {
      revealedRef.current = true;
      onReveal?.();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className={`scratch-canvas ${interactive ? "" : "scratch-canvas-preview"}`}
      aria-hidden={!interactive}
      aria-label={
        interactive ? `用鼠标或手指刮开${ticket.name}` : undefined
      }
      onPointerDown={(event) => {
        if (!interactive) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drawingRef.current = true;
        lastPointRef.current = pointFromEvent(event);
      }}
      onPointerMove={(event) =>
        interactive &&
        drawingRef.current &&
        scratchTo(pointFromEvent(event))
      }
      onPointerUp={(event) => {
        if (!interactive) return;
        drawingRef.current = false;
        lastPointRef.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        checkProgress();
      }}
      onPointerCancel={() => {
        if (!interactive) return;
        drawingRef.current = false;
        lastPointRef.current = null;
      }}
    />
  );
}

function ResultModal({
  result,
  ticket,
  onClose,
  onNext,
}: {
  result: DrawResult;
  ticket: PlayerTicket;
  onClose: () => void;
  onNext: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className={`result-modal result-${result.kind}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        style={{ borderColor: ticket.accentColor }}
      >
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="关闭结果弹窗"
        >
          ×
        </button>
        <div className="result-image-wrap">
          <span className="result-ribbon">{resultMeta[result.kind].label}</span>
          <img src={withBasePath(result.image)} alt={result.title} />
        </div>
        <p className="eyebrow">{ticket.name}</p>
        <h2 id="result-title">
          <span>{result.icon}</span>
          {result.title}
        </h2>
        <p>{result.description}</p>
        <button className="primary-button modal-primary" onClick={onNext}>
          {result.kind === "prize" ? "收下并继续" : "再刮一张"}
        </button>
      </section>
    </div>
  );
}

type ScratchGameScreenProps = {
  tickets: PlayerTicket[];
  selectedTicket: PlayerTicket | null;
  currentResult: DrawResult | null;
  revealed: boolean;
  resultOpen: boolean;
  resetKey: number;
  isPreparingRound: boolean;
  roundError: string;
  onNavigate: (screen: PlayerScreen) => void;
  onEnterGame: () => void;
  onSelectTicket: (ticketTypeId: number | null) => void;
  onReveal: () => void;
  onContinue: () => void;
  onRetry: () => void;
  onStart: () => void;
  onOpenResult: () => void;
  onCloseResult: () => void;
};

export function ScratchGameScreen({
  tickets,
  selectedTicket,
  currentResult,
  revealed,
  resultOpen,
  resetKey,
  isPreparingRound,
  roundError,
  onNavigate,
  onEnterGame,
  onSelectTicket,
  onReveal,
  onContinue,
  onRetry,
  onStart,
  onOpenResult,
  onCloseResult,
}: ScratchGameScreenProps) {
  const navigate = (next: PlayerScreen) => {
    if (next === "game") onEnterGame();
    else onNavigate(next);
  };

  if (!selectedTicket) {
    const sortedTickets = [...tickets].sort(
      (left, right) =>
        Number(right.balance > 0) - Number(left.balance > 0),
    );
    return (
      <main className="app-shell game-screen ticket-wallet-screen">
        <nav className="topbar">
          <button className="back-link" onClick={() => onNavigate("home")}>
            ← 返回刮刮乐
          </button>
          <div className="brand">
            <span>✦</span> MY LUCKY TICKETS
          </div>
          <button
            className="collection-link"
            onClick={() => onNavigate("collection")}
          >
            🎀 我的收藏
          </button>
        </nav>
        <section className="game-heading ticket-wallet-heading">
          <p className="eyebrow">PICK YOUR LITTLE LUCK</p>
          <h1>
            今天想刮哪张<span>幸运券</span>？
          </h1>
          <p>每一种券，都藏着不一样的小惊喜。</p>
        </section>
        <section className="ticket-wallet">
          {sortedTickets.map((ticket) => (
            <button
              type="button"
              key={ticket.id}
              className={`ticket-wallet-card ${ticket.balance <= 0 ? "empty" : ""}`}
              style={{
                "--ticket-color": ticket.themeColor,
                "--ticket-accent": ticket.accentColor,
              } as React.CSSProperties}
              onClick={() => onSelectTicket(ticket.id)}
            >
              <span className="ticket-wallet-cover">
                {ticket.coverImagePath ? (
                  <img src={withBasePath(ticket.coverImagePath)} alt="" />
                ) : (
                  <span aria-hidden="true">{ticketIcon(ticket.displayIcon)}</span>
                )}
              </span>
              <span className="ticket-wallet-copy">
                <span className="ticket-wallet-badges">
                  {ticket.kind === "limited" && <i>限定</i>}
                  {!ticket.isDrawEnabled && <i>暂停刮奖</i>}
                </span>
                <strong>{ticket.name}</strong>
                <small>{ticket.description}</small>
              </span>
              <span className="ticket-wallet-count">
                <b>× {ticket.balance}</b>
                <small>{ticket.balance > 0 ? "去刮奖 →" : "暂时没有"}</small>
              </span>
            </button>
          ))}
          {tickets.length === 0 && (
            <div className="ticket-wallet-empty">
              <span>🎟️</span>
              <h2>券包还是空的</h2>
              <p>请管理员先创建并发放一张幸运券吧～</p>
            </div>
          )}
        </section>
        <PlayerBottomNav active="game" onNavigate={navigate} />
      </main>
    );
  }

  const canStart =
    selectedTicket.balance > 0 && selectedTicket.isDrawEnabled;

  return (
    <main
      className="app-shell game-screen themed-game-screen"
      style={{
        "--ticket-color": selectedTicket.themeColor,
        "--ticket-accent": selectedTicket.accentColor,
      } as React.CSSProperties}
    >
      <nav className="topbar">
        <button className="back-link" onClick={() => onSelectTicket(null)}>
          ← 我的奖券
        </button>
        <div className="brand">
          <span>✦</span> {selectedTicket.name}
        </div>
        <button
          className="collection-link"
          onClick={() => onNavigate("collection")}
        >
          🎀 我的收藏
        </button>
      </nav>
      <section className="game-heading">
        <p className="eyebrow">
          {selectedTicket.kind === "limited"
            ? "LIMITED LITTLE LUCK"
            : "TODAY'S LITTLE LUCK"}
        </p>
        <h1>{selectedTicket.name}</h1>
        <p>{selectedTicket.description}</p>
      </section>
      <section className="ticket-section themed-ticket-section">
        <div className="ticket-meta">
          <span>
            {ticketIcon(selectedTicket.displayIcon)}{" "}
            {selectedTicket.kind === "limited" ? "限定奖券" : "常驻奖券"}
          </span>
          <b>
            持有 <i>{selectedTicket.balance}</i> 张
          </b>
        </div>
        {currentResult ? (
          <>
            <div
              className={`scratch-board ${isPreparingRound ? "is-preparing" : ""}`}
              aria-busy={isPreparingRound}
            >
              <img
                src={withBasePath(selectedTicket.drawBackgroundImagePath)}
                alt={`${selectedTicket.name}刮奖背景`}
                draggable={false}
              />
              <div className={`prize-reveal reveal-${currentResult.kind}`}>
                <small>{resultMeta[currentResult.kind].label}</small>
                <strong>{currentResult.title}</strong>
                <span>{currentResult.icon}</span>
              </div>
              <ScratchCanvas
                interactive={!isPreparingRound}
                onReveal={onReveal}
                resetKey={resetKey}
                ticket={selectedTicket}
              />
              {isPreparingRound && (
                <div className="round-preparing-overlay" role="status">
                  <span aria-hidden="true">✦</span>
                  <strong>飞鼠正在准备下一张…</strong>
                </div>
              )}
            </div>
            <div className="scratch-round-status">
              <p className="scratch-hint">
                {isPreparingRound
                  ? "✦ 保持这份幸运，下一张马上就好"
                  : revealed
                    ? "✦ 已经刮开啦，看看飞鼠带来了什么"
                    : `↝ ${selectedTicket.scratchPrompt}`}
              </p>
              {roundError && !resultOpen && !isPreparingRound && (
                <div className="round-inline-error" role="alert">
                  <span>{roundError}</span>
                  <button className="result-next-button" onClick={onRetry}>
                    重新准备
                  </button>
                </div>
              )}
              {revealed &&
                !resultOpen &&
                !isPreparingRound &&
                !roundError && (
                  <div className="result-actions">
                    <button className="primary-button" onClick={onOpenResult}>
                      查看刮奖结果
                    </button>
                    {selectedTicket.balance > 0 && (
                      <button
                        className="result-next-button"
                        onClick={onContinue}
                      >
                        直接刮下一张
                      </button>
                    )}
                  </div>
                )}
            </div>
          </>
        ) : isPreparingRound ? (
          <div className="ticket-start-card">
            <div className="ticket-start-preview-frame">
              <div className="scratch-board ticket-start-preview">
                <img
                  src={withBasePath(selectedTicket.drawBackgroundImagePath)}
                  alt="飞鼠正在准备刮奖券"
                  draggable={false}
                />
                <ScratchCanvas
                  interactive={false}
                  resetKey={resetKey}
                  ticket={selectedTicket}
                />
              </div>
            </div>
            <h2>飞鼠正在准备这张券…</h2>
            <p>中奖结果会由幸运小屋安全地保存下来。</p>
          </div>
        ) : (
          <div className="ticket-start-card">
            <div className="ticket-start-preview-frame">
              <div className="scratch-board ticket-start-preview">
                <img
                  src={withBasePath(selectedTicket.drawBackgroundImagePath)}
                  alt={`${selectedTicket.name}预览`}
                  draggable={false}
                />
                <ScratchCanvas
                  interactive={false}
                  resetKey={resetKey}
                  ticket={selectedTicket}
                />
              </div>
            </div>
            {roundError ? (
              <>
                <h2>奖券还没准备好</h2>
                <p className="ticket-start-error">{roundError}</p>
                {canStart && (
                  <button className="primary-button" onClick={onRetry}>
                    再试一次
                  </button>
                )}
              </>
            ) : canStart ? (
              <>
                <h2>准备好迎接这份小幸运了吗？</h2>
                <p>点击后会使用 1 张“{selectedTicket.name}”。</p>
                <button className="primary-button" onClick={onStart}>
                  使用 1 张开始刮奖
                </button>
              </>
            ) : (
              <>
                <h2>
                  {selectedTicket.isDrawEnabled
                    ? "这类券暂时用完啦"
                    : "这类券暂时不能刮"}
                </h2>
                <p>
                  {selectedTicket.isDrawEnabled
                    ? "找管理员撒个娇，请求再发一张吧～"
                    : "管理员还在准备这个特别奖池，请稍后再来看看～"}
                </p>
              </>
            )}
          </div>
        )}
      </section>
      {resultOpen && currentResult && (
        <ResultModal
          result={currentResult}
          ticket={selectedTicket}
          onClose={onCloseResult}
          onNext={onContinue}
        />
      )}
      <PlayerBottomNav active="game" onNavigate={navigate} />
    </main>
  );
}
