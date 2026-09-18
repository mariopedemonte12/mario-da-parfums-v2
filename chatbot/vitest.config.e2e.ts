import { defineConfig } from 'vitest/config';

// Hits the real Gemini API (needs a real GEMINI_API_KEY in the repo-root env file) and
// spawns dev-mcp-stub as a child process — slower and non-deterministic
// compared to the mocked unit suite, so it's kept out of `pnpm test` and out
// of the Stryker mutation run (see stryker.config.json).
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/e2e-setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
