import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Self-contained server bundle (.next/standalone) for the Docker image.
  // The trace root is the monorepo root so pnpm's hoisted workspace
  // node_modules are found and copied into the standalone output.
  output: "standalone",
  outputFileTracingRoot: path.join(process.cwd(), ".."),
};

export default nextConfig;
