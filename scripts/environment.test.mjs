import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const loaderUrl = new URL("./load-env.mjs", import.meta.url).href;
const migrateScript = fileURLToPath(new URL("./migrate-database.mjs", import.meta.url));
const verifyScript = fileURLToPath(new URL("./verify-database.mjs", import.meta.url));

function fixture(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "our-world-env-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function child(directory, args, overrides = {}) {
  // No inherited application credentials or real database paths.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(PATH|SystemRoot|WINDIR|TEMP|TMP|COMSPEC|PATHEXT)$/i.test(key),
    ),
  );
  const result = spawnSync(process.execPath, args, {
    cwd: directory,
    env: { ...env, ...overrides },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result.stdout.trim();
}

function loadedPath(directory, overrides) {
  return child(directory, ["--input-type=module", "-e", `
    import { loadProjectEnvironment } from ${JSON.stringify(loaderUrl)};
    loadProjectEnvironment();
    console.log(process.env.DATABASE_PATH);
  `], overrides);
}

test("configuration order preserves process overrides and local settings", (context) => {
  const directory = fixture(context);
  fs.writeFileSync(path.join(directory, ".env"), "DATABASE_PATH=base.db\n");
  fs.writeFileSync(path.join(directory, ".env.production"), "DATABASE_PATH=production.db\n");
  assert.equal(loadedPath(directory), "production.db");
  fs.writeFileSync(path.join(directory, ".env.local"), "DATABASE_PATH=local.db\n");
  assert.equal(loadedPath(directory), "local.db");
  fs.writeFileSync(path.join(directory, ".env.production.local"), "DATABASE_PATH=production-local.db\n");
  assert.equal(loadedPath(directory), "production-local.db");
  assert.equal(loadedPath(directory, { DATABASE_PATH: "isolated.db" }), "isolated.db");
});

test("development and test use their own files; test ignores .env.local", (context) => {
  const directory = fixture(context);
  fs.writeFileSync(path.join(directory, ".env.local"), "DATABASE_PATH=local.db\n");
  fs.writeFileSync(path.join(directory, ".env.development.local"), "DATABASE_PATH=development.db\n");
  fs.writeFileSync(path.join(directory, ".env.test"), "DATABASE_PATH=test.db\n");
  assert.equal(loadedPath(directory, { NODE_ENV: "development" }), "development.db");
  assert.equal(loadedPath(directory, { NODE_ENV: "test" }), "test.db");
});

test("migration and verification CLI use the configured database, including UTF-8 paths", (context) => {
  const directory = fixture(context);
  fs.cpSync(path.join(projectRoot, "drizzle"), path.join(directory, "drizzle"), { recursive: true });
  const configuredPath = "./隔离数据/custom.db";
  fs.writeFileSync(path.join(directory, ".env.local"), `DATABASE_PATH=${configuredPath}\n`);
  child(directory, [migrateScript]);
  child(directory, [migrateScript]);
  child(directory, [verifyScript]);
  const databasePath = path.join(directory, configuredPath);
  assert.ok(fs.existsSync(databasePath));
  assert.ok(!fs.existsSync(path.join(directory, "data", "our-world.db")));
  const database = new Database(databasePath, { readonly: true });
  try {
    const journal = JSON.parse(fs.readFileSync(path.join(directory, "drizzle/meta/_journal.json"), "utf8"));
    assert.equal(database.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get().n, journal.entries.length);
    assert.equal(database.pragma("integrity_check", { simple: true }), "ok");
  } finally {
    database.close();
  }
  child(directory, [migrateScript], { DATABASE_PATH: "./override.db" });
  child(directory, [verifyScript], { DATABASE_PATH: "./override.db" });
  assert.ok(fs.existsSync(path.join(directory, "override.db")));
});

test("importing migration service does not load environment files", (context) => {
  const directory = fixture(context);
  fs.writeFileSync(path.join(directory, ".env.local"), "DATABASE_PATH=should-not-load.db\n");
  child(directory, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    await import(${JSON.stringify(pathToFileURL(migrateScript).href)});
    assert.equal(process.env.DATABASE_PATH, undefined);
  `]);
  assert.ok(!fs.existsSync(path.join(directory, "should-not-load.db")));
});
