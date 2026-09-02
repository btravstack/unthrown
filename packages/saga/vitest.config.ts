import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      // Always on, so a bare `vitest run` enforces the thresholds below — a
      // local run can no longer pass while the gate fails.
      enabled: true,
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/*.test-d.ts"],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
