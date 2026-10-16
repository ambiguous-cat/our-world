import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { migrateDatabase } from "./migrate-database.mjs";

const projectRoot = process.cwd();
const temporaryDirectory = path.resolve(
  projectRoot,
  ".tmp-prize-image-upload-smoke",
);
const port = 3020;
const baseUrl = `http://127.0.0.1:${port}/our-world`;
const environment = {
  ...process.env,
  EMAIL_NOTIFICATIONS_ENABLED: "false",
  DATABASE_PATH: path.join(temporaryDirectory, "test.db"),
  PLAYER_ANSWER: "image-smoke-player",
  ADMIN_ANSWER: "image-smoke-admin",
  AUTH_SESSION_SECRET: "image-smoke-secret-with-at-least-thirty-two-bytes",
  AUTH_COOKIE_SECURE: "false",
  PRIZE_UPLOAD_DIR: path.join(temporaryDirectory, "uploads"),
};

assert.ok(
  temporaryDirectory.startsWith(`${projectRoot}${path.sep}`),
  "临时上传目录必须位于项目目录内",
);
fs.rmSync(temporaryDirectory, { recursive: true, force: true });
fs.mkdirSync(temporaryDirectory, { recursive: true });
migrateDatabase(environment.DATABASE_PATH);

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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer }),
  });
  assert.equal(response.status, 200);
  return (response.headers.get("set-cookie") ?? "").split(";", 1)[0];
}

function pngFormData(content) {
  const formData = new FormData();
  formData.append("image", new Blob([content], { type: "image/png" }), "test.png");
  return formData;
}

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

try {
  await waitForServer();

  const unauthenticatedUpload = await fetch(
    `${baseUrl}/api/admin/prize-images`,
    { method: "POST", body: pngFormData(onePixelPng) },
  );
  assert.equal(unauthenticatedUpload.status, 401);

  const playerCookie = await login(environment.PLAYER_ANSWER);
  const playerUpload = await fetch(`${baseUrl}/api/admin/prize-images`, {
    method: "POST",
    headers: { Cookie: playerCookie },
    body: pngFormData(onePixelPng),
  });
  assert.equal(playerUpload.status, 401);

  const adminCookie = await login(environment.ADMIN_ANSWER);
  const invalidUpload = await fetch(`${baseUrl}/api/admin/prize-images`, {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: pngFormData(Buffer.from("not an image")),
  });
  assert.equal(invalidUpload.status, 400);

  const upload = await fetch(`${baseUrl}/api/admin/prize-images`, {
    method: "POST",
    headers: { Cookie: adminCookie },
    body: pngFormData(onePixelPng),
  });
  assert.equal(upload.status, 200);
  const payload = await upload.json();
  assert.match(
    payload.imagePath,
    /^\/api\/prize-images\/[0-9a-f-]{36}\.png$/,
  );
  assert.equal(fs.readdirSync(environment.PRIZE_UPLOAD_DIR).length, 1);

  const unauthenticatedRead = await fetch(`${baseUrl}${payload.imagePath}`);
  assert.equal(unauthenticatedRead.status, 401);

  const playerRead = await fetch(`${baseUrl}${payload.imagePath}`, {
    headers: { Cookie: playerCookie },
  });
  assert.equal(playerRead.status, 200);
  assert.equal(playerRead.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await playerRead.arrayBuffer()), onePixelPng);

  const missingRead = await fetch(
    `${baseUrl}/api/prize-images/not-a-valid-name.png`,
    { headers: { Cookie: playerCookie } },
  );
  assert.equal(missingRead.status, 404);

  console.log("奖品图片权限、内容校验、持久化写入与登录后读取联调通过");
} finally {
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
