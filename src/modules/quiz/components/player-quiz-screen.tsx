"use client";

import { usePlayerName } from "@/core/auth/player-name-context";


import Link from "next/link";
import { useState } from "react";

import type { ApiErrorResponse } from "@/shared/http/contracts";
import { withBasePath } from "@/shared/routing/app-path";
import type {
  PlayerQuizView,
  PlayerQuizWorkspace,
  QuizAttemptView,
} from "../contracts/quiz";
import { AttemptResult } from "./attempt-result";

type AnswerState = Record<number, number | string>;

export function PlayerQuizScreen({ initialData }: { initialData: PlayerQuizWorkspace }) {
  const playerName = usePlayerName();
  const [workspace, setWorkspace] = useState(initialData);
  const [activeQuizId, setActiveQuizId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [result, setResult] = useState<QuizAttemptView | null>(null);
  const [requestKey, setRequestKey] = useState("");
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const activeQuiz = workspace.quizzes.find((quiz) => quiz.id === activeQuizId) ?? null;

  const startQuiz = (quiz: PlayerQuizView) => {
    setActiveQuizId(quiz.id);
    setAnswers({});
    setResult(null);
    setShowRewardModal(false);
    setFeedback("");
    setRequestKey(crypto.randomUUID());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showHistory = (quiz: PlayerQuizView, attempt: QuizAttemptView) => {
    setActiveQuizId(quiz.id);
    setResult(attempt);
    setShowRewardModal(false);
    setFeedback("");
    setShowRewardModal(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const backToList = () => {
    setActiveQuizId(null);
    setResult(null);
    setAnswers({});
    setFeedback("");
  };

  const submit = async () => {
    if (!activeQuiz) return;
    const incomplete = activeQuiz.questions.some((question) => {
      const answer = answers[question.id];
      return question.type === "single"
        ? typeof answer !== "number"
        : typeof answer !== "string" || !answer.trim();
    });
    if (incomplete) {
      setFeedback("请完成所有题目后再提交");
      return;
    }
    setSubmitting(true);
    setFeedback("");
    try {
      const response = await fetch(withBasePath(`/api/player/quizzes/${activeQuiz.id}/attempts`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey,
          answers: activeQuiz.questions.map((question) => ({
            questionId: question.id,
            selectedOptionId: question.type === "single" ? answers[question.id] : null,
            textAnswer: question.type === "text" ? answers[question.id] : null,
          })),
        }),
      });
      const data = (await response.json()) as QuizAttemptView | ApiErrorResponse;
      if (!response.ok) throw new Error((data as ApiErrorResponse).message);
      const attempt = data as QuizAttemptView;
      setResult(attempt);
      setShowRewardModal(attempt.reward !== null);
      const refreshedResponse = await fetch(withBasePath("/api/player/quizzes"));
      if (refreshedResponse.ok) setWorkspace((await refreshedResponse.json()) as PlayerQuizWorkspace);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "提交失败，请稍后再试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="quiz-shell quiz-player-shell">
      <nav className="quiz-topbar">
        <Link href="/home">← 返回小屋</Link>
        <strong>📝 答题小屋</strong>
        {activeQuizId ? <button type="button" onClick={backToList}>题版列表</button> : <span>PLAYER</span>}
      </nav>
      <div className="quiz-player-content">
        {!activeQuiz ? (
          <>
            <header className="quiz-player-hero">
              <p>QUIZ TIME</p>
              <h1>来看看这次准备了什么题吧</h1>
              <span>每份题版都是一次小挑战，全部答对还能获得奖励喔。</span>
            </header>
            <section className="quiz-board-grid">
              {workspace.quizzes.map((quiz) => (
                <article className="quiz-board-card" key={quiz.id}>
                  <div className="quiz-board-status">{quiz.status === "published" ? "可以作答" : "已经关闭"}</div>
                  <h2>{quiz.title}</h2>
                  <p>{quiz.description || `为${playerName}准备的小挑战。`}</p>
                  <div className="quiz-board-meta"><span>{quiz.questions.length} 道题</span><span>已答 {quiz.attempts.length} 次</span></div>
                  {quiz.reward && (
                    <p className="quiz-board-reward">
                      {quiz.rewardAvailable
                        ? `🎁 全对奖励：${quiz.reward.ticketName} × ${quiz.reward.quantity}`
                        : `✅ 全对奖励已领取：${quiz.reward.ticketName} × ${quiz.reward.quantity}`}
                    </p>
                  )}
                  <div className="quiz-board-actions">
                    {quiz.status === "published" && <button type="button" onClick={() => startQuiz(quiz)}>{quiz.attempts.length ? "再答一次" : "开始答题"}</button>}
                    {quiz.attempts.map((attempt) => (
                      <button className="history" type="button" key={attempt.id} onClick={() => showHistory(quiz, attempt)}>第 {attempt.attemptNumber} 次结果</button>
                    ))}
                  </div>
                </article>
              ))}
              {!workspace.quizzes.length && <p className="quiz-empty">管理员还没有发布题版，再等等吧～</p>}
            </section>
          </>
        ) : result ? (
          <div className="quiz-attempt-page">
            <header className="quiz-attempt-title"><p>{activeQuiz.title}</p><h1>答案已经揭晓</h1></header>
            <AttemptResult attempt={result} />
            <div className="quiz-result-actions"><button type="button" onClick={() => startQuiz(activeQuiz)} disabled={activeQuiz.status !== "published"}>再答一次</button><button className="quiet" type="button" onClick={backToList}>返回题版列表</button></div>
          </div>
        ) : (
          <div className="quiz-attempt-page">
            <header className="quiz-attempt-title">
              <p>{activeQuiz.rewardAvailable ? "PERFECT SCORE · 全对就有奖励" : `TRY AGAIN · 第 ${activeQuiz.attempts.length + 1} 次`}</p>
              <h1>{activeQuiz.title}</h1>
              {activeQuiz.description && <span>{activeQuiz.description}</span>}
            </header>
            <div className="quiz-answer-list">
              {activeQuiz.questions.map((question, index) => (
                <fieldset className="quiz-answer-card" key={question.id}>
                  <legend><span>{index + 1}</span>{question.prompt}</legend>
                  {question.type === "single" ? (
                    <div className="quiz-player-options">
                      {question.options.map((option) => (
                        <label className={answers[question.id] === option.id ? "selected" : ""} key={option.id}>
                          <input type="radio" name={`question-${question.id}`} checked={answers[question.id] === option.id} onChange={() => setAnswers({ ...answers, [question.id]: option.id })} />
                          <span>{option.content}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea maxLength={2000} placeholder="写下你的回答…" value={typeof answers[question.id] === "string" ? answers[question.id] : ""} onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })} />
                  )}
                </fieldset>
              ))}
            </div>
            {feedback && <p className="quiz-feedback" role="alert">{feedback}</p>}
            <button className="quiz-submit-button" type="button" disabled={submitting} onClick={() => void submit()}>{submitting ? "正在提交…" : "确认提交并揭晓答案"}</button>
          </div>
        )}
      </div>
      {showRewardModal && result?.reward && (
        <div className="quiz-reward-modal-backdrop" role="presentation">
          <section
            className="quiz-reward-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quiz-reward-modal-title"
          >
            <div className="quiz-reward-confetti" aria-hidden="true">✦　💞　✦</div>
            <span className="quiz-reward-gift" aria-hidden="true">🎁</span>
            <p>PERFECT SCORE!</p>
            <h2 id="quiz-reward-modal-title">单选题全部答对啦！</h2>
            <div className="quiz-reward-prize">
              <strong>{result.reward.ticketName}</strong>
              <span>× {result.reward.quantity}</span>
            </div>
            <blockquote>“{result.reward.note}”</blockquote>
            <div className="quiz-reward-modal-actions">
              <button type="button" onClick={() => setShowRewardModal(false)}>
                查看本次答案
              </button>
              <Link href="/scratch">去刮刮乐 ➜</Link>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
