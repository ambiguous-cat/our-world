import fs from "node:fs";
import path from "node:path";

import { defineConfig } from "drizzle-kit";
import { loadProjectEnvironment } from "./scripts/load-env.mjs";

loadProjectEnvironment();

const databasePath =
  process.env.DATABASE_PATH ?? path.join("data", "our-world.db");

if (databasePath !== ":memory:") {
  fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
}

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databasePath,
  },
  strict: true,
  verbose: true,
});
