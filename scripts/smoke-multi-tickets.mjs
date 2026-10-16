import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const projectRoot = process.cwd();
const temporaryDirectory = path.resolve(projectRoot, ".tmp-multi-tickets-smoke");
const databasePath = path.join(temporaryDirectory, "our-world.db");
const port = 3018;
const baseUrl = `http://127.0.0.1:${port}/our-world`;
const environment = {
  ...process.env,
  EMAIL_NOTIFICATIONS_ENABLED: "false",
  DATABASE_PATH: databasePath,
  PLAYER_ANSWER: "tickets-smoke-player",
  ADMIN_ANSWER: "tickets-smoke-admin",
  AUTH_SESSION_SECRET: "multi-tickets-smoke-secret-with-at-least-thirty-two-bytes",
  AUTH_COOKIE_SECURE: "false",
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

try {
  await waitForServer();
  const adminCookie = await login(environment.ADMIN_ANSWER);
  const adminHeaders = {
    Cookie: adminCookie,
    "Content-Type": "application/json",
  };
  const overview = await jsonRequest("/api/admin/overview", {
    headers: adminHeaders,
  });
  assert.equal(overview.status, 200);
  assert.deepEqual(
    overview.body.tickets.map((ticket) => ticket.name),
    ["日常幸运券", "心动惊喜券"],
  );
  assert.ok(
    overview.body.tickets.every((ticket) =>
      ticket.drawBackgroundImagePath.startsWith("/"),
    ),
    "每种奖券都应配置站内刮奖背景",
  );
  assert.ok(
    overview.body.tickets.every((ticket) => ticket.displayIcon === "ticket"),
    "默认常驻券应使用奖券图标",
  );

  const prize = await jsonRequest("/api/admin/prizes", {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({
      name: "多券种测试礼物",
      description: "只会从日常券抽中",
      imagePath: "/momo/celebrate.jpg",
      initialStock: 1,
      sortOrder: 0,
    }),
  });
  assert.equal(prize.status, 200);
  const refreshed = await jsonRequest("/api/admin/overview", {
    headers: adminHeaders,
  });
  const prizeId = refreshed.body.prizes[0].id;

  assert.equal(
    (
      await jsonRequest("/api/admin/ticket-pool", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ ticketTypeId: 1, prizeId, weight: 10 }),
      })
    ).status,
    200,
  );
  for (const body of [
    { ticketTypeId: 1, prizeWeight: 10000, retryWeight: 0, missWeight: 0 },
    { ticketTypeId: 2, prizeWeight: 0, retryWeight: 0, missWeight: 10000 },
  ]) {
    assert.equal(
      (
        await jsonRequest("/api/admin/probability", {
          method: "PUT",
          headers: adminHeaders,
          body: JSON.stringify(body),
        })
      ).status,
      200,
    );
  }
  for (const ticketTypeId of [1, 2]) {
    assert.equal(
      (
        await jsonRequest("/api/admin/balance", {
          method: "PATCH",
          headers: adminHeaders,
          body: JSON.stringify({
            ticketTypeId,
            delta: 2,
            note: `测试发放第 ${ticketTypeId} 类券`,
          }),
        })
      ).status,
      200,
    );
  }

  const playerCookie = await login(environment.PLAYER_ANSWER);
  const playerHeaders = {
    Cookie: playerCookie,
    "Content-Type": "application/json",
  };
  const summary = await jsonRequest("/api/player/summary", {
    headers: playerHeaders,
  });
  assert.equal(summary.body.totalTickets, 4);
  assert.deepEqual(
    summary.body.tickets.map((ticket) => ticket.balance),
    [2, 2],
  );
  assert.ok(
    summary.body.tickets.every((ticket) => ticket.displayIcon === "ticket"),
    "玩家券包应返回券种图标",
  );

  const dailyKey = "00000000-0000-4000-8000-000000000101";
  const dailyDraw = await jsonRequest("/api/player/draw", {
    method: "POST",
    headers: playerHeaders,
    body: JSON.stringify({ requestKey: dailyKey, ticketTypeId: 1 }),
  });
  assert.equal(dailyDraw.status, 200);
  assert.equal(dailyDraw.body.result.kind, "prize");
  assert.equal(dailyDraw.body.remainingTickets, 1);

  const duplicate = await jsonRequest("/api/player/draw", {
    method: "POST",
    headers: playerHeaders,
    body: JSON.stringify({ requestKey: dailyKey, ticketTypeId: 1 }),
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.drawRecordId, dailyDraw.body.drawRecordId);
  assert.equal(duplicate.body.remainingTickets, 1);

  const heartDraw = await jsonRequest("/api/player/draw", {
    method: "POST",
    headers: playerHeaders,
    body: JSON.stringify({
      requestKey: "00000000-0000-4000-8000-000000000102",
      ticketTypeId: 2,
    }),
  });
  assert.equal(heartDraw.status, 200);
  assert.equal(heartDraw.body.result.kind, "thanks");
  assert.equal(heartDraw.body.remainingTickets, 1);

  const verificationDb = new Database(databasePath, { readonly: true });
  const balances = verificationDb
    .prepare(
      "SELECT ticket_type_id, balance FROM player_ticket_balances ORDER BY ticket_type_id",
    )
    .all();
  const draws = verificationDb
    .prepare(
      "SELECT ticket_type_id, ticket_snapshot, config_snapshot FROM draw_records ORDER BY id",
    )
    .all();
  const stock = verificationDb
    .prepare("SELECT remaining_stock FROM prizes WHERE id = ?")
    .get(prizeId);
  verificationDb.close();

  assert.deepEqual(balances, [
    { ticket_type_id: 1, balance: 1 },
    { ticket_type_id: 2, balance: 1 },
  ]);
  assert.equal(draws.length, 2, "幂等重试不得创建第二条抽奖记录");
  assert.deepEqual(
    draws.map((draw) => JSON.parse(draw.ticket_snapshot).name),
    ["日常幸运券", "心动惊喜券"],
  );
  assert.deepEqual(
    draws.map((draw) => JSON.parse(draw.config_snapshot).ticketTypeId),
    [1, 2],
  );
  assert.equal(stock.remaining_stock, 0);

  console.log("多券种独立余额、概率、奖池、背景、幂等和库存联调通过");
} finally {
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
