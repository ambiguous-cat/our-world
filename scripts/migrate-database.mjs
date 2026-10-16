import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { loadProjectEnvironment } from "./load-env.mjs";

// Compatible with Drizzle's journal and hash format. Foreign keys must be
// disabled BEFORE the transaction for SQLite table rebuilds; validate before commit.
export function migrateDatabase(databasePath, migrationsFolder = "./drizzle") {
  if (databasePath !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  const sqlite = new Database(databasePath);
  try {
    sqlite.pragma("busy_timeout = 5000");
    sqlite.pragma("foreign_keys = OFF");
    const migrations = readMigrationFiles({ migrationsFolder });
    sqlite.transaction(() => {
      sqlite.exec('CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)');
      const applied = sqlite.prepare('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at').all();
      for (const row of applied) {
        const source = migrations.find((m) => m.folderMillis === Number(row.created_at));
        if (!source || source.hash !== row.hash) throw new Error("迁移历史与源码不一致，停止迁移");
      }
      const latest = Number(applied.at(-1)?.created_at ?? -1);
      for (const migration of migrations) {
        if (migration.folderMillis <= latest) continue;
        for (const statement of migration.sql) sqlite.exec(statement);
        sqlite.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(migration.hash, migration.folderMillis);
      }
      if (sqlite.pragma("foreign_key_check").length) throw new Error("迁移后外键检查失败，已回滚");
      const integrity = sqlite.pragma("integrity_check");
      if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") throw new Error("迁移后完整性检查失败，已回滚");
    }).immediate();
    sqlite.pragma("foreign_keys = ON");
  } finally {
    sqlite.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  loadProjectEnvironment();
  migrateDatabase(process.env.DATABASE_PATH ?? "./data/our-world.db");
  console.log("数据库迁移及完整性检查通过");
}
