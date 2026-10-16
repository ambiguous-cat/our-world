import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const projectRoot = process.cwd();
const temporaryDirectory = path.resolve(
  projectRoot,
  ".tmp-collection-smoke",
);
const databasePath = path.join(temporaryDirectory, "our-world.db");
const port = 3015;
const baseUrl = `http://127.0.0.1:${port}/our-world`;
const environment = {
  ...process.env,
  EMAIL_NOTIFICATIONS_ENABLED: "false",
  DATABASE_PATH: databasePath,
  PLAYER_ANSWER: "collection-smoke-player",
  ADMIN_ANSWER: "collection-smoke-admin",
  AUTH_SESSION_SECRET:
    "collection-smoke-secret-with-at-least-thirty-two-bytes",
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

const verifyDatabase = spawnSync(process.execPath, ["scripts/verify-database.mjs"], {
  cwd: projectRoot,
  env: environment,
  encoding: "utf8",
});
assert.equal(
  verifyDatabase.status,
  0,
  verifyDatabase.stderr || verifyDatabase.stdout,
);

const sqlite = new Database(databasePath);
sqlite.pragma("foreign_keys = ON");
const now = Date.now();
sqlite
  .prepare(
    `INSERT INTO prizes
      (name, description, image_path, remaining_stock, is_active)
     VALUES (?, ?, ?, ?, ?)`,
  )
  .run("后来修改的名字", "后来修改的说明", "/momo/celebrate.jpg", 0, 0);
sqlite
  .prepare(
    `INSERT INTO ticket_prize_pool_items
      (ticket_type_id, prize_id, weight, is_active)
     VALUES (1, 1, 10, 1)`,
  )
  .run();
sqlite
  .prepare(
    `INSERT INTO draw_records
    (member_id, request_key, ticket_type_id, result_type, balance_before, balance_after,
       prize_id, pool_item_id, ticket_snapshot, config_snapshot,
       result_snapshot, created_at) VALUES ('member_001', ?, 1, 'prize', 1, 0, 1, 1, ?, ?, ?, ?)`,
  )
  .run(
    "00000000-0000-4000-8000-000000000001",
    JSON.stringify({
      ticketTypeId: 1,
      name: "日常幸运券",
      kind: "permanent",
      coverImagePath: null,
      drawBackgroundImagePath: "/momo/scratch.jpg",
      themeColor: "#BFD9A8",
      accentColor: "#F3AFC1",
    }),
    JSON.stringify({
      configId: 1,
      ticketTypeId: 1,
      version: 1,
      prizeWeight: 10000,
      retryWeight: 0,
      missWeight: 0,
    }),
    JSON.stringify({
      type: "prize",
      prizeId: 1,
      poolItemId: 1,
      name: "中奖时的蛋糕",
      description: "中奖时永久保留的说明",
      imagePath: "/momo/gifts.jpg",
    }),
    now,
  );
sqlite
  .prepare(
    `INSERT INTO prize_wins
    (member_id, draw_record_id, prize_id, source, name_snapshot, description_snapshot,
       image_path_snapshot, status, created_at, updated_at) VALUES ('member_001', 1, 1, 'draw', '中奖时的蛋糕', '中奖时永久保留的说明',
       '/momo/gifts.jpg', 'unredeemed', ?, ?)`,
  )
  .run(now, now);
sqlite.close();

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

try {
  await waitForServer();

  const unauthorized = await jsonRequest("/api/player/prize-wins");
  assert.equal(unauthorized.status, 401);

  const login = await jsonRequest("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer: environment.PLAYER_ANSWER }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "登录响应缺少会话 Cookie");
  const authenticated = { headers: { Cookie: cookie } };

  const collection = await jsonRequest(
    "/api/player/prize-wins",
    authenticated,
  );
  assert.equal(collection.status, 200);
  assert.equal(collection.body.collectedCount, 1);
  assert.equal(collection.body.unredeemedCount, 1);
  assert.equal(collection.body.totalDraws, 1);
  assert.equal(collection.body.prizeWins[0].name, "中奖时的蛋糕");
  assert.equal(
    collection.body.prizeWins[0].description,
    "中奖时永久保留的说明",
  );

  const request = await jsonRequest("/api/player/prize-wins/1/request", {
    method: "POST",
    ...authenticated,
  });
  assert.equal(request.status, 200);
  assert.equal(request.body.prizeWin.status, "requested");
  assert.ok(request.body.prizeWin.requestedAt);

  const duplicateRequest = await jsonRequest(
    "/api/player/prize-wins/1/request",
    { method: "POST", ...authenticated },
  );
  assert.equal(duplicateRequest.status, 409);

  const cancel = await jsonRequest("/api/player/prize-wins/1/request", {
    method: "DELETE",
    ...authenticated,
  });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.body.prizeWin.status, "unredeemed");
  assert.equal(cancel.body.prizeWin.requestedAt, null);

  const duplicateCancel = await jsonRequest(
    "/api/player/prize-wins/1/request",
    { method: "DELETE", ...authenticated },
  );
  assert.equal(duplicateCancel.status, 409);

  const invalidId = await jsonRequest(
    "/api/player/prize-wins/not-a-number/request",
    { method: "POST", ...authenticated },
  );
  assert.equal(invalidId.status, 400);

  const verificationDb = new Database(databasePath, { readonly: true });
  const actions = verificationDb
    .prepare(
      "SELECT action FROM redemption_logs ORDER BY id",
    )
    .all()
    .map((row) => row.action);
  const finalWin = verificationDb
    .prepare(
      "SELECT status, requested_at, redeemed_at FROM prize_wins WHERE id = 1",
    )
    .get();
  verificationDb.close();

  assert.deepEqual(actions, ["request", "cancel_request"]);
  assert.deepEqual(finalWin, {
    status: "unredeemed",
    requested_at: null,
    redeemed_at: null,
  });

  console.log("玩家收藏与兑换申请端到端联调通过");
} finally {
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
