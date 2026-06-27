import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // Both entry points are exercised over valid input, issues, an async
      // schema, and a throwing validator (→ defect), covering every branch.
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 100,
        lines: 100,
      },
    },
  },
});
