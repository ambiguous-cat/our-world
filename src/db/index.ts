import "server-only";

import path from "node:path";
import fs from "node:fs";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

function resolveDatabasePath() {
  const configuredPath =
    process.env.DATABASE_PATH ?? path.join("data", "our-world.db");

  if (configuredPath === ":memory:") {
    return configuredPath;
  }

  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    configuredPath,
  );
}

function createDatabase() {
  const databasePath = resolveDatabasePath();

  if (databasePath !== ":memory:") {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const client = new Database(databasePath);
  client.pragma("foreign_keys = ON");
  client.pragma("journal_mode = WAL");
  client.pragma("synchronous = NORMAL");
  client.pragma("busy_timeout = 5000");

  return {
    client,
    db: drizzle(client, { schema }),
  };
}

type DatabaseBundle = ReturnType<typeof createDatabase>;

const globalForDatabase = globalThis as typeof globalThis & {
  ourWorldDatabase?: DatabaseBundle;
};

const databaseBundle =
  globalForDatabase.ourWorldDatabase ?? createDatabase();

globalForDatabase.ourWorldDatabase = databaseBundle;

export const sqlite = databaseBundle.client;
export const db = databaseBundle.db;
export { schema };
