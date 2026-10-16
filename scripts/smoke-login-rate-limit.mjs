import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { migrateDatabase } from "./migrate-database.mjs";
import Database from "better-sqlite3";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "our-world-login-"));
const databasePath = path.join(temporaryDirectory, "app.db");
migrateDatabase(databasePath);
const fixture = new Database(databasePath);
try {
  fixture.exec(`
    INSERT INTO player_ticket_balances (member_id,ticket_type_id,balance) VALUES ('member_002',1,99);
    INSERT INTO prizes (id,name) VALUES (1,'管理员私有测试礼物');
    INSERT INTO prize_wins (id,member_id,prize_id,source,name_snapshot) VALUES (1,'member_002',1,'admin_grant','不可串读');
    INSERT INTO ticket_balance_logs (id,member_id,actor_type,actor_member_id,ticket_type_id,ticket_name_snapshot,delta,balance_before,balance_after,reason,note)
      VALUES (1,'member_002','member','member_002',1,'测试券',1,0,1,'admin_grant','不可串读的原因');
    INSERT INTO ticket_grant_notices (ticket_balance_log_id) VALUES (1);
    INSERT INTO draw_records (id,member_id,request_key,ticket_type_id,result_type,balance_before,balance_after,ticket_snapshot,config_snapshot,result_snapshot)
      VALUES (1,'member_002','00000000-0000-4000-8000-000000000001',1,'miss',1,0,'{}','{}','{"type":"miss"}');
    INSERT INTO quizzes (id,created_by_member_id,title,status) VALUES (1,'member_002','隔离题版','published');
    INSERT INTO quiz_publish_notices (member_id,quiz_id) VALUES ('member_002',1);
    INSERT INTO quiz_attempts (id,member_id,quiz_id,request_key,attempt_number) VALUES (1,'member_002',1,'00000000-0000-4000-8000-000000000002',1);
  `);
} finally { fixture.close(); }
const port = 3018;
const originUrl = `http://127.0.0.1:${port}`;
const baseUrl = `${originUrl}/our-world`;
const environment = {
  ...process.env,
  DATABASE_PATH: databasePath,
  EMAIL_NOTIFICATIONS_ENABLED: "false",
  PLAYER_ANSWER: "rate-limit-smoke-player",
  ADMIN_ANSWER: "rate-limit-smoke-admin",
  AUTH_SESSION_SECRET:
    "login-rate-limit-smoke-secret-with-at-least-thirty-two-bytes",
  AUTH_COOKIE_SECURE: "false",
  AUTH_LOGIN_RATE_LIMIT_MAX_FAILURES: "3",
  AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS: "60",
  AUTH_LOGIN_RATE_LIMIT_LOCK_SECONDS: "2",
};

const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(port)],
  {
    cwd: projectRoot,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

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

async function login(answer) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ answer }),
  });

  return {
    status: response.status,
    headers: response.headers,
    body: await response.json(),
  };
}

function signedToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", environment.AUTH_SESSION_SECRET)
    .update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

async function assertSessionAccess(token, authenticated) {
  const response = await fetch(baseUrl, {
    headers: { Cookie: `our_world_session=${token}` },
    redirect: "manual",
  });
  assert.equal(response.status, authenticated ? 307 : 200);
  if (authenticated) assert.match(response.headers.get("location"), /\/our-world\/home$/);
}

try {
  await waitForServer();

  assert.equal((await fetch(originUrl)).status, 404);
  assert.equal((await fetch(`${originUrl}/api/auth/login`)).status, 404);
  assert.equal(
    (await fetch(`${baseUrl}/momo/welcome-transparent.png`)).status,
    200,
  );

  const malformed = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: "{",
  });
  assert.equal(malformed.status, 400);

  assert.equal((await login("wrong-1")).status, 401);
  assert.equal((await login("wrong-2")).status, 401);

  const resetBySuccess = await login(environment.PLAYER_ANSWER);
  assert.equal(resetBySuccess.status, 200);
  assert.deepEqual(resetBySuccess.body, { role: "player", memberId: "member_001" });
  const playerCookie = resetBySuccess.headers.get("set-cookie");
  const playerToken = playerCookie.match(/our_world_session=([^;]+)/)[1];
  assert.deepEqual(JSON.parse(Buffer.from(playerToken.split(".")[0], "base64url")), {
    version: 2, role: "player", memberId: "member_001",
  });
  await assertSessionAccess(playerToken, true);
  const adminLogin = await login(environment.ADMIN_ANSWER);
  assert.equal(adminLogin.status, 200);
  assert.deepEqual(adminLogin.body, { role: "admin", memberId: "member_002" });
  await assertSessionAccess(adminLogin.headers.get("set-cookie").match(/our_world_session=([^;]+)/)[1], true);
  for (const role of ["player", "admin"]) {
    await assertSessionAccess(signedToken({ version: 1, role }), true);
  }
  for (const payload of [
    { version: 2, role: "admin", memberId: "member_001" },
    { version: 2, role: "player", memberId: "member_002" },
    { version: 2, role: "player", memberId: "unknown" },
    { version: 2, role: "player" },
    { version: 3, role: "player", memberId: "member_001" },
    { version: 1, role: "unknown" },
    null,
  ]) await assertSessionAccess(signedToken(payload), false);
  await assertSessionAccess(`${playerToken}tampered`, false);
  const denied = await fetch(`${baseUrl}/api/admin/home-note`, {
    method: "PUT", headers: { Cookie: `our_world_session=${playerToken}` },
  });
  assert.equal(denied.status, 401);
  const playerHeaders = { Cookie: `our_world_session=${playerToken}`, "Content-Type": "application/json" };
  const playerRequest = (url, method = "GET", body) => fetch(`${baseUrl}${url}`, {
    method, headers: playerHeaders, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.equal((await (await playerRequest('/api/player/summary')).json()).tickets.find((t) => t.id === 1).balance, 0);
  const collection = await (await playerRequest('/api/player/prize-wins')).json();
  assert.equal(collection.prizeWins.length, 0);
  assert.equal(collection.totalDraws, 0);
  assert.equal((await (await playerRequest('/api/player/balance-history')).json()).items.length, 0);
  assert.equal((await (await playerRequest('/api/player/balance-notices')).json()).notices.length, 0);
  assert.equal((await (await playerRequest('/api/player/quiz-notices')).json()).notices.length, 0);
  assert.equal((await (await playerRequest('/api/player/quizzes')).json()).quizzes[0].attempts.length, 0);
  assert.equal((await playerRequest('/api/player/prize-wins/1/request', 'POST')).status, 404);
  assert.equal((await playerRequest('/api/player/draw', 'POST', { requestKey: '00000000-0000-4000-8000-000000000001', ticketTypeId: 1, memberId: 'member_002' })).status, 409);
  assert.equal((await playerRequest('/api/player/quizzes/1/attempts', 'POST', { requestKey: '00000000-0000-4000-8000-000000000002', answers: [], memberId: 'member_002' })).status, 409);
  await playerRequest('/api/player/balance-notices', 'PATCH', { ticketBalanceLogIds: [1] });
  await playerRequest('/api/player/quiz-notices', 'PATCH', { quizIds: [1] });
  const isolated = new Database(databasePath, { readonly: true });
  try {
    assert.equal(isolated.prepare('SELECT shown_at FROM ticket_grant_notices').get().shown_at, null);
    assert.equal(isolated.prepare('SELECT shown_at FROM quiz_publish_notices').get().shown_at, null);
    assert.equal(isolated.prepare('SELECT status FROM prize_wins').get().status, 'unredeemed');
  } finally { isolated.close(); }
  // 空请求体在授权后返回 400，不执行写操作；同时验证旧角色会话权限。
  for (const [role, memberId] of [["player", "member_001"], ["admin", "member_002"]]) {
    for (const version of [1, 2]) {
      const token = signedToken(version === 1 ? { version, role } : { version, role, memberId });
      const response = await fetch(`${baseUrl}/api/admin/home-note`, {
        method: "PUT", headers: { Cookie: `our_world_session=${token}` },
      });
      assert.equal(response.status, role === "admin" ? 400 : 401);
    }
  }
  assert.equal((await fetch(`${baseUrl}/api/admin/home-note`, { method: "PUT" })).status, 401);
  assert.ok(
    resetBySuccess.headers.get("set-cookie"),
    "成功登录应签发会话 Cookie",
  );
  assert.match(
    resetBySuccess.headers.get("set-cookie") ?? "",
    /Path=\/our-world(?:;|$)/,
    "会话 Cookie 应限制在 /our-world 路径",
  );
  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
  });
  assert.equal(logout.status, 200);
  const logoutCookies = logout.headers.get("set-cookie") ?? "";
  assert.match(logoutCookies, /Path=\/our-world(?:;|,|$)/);
  assert.match(logoutCookies, /Path=\/(?:;|,|$)/);

  assert.equal((await login("")).status, 401);
  assert.equal((await login("wrong-3")).status, 401);

  const globalLimited = await login("wrong-4");
  assert.equal(globalLimited.status, 429);
  assert.equal(globalLimited.body.retryAfterSeconds, 2);
  assert.equal(globalLimited.headers.get("retry-after"), "2");
  assert.equal(globalLimited.headers.get("cache-control"), "no-store");

  const validWhileGloballyLimited = await login(environment.PLAYER_ANSWER);
  assert.equal(validWhileGloballyLimited.status, 429);

  await new Promise((resolve) => setTimeout(resolve, 2100));

  const afterLock = await login(environment.PLAYER_ANSWER);
  assert.equal(afterLock.status, 200);

  assert.equal(afterLock.body.memberId, "member_001");
  console.log("固定成员身份、新旧会话、非法身份拒绝、角色隔离及登录限流联调通过");
} finally {
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
  assert.equal(path.dirname(temporaryDirectory), os.tmpdir());
  assert.ok(path.basename(temporaryDirectory).startsWith("our-world-login-"));
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
