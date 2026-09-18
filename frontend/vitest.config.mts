import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Node by default (pure logic). Component tests opt into the DOM per file with
// a `// @vitest-environment jsdom` comment.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
