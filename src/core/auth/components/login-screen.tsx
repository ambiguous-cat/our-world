"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { withBasePath } from "@/shared/routing/app-path";

export function LoginScreen() {
  const router = useRouter();
  const [identity, setIdentity] = useState("");
  const [entryError, setEntryError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const submitIdentity = async (event: FormEvent) => {
    event.preventDefault();
    const answer = identity.trim();

    if (!answer || isAuthenticating) {
      if (!answer) setEntryError("先轻轻说出小暗号吧～");
      return;
    }

    setIsAuthenticating(true);
    setEntryError("");

    try {
      const response = await fetch(withBasePath("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const payload = (await response.json()) as {
        role?: "player" | "admin";
        message?: string;
      };

      if (!response.ok || !payload.role) {
        setEntryError(payload.message ?? "暗号好像不对，再想一想呀～");
        return;
      }

      setIdentity("");
      router.replace("/home");
      router.refresh();
    } catch {
      setEntryError("飞鼠暂时没听清，请稍后再试一次～");
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <main className="app-shell welcome-screen">
      <span className="float-deco star-one">✦</span>
      <span className="float-deco heart-one">♥</span>
      <section className="entrance-panel">
        <div className="entrance-art">
          <span className="art-sticker">偷偷为你准备的 ✦</span>
          <img
            src={withBasePath("/momo/welcome-transparent.png")}
            alt="等待回答的可爱飞鼠"
          />
        </div>
        <div className="entrance-form-wrap">
          <p className="eyebrow">OUR LITTLE WORLD</p>
          <h1>你是谁？</h1>
          <p className="subtext">
            只有说出正确的暗号，
            <br />
            飞鼠才会为你打开门。
          </p>
          <form onSubmit={submitIdentity}>
            <label htmlFor="identity">我的答案是</label>
            <div className={`answer-field ${entryError ? "has-error" : ""}`}>
              <span>💭</span>
              <input
                id="identity"
                value={identity}
                onChange={(event) => {
                  setIdentity(event.target.value);
                  setEntryError("");
                }}
                placeholder="在这里输入暗号..."
                autoComplete="off"
                autoFocus
              />
            </div>
            <div className="entry-message" aria-live="polite">
              {entryError || "嘘——答案要轻轻地说"}
            </div>
            <button
              className="enter-button"
              type="submit"
              disabled={isAuthenticating}
            >
              {isAuthenticating ? "飞鼠正在确认…" : "进入我们的小世界"}
              <span>➜</span>
            </button>
          </form>
        </div>
      </section>
      <p className="footer-note">
        ♥ PRIVATE LITTLE WORLD · 只属于我们的秘密入口
      </p>
    </main>
  );
}
