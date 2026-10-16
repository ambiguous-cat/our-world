import nextEnv from "@next/env";

// Match Next.js outside `next dev`: production unless development is explicit.
// Existing process variables take priority, including isolated smoke-test paths.
export function loadProjectEnvironment() {
  return nextEnv.loadEnvConfig(
    process.cwd(),
    process.env.NODE_ENV === "development",
  );
}
