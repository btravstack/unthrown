import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // Lock in the matcher suite at full statement/line/function coverage. The
      // one uncovered branch is the defensive `typeof x === "function"` arm of
      // `isThenable` (a value that is callable *and* thenable never reaches the
      // matchers), so `branches` sits just below 100.
      thresholds: {
        statements: 100,
        branches: 95,
        functions: 100,
        lines: 100,
      },
    },
  },
});
