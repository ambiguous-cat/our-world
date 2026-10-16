import { getPlayerName } from "@/core/auth/player-name";
import { MEMBER_IDS, type MemberId } from "@/core/members/contracts";
import "server-only";

import { and, asc, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db, schema, sqlite } from "@/db";
import { enqueueEmailNotification } from "@/core/notifications/server/email-service";
import {
  getQuizRewardTicketChoices,
  grantQuizReward,
  TicketRewardError,
} from "@/modules/scratch/server/reward-service";
import type {
  AdminQuizView,
  AdminQuizWorkspace,
  PlayerQuizView,
  PlayerQuizWorkspace,
  QuizAttemptView,
  QuizDraftInput,
  QuizQuestionDraft,
} from "../contracts/quiz";
import { QuizServiceError } from "./error";

const MAX_QUESTIONS = 100;
const MAX_TEXT_ANSWER = 2000;

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new QuizServiceError("INVALID_REQUEST", "提交的数据格式不正确");
  }
  return value as Record<string, unknown>;
}

function textValue(value: unknown, label: string, maximum: number, required = true) {
  if (typeof value !== "string") {
    throw new QuizServiceError("INVALID_INPUT", `${label}格式不正确`);
  }
  const valueText = value.trim();
  if (required && !valueText) throw new QuizServiceError("INVALID_INPUT", `${label}不能为空`);
  if (valueText.length > maximum) {
    throw new QuizServiceError("INVALID_INPUT", `${label}不能超过 ${maximum} 个字符`);
  }
  return valueText;
}

function optionalText(value: unknown, label: string, maximum: number) {
  if (value === undefined || value === null || value === "") return "";
  return textValue(value, label, maximum, false);
}

function positiveInteger(value: unknown, label: string, maximum = 9999) {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > maximum) {
    throw new QuizServiceError("INVALID_INPUT", `${label}无效`);
  }
  return Number(value);
}

function validateQuestion(value: unknown, index: number): QuizQuestionDraft {
  const body = record(value);
  if (body.type !== "single" && body.type !== "text") {
    throw new QuizServiceError("INVALID_INPUT", `第 ${index + 1} 题类型无效`);
  }
  const prompt = textValue(body.prompt, `第 ${index + 1} 题题干`, 500);
  const explanation = optionalText(body.explanation, `第 ${index + 1} 题解析`, 3000);
  const message = optionalText(body.message, `第 ${index + 1} 题留言`, 3000);
  const referenceAnswer = optionalText(
    body.referenceAnswer,
    `第 ${index + 1} 题参考答案`,
    3000,
  );
  const rawOptions = Array.isArray(body.options) ? body.options : [];

  if (body.type === "text") {
    if (rawOptions.length) {
      throw new QuizServiceError("INVALID_INPUT", `第 ${index + 1} 题是文字题，不能设置选项`);
    }
    return { type: "text", prompt, options: [], referenceAnswer, explanation, message };
  }

  if (referenceAnswer) {
    throw new QuizServiceError("INVALID_INPUT", `第 ${index + 1} 题是单选题，不单独填写参考答案`);
  }
  if (rawOptions.length < 2 || rawOptions.length > 10) {
    throw new QuizServiceError("INVALID_INPUT", `第 ${index + 1} 题需要 2 到 10 个选项`);
  }
  const options = rawOptions.map((rawOption, optionIndex) => {
    const option = record(rawOption);
    return {
      content: textValue(option.content, `第 ${index + 1} 题第 ${optionIndex + 1} 个选项`, 300),
      isCorrect: option.isCorrect === true,
    };
  });
  if (options.filter((option) => option.isCorrect).length !== 1) {
    throw new QuizServiceError("INVALID_INPUT", `第 ${index + 1} 题必须且只能有一个正确选项`);
  }
  return { type: "single", prompt, options, referenceAnswer: "", explanation, message };
}

function validateDraft(input: unknown): QuizDraftInput {
  const body = record(input);
  const title = textValue(body.title, "题版标题", 100);
  const description = optionalText(body.description, "题版说明", 1000);
  const rawQuestions = body.questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length > MAX_QUESTIONS) {
    throw new QuizServiceError("INVALID_INPUT", `题目必须是数组且不能超过 ${MAX_QUESTIONS} 道`);
  }
  const rewardTicketTypeId =
    body.rewardTicketTypeId === null || body.rewardTicketTypeId === undefined
      ? null
      : positiveInteger(body.rewardTicketTypeId, "奖励券种");
  const rewardQuantity = rewardTicketTypeId
    ? positiveInteger(body.rewardQuantity, "奖励张数")
    : 0;
  const rewardNote = rewardTicketTypeId
    ? optionalText(body.rewardNote, "奖励原因", 200) ||
      `聪明的${getPlayerName()}通关了${title}挑战`
    : "";

  return {
    title,
    description,
    rewardTicketTypeId,
    rewardQuantity,
    rewardNote,
    questions: rawQuestions.map(validateQuestion),
  };
}

function loadEditorQuestions(quizId: number) {
  const questions = db
    .select()
    .from(schema.quizQuestions)
    .where(eq(schema.quizQuestions.quizId, quizId))
    .orderBy(asc(schema.quizQuestions.sortOrder))
    .all();
  const ids = questions.map((question) => question.id);
  const options = ids.length
    ? db
        .select()
        .from(schema.quizOptions)
        .where(inArray(schema.quizOptions.questionId, ids))
        .orderBy(asc(schema.quizOptions.sortOrder))
        .all()
    : [];
  return questions.map((question) => ({
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    referenceAnswer: question.referenceAnswer ?? "",
    explanation: question.explanation ?? "",
    message: question.message ?? "",
    options: options
      .filter((option) => option.questionId === question.id)
      .map(({ content, isCorrect }) => ({ content, isCorrect })),
  }));
}

function loadAttempt(attemptId: number, memberId?: MemberId): QuizAttemptView {
  const attempt = db
    .select()
    .from(schema.quizAttempts)
    .where(and(eq(schema.quizAttempts.id, attemptId), memberId ? eq(schema.quizAttempts.memberId, memberId) : undefined))
    .get();
  if (!attempt) throw new QuizServiceError("ATTEMPT_NOT_FOUND", "答题记录不存在", 404);
  const rewardQuiz = db
    .select({ title: schema.quizzes.title, note: schema.quizzes.rewardNote })
    .from(schema.quizzes)
    .where(eq(schema.quizzes.id, attempt.quizId))
    .get();
  const answers = db
    .select()
    .from(schema.quizAnswers)
    .where(eq(schema.quizAnswers.attemptId, attemptId))
    .orderBy(asc(schema.quizAnswers.sortOrder))
    .all()
    .map((answer) => ({
      questionId: answer.questionId,
      questionType: answer.questionTypeSnapshot,
      prompt: answer.promptSnapshot,
      selectedOptionId: answer.selectedOptionId,
      selectedOptionText: answer.selectedOptionTextSnapshot,
      textAnswer: answer.textAnswer,
      isCorrect: answer.isCorrect,
      options: answer.optionsSnapshot,
      referenceAnswer: answer.referenceAnswerSnapshot,
      explanation: answer.explanationSnapshot,
      message: answer.messageSnapshot,
    }));
  return {
    id: attempt.id,
    quizId: attempt.quizId,
    attemptNumber: attempt.attemptNumber,
    singleCorrectCount: attempt.singleCorrectCount,
    singleQuestionCount: attempt.singleQuestionCount,
    reward:
      attempt.rewardBalanceLogId && attempt.rewardTicketNameSnapshot && attempt.rewardQuantitySnapshot
        ? {
            ticketName: attempt.rewardTicketNameSnapshot,
            quantity: attempt.rewardQuantitySnapshot,
            note:
              rewardQuiz?.note ??
              `聪明的${getPlayerName()}通关了${rewardQuiz?.title ?? "题版"}挑战`,
          }
        : null,
    submittedAt: attempt.submittedAt.toISOString(),
    answers,
  };
}

function loadAttempts(quizId: number, memberId?: MemberId) {
  return db
    .select({ id: schema.quizAttempts.id })
    .from(schema.quizAttempts)
    .where(and(eq(schema.quizAttempts.quizId, quizId), memberId ? eq(schema.quizAttempts.memberId, memberId) : undefined))
    .orderBy(desc(schema.quizAttempts.attemptNumber))
    .all()
    .map(({ id }) => loadAttempt(id, memberId));
}

export function getAdminQuizWorkspace(): AdminQuizWorkspace {
  const quizzes: AdminQuizView[] = db
    .select()
    .from(schema.quizzes)
    .orderBy(desc(schema.quizzes.updatedAt), desc(schema.quizzes.id))
    .all()
    .map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description ?? "",
      status: quiz.status,
      rewardTicketTypeId: quiz.rewardTicketTypeId,
      rewardQuantity: quiz.rewardQuantity,
      rewardNote: quiz.rewardNote ?? "",
      publishedAt: quiz.publishedAt?.toISOString() ?? null,
      updatedAt: quiz.updatedAt.toISOString(),
      questions: loadEditorQuestions(quiz.id),
      attempts: loadAttempts(quiz.id),
    }));
  return { quizzes, rewardTickets: getQuizRewardTicketChoices() };
}

function writeQuestions(quizId: number, questions: QuizQuestionDraft[]) {
  db.delete(schema.quizQuestions).where(eq(schema.quizQuestions.quizId, quizId)).run();
  for (const [questionIndex, question] of questions.entries()) {
    const inserted = db
      .insert(schema.quizQuestions)
      .values({
        quizId,
        type: question.type,
        prompt: question.prompt,
        referenceAnswer: question.referenceAnswer || null,
        explanation: question.explanation || null,
        message: question.message || null,
        sortOrder: questionIndex,
      })
      .returning({ id: schema.quizQuestions.id })
      .get();
    if (question.type === "single") {
      db.insert(schema.quizOptions)
        .values(
          question.options.map((option, optionIndex) => ({
            questionId: inserted.id,
            content: option.content,
            isCorrect: option.isCorrect,
            sortOrder: optionIndex,
          })),
        )
        .run();
    }
  }
}

const createQuizTransaction = sqlite.transaction((actorMemberId: MemberId, input: unknown) => {
  const draft = validateDraft(input);
  const quiz = db
    .insert(schema.quizzes)
    .values({
      createdByMemberId: actorMemberId,
      title: draft.title,
      description: draft.description || null,
      rewardTicketTypeId: draft.rewardTicketTypeId,
      rewardQuantity: draft.rewardQuantity,
      rewardNote: draft.rewardNote || null,
      updatedAt: new Date(),
    })
    .returning({ id: schema.quizzes.id })
    .get();
  writeQuestions(quiz.id, draft.questions);
  return { message: "题版草稿已创建", quizId: quiz.id };
});

export function createQuiz(actorMemberId: MemberId, input: unknown) {
  return createQuizTransaction.immediate(actorMemberId, input);
}

const saveQuizTransaction = sqlite.transaction((quizId: number, input: unknown) => {
  const existing = db.select().from(schema.quizzes).where(eq(schema.quizzes.id, quizId)).get();
  if (!existing) throw new QuizServiceError("QUIZ_NOT_FOUND", "题版不存在", 404);
  if (existing.status !== "draft") {
    throw new QuizServiceError("QUIZ_LOCKED", "只有草稿题版可以编辑", 409);
  }
  const draft = validateDraft(input);
  db.update(schema.quizzes)
    .set({
      title: draft.title,
      description: draft.description || null,
      rewardTicketTypeId: draft.rewardTicketTypeId,
      rewardQuantity: draft.rewardQuantity,
      rewardNote: draft.rewardNote || null,
      updatedAt: new Date(),
    })
    .where(eq(schema.quizzes.id, quizId))
    .run();
  writeQuestions(quizId, draft.questions);
  return { message: "题版草稿已保存", quizId };
});

export function saveQuiz(quizId: number, input: unknown) {
  return saveQuizTransaction.immediate(quizId, input);
}

const changeQuizStatusTransaction = sqlite.transaction((actorMemberId: MemberId, quizId: number, input: unknown) => {
  const body = record(input);
  const action = body.action;
  const quiz = db.select().from(schema.quizzes).where(eq(schema.quizzes.id, quizId)).get();
  if (!quiz) throw new QuizServiceError("QUIZ_NOT_FOUND", "题版不存在", 404);
  const now = new Date();

  if (action === "duplicate") {
    const duplicate = db
      .insert(schema.quizzes)
      .values({
      createdByMemberId: actorMemberId,
        title: `${quiz.title}（副本）`.slice(0, 100),
        description: quiz.description,
        rewardTicketTypeId: quiz.rewardTicketTypeId,
        rewardQuantity: quiz.rewardQuantity,
        rewardNote: quiz.rewardNote,
        updatedAt: now,
      })
      .returning({ id: schema.quizzes.id })
      .get();
    writeQuestions(
      duplicate.id,
      loadEditorQuestions(quizId).map((question) => ({
        type: question.type,
        prompt: question.prompt,
        options: question.options,
        referenceAnswer: question.referenceAnswer,
        explanation: question.explanation,
        message: question.message,
      })),
    );
    return { message: "已复制为新的题版草稿", quizId: duplicate.id };
  }

  if (action === "publish") {
    if (quiz.status !== "draft") throw new QuizServiceError("INVALID_STATUS", "只有草稿可以发布", 409);
    const questionCount = Number(
      db.select({ value: count() }).from(schema.quizQuestions).where(eq(schema.quizQuestions.quizId, quizId)).get()?.value ?? 0,
    );
    if (!questionCount) throw new QuizServiceError("EMPTY_QUIZ", "至少添加一道题后才能发布");
    const singleQuestionCount = Number(
      db
        .select({ value: count() })
        .from(schema.quizQuestions)
        .where(
          and(
            eq(schema.quizQuestions.quizId, quizId),
            eq(schema.quizQuestions.type, "single"),
          ),
        )
        .get()?.value ?? 0,
    );
    if (!singleQuestionCount) {
      throw new QuizServiceError(
        "SINGLE_QUESTION_REQUIRED",
        "至少添加一道单选题后才能发布并设置全对奖励",
      );
    }
    if (!quiz.rewardTicketTypeId || quiz.rewardQuantity < 1 || !quiz.rewardNote) {
      throw new QuizServiceError("REWARD_REQUIRED", "发布前必须配置单选题全对奖励");
    }
    const ticket = getQuizRewardTicketChoices().find((item) => item.id === quiz.rewardTicketTypeId);
    if (!ticket || !ticket.isGrantEnabled) {
      throw new QuizServiceError("REWARD_UNAVAILABLE", "奖励券当前不可发放", 409);
    }
    db.update(schema.quizzes)
      .set({ status: "published", publishedAt: now, updatedAt: now })
      .where(eq(schema.quizzes.id, quizId))
      .run();
    db.insert(schema.quizPublishNotices)
      .values({ quizId, memberId: MEMBER_IDS.first })
      .onConflictDoNothing()
      .run();
    enqueueEmailNotification({
      recipientMemberId: MEMBER_IDS.first,
      eventType: "quiz_published",
      eventKey: String(quizId),
      subject: `新的答题挑战：${quiz.title}`,
      heading: "新的挑战来啦！",
      message: quiz.description
        ? `「${quiz.title}」已经发布啦！\n${quiz.description}`
        : `「${quiz.title}」已经发布啦，等你来挑战！`,
      actionLabel: "去答题",
      actionPath: "/quiz",
    });
    return { message: "题版已发布" };
  }
  if (action === "close") {
    if (quiz.status !== "published") throw new QuizServiceError("INVALID_STATUS", "只有已发布题版可以关闭", 409);
    db.update(schema.quizzes)
      .set({ status: "closed", closedAt: now, updatedAt: now })
      .where(eq(schema.quizzes.id, quizId))
      .run();
    db.update(schema.quizPublishNotices)
      .set({ shownAt: now })
      .where(
        and(
          eq(schema.quizPublishNotices.quizId, quizId),
          isNull(schema.quizPublishNotices.shownAt),
        ),
      )
      .run();
    return { message: "题版已关闭，历史仍可查看" };
  }
  if (action === "archive") {
    if (quiz.status === "archived") throw new QuizServiceError("INVALID_STATUS", "题版已经归档", 409);
    db.update(schema.quizzes)
      .set({ status: "archived", archivedAt: now, updatedAt: now })
      .where(eq(schema.quizzes.id, quizId))
      .run();
    db.update(schema.quizPublishNotices)
      .set({ shownAt: now })
      .where(
        and(
          eq(schema.quizPublishNotices.quizId, quizId),
          isNull(schema.quizPublishNotices.shownAt),
        ),
      )
      .run();
    return { message: "题版已归档" };
  }
  throw new QuizServiceError("INVALID_ACTION", "题版操作无效");
});

export function changeQuizStatus(actorMemberId: MemberId, quizId: number, input: unknown) {
  return changeQuizStatusTransaction.immediate(actorMemberId, quizId, input);
}

function playerQuestions(quizId: number) {
  const questions = db
    .select()
    .from(schema.quizQuestions)
    .where(eq(schema.quizQuestions.quizId, quizId))
    .orderBy(asc(schema.quizQuestions.sortOrder))
    .all();
  const ids = questions.map((question) => question.id);
  const options = ids.length
    ? db
        .select({
          id: schema.quizOptions.id,
          questionId: schema.quizOptions.questionId,
          content: schema.quizOptions.content,
        })
        .from(schema.quizOptions)
        .where(inArray(schema.quizOptions.questionId, ids))
        .orderBy(asc(schema.quizOptions.sortOrder))
        .all()
    : [];
  return questions.map((question) => ({
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    options: options
      .filter((option) => option.questionId === question.id)
      .map(({ id, content }) => ({ id, content })),
  }));
}

export function getPlayerQuizWorkspace(memberId: MemberId): PlayerQuizWorkspace {
  const rows = db
    .select({ quiz: schema.quizzes, ticketName: schema.ticketTypes.name })
    .from(schema.quizzes)
    .leftJoin(schema.ticketTypes, eq(schema.quizzes.rewardTicketTypeId, schema.ticketTypes.id))
    .where(inArray(schema.quizzes.status, ["published", "closed"]))
    .orderBy(desc(schema.quizzes.publishedAt), desc(schema.quizzes.id))
    .all();
  const quizzes: PlayerQuizView[] = rows.map(({ quiz, ticketName }) => {
    const attempts = loadAttempts(quiz.id, memberId);
    return {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description ?? "",
      status: quiz.status as "published" | "closed",
      reward:
        ticketName && quiz.rewardQuantity > 0
          ? { ticketName, quantity: quiz.rewardQuantity }
          : null,
      rewardAvailable: !attempts.some((attempt) => attempt.reward !== null),
      questions: playerQuestions(quiz.id),
      attempts,
    };
  });
  return { quizzes };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const submitQuizTransaction = sqlite.transaction((memberId: MemberId, quizId: number, input: unknown) => {
  const body = record(input);
  const requestKey = textValue(body.requestKey, "请求标识", 64);
  if (!UUID_PATTERN.test(requestKey)) throw new QuizServiceError("INVALID_REQUEST_KEY", "请求标识无效");
  const existing = db
    .select({ id: schema.quizAttempts.id, quizId: schema.quizAttempts.quizId, memberId: schema.quizAttempts.memberId })
    .from(schema.quizAttempts)
    .where(eq(schema.quizAttempts.requestKey, requestKey))
    .get();
  if (existing) {
    if (existing.memberId !== memberId || existing.quizId !== quizId) throw new QuizServiceError("REQUEST_KEY_CONFLICT", "请求标识已用于其他题版", 409);
    return loadAttempt(existing.id, memberId);
  }

  const quiz = db.select().from(schema.quizzes).where(eq(schema.quizzes.id, quizId)).get();
  if (!quiz) throw new QuizServiceError("QUIZ_NOT_FOUND", "题版不存在", 404);
  if (quiz.status !== "published") throw new QuizServiceError("QUIZ_NOT_OPEN", "这份题版当前不能作答", 409);
  const questions = db
    .select()
    .from(schema.quizQuestions)
    .where(eq(schema.quizQuestions.quizId, quizId))
    .orderBy(asc(schema.quizQuestions.sortOrder))
    .all();
  const questionIds = questions.map((question) => question.id);
  const options = db
    .select()
    .from(schema.quizOptions)
    .where(inArray(schema.quizOptions.questionId, questionIds))
    .orderBy(asc(schema.quizOptions.sortOrder))
    .all();
  if (!Array.isArray(body.answers) || body.answers.length !== questions.length) {
    throw new QuizServiceError("INCOMPLETE_ANSWERS", "请完成所有题目后再提交");
  }
  const answerMap = new Map<number, Record<string, unknown>>();
  for (const rawAnswer of body.answers) {
    const answer = record(rawAnswer);
    const questionId = positiveInteger(answer.questionId, "题目编号");
    if (answerMap.has(questionId)) throw new QuizServiceError("DUPLICATE_ANSWER", "同一道题不能重复提交");
    answerMap.set(questionId, answer);
  }

  let singleCorrectCount = 0;
  let singleQuestionCount = 0;
  const preparedAnswers = questions.map((question) => {
    const answer = answerMap.get(question.id);
    if (!answer) throw new QuizServiceError("INCOMPLETE_ANSWERS", "请完成所有题目后再提交");
    const questionOptions = options.filter((option) => option.questionId === question.id);
    if (question.type === "single") {
      singleQuestionCount += 1;
      const selectedOptionId = positiveInteger(answer.selectedOptionId, "所选答案");
      const selected = questionOptions.find((option) => option.id === selectedOptionId);
      if (!selected) throw new QuizServiceError("INVALID_OPTION", "所选答案不属于当前题目");
      if (selected.isCorrect) singleCorrectCount += 1;
      return {
        question,
        questionOptions,
        selectedOptionId,
        selectedOptionTextSnapshot: selected.content,
        textAnswer: null,
        isCorrect: selected.isCorrect,
      };
    }
    return {
      question,
      questionOptions,
      selectedOptionId: null,
      selectedOptionTextSnapshot: null,
      textAnswer: textValue(answer.textAnswer, "文字回答", MAX_TEXT_ANSWER),
      isCorrect: null,
    };
  });

  const previousCount = Number(
    db.select({ value: count() }).from(schema.quizAttempts).where(and(eq(schema.quizAttempts.quizId, quizId), memberId ? eq(schema.quizAttempts.memberId, memberId) : undefined)).get()?.value ?? 0,
  );
  const attemptNumber = previousCount + 1;
  let reward: ReturnType<typeof grantQuizReward> | null = null;
  const rewardAlreadyGranted = db
    .select({ id: schema.quizAttempts.id })
    .from(schema.quizAttempts)
    .where(
      and(
        eq(schema.quizAttempts.quizId, quizId),
        eq(schema.quizAttempts.memberId, memberId),
        isNotNull(schema.quizAttempts.rewardBalanceLogId),
      ),
    )
    .get();
  const qualifiesForReward =
    singleQuestionCount > 0 && singleCorrectCount === singleQuestionCount;
  if (qualifiesForReward && !rewardAlreadyGranted) {
    if (!quiz.rewardTicketTypeId || quiz.rewardQuantity < 1 || !quiz.rewardNote) {
      throw new QuizServiceError("REWARD_NOT_CONFIGURED", "这份题版的全对奖励配置不完整", 409);
    }
    try {
      reward = grantQuizReward({
        memberId,
        quizId,
        ticketTypeId: quiz.rewardTicketTypeId,
        quantity: quiz.rewardQuantity,
        note: quiz.rewardNote,
      });
    } catch (error) {
      if (error instanceof TicketRewardError) {
        throw new QuizServiceError(error.code, error.message, error.status);
      }
      throw error;
    }
  }

  const attempt = db
    .insert(schema.quizAttempts)
    .values({
      memberId,
      quizId,
      requestKey,
      attemptNumber,
      singleCorrectCount,
      singleQuestionCount,
      rewardBalanceLogId: reward?.id ?? null,
      rewardTicketNameSnapshot: reward?.ticketName ?? null,
      rewardQuantitySnapshot: reward?.quantity ?? null,
    })
    .returning({ id: schema.quizAttempts.id })
    .get();
  db.insert(schema.quizAnswers)
    .values(
      preparedAnswers.map((prepared, sortOrder) => ({
        attemptId: attempt.id,
        questionId: prepared.question.id,
        questionTypeSnapshot: prepared.question.type,
        promptSnapshot: prepared.question.prompt,
        optionsSnapshot: prepared.questionOptions.map((option) => ({
          id: option.id,
          content: option.content,
          isCorrect: option.isCorrect,
        })),
        selectedOptionId: prepared.selectedOptionId,
        selectedOptionTextSnapshot: prepared.selectedOptionTextSnapshot,
        textAnswer: prepared.textAnswer,
        isCorrect: prepared.isCorrect,
        referenceAnswerSnapshot: prepared.question.referenceAnswer,
        explanationSnapshot: prepared.question.explanation,
        messageSnapshot: prepared.question.message,
        sortOrder,
      })),
    )
    .run();
  return loadAttempt(attempt.id, memberId);
});

export function submitQuiz(memberId: MemberId, quizId: number, input: unknown) {
  return submitQuizTransaction.immediate(memberId, quizId, input);
}
