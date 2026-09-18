import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// This file may be evaluated as CJS (__dirname exists) or ESM (import.meta),
// depending on how Next transpiles it.
const frontendDir =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(frontendDir, "..");

// Single root env file (<repo root>/.env, see specs/single-root-env.md): makes
// NEXT_PUBLIC_* visible to `next dev` / `next build` on the host. Optional
// (loadEnvConfig silently skips missing files) and never overrides variables
// already in the process environment — in Docker they arrive as build args.
loadEnvConfig(repoRoot, process.env.NODE_ENV !== "production", {
  info: () => {},
  error: console.error,
});

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Self-contained server bundle (.next/standalone) for the Docker image.
  // The trace root is the monorepo root so pnpm's hoisted workspace
  // node_modules are found and copied into the standalone output.
  output: "standalone",
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
