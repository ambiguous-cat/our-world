import type { MemberId } from "@/core/members/contracts";
import "server-only";

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db, schema, sqlite } from "@/db";
import type { PlayerQuizPublishNoticesResponse } from "../contracts/quiz";
import { QuizServiceError } from "./error";

const MAX_NOTICE_ACKNOWLEDGEMENTS = 100;

export function getPendingQuizPublishNotices(memberId: MemberId): PlayerQuizPublishNoticesResponse {
  const notices = db
    .select({
      quizId: schema.quizPublishNotices.quizId,
      title: schema.quizzes.title,
      description: schema.quizzes.description,
      createdAt: schema.quizPublishNotices.createdAt,
    })
    .from(schema.quizPublishNotices)
    .innerJoin(schema.quizzes, eq(schema.quizPublishNotices.quizId, schema.quizzes.id))
    .where(
      and(
        eq(schema.quizPublishNotices.memberId, memberId),
        isNull(schema.quizPublishNotices.shownAt),
        eq(schema.quizzes.status, "published"),
      ),
    )
    .orderBy(asc(schema.quizPublishNotices.createdAt), asc(schema.quizPublishNotices.quizId))
    .limit(MAX_NOTICE_ACKNOWLEDGEMENTS)
    .all()
    .map((notice) => ({
      quizId: notice.quizId,
      title: notice.title,
      description: notice.description ?? "",
      createdAt: notice.createdAt.toISOString(),
    }));
  return { notices };
}

function noticeIds(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new QuizServiceError("INVALID_REQUEST", "提交的数据格式不正确");
  }
  const ids = (input as Record<string, unknown>).quizIds;
  if (
    !Array.isArray(ids) ||
    ids.length < 1 ||
    ids.length > MAX_NOTICE_ACKNOWLEDGEMENTS ||
    ids.some((id) => typeof id !== "number" || !Number.isSafeInteger(id) || id < 1)
  ) {
    throw new QuizServiceError("INVALID_NOTICE_IDS", "答题消息编号不正确");
  }
  return [...new Set(ids as number[])];
}

const acknowledgeTransaction = sqlite.transaction((memberId: MemberId, input: unknown) => {
  const quizIds = noticeIds(input);
  db.update(schema.quizPublishNotices)
    .set({ shownAt: new Date() })
    .where(
      and(
        inArray(schema.quizPublishNotices.quizId, quizIds),
        eq(schema.quizPublishNotices.memberId, memberId),
        isNull(schema.quizPublishNotices.shownAt),
      ),
    )
    .run();
  return { message: "答题消息已确认" };
});

export function acknowledgeQuizPublishNotices(memberId: MemberId, input: unknown) {
  return acknowledgeTransaction.immediate(memberId, input);
}
