import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 30_000,
    include: ["tests/firestore.rules.test.ts"],
    testTimeout: 10_000,
  },
});
