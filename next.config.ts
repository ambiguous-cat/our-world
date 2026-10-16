import type { NextConfig } from "next";

const basePath = "/our-world";
const runtimeUploadTraceExcludes = [
  "./data/**/*",
  "./drizzle/**/*",
  "./public/**/*",
  "./scripts/**/*",
  "./src/**/*",
  "./*.md",
  "./*.ts",
  "./*.mjs",
  "./package-lock.json",
];

const nextConfig: NextConfig = {
  basePath,
  // Route imports initialize SQLite; parallel build workers can race on WAL setup.
  experimental: { cpus: 1 },
  outputFileTracingExcludes: {
    "/api/admin/prize-images": runtimeUploadTraceExcludes,
    "/api/prize-images/*": runtimeUploadTraceExcludes,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
