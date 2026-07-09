import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // The generated test client is Prisma's output, not ours.
      exclude: ["src/generated/**", "src/**/*.test-d.ts", "src/**/*.spec.ts"],
      // The whole bridge is exercised against a real in-memory SQLite database:
      // every mapped P-code is provoked for real, and `$tryTransaction` covers
      // commit, rollback-on-Err, rollback-on-defect, and a transaction-level
      // failure that bypasses the sentinel.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
