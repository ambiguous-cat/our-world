import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const projectRoot = process.cwd();
const temporaryDirectory = path.resolve(projectRoot, ".tmp-quiz-smoke");
const databasePath = path.join(temporaryDirectory, "our-world.db");
const port = 3020;
const baseUrl = `http://127.0.0.1:${port}/our-world`;
const environment = {
  ...process.env,
  DATABASE_PATH: databasePath,
  PLAYER_ANSWER: "quiz-smoke-player",
  ADMIN_ANSWER: "quiz-smoke-admin",
  AUTH_SESSION_SECRET: "quiz-smoke-secret-with-at-least-thirty-two-bytes",
  AUTH_COOKIE_SECURE: "false",
  EMAIL_NOTIFICATIONS_ENABLED: "true",
  RESEND_API_KEY: "",
  EMAIL_FROM_ADDRESS: "",
  EMAIL_FROM_NAME: "",
  PLAYER_NOTIFICATION_EMAIL: "",
  OUR_WORLD_PUBLIC_URL: "",
};

assert.ok(
  temporaryDirectory.startsWith(`${projectRoot}${path.sep}`),
  "临时目录必须位于项目目录内",
);
fs.rmSync(temporaryDirectory, { recursive: true, force: true });
fs.mkdirSync(temporaryDirectory, { recursive: true });

const migrate = spawnSync(process.execPath, ["scripts/migrate-database.mjs"], {
  cwd: projectRoot,
  env: environment,
  encoding: "utf8",
});
assert.equal(migrate.status, 0, migrate.stderr || migrate.stdout);

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
  { cwd: projectRoot, env: environment, stdio: ["ignore", "pipe", "pipe"] },
);
let serverOutput = "";
server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // 服务仍在启动。
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`测试服务器启动超时\n${serverOutput}`);
}

async function jsonRequest(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  return { status: response.status, headers: response.headers, body: await response.json() };
}

async function login(answer) {
  const response = await jsonRequest("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}

async function textRequest(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  return { status: response.status, body: await response.text() };
}

try {
  await waitForServer();
  const loginPage = await textRequest("");
  assert.ok(!loginPage.body.includes(environment.PLAYER_ANSWER));
  const publicPreview = await textRequest("/memories/preview");
  assert.ok(!publicPreview.body.includes(environment.PLAYER_ANSWER));
  assert.equal((await jsonRequest("/api/admin/quizzes")).status, 401);
  assert.equal((await jsonRequest("/api/player/quizzes")).status, 401);
  assert.equal((await jsonRequest("/api/player/quiz-notices")).status, 401);

  const adminCookie = await login(environment.ADMIN_ANSWER);
  const markdown = `# 我们的小测试

> 测试导入、解析与开放回答

## [single] 我最喜欢哪一种？

- [ ] 咖啡
- [x] 奶茶

### 解析（选填）

**每次约会**都会先找奶茶店。

- 这是第一条解析

> 原文出处

### 留言内容（选填）

*答得开心最重要。*

## [text] 你最想一起完成什么？

### 参考答案

一起去旅行。
`;
  const form = new FormData();
  form.set("file", new File([markdown], "quiz.md", { type: "text/markdown" }));
  const importedResponse = await fetch(`${baseUrl}/api/admin/quizzes/import`, {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: form,
  });
  assert.equal(importedResponse.status, 200);
  const imported = await importedResponse.json();
  assert.equal(imported.draft.questions.length, 2);
  assert.equal(
    imported.draft.questions[0].explanation,
    "**每次约会**都会先找奶茶店。\n\n- 这是第一条解析\n\n> 原文出处",
  );
  assert.equal(imported.draft.questions[0].message, "*答得开心最重要。*");

  const create = await jsonRequest("/api/admin/quizzes", {
    method: "POST",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      ...imported.draft,
      rewardTicketTypeId: 1,
      rewardQuantity: 2,
      rewardNote: "",
    }),
  });
  assert.equal(create.status, 200);
  const quizId = create.body.quizId;
  const publish = await jsonRequest(`/api/admin/quizzes/${quizId}`, {
    method: "PATCH",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "publish" }),
  });
  assert.equal(publish.status, 200);

  const playerCookie = await login(environment.PLAYER_ANSWER);
  const playerHeaders = { Cookie: playerCookie, "Content-Type": "application/json" };
  const publishNotices = await jsonRequest("/api/player/quiz-notices", {
    headers: playerHeaders,
  });
  assert.equal(publishNotices.status, 200);
  assert.equal(publishNotices.body.notices.length, 1);
  assert.equal(publishNotices.body.notices[0].quizId, quizId);
  assert.equal(publishNotices.body.notices[0].title, "我们的小测试");

  const homeWithChallenge = await textRequest("/home", { headers: playerHeaders });
  assert.equal(homeWithChallenge.status, 200);
  assert.ok(homeWithChallenge.body.includes(environment.PLAYER_ANSWER));
  assert.ok(!homeWithChallenge.body.includes("小狗"));
  for (const pathname of ["/scratch", "/quiz", "/memories/preview"]) {
    const page = await textRequest(pathname, { headers: playerHeaders });
    assert.equal(page.status, 200);
    assert.ok(page.body.includes(environment.PLAYER_ANSWER), pathname);
    assert.ok(!page.body.includes("小狗"), pathname);
  }
  assert.match(homeWithChallenge.body, /小屋有新消息啦/);
  assert.match(homeWithChallenge.body, /我们的小测试/);

  const acknowledgePublish = await jsonRequest("/api/player/quiz-notices", {
    method: "PATCH",
    headers: playerHeaders,
    body: JSON.stringify({ quizIds: [quizId] }),
  });
  assert.equal(acknowledgePublish.status, 200);
  assert.deepEqual(
    (await jsonRequest("/api/player/quiz-notices", { headers: playerHeaders })).body.notices,
    [],
  );
  const playerWorkspace = await jsonRequest("/api/player/quizzes", { headers: playerHeaders });
  assert.equal(playerWorkspace.status, 200);
  const playerQuiz = playerWorkspace.body.quizzes[0];
  assert.equal(playerQuiz.rewardAvailable, true);
  assert.equal("isCorrect" in playerQuiz.questions[0].options[0], false);

  const firstKey = crypto.randomUUID();
  const firstBody = {
    requestKey: firstKey,
    answers: [
      { questionId: playerQuiz.questions[0].id, selectedOptionId: playerQuiz.questions[0].options[0].id },
      { questionId: playerQuiz.questions[1].id, textAnswer: "一起看很多地方" },
    ],
  };
  const first = await jsonRequest(`/api/player/quizzes/${quizId}/attempts`, {
    method: "POST", headers: playerHeaders, body: JSON.stringify(firstBody),
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.singleCorrectCount, 0);
  assert.equal(first.body.reward, null);
  assert.equal(
    first.body.answers[0].explanation,
    "**每次约会**都会先找奶茶店。\n\n- 这是第一条解析\n\n> 原文出处",
  );
  assert.equal(first.body.answers[0].message, "*答得开心最重要。*");
  assert.equal(first.body.answers[1].referenceAnswer, "一起去旅行。");

  const secondBody = {
    requestKey: crypto.randomUUID(),
    answers: [
      { questionId: playerQuiz.questions[0].id, selectedOptionId: playerQuiz.questions[0].options[1].id },
      { questionId: playerQuiz.questions[1].id, textAnswer: "开放问题的第二次回答" },
    ],
  };
  const second = await jsonRequest(`/api/player/quizzes/${quizId}/attempts`, {
    method: "POST",
    headers: playerHeaders,
    body: JSON.stringify(secondBody),
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.attemptNumber, 2);
  assert.deepEqual(second.body.reward, {
    ticketName: "日常幸运券",
    quantity: 2,
    note: `聪明的${environment.PLAYER_ANSWER}通关了我们的小测试挑战`,
  });

  const retry = await jsonRequest(`/api/player/quizzes/${quizId}/attempts`, {
    method: "POST", headers: playerHeaders, body: JSON.stringify(secondBody),
  });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.id, second.body.id);

  const third = await jsonRequest(`/api/player/quizzes/${quizId}/attempts`, {
    method: "POST",
    headers: playerHeaders,
    body: JSON.stringify({ ...secondBody, requestKey: crypto.randomUUID() }),
  });
  assert.equal(third.status, 200);
  assert.equal(third.body.attemptNumber, 3);
  assert.equal(third.body.reward, null);

  const adminWorkspace = await jsonRequest("/api/admin/quizzes", {
    headers: { Cookie: adminCookie },
  });
  assert.equal(adminWorkspace.body.quizzes[0].attempts.length, 3);

  const verificationDb = new Database(databasePath, { readonly: true });
  const balance = verificationDb.prepare(
    "SELECT balance FROM player_ticket_balances WHERE ticket_type_id = 1",
  ).get();
  const rewards = verificationDb.prepare(
    "SELECT COUNT(*) AS total FROM external_ticket_grants WHERE source_type = 'quiz'",
  ).get();
  const attempts = verificationDb.prepare("SELECT COUNT(*) AS total FROM quiz_attempts").get();
  const answerSnapshot = verificationDb.prepare(
    "SELECT message_snapshot FROM quiz_answers WHERE attempt_id = ? AND question_type_snapshot = 'single'",
  ).get(first.body.id);
  const rewardNotice = verificationDb.prepare(
    "SELECT ticket_balance_log_id, shown_at FROM ticket_grant_notices",
  ).get();
  const emailOutbox = verificationDb.prepare(
    "SELECT event_type, event_key, sent_at FROM notification_email_outbox ORDER BY id",
  ).all();
  assert.equal(verificationDb.prepare("SELECT count(*) n FROM quiz_attempts WHERE member_id != 'member_001'").get().n, 0);
  assert.equal(verificationDb.prepare("SELECT count(*) n FROM quizzes WHERE created_by_member_id != 'member_002'").get().n, 0);
  assert.equal(verificationDb.prepare("SELECT count(*) n FROM ticket_balance_logs WHERE member_id != 'member_001' OR actor_type != 'system' OR actor_member_id IS NOT NULL").get().n, 0);
  assert.equal(verificationDb.prepare("SELECT count(*) n FROM notification_email_outbox WHERE recipient_member_id != 'member_001'").get().n, 0);
  verificationDb.close();
  assert.equal(balance.balance, 2);
  assert.equal(rewards.total, 1);
  assert.equal(attempts.total, 3);
  assert.equal(answerSnapshot.message_snapshot, "*答得开心最重要。*");
  assert.equal(rewardNotice.shown_at, null);
  assert.deepEqual(emailOutbox, [
    { event_type: "quiz_published", event_key: String(quizId), sent_at: null },
    {
      event_type: "ticket_grant",
      event_key: String(rewardNotice.ticket_balance_log_id),
      sent_at: null,
    },
  ]);

  const close = await jsonRequest(`/api/admin/quizzes/${quizId}`, {
    method: "PATCH",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "close" }),
  });
  assert.equal(close.status, 200);
  const afterClose = await jsonRequest(`/api/player/quizzes/${quizId}/attempts`, {
    method: "POST",
    headers: playerHeaders,
    body: JSON.stringify({ ...firstBody, requestKey: crypto.randomUUID() }),
  });
  assert.equal(afterClose.status, 409);

  console.log("答题导入、首次全对发奖、多次作答、揭晓、幂等奖励与关闭流程：通过");
} finally {
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
