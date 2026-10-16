"use client";

import { usePlayerName } from "@/core/auth/player-name-context";


import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import type { ApiErrorResponse } from "@/shared/http/contracts";
import { withBasePath } from "@/shared/routing/app-path";
import type {
  AdminQuizView,
  AdminQuizWorkspace,
  QuizDraftInput,
  QuizQuestionDraft,
} from "../contracts/quiz";
import { AttemptResult } from "./attempt-result";

const emptyDraft = (): QuizDraftInput => ({
  title: "",
  description: "",
  rewardTicketTypeId: null,
  rewardQuantity: 1,
  rewardNote: "",
  questions: [],
});

function draftFromQuiz(quiz: AdminQuizView): QuizDraftInput {
  return {
    title: quiz.title,
    description: quiz.description,
    rewardTicketTypeId: quiz.rewardTicketTypeId,
    rewardQuantity: quiz.rewardQuantity || 1,
    rewardNote: quiz.rewardNote,
    questions: quiz.questions.map((question) => ({
      type: question.type,
      prompt: question.prompt,
      options: question.options,
      referenceAnswer: question.referenceAnswer,
      explanation: question.explanation,
      message: question.message,
    })),
  };
}

async function responseData<T>(response: Response) {
  const data = (await response.json()) as T | ApiErrorResponse;
  if (!response.ok) throw new Error((data as ApiErrorResponse).message);
  return data as T;
}

export function AdminQuizScreen({ initialData }: { initialData: AdminQuizWorkspace }) {
  const playerName = usePlayerName();
  const [workspace, setWorkspace] = useState(initialData);
  const [selectedId, setSelectedId] = useState<number | null>(initialData.quizzes[0]?.id ?? null);
  const selected = workspace.quizzes.find((quiz) => quiz.id === selectedId) ?? null;
  const [draft, setDraft] = useState<QuizDraftInput>(selected ? draftFromQuiz(selected) : emptyDraft());
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editable = selectedId === null || selected?.status === "draft";
  const statusLabel = useMemo(
    () => ({ draft: "草稿", published: "答题中", closed: "已关闭", archived: "已归档" }),
    [],
  );

  const refresh = async (focusId?: number) => {
    const response = await fetch(withBasePath("/api/admin/quizzes"));
    const data = await responseData<AdminQuizWorkspace>(response);
    setWorkspace(data);
    const nextId = focusId ?? selectedId ?? data.quizzes[0]?.id ?? null;
    setSelectedId(nextId);
    const nextQuiz = data.quizzes.find((quiz) => quiz.id === nextId);
    if (nextQuiz) setDraft(draftFromQuiz(nextQuiz));
    return data;
  };

  const selectQuiz = (quiz: AdminQuizView) => {
    setSelectedId(quiz.id);
    setDraft(draftFromQuiz(quiz));
    setFeedback("");
  };

  const updateQuestion = (index: number, question: QuizQuestionDraft) => {
    setDraft({
      ...draft,
      questions: draft.questions.map((item, itemIndex) => (itemIndex === index ? question : item)),
    });
  };

  const save = async () => {
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch(
        withBasePath(selectedId ? `/api/admin/quizzes/${selectedId}` : "/api/admin/quizzes"),
        {
          method: selectedId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const result = await responseData<{ message: string; quizId: number }>(response);
      await refresh(result.quizId);
      setFeedback(result.message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (action: "publish" | "close" | "archive" | "duplicate") => {
    if (!selectedId) return;
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch(withBasePath(`/api/admin/quizzes/${selectedId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await responseData<{ message: string; quizId?: number }>(response);
      await refresh(result.quizId ?? selectedId);
      setFeedback(result.message);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    setBusy(true);
    setFeedback("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(withBasePath("/api/admin/quizzes/import"), {
        method: "POST",
        body: form,
      });
      const result = await responseData<{ draft: QuizDraftInput }>(response);
      setSelectedId(null);
      setDraft({
        ...result.draft,
        rewardQuantity: 1,
        rewardNote: "",
      });
      setFeedback(`已解析 ${result.draft.questions.length} 道题，请预览并配置奖励后保存`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "导入失败");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      setBusy(false);
    }
  };

  return (
    <main className="quiz-shell quiz-admin-shell">
      <nav className="quiz-topbar">
        <Link href="/home">← 返回小屋</Link>
        <strong>📝 题版管理</strong>
        <span>管理员出题</span>
      </nav>
      <div className="quiz-admin-layout">
        <aside className="quiz-admin-list">
          <header>
            <div><small>QUESTION BOARDS</small><h1>题版管理</h1></div>
            <button type="button" onClick={() => { setSelectedId(null); setDraft(emptyDraft()); setFeedback(""); }}>＋ 新建</button>
          </header>
          <label className="quiz-import-button">
            📄 从 TXT / Markdown 导入
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
              }}
            />
          </label>
          <div className="quiz-admin-items">
            {workspace.quizzes.map((quiz) => (
              <button
                className={quiz.id === selectedId ? "active" : ""}
                key={quiz.id}
                type="button"
                onClick={() => selectQuiz(quiz)}
              >
                <strong>{quiz.title}</strong>
                <span>{statusLabel[quiz.status]} · {quiz.questions.length} 题 · {quiz.attempts.length} 次作答</span>
              </button>
            ))}
            {!workspace.quizzes.length && <p>还没有题版，创建一份或导入文件吧。</p>}
          </div>
        </aside>

        <section className="quiz-editor-panel">
          <header className="quiz-editor-heading">
            <div>
              <small>{selected ? statusLabel[selected.status] : "新草稿"}</small>
              <h2>{selectedId ? "题版详情" : "创建题版"}</h2>
            </div>
            <div className="quiz-editor-actions">
              {editable && <button type="button" disabled={busy} onClick={() => void save()}>{busy ? "处理中…" : "保存草稿"}</button>}
              {selected?.status === "draft" && <button className="publish" type="button" disabled={busy} onClick={() => void changeStatus("publish")}>发布</button>}
              {selected?.status === "published" && <button type="button" disabled={busy} onClick={() => void changeStatus("close")}>关闭答题</button>}
              {selected && <button type="button" disabled={busy} onClick={() => void changeStatus("duplicate")}>复制为新草稿</button>}
              {selected && selected.status !== "archived" && <button className="quiet" type="button" disabled={busy} onClick={() => void changeStatus("archive")}>归档</button>}
            </div>
          </header>
          {feedback && <p className="quiz-feedback" role="status">{feedback}</p>}

          {editable ? (
            <div className="quiz-editor-form">
              <label>题版标题<input maxLength={100} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
              <label>题版说明<textarea maxLength={1000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
              <fieldset className="quiz-reward-config">
                <legend>单选题全部答对奖励</legend>
                <label>奖励券种<select value={draft.rewardTicketTypeId ?? ""} onChange={(event) => setDraft({ ...draft, rewardTicketTypeId: event.target.value ? Number(event.target.value) : null })}><option value="">请选择</option>{workspace.rewardTickets.map((ticket) => <option key={ticket.id} value={ticket.id} disabled={!ticket.isGrantEnabled}>{ticket.name}{ticket.isGrantEnabled ? "" : "（停止发放）"}</option>)}</select></label>
                <label>张数<input type="number" min={1} max={9999} value={draft.rewardQuantity} onChange={(event) => setDraft({ ...draft, rewardQuantity: Number(event.target.value) })} /></label>
                <label className="reward-note">奖励原因：<input maxLength={200} placeholder={`聪明的${playerName}通关了${draft.title || "具体题版名称"}挑战`} value={draft.rewardNote} onChange={(event) => setDraft({ ...draft, rewardNote: event.target.value })} /></label>
              </fieldset>
              <div className="quiz-question-list">
                {draft.questions.map((question, index) => (
                  <article className="quiz-question-editor" key={index}>
                    <header><strong>第 {index + 1} 题</strong><select value={question.type} onChange={(event) => updateQuestion(index, { ...question, type: event.target.value as "single" | "text", options: event.target.value === "single" ? [{ content: "", isCorrect: true }, { content: "", isCorrect: false }] : [], referenceAnswer: "" })}><option value="single">单选题</option><option value="text">文字题</option></select><button type="button" onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, itemIndex) => itemIndex !== index) })}>移除</button></header>
                    <label>题干<textarea maxLength={500} value={question.prompt} onChange={(event) => updateQuestion(index, { ...question, prompt: event.target.value })} /></label>
                    {question.type === "single" ? (
                      <div className="quiz-option-editors">
                        {question.options.map((option, optionIndex) => (
                          <div key={optionIndex}><input aria-label="正确答案" type="radio" checked={option.isCorrect} onChange={() => updateQuestion(index, { ...question, options: question.options.map((item, itemIndex) => ({ ...item, isCorrect: itemIndex === optionIndex })) })} /><input maxLength={300} value={option.content} placeholder={`选项 ${optionIndex + 1}`} onChange={(event) => updateQuestion(index, { ...question, options: question.options.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, content: event.target.value } : item) })} /><button type="button" disabled={question.options.length <= 2} onClick={() => updateQuestion(index, { ...question, options: question.options.filter((_, itemIndex) => itemIndex !== optionIndex).map((item, itemIndex) => ({ ...item, isCorrect: item.isCorrect || (itemIndex === 0 && option.isCorrect) })) })}>×</button></div>
                        ))}
                        <button type="button" disabled={question.options.length >= 10} onClick={() => updateQuestion(index, { ...question, options: [...question.options, { content: "", isCorrect: false }] })}>＋ 添加选项</button>
                      </div>
                    ) : (
                      <label>参考答案（可选）<textarea maxLength={3000} value={question.referenceAnswer} onChange={(event) => updateQuestion(index, { ...question, referenceAnswer: event.target.value })} /></label>
                    )}
                    <label>解析（可选）<textarea maxLength={3000} value={question.explanation} onChange={(event) => updateQuestion(index, { ...question, explanation: event.target.value })} /></label>
                    <label>留言（可选）<textarea maxLength={3000} placeholder="可以写一句补充、鼓励或想对玩家说的话，支持 Markdown" value={question.message} onChange={(event) => updateQuestion(index, { ...question, message: event.target.value })} /></label>
                  </article>
                ))}
              </div>
              <div className="quiz-add-question">
                <button type="button" onClick={() => setDraft({ ...draft, questions: [...draft.questions, { type: "single", prompt: "", options: [{ content: "", isCorrect: true }, { content: "", isCorrect: false }], referenceAnswer: "", explanation: "", message: "" }] })}>＋ 单选题</button>
                <button type="button" onClick={() => setDraft({ ...draft, questions: [...draft.questions, { type: "text", prompt: "", options: [], referenceAnswer: "", explanation: "", message: "" }] })}>＋ 文字题</button>
              </div>
            </div>
          ) : selected ? (
            <div className="quiz-readonly-summary">
              <h3>{selected.title}</h3><p>{selected.description || "暂无说明"}</p>
              <p>全对奖励：{workspace.rewardTickets.find((ticket) => ticket.id === selected.rewardTicketTypeId)?.name ?? "未知券种"} × {selected.rewardQuantity}</p>
              <div className="quiz-readonly-questions">{selected.questions.map((question, index) => <article key={question.id}><strong>{index + 1}. {question.prompt}</strong><span>{question.type === "single" ? "单选题" : "文字题"}</span></article>)}</div>
            </div>
          ) : null}

          {selected && selected.attempts.length > 0 && (
            <section className="quiz-admin-attempts"><h2>玩家答题记录</h2>{selected.attempts.map((attempt) => <AttemptResult key={attempt.id} attempt={attempt} />)}</section>
          )}
        </section>
      </div>
    </main>
  );
}
