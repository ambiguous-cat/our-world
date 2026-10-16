import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const projectRoot = process.cwd();
const temporaryDirectory = path.resolve(
  projectRoot,
  ".tmp-balance-notices-smoke",
);
const databasePath = path.join(temporaryDirectory, "our-world.db");
const port = 3017;
const baseUrl = `http://127.0.0.1:${port}/our-world`;
const environment = {
  ...process.env,
  DATABASE_PATH: databasePath,
  PLAYER_ANSWER: "balance-smoke-player",
  ADMIN_ANSWER: "balance-smoke-admin",
  AUTH_SESSION_SECRET:
    "balance-notices-smoke-secret-with-at-least-thirty-two-bytes",
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

async function jsonRequest(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  return {
    status: response.status,
    headers: response.headers,
    body: await response.json(),
  };
}

async function login(answer) {
  const response = await jsonRequest("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "登录响应缺少会话 Cookie");
  return cookie;
}

async function textRequest(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  return { status: response.status, body: await response.text() };
}

try {
  await waitForServer();

  assert.equal(
    (await jsonRequest("/api/player/balance-notices")).status,
    401,
  );
  assert.equal(
    (await jsonRequest("/api/player/balance-history")).status,
    401,
  );

  const adminCookie = await login(environment.ADMIN_ANSWER);
  const adminHeaders = {
    Cookie: adminCookie,
    "Content-Type": "application/json",
  };

  const missingReason = await jsonRequest("/api/admin/balance", {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ ticketTypeId: 1, delta: 2 }),
  });
  assert.equal(missingReason.status, 400);

  const reward = await jsonRequest("/api/admin/balance", {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({
      ticketTypeId: 1,
      delta: 5,
      note: "完成今天的小目标",
    }),
  });
  assert.equal(reward.status, 200);

  const reduce = await jsonRequest("/api/admin/balance", {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({
      ticketTypeId: 1,
      delta: -1,
      note: "测试扣减",
    }),
  });
  assert.equal(reduce.status, 200);

  const playerCookie = await login(environment.PLAYER_ANSWER);
  const playerHeaders = { Cookie: playerCookie };
  const notices = await jsonRequest(
    "/api/player/balance-notices",
    { headers: playerHeaders },
  );
  assert.equal(notices.status, 200);
  assert.equal(notices.body.notices.length, 1);
  assert.equal(notices.body.notices[0].delta, 5);
  assert.equal(notices.body.notices[0].ticketName, "日常幸运券");
  assert.equal(notices.body.notices[0].reason, "完成今天的小目标");

  const home = await textRequest("/home", { headers: playerHeaders });
  assert.equal(home.status, 200);
  assert.match(home.body, /小屋有新消息啦/);
  assert.match(home.body, /日常幸运券 × 5/);

  const history = await jsonRequest(
    "/api/player/balance-history?page=1&pageSize=10",
    { headers: playerHeaders },
  );
  assert.equal(history.status, 200);
  assert.equal(history.body.pagination.total, 1);
  assert.equal(history.body.items[0].source, "admin_reward");
  assert.equal(history.body.items[0].reason, "完成今天的小目标");
  assert.equal(history.body.items[0].balanceAfter, 5);
  assert.equal(history.body.items[0].ticketName, "日常幸运券");

  const invalidPagination = await jsonRequest(
    "/api/player/balance-history?page=0",
    { headers: playerHeaders },
  );
  assert.equal(invalidPagination.status, 400);

  const acknowledgement = await jsonRequest(
    "/api/player/balance-notices",
    {
      method: "PATCH",
      headers: {
        ...playerHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ticketBalanceLogIds: [
          notices.body.notices[0].ticketBalanceLogId,
        ],
      }),
    },
  );
  assert.equal(acknowledgement.status, 200);

  const afterAcknowledgement = await jsonRequest(
    "/api/player/balance-notices",
    { headers: playerHeaders },
  );
  assert.deepEqual(afterAcknowledgement.body.notices, []);

  const verificationDb = new Database(databasePath, { readonly: true });
  const player = verificationDb
    .prepare(
      "SELECT balance FROM player_ticket_balances WHERE ticket_type_id = 1",
    )
    .get();
  const logs = verificationDb
    .prepare(
      "SELECT delta, note FROM ticket_balance_logs ORDER BY id",
    )
    .all();
  const storedNotice = verificationDb
    .prepare(
      "SELECT ticket_balance_log_id, shown_at FROM ticket_grant_notices",
    )
    .get();
  const emailOutbox = verificationDb
    .prepare(
      "SELECT event_type, event_key, subject, sent_at FROM notification_email_outbox ORDER BY id",
    )
    .all();
  assert.equal(verificationDb.prepare("SELECT count(*) n FROM ticket_balance_logs WHERE member_id != 'member_001' OR actor_type != 'member' OR actor_member_id != 'member_002'").get().n, 0);
  assert.equal(verificationDb.prepare("SELECT count(*) n FROM notification_email_outbox WHERE recipient_member_id != 'member_001'").get().n, 0);
  verificationDb.close();

  assert.equal(player.balance, 4);
  assert.deepEqual(logs, [
    { delta: 5, note: "完成今天的小目标" },
    { delta: -1, note: "测试扣减" },
  ]);
  assert.ok(storedNotice.shown_at, "奖励提示应记录首次展示时间");
  assert.deepEqual(emailOutbox, [
    {
      event_type: "ticket_grant",
      event_key: String(storedNotice.ticket_balance_log_id),
      subject: "新的日常幸运券来啦",
      sent_at: null,
    },
  ]);

  console.log("多券种发放原因、玩家记录与首次提示端到端联调通过");
} finally {
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
