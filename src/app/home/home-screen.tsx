"use client";

import { usePlayerName } from "@/core/auth/player-name-context";


import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import type { SessionRole } from "@/core/auth/contracts";
import type { HomeNote } from "@/core/site-settings/contracts";
import { withBasePath } from "@/shared/routing/app-path";
import { HomeNotificationModal } from "./home-notification-modal";
import type { HomeNotification } from "./home-notifications";

type HomeScreenProps = {
  role: SessionRole;
  homeNote: HomeNote;
  initialNotifications: HomeNotification[];
};

const upcomingModules = [
  {
    icon: "📖",
    title: "我们的记录",
    description: "把平凡又珍贵的日子，慢慢收进这里。",
    tone: "memory",
  },
];

export function HomeScreen({ role, homeNote, initialNotifications }: HomeScreenProps) {
  const playerName = usePlayerName();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [savedNote, setSavedNote] = useState(homeNote);
  const [noteDraft, setNoteDraft] = useState(homeNote);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteFeedback, setNoteFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [notifications, setNotifications] = useState(initialNotifications);
  const isPlayer = role === "player";
  const hasTicketNotification = notifications.some((item) => item.type === "ticket_grant");
  const hasQuizNotification = notifications.some((item) => item.type === "quiz_published");

  const signOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError("");

    try {
      const response = await fetch(withBasePath("/api/auth/logout"), {
        method: "POST",
      });
      if (!response.ok) throw new Error("sign out failed");

      router.replace("/");
      router.refresh();
    } catch {
      setSignOutError("退出失败，请检查网络后再试一次～");
      setIsSigningOut(false);
    }
  };

  const saveNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSavingNote) return;

    setIsSavingNote(true);
    setNoteFeedback(null);

    try {
      const response = await fetch(withBasePath("/api/admin/home-note"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noteDraft),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(result.message || "首页寄语保存失败");
      }

      const saved = {
        content: noteDraft.content.trim(),
        signature: noteDraft.signature.trim(),
      };
      setSavedNote(saved);
      setNoteDraft(saved);
      setIsEditingNote(false);
      setNoteFeedback({
        type: "success",
        message: result.message || `给${playerName}的话已保存`,
      });
      router.refresh();
    } catch (error) {
      setNoteFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "首页寄语保存失败",
      });
    } finally {
      setIsSavingNote(false);
    }
  };

  return (
    <main className={`app-shell world-home ${isPlayer ? "player" : "admin"}`}>
      <nav className="world-home-topbar">
        <div className="world-home-brand">
          <span>✦</span>
          <div>
            <strong>OUR LITTLE WORLD</strong>
            <small>只属于我们的生活小屋</small>
          </div>
        </div>
        <button
          className="world-home-signout"
          type="button"
          onClick={() => void signOut()}
          disabled={isSigningOut}
        >
          {isSigningOut ? "正在退出…" : "退出登录"}
        </button>
      </nav>

      <div className="world-home-content">
        {isPlayer ? (
          <>
            <section className="world-home-hero">
              <div className="world-home-hero-copy">
                <p className="eyebrow">WELCOME HOME, PUPPY</p>
                <h1>
                  欢迎回来，
                  <span>{playerName}！</span>
                </h1>
                <p>这里装着我们的日常、默契，还有飞鼠替你守着的小幸运。</p>
                <div className="world-home-tags" aria-label="小屋状态">
                  <span>🌷 今日份好心情</span>
                  <span>☀️ 我们的小世界营业中</span>
                </div>
              </div>
              <div className="world-home-hero-art">
                <span>你回来啦～</span>
                <img
                  src={withBasePath("/momo/home.jpg")}
                  alt="在小屋等候的飞鼠"
                />
              </div>
            </section>

            <section className="world-note-card" aria-label={`给${playerName}的话`}>
              <div className="world-note-title">
                <span>💌</span>
                <div>
                  <p className="eyebrow">A LITTLE NOTE</p>
                  <h2>给{playerName}的话</h2>
                </div>
              </div>
              <blockquote>“{homeNote.content}”</blockquote>
              <p className="world-note-signature">—— {homeNote.signature}</p>
            </section>
          </>
        ) : (
          <>
            <header className="world-admin-heading">
              <div>
                <p className="eyebrow">HOME MANAGEMENT</p>
                <h1>小屋管理</h1>
              </div>
              <p>在这里整理主页内容，也可以进入各个功能的管理区域。</p>
            </header>

            <section
              className={`world-note-card world-admin-note-card${isEditingNote ? " editing" : ""}`}
              aria-label={isEditingNote ? `编辑给${playerName}的话` : `给${playerName}的话，双击可以编辑`}
              role={isEditingNote ? undefined : "button"}
              tabIndex={isEditingNote ? undefined : 0}
              onDoubleClick={() => {
                if (!isEditingNote) {
                  setNoteFeedback(null);
                  setIsEditingNote(true);
                }
              }}
              onKeyDown={(event) => {
                if (!isEditingNote && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  setNoteFeedback(null);
                  setIsEditingNote(true);
                }
              }}
            >
              <div className="world-note-title">
                <span>💌</span>
                <div>
                  <p className="eyebrow">A LITTLE NOTE</p>
                  <h2>{isEditingNote ? `编辑给${playerName}的话` : `给${playerName}的话`}</h2>
                </div>
              </div>
              {isEditingNote ? (
                <form className="world-note-editor-form" onSubmit={saveNote}>
                  <label>
                    寄语正文
                    <textarea
                      required
                      autoFocus
                      maxLength={300}
                      value={noteDraft.content}
                      onChange={(event) =>
                        setNoteDraft({ ...noteDraft, content: event.target.value })
                      }
                    />
                    <small>{noteDraft.content.length} / 300</small>
                  </label>
                  <label>
                    落款
                    <input
                      required
                      maxLength={40}
                      value={noteDraft.signature}
                      onChange={(event) =>
                        setNoteDraft({ ...noteDraft, signature: event.target.value })
                      }
                    />
                    <small>{noteDraft.signature.length} / 40</small>
                  </label>
                  <div className="world-note-editor-actions">
                    <button className="save" type="submit" disabled={isSavingNote}>
                      {isSavingNote ? "正在保存…" : "保存寄语"}
                    </button>
                    <button
                      className="cancel"
                      type="button"
                      disabled={isSavingNote}
                      onClick={() => {
                        setNoteDraft(savedNote);
                        setNoteFeedback(null);
                        setIsEditingNote(false);
                      }}
                    >
                      取消
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <blockquote>“{savedNote.content}”</blockquote>
                  <p className="world-note-signature">—— {savedNote.signature}</p>
                  <small className="world-note-edit-hint">双击寄语可编辑</small>
                </>
              )}
              {noteFeedback && (
                <p
                  className={`world-note-feedback ${noteFeedback.type}`}
                  role="status"
                >
                  {noteFeedback.message}
                </p>
              )}
            </section>
          </>
        )}

        <section className="world-modules" aria-labelledby="world-modules-title">
          <div className="world-section-heading">
            <div>
              <p className="eyebrow">OUR CORNERS</p>
              <h2 id="world-modules-title">
                {isPlayer ? "今天想去哪里看看？" : "今天要管理哪里？"}
              </h2>
            </div>
            <p>{isPlayer ? "每个角落，都藏着我们的小故事。" : "各个角落会在准备好后陆续开放。"}</p>
          </div>

          <div className="world-module-grid">
            <Link className="world-module-card scratch" href="/scratch">
              <div className="world-module-icon">🎟️</div>
              <div className="world-module-copy">
                <span className={`world-module-status ready${hasTicketNotification ? " new" : ""}`}>
                  {hasTicketNotification ? "NEW · 有新消息" : "可以进入"}
                </span>
                <h3>{isPlayer ? "飞鼠幸运屋" : "刮刮乐管理"}</h3>
                <p>
                  {isPlayer
                    ? "刮开今天的小幸运，看看飞鼠藏了什么惊喜。"
                    : "管理奖券、奖品库存、礼物兑换与历史记录。"}
                </p>
              </div>
              <span className="world-module-arrow">➜</span>
            </Link>

            <Link className="world-module-card quiz" href="/quiz">
              <div className="world-module-icon">📝</div>
              <div className="world-module-copy">
                <span className={`world-module-status ready${hasQuizNotification ? " new" : ""}`}>
                  {hasQuizNotification ? "NEW · 有新挑战" : "可以进入"}
                </span>
                <h3>{isPlayer ? "趣味答题" : "答题管理"}</h3>
                <p>
                  {isPlayer
                    ? "趣味问答，答对有奖！"
                    : "创建和导入题版，配置奖励并查看玩家的回答。"}
                </p>
              </div>
              <span className="world-module-arrow">➜</span>
            </Link>

            {upcomingModules.map((module) => (
              <Link
                href="/memories/preview"
                className={`world-module-card ${module.tone}`}
                key={module.title}
              >
                <div className="world-module-icon">{module.icon}</div>
                <div className="world-module-copy">
                  <span className="world-module-status">样式预览</span>
                  <h3>{module.title}</h3>
                  <p>{module.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {signOutError && (
          <p className="world-home-error" role="alert">
            {signOutError}
          </p>
        )}
      </div>
      {isPlayer && (
        <HomeNotificationModal
          initialNotifications={initialNotifications}
          onNotificationsChange={setNotifications}
        />
      )}
    </main>
  );
}
