import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const projectRoot = process.cwd();
const temporaryDirectory = path.resolve(projectRoot, ".tmp-admin-records-smoke");
const databasePath = path.join(temporaryDirectory, "our-world.db");
const port = 3016;
const baseUrl = `http://127.0.0.1:${port}/our-world`;
const environment = {
  ...process.env,
  EMAIL_NOTIFICATIONS_ENABLED: "false",
  DATABASE_PATH: databasePath,
  PLAYER_ANSWER: "records-smoke-player",
  ADMIN_ANSWER: "records-smoke-admin",
  AUTH_SESSION_SECRET: "records-smoke-secret-with-at-least-thirty-two-bytes",
  AUTH_COOKIE_SECURE: "false",
};

assert.ok(
  temporaryDirectory.startsWith(`${projectRoot}${path.sep}`),
  "临时目录必须位于项目目录内",
);
fs.rmSync(temporaryDirectory, { recursive: true, force: true });
fs.mkdirSync(temporaryDirectory, { recursive: true });

for (const script of [
  "scripts/migrate-database.mjs",
  "scripts/verify-database.mjs",
]) {
  const result = spawnSync(process.execPath, [script], {
    cwd: projectRoot,
    env: environment,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

const sqlite = new Database(databasePath);
sqlite.pragma("foreign_keys = ON");
const now = Date.now();
const configSnapshot = JSON.stringify({
  configId: 1,
  ticketTypeId: 1,
  version: 1,
  prizeWeight: 10000,
  retryWeight: 0,
  missWeight: 0,
});
sqlite
  .prepare(
    `INSERT INTO prizes
      (name, description, remaining_stock, is_active)
     VALUES ('当前奖品名', '当前说明', 5, 1)`,
  )
  .run();
sqlite
  .prepare(
    `INSERT INTO ticket_prize_pool_items
      (ticket_type_id, prize_id, weight, is_active)
     VALUES (1, 1, 10, 1)`,
  )
  .run();

const insertDraw = sqlite.prepare(
  `INSERT INTO draw_records
    (member_id, request_key, ticket_type_id, result_type, balance_before, balance_after,
     prize_id, pool_item_id, ticket_snapshot, config_snapshot,
     result_snapshot, created_at) VALUES ('member_001', ?, 1, 'prize', ?, ?, 1, 1, ?, ?, ?, ?)`,
);
const insertWin = sqlite.prepare(
  `INSERT INTO prize_wins
    (member_id, draw_record_id, prize_id, source, name_snapshot, description_snapshot,
     status, requested_at, redeemed_at, revoked_at, created_at, updated_at) VALUES ('member_001', ?, 1, 'draw', ?, ?, ?, ?, NULL, NULL, ?, ?)`,
);
for (let index = 1; index <= 3; index += 1) {
  insertDraw.run(
    `00000000-0000-4000-8000-00000000000${index}`,
    4 - index + 1,
    4 - index,
    JSON.stringify({
      ticketTypeId: 1,
      name: "日常幸运券",
      kind: "permanent",
      coverImagePath: null,
      drawBackgroundImagePath: "/momo/scratch.jpg",
      themeColor: "#BFD9A8",
      accentColor: "#F3AFC1",
    }),
    configSnapshot,
    JSON.stringify({
      type: "prize",
      prizeId: 1,
      poolItemId: 1,
      name: `中奖快照 ${index}`,
      description: `永久说明 ${index}`,
      imagePath: null,
    }),
    now + index,
  );
  const requested = index === 1 || index === 3;
  insertWin.run(
    index,
    `中奖快照 ${index}`,
    `永久说明 ${index}`,
    requested ? "requested" : "unredeemed",
    requested ? now + index + 10 : null,
    now + index,
    now + index + 10,
  );
  if (requested) {
    sqlite
      .prepare(
        `INSERT INTO redemption_logs
    (actor_type, actor_member_id, prize_win_id, action, created_at) VALUES ('member', 'member_001', ?, 'request', ?)`,
      )
      .run(index, now + index + 10);
  }
}
sqlite
  .prepare(
    `INSERT INTO ticket_balance_logs
    (member_id, actor_type, actor_member_id, ticket_type_id, ticket_name_snapshot, delta, balance_before,
       balance_after, reason, note, created_at) VALUES ('member_001', 'member', 'member_002', 1, '日常幸运券', 5, 0, 5, 'admin_grant', '测试发放奖券', ?)`,
  )
  .run(now);
sqlite
  .prepare(
    `INSERT INTO ticket_balance_logs
    (member_id, actor_type, actor_member_id, ticket_type_id, ticket_name_snapshot, delta, balance_before,
       balance_after, reason, draw_record_id, created_at) VALUES ('member_001', 'member', 'member_001', 1, '日常幸运券', -1, 4, 3, 'draw_cost', 1, ?)`,
  )
  .run(now + 1);
sqlite
  .prepare(
    `INSERT INTO prize_stock_logs
    (actor_type, actor_member_id, prize_id, delta, stock_before, stock_after, reason, note, created_at) VALUES ('member', 'member_002', 1, 5, 0, 5, 'admin_add', '测试初始库存', ?)`,
  )
  .run(now);
sqlite
  .prepare(
    `INSERT INTO prize_stock_logs
    (actor_type, actor_member_id, prize_id, delta, stock_before, stock_after, reason, draw_record_id, created_at) VALUES ('member', 'member_001', 1, -1, 5, 4, 'draw', 1, ?)`,
  )
  .run(now + 1);
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
  assert.equal((await jsonRequest("/api/admin/redemptions")).status, 401);
  assert.equal((await jsonRequest("/api/admin/history")).status, 401);

  const login = await jsonRequest("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer: environment.ADMIN_ANSWER }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie, "登录响应缺少会话 Cookie");
  const authenticated = { headers: { Cookie: cookie } };

  const requested = await jsonRequest(
    "/api/admin/redemptions?status=requested&page=1&pageSize=20",
    authenticated,
  );
  assert.equal(requested.status, 200);
  assert.equal(requested.body.items.length, 2);
  assert.equal(requested.body.counts.requested, 2);
  assert.equal(requested.body.items[0].name, "中奖快照 3");
  assert.equal(requested.body.items[0].logs[0].action, "request");

  const grant = await jsonRequest("/api/admin/redemptions", {
    method: "POST",
    headers: { ...authenticated.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ prizeId: 1 }),
  });
  assert.equal(grant.status, 200);

  const grantedList = await jsonRequest(
    "/api/admin/redemptions?status=unredeemed",
    authenticated,
  );
  assert.equal(grantedList.status, 200);
  const granted = grantedList.body.items.find(
    (item) => item.source === "admin_grant",
  );
  assert.ok(granted, "管理员发放的奖券没有出现在未兑换列表");
  assert.equal(granted.name, "当前奖品名");
  assert.equal(granted.logs[0].action, "grant");

  const playerLogin = await jsonRequest("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer: environment.PLAYER_ANSWER }),
  });
  assert.equal(playerLogin.status, 200);
  const playerCookie = playerLogin.headers.get("set-cookie")?.split(";")[0];
  assert.ok(playerCookie, "玩家登录响应缺少会话 Cookie");
  const playerAuthenticated = { headers: { Cookie: playerCookie } };
  const collectionAfterGrant = await jsonRequest(
    "/api/player/prize-wins",
    playerAuthenticated,
  );
  assert.equal(collectionAfterGrant.status, 200);
  assert.ok(
    collectionAfterGrant.body.prizeWins.some(
      (item) => item.id === granted.id && item.name === "当前奖品名",
    ),
  );
  assert.equal(collectionAfterGrant.body.totalDraws, 3);

  const revoke = await jsonRequest(
    `/api/admin/redemptions/${granted.id}`,
    {
      method: "PATCH",
      headers: {
        ...authenticated.headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "revoke" }),
    },
  );
  assert.equal(revoke.status, 200);
  const collectionAfterRevoke = await jsonRequest(
    "/api/player/prize-wins",
    playerAuthenticated,
  );
  assert.ok(
    !collectionAfterRevoke.body.prizeWins.some(
      (item) => item.id === granted.id,
    ),
  );
  const restore = await jsonRequest(
    `/api/admin/redemptions/${granted.id}`,
    {
      method: "PATCH",
      headers: {
        ...authenticated.headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "restore" }),
    },
  );
  assert.equal(restore.status, 200);
  const collectionAfterRestore = await jsonRequest(
    "/api/player/prize-wins",
    playerAuthenticated,
  );
  assert.ok(
    collectionAfterRestore.body.prizeWins.some(
      (item) => item.id === granted.id,
    ),
  );

  const reject = await jsonRequest("/api/admin/redemptions/1", {
    method: "PATCH",
    headers: { ...authenticated.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "reject", note: "稍后再兑换" }),
  });
  assert.equal(reject.status, 200);

  const directRedeem = await jsonRequest("/api/admin/redemptions/2", {
    method: "PATCH",
    headers: { ...authenticated.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "redeem" }),
  });
  assert.equal(directRedeem.status, 200);
  const undo = await jsonRequest("/api/admin/redemptions/2", {
    method: "PATCH",
    headers: { ...authenticated.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "undo_redeem" }),
  });
  assert.equal(undo.status, 200);

  const approve = await jsonRequest("/api/admin/redemptions/3", {
    method: "PATCH",
    headers: { ...authenticated.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "redeem" }),
  });
  assert.equal(approve.status, 200);
  const duplicate = await jsonRequest("/api/admin/redemptions/3", {
    method: "PATCH",
    headers: { ...authenticated.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "redeem" }),
  });
  assert.equal(duplicate.status, 409);

  for (const type of ["draws", "balance", "stock"]) {
    const history = await jsonRequest(
      `/api/admin/history?type=${type}&page=1&pageSize=1`,
      authenticated,
    );
    assert.equal(history.status, 200);
    assert.equal(history.body.type, type);
    assert.equal(history.body.items.length, 1);
    assert.ok(history.body.pagination.total >= 2);
  }
  assert.equal(
    (
      await jsonRequest(
        "/api/admin/history?type=draws&page=0",
        authenticated,
      )
    ).status,
    400,
  );

  const verificationDb = new Database(databasePath, { readonly: true });
  const wins = verificationDb
    .prepare("SELECT id, status FROM prize_wins ORDER BY id")
    .all();
  const logs = verificationDb
    .prepare(
      "SELECT prize_win_id, action, note FROM redemption_logs ORDER BY id",
    )
    .all();
  verificationDb.close();

  assert.deepEqual(wins, [
    { id: 1, status: "unredeemed" },
    { id: 2, status: "unredeemed" },
    { id: 3, status: "redeemed" },
    { id: 4, status: "unredeemed" },
  ]);
  assert.deepEqual(
    logs.map(({ prize_win_id, action }) => [prize_win_id, action]),
    [
      [1, "request"],
      [3, "request"],
      [4, "grant"],
      [4, "revoke"],
      [4, "restore"],
      [1, "reject_request"],
      [2, "redeem"],
      [2, "undo_redeem"],
      [3, "redeem"],
    ],
  );
  assert.equal(logs[5].note, "稍后再兑换");
  assert.equal(logs[6].note, "管理员直接核销");
  assert.equal(logs[8].note, "管理员确认兑换申请");

  console.log("管理员兑换处理与历史记录端到端联调通过");
} finally {
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
